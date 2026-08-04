# AA 计算函数（calculate_aa）优化清单

> 状态：**待实施**。本文档记录 `calculate_aa` 函数的优化建议与背景，供后续实现参考；除已标注“已修复”的内容外，尚未改动任何代码。

## 背景

`calculate_aa(p_room_id uuid)` 是房间 AA 结算的核心函数：

1. 读取房间 `rooms.version`；
2. 汇总每个成员的 `total_paid`（代付总额）、`total_share`（分摊总额）、`self_pay`（自付总额，不参与 AA）；
3. 用贪心配对生成转账计划（欠款人 → 应收人）；
4. 结果 upsert 到 `aa_results` 缓存表并返回 JSONB。

调用方：前端通过 `supabase.rpc('calculate_aa', { p_room_id })` 调用，`重新计算` 按钮会强制触发。

函数定义位于：

- `supabase/migrations/20250517000001_fix_security_definer_search_path.sql`（历史版本）
- `supabase/migrations/20260804061447_fix_aa_cartesian_product.sql`（当前版本，含修复）
- `supabase/deploy.sql`（远程部署脚本，需保持同步）

## 已修复问题（2026-08）

**笛卡尔积导致的金额放大**：旧实现同时 `LEFT JOIN bills b`（非自付）与 `bills b_self`（自付），两个 join 之间无关联条件，所有求和按对方行数成倍放大。

真实案例（18 笔自付 + 1 笔 51.9 共享账单）：

| 项 | 错误结果 | 正确结果 |
| --- | --- | --- |
| 共享账单 `total_paid` | 51.9 × 18 = 934.2 | 51.9 |
| 人均分摊 `total_share` | 25.95 × 18 = 467.1 | 25.95 |
| 麦麦应付 | 467.1 | 25.95 |

修复方式：改为单次 `LEFT JOIN bills b`，用 `FILTER` 条件分别聚合 `total_paid` / `total_share` / `self_pay`，消除笛卡尔积。修复迁移见 `20260804061447_fix_aa_cartesian_product.sql`。

## 当前基线

以 19 条账单的房间为例，`EXPLAIN ANALYZE` 结果：

```
HashAggregate (actual time=0.131..0.134 rows=2 loops=1)
Execution Time: 0.407 ms
```

当前数据规模下整体毫秒级，**性能不是瓶颈**；优先优化正确性与健壮性。

已有索引（无需新增）：

| 表 | 索引 |
| --- | --- |
| bills | `idx_bills_room_id`、`idx_bills_created_by`、`idx_bills_created_at(room_id, created_at DESC)`、`idx_bills_paid_at(room_id, paid_at DESC)` |
| room_members | `idx_room_members_room_id`、`idx_room_members_user_id`、唯一 `(room_id, user_id)` |
| aa_results | 唯一 `room_id` |

## 优化点

### P0-1 分摊分币：保证每人分摊之和等于账单金额

**问题**：当前 `sum(amount / cardinality(shared_by))` 后再 `round(..., 2)`，遇到不能整除的金额会丢分。例如 100 元 3 人分摊：每人 33.33，三份合计 99.99，付款人净额多出 0.01，转账计划会出现一分钱的残差或奇怪的 0.01 转账。

**方案**：在单笔账单内用“整数分 + 最大余数法”分配分币，保证 `sum(share) = amount`：

```sql
-- 以“分”为单位计算，避免浮点误差
total_cents := round(amount * 100);   -- 账单金额（分）
base        := total_cents / n;       -- 每人基础分摊（向下取整）
rem         := total_cents % n;       -- 余数
-- 前 rem 个成员各 +1 分，其余成员拿 base 分
```

分摊顺序建议稳定（如按 `shared_by` 数组顺序或成员创建顺序），付款人可优先拿到余数分。

### P0-2 健壮性防御

- **空 `shared_by`**：`amount / cardinality(shared_by)` 会除零，导致整个房间的 AA 计算报错。建议函数内跳过这类账单（或明确报错提示数据异常）。
- **重复成员**：`shared_by` 中同一成员出现两次会被重复分摊。建议在账单写入时校验去重，或在函数内 `array_distinct` 后再计算。

### P1-1 确定性输出

`jsonb_agg` / `array_agg` 目前没有 `ORDER BY`，成员顺序和转账配对顺序在多次调用间可能不一致。建议：

```sql
select jsonb_agg(
  jsonb_build_object(...) order by member_id
) into v_members
from member_totals;
```

输出可预测后，接口结果便于缓存对比和写测试。

### P1-2 代码卫生

- 删除未使用的声明变量：`v_settlement`、`v_item`、`v_from_member`、`v_to_member`。
- `sum(b.amount / (select cardinality(b.shared_by)))` 的标量子查询可简化为 `sum(b.amount / cardinality(b.shared_by))`，减少每行的子计划。

### P1-3 转账循环的数值处理

贪心转账循环里每一步都在 `round(v_to_amount, 2)` 并更新 JSONB，多成员时可能累积舍入误差。建议全程用精确 `numeric` 计算，仅在最终输出时统一 `round` 一次。

### P2-1 规模变大后的集合化转账（暂缓）

当前转账是 O(n²) 双层循环，且反复 `->>` / `jsonb_set` 解析 JSONB。当房间成员达到几十人以上时，这会成为主要耗时。

届时可改为：

- 用窗口函数（running balance）在一条 SQL 中生成转账，替代嵌套循环；或
- 先把成员净额算进数组/临时表，避免“聚合进 JSONB 再拆出来”的往返。

AA 场景成员数通常是个位数，当前不做。

## 不建议做的事

- **新增索引**：join/过滤列已有索引，当前表量级下无收益。
- **新增缓存层**：已有 `aa_results` 表 + 前端 localStorage 三层缓存，`重新计算` 会强制走 RPC，调用频率低。
- **修改函数稳定性标记**：函数写入 `aa_results`，保持默认 `VOLATILE` 是正确的。

## 验证方法

任何改动后至少验证以下内容：

1. **手工核算对比**：按“排除自付账单 + 单笔账单分币求和”独立重算，与函数返回的 `members` / `transfers` 完全一致。
2. **RPC 回归**：对混合房间（同时存在自付与共享账单）调用 `calculate_aa`，金额不再被放大。
3. **边界用例**：`100/3` 分摊、空 `shared_by`、重复 `shared_by` 成员。
4. **e2e**：可在 `e2e/aa-calculation.spec.ts` 中增加“自付 + 共享混合房间”用例。
5. **同步部署脚本**：改动同步到新 migration 与 `supabase/deploy.sql`。
