import { shallowRef } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'
import { useLocalBills } from './useLocalBills'
import { useLocalRooms } from './useLocalRooms'
import type {
  AAResult,
  AAResultData,
  Bill,
  LocalAAResultStore,
  LocalRoom,
} from '@/lib/types'

const store: LocalAAResultStore = loadFromStorage()
const revision = shallowRef(0)

function loadFromStorage(): LocalAAResultStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_AA_V2)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_AA_V2, JSON.stringify(store))
  } catch {
    // 配额不足时仅保留内存态
  }
  revision.value++
}

/** Postgres round(numeric, 2)：四舍五入、远离零 */
function round2(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100
}

function isSelfPay(bill: Bill): boolean {
  return bill.shared_by.length === 1 && (bill.payer_id ?? bill.created_by) === bill.shared_by[0]
}

/**
 * 纯 TS 复刻服务端 calculate_aa：
 * - total_paid / total_share / self_pay 与 SQL 的 FILTER 条件一致
 * - 自付账单（shared_by 仅自己且 created_by 为自己）不参与 AA
 * - 空 shared_by 与 SQL 一样视为计算错误
 * - 贪心配对顺序、>0.001 阈值、逐步 round(...,2) 均与 SQL 一致
 */
export function calculateAAFromData(room: Pick<LocalRoom, 'id' | 'members'>, bills: Bill[]): AAResultData {
  const memberMap = new Map<string, { id: string; name: string }>()
  for (const m of room.members) {
    memberMap.set(m.id, { id: m.id, name: m.name })
  }

  const totals = new Map<string, { total_paid: number; total_share: number; self_pay: number }>()
  for (const m of room.members) {
    totals.set(m.id, { total_paid: 0, total_share: 0, self_pay: 0 })
  }

    for (const bill of bills) {
      const count = bill.shared_by.length
      if (count === 0) {
        throw new Error('包含无效账单（分摊人员为空），无法计算 AA')
      }
      const selfPay = isSelfPay(bill)
      const payerId = bill.payer_id ?? bill.created_by
      const share = bill.amount / count
    for (const memberId of bill.shared_by) {
      if (selfPay) continue
      const t = totals.get(memberId)
      if (t) t.total_share += share
    }
    const creator = totals.get(payerId)
    if (creator) {
      if (selfPay) {
        creator.self_pay += bill.amount
      } else {
        creator.total_paid += bill.amount
      }
    }
  }

  const members = [...room.members].map(m => {
    const t = totals.get(m.id) ?? { total_paid: 0, total_share: 0, self_pay: 0 }
    const totalPaid = round2(t.total_paid)
    const totalShare = round2(t.total_share)
    return {
      member_id: m.id,
      name: m.name,
      total_paid: totalPaid,
      total_share: totalShare,
      net: round2(t.total_paid - t.total_share),
      self_pay: round2(t.self_pay),
    }
  })

  const positives = members
    .filter(m => m.net > 0.001)
    .map(m => ({ ...m }))
  const negatives = members
    .filter(m => m.net < -0.001)
    .map(m => ({ ...m }))
  const transfers: AAResultData['transfers'] = []
  const positiveNets = positives.map(m => m.net)
  const negativeNets = negatives.map(m => m.net)

  for (let i = 0; i < negatives.length; i++) {
    const negative = negatives[i]
    const negativeNet = negativeNets[i]
    if (!negative || negativeNet === undefined || negativeNet >= 0) continue
    for (let j = 0; j < positives.length; j++) {
      const positive = positives[j]
      const positiveNet = positiveNets[j]
      if (!positive || positiveNet === undefined || positiveNet <= 0) continue
      const amount = Math.min(Math.abs(negativeNet), positiveNet)
      if (amount > 0.001) {
        transfers.push({
          from_member_id: negative.member_id,
          from_name: negative.name,
          to_member_id: positive.member_id,
          to_name: positive.name,
          amount: round2(amount),
        })
        negativeNets[i] = round2(negativeNet + amount)
        positiveNets[j] = round2(positiveNet - amount)
      }
    }
  }

  return { members, transfers }
}

function wrapResult(roomId: string, version: number, results: AAResultData): AAResult {
  return {
    id: '',
    room_id: roomId,
    version,
    results,
    calculated_at: new Date().toISOString(),
  }
}

export function useLocalAA() {
  function getLocalAAResult(roomId: string): AAResult | null {
    revision.value
    return store[roomId] ?? null
  }

  function saveLocalResult(roomId: string, result: AAResult) {
    store[roomId] = result
    persist()
  }

  function getOrCalculateLocalAA(roomId: string, roomVersion: number): AAResult {
    const cached = getLocalAAResult(roomId)
    if (cached && cached.version === roomVersion) return cached

    const { getRoom } = useLocalRooms()
    const { getBills } = useLocalBills()
    const room = getRoom(roomId)
    if (!room) throw new Error('房间不存在')
    const results = calculateAAFromData(room, getBills(roomId))
    const result = wrapResult(roomId, roomVersion, results)
    saveLocalResult(roomId, result)
    return result
  }

  function clearAAResult(roomId: string) {
    if (!(roomId in store)) return
    delete store[roomId]
    persist()
  }

  return { getLocalAAResult, saveLocalResult, getOrCalculateLocalAA, clearAAResult }
}
