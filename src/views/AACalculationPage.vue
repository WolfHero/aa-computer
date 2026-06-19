<template>
  <div class="aa-page">
    <AppNavBar
      title="AA计算"
      :right-actions="rightActions"
    />

    <div v-if="staleAA" class="stale-banner">
      <van-icon name="warning-o" /> AA计算结果不是最新版本，本地账单数据有新变更，请手动计算或联系房主
    </div>

    <AACalculationChart
      :loading="loading"
      :result="aaResult"
      :current-member-id="myMember?.id"
    />

    <div class="related-bills-section">
      <div class="section-title">
        <span class="section-title-text">涉及你的账单</span>
        <van-checkbox v-model="includeSelfPay" shape="square" size="10" @change="onIncludeSelfPayChange">
          包含自付自用
        </van-checkbox>
      </div>
      <van-list
        v-model:loading="billListLoading"
        :finished="billListFinished"
        :immediate-check="false"
        finished-text="没有更多了"
        @load="onBillListLoad"
      >
        <BillCard
          v-for="bill in relatedBills"
          :key="bill.local_id || bill.id"
          :bill="bill"
          :members="members"
        />
      </van-list>
      <div v-if="relatedBills.length === 0 && !billListLoading" class="empty-bills">
        <p>暂无涉及你的账单</p>
      </div>
    </div>

    <van-back-top />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { showToast } from '@/utils/toast'
import { useRooms } from '@/composables/useRooms'
import { useAAResult } from '@/composables/useAAResult'
import { useLocalBills } from '@/composables/useLocalBills'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/lib/supabaseClient'
import AppNavBar from '@/components/AppNavBar.vue'
import AACalculationChart from '@/components/AACalculationChart.vue'
import BillCard from '@/components/BillCard.vue'
import type { AAResult, Bill, RoomMember, RoomWithMembers } from '@/lib/types'

const route = useRoute()
const roomId = route.params.id as string
const { getRoomById, getMyMemberRecord } = useRooms()
const { getOrCalculateAA, getLocalAAResult } = useAAResult()
const { getBills } = useLocalBills()
const { getCachedRoom, markRoomExpired, isRoomExpired } = useLocalRooms()
const { userId } = useAuth()

const BILL_PAGE_SIZE = 10

type MemberInfo = { id: string; name: string; user_id: string | null; is_unsubmitted: boolean; created_at: string }
const loading = ref(true)
const roomExpired = ref(false)
const staleAA = ref(false)
const aaResult = ref<AAResult | null>(null)
const room = ref<RoomWithMembers | null>(null)
const myMember = ref<MemberInfo | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name'>[]>([])

const rightActions = computed(() => {
  if (roomExpired.value) return []
  return [{ text: '重新计算', onClick: onRecalculate }]
})
const relatedBills = ref<Bill[]>([])
const includeSelfPay = ref(true)
const billListLoading = ref(false)
const billListFinished = ref(false)
let billPage = 0
let allSyncedBills: Bill[] = []

function isSelfPayBill(b: Bill) {
  return b.shared_by.length === 1 && b.created_by === b.shared_by[0]
}

async function loadData() {
  loading.value = true
  try {
    // 如果房间已被标记为过期，直接走本地缓存，跳过所有网络请求
    if (isRoomExpired(roomId)) {
      const cached = getCachedRoom(roomId)
      if (cached) {
        room.value = cached
        members.value = cached.members.map(m => ({ id: m.id, name: m.name }))
        myMember.value = cached.members.find(m => m.user_id === userId.value) ?? null
        roomExpired.value = true
        aaResult.value = getLocalAAResult(roomId)
        if (!aaResult.value) showToast('本地未找到AA计算结果')
        else if (aaResult.value.version < room.value.version) staleAA.value = true
        await loadRelatedBills(true)
      } else {
        showToast('房间不存在')
      }
      loading.value = false
      return
    }

    room.value = await getRoomById(roomId)
    myMember.value = room.value.members.find(m => m.user_id === userId.value) ?? null
    if (!myMember.value) myMember.value = await getMyMemberRecord(roomId)
    members.value = (room.value?.members ?? []).map(m => ({ id: m.id, name: m.name }))
    roomExpired.value = false
  } catch {
    const cached = getCachedRoom(roomId)
    if (cached) {
      room.value = cached
      members.value = cached.members.map(m => ({ id: m.id, name: m.name }))
      myMember.value = cached.members.find(m => m.user_id === userId.value) ?? null
      roomExpired.value = true
      markRoomExpired(roomId)
      aaResult.value = getLocalAAResult(roomId)
      if (!aaResult.value) showToast('本地未找到AA计算结果')
      else if (aaResult.value.version < room.value.version) staleAA.value = true
      await loadRelatedBills(true)
    } else {
      showToast('房间不存在')
    }
    loading.value = false
    return
  }

  try {
    aaResult.value = await getOrCalculateAA(roomId, room.value?.version ?? 0)
    await loadRelatedBills(true)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadRelatedBills(refresh = false) {
  if (!myMember.value) return

  if (refresh) {
    billPage = 0
    billListFinished.value = false
    allSyncedBills = []
  }

  billListLoading.value = true
  const memberId = myMember.value.id

  // 过期房间：从本地账单列表中筛选，伪分页
  if (roomExpired.value) {
    const allBills = getBills(roomId).filter(
      b => (b.shared_by.includes(memberId) || b.created_by === memberId)
        && (includeSelfPay.value || !isSelfPayBill(b))
    )
    allBills.sort((a, b) => ((b.paid_at ?? b.created_at) > (a.paid_at ?? a.created_at) ? 1 : -1))

    const from = billPage * BILL_PAGE_SIZE
    const page = allBills.slice(from, from + BILL_PAGE_SIZE)
    if (refresh) {
      relatedBills.value = page
    } else {
      relatedBills.value = [...relatedBills.value, ...page]
    }
    if (from + BILL_PAGE_SIZE >= allBills.length) {
      billListFinished.value = true
    }
    billPage++
    billListLoading.value = false
    return
  }

  const from = billPage * BILL_PAGE_SIZE
  const query = supabase
    .from('bills')
    .select('*')
    .eq('room_id', roomId)
    .or(`shared_by.cs.{${myMember.value.id}},created_by.eq.${myMember.value.id}`)

  if (!includeSelfPay.value) {
    // Exclude self-pay: shared_by = {memberId} AND created_by = memberId
    query.or(`not.and(shared_by.eq.{${myMember.value.id}},created_by.eq.${myMember.value.id})`)
  }

  const { data } = await query
    .order('paid_at', { ascending: false })
    .range(from, from + BILL_PAGE_SIZE - 1)

  let synced = (data ?? []).map(b => ({ ...b, local_id: b.id, synced: true } as Bill))

  if (refresh) {
    allSyncedBills = synced
  } else {
    allSyncedBills = [...allSyncedBills, ...synced]
  }

  if (synced.length < BILL_PAGE_SIZE) {
    billListFinished.value = true
  }
  billPage++

  // Merge with local unsynced bills
  let local = getBills(roomId).filter(
    b => !b.synced && (b.shared_by.includes(memberId) || b.created_by === memberId)
    && (includeSelfPay.value || !isSelfPayBill(b))
  )
  relatedBills.value = [...local, ...allSyncedBills]

  billListLoading.value = false
}

function onBillListLoad() {
  loadRelatedBills(false)
}

function onIncludeSelfPayChange() {
  loadRelatedBills(true)
}

async function onRecalculate() {
  try {
    if (isRoomExpired(roomId)) {
      showToast('房间已过期，无法重新计算')
      return
    }

    // Re-fetch room to check version change
    const updatedRoom = await getRoomById(roomId)
    const versionChanged = updatedRoom.version !== room.value?.version
    room.value = updatedRoom

    // Refresh member info and related bills if version changed
    if (versionChanged) {
      myMember.value = updatedRoom.members.find(m => m.user_id === myMember.value?.user_id) ?? null
      await loadRelatedBills()
    }

    aaResult.value = await getOrCalculateAA(roomId, -1) // force recalculate
    showToast('已重新计算')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '计算失败')
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.aa-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.related-bills-section {
  padding: 16px;
}
.section-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title-text {
  font-size: 16px;
}
.empty-bills {
  text-align: center;
  padding: 40px;
  color: var(--color-text-secondary);
}
.stale-banner {
  padding: 12px 16px;
  background: #fff7e6;
  color: #e6a23c;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
