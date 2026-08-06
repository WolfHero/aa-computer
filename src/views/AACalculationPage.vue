<template>
  <div class="aa-page">
    <AppNavBar
      title="AA计算"
      :right-actions="rightActions"
    />

    <div v-if="staleAA" class="stale-banner">
      <van-icon name="warning-o" /> AA计算结果不是最新版本，本地数据有新变更，请手动计算
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
          :show-local-badge="roomMode === 'online'"
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { showToast } from '@/utils/toast'
import { useRooms } from '@/composables/useRooms'
import { useAAResult } from '@/composables/useAAResult'
import { useLocalAA, calculateAAFromData } from '@/composables/useLocalAA'
import { useLocalBills } from '@/composables/useLocalBills'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useAuth } from '@/composables/useAuth'
import { supabase } from '@/lib/supabaseClient'
import AppNavBar from '@/components/AppNavBar.vue'
import AACalculationChart from '@/components/AACalculationChart.vue'
import BillCard from '@/components/BillCard.vue'
import type { AAResult, Bill, RoomMember, RoomWithMembers } from '@/lib/types'

const route = useRoute()
const roomId = computed(() => route.params.id as string)
const { getRoomById, getMyMemberRecord } = useRooms()
const { getOrCalculateAA } = useAAResult()
const { getOrCalculateLocalAA, getLocalAAResult, saveLocalResult } = useLocalAA()
const { getBills } = useLocalBills()
const { getRoom, getLegacyRoomData } = useLocalRooms()
const { userId } = useAuth()

const BILL_PAGE_SIZE = 10

type MemberInfo = Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>
type LocalRoomView = {
  id: string
  name: string
  description: string
  version: number
  members: MemberInfo[]
}
const loading = ref(true)
const staleAA = ref(false)
const aaResult = ref<AAResult | null>(null)
const roomMode = ref<'local' | 'online' | 'expired' | 'legacy'>('online')
const room = ref<RoomWithMembers | LocalRoomView | null>(null)
const myMember = ref<MemberInfo | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name'>[]>([])

const rightActions = computed(() => {
  if (roomMode.value === 'local') {
    return [{ text: '重新计算', onClick: onRecalculate }]
  }
  if (roomMode.value === 'online') return [{ text: '重新计算', onClick: onRecalculate }]
  return []
})
const relatedBills = ref<Bill[]>([])
const includeSelfPay = ref(true)
const billListLoading = ref(false)
const billListFinished = ref(false)
let billPage = 0
let allLocalBills: Bill[] = []

function isSelfPayBill(b: Bill) {
  return b.shared_by.length === 1 && (b.payer_id ?? b.created_by) === b.shared_by[0]
}

function applyLocalMode(mode: 'local' | 'expired' | 'legacy', roomView: LocalRoomView, bills: Bill[], cached: AAResult | null) {
  roomMode.value = mode
  room.value = roomView
  members.value = roomView.members.map(m => ({ id: m.id, name: m.name }))
  myMember.value = null
  if (mode === 'local' || mode === 'expired') {
    myMember.value = (roomView.members as MemberInfo[]).find(
      m => m.id === (getRoom(roomId.value)?.self_member_id ?? null),
    ) ?? null
  } else {
    myMember.value = (roomView.members as MemberInfo[]).find(m => m.user_id === userId.value) ?? null
  }

  if (mode === 'local') {
    aaResult.value = getOrCalculateLocalAA(roomId.value, roomView.version)
  } else {
    const version = roomView.version
    if (cached && cached.version === version) {
      aaResult.value = cached
    } else {
      try {
        aaResult.value = {
          id: '',
          room_id: roomId.value,
          version,
          results: calculateAAFromData(roomView, bills),
          calculated_at: new Date().toISOString(),
        }
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : '计算失败')
      }
    }
  }
  if (aaResult.value && aaResult.value.version < roomView.version) {
    staleAA.value = true
  }
  allLocalBills = bills
  loadRelatedBills(true)
}

async function loadData() {
  loading.value = true
  try {
    const v2 = getRoom(roomId.value)
    if (v2 && v2.mode !== 'online') {
      const bills = getBills(roomId.value)
      applyLocalMode(v2.mode, v2, bills, getLocalAAResult(roomId.value))
      loading.value = false
      return
    }

    const legacy = getLegacyRoomData(roomId.value)
    if (legacy) {
      const view = {
        id: legacy.room.id,
        name: legacy.room.name,
        description: legacy.room.description,
        version: legacy.version,
        members: legacy.room.members,
      }
      applyLocalMode('legacy', view, legacy.bills, legacy.aaResult)
      loading.value = false
      return
    }

    if (!v2 || !userId.value) {
      showToast('房间不存在')
      loading.value = false
      return
    }

    roomMode.value = 'online'
    room.value = await getRoomById(roomId.value)
    myMember.value = room.value.members.find(m => m.user_id === userId.value) ?? null
    if (!myMember.value) myMember.value = await getMyMemberRecord(roomId.value)
    members.value = (room.value?.members ?? []).map(m => ({ id: m.id, name: m.name }))

    try {
      aaResult.value = await getOrCalculateAA(roomId.value, room.value?.version ?? 0)
      await loadRelatedBills(true)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '加载失败')
    }
  } catch (e: unknown) {
    const cached = getRoom(roomId.value)
    if (cached) {
      const bills = getBills(roomId.value)
      applyLocalMode(cached.mode === 'online' ? 'expired' : cached.mode, cached, bills, getLocalAAResult(roomId.value))
    } else {
      showToast('房间不存在')
    }
  } finally {
    loading.value = false
  }
}

async function loadRelatedBills(refresh = false) {
  if (!myMember.value) return

  if (refresh) {
    billPage = 0
    billListFinished.value = false
  }

  billListLoading.value = true
  const memberId = myMember.value.id

  if (roomMode.value !== 'online') {
    const all = allLocalBills.filter(
      b => (b.shared_by.includes(memberId) || b.created_by === memberId || (b.payer_id ?? b.created_by) === memberId)
        && (includeSelfPay.value || !isSelfPayBill(b)),
    )
    all.sort((a, b) => ((b.paid_at ?? b.created_at) > (a.paid_at ?? a.created_at) ? 1 : -1))

    const from = billPage * BILL_PAGE_SIZE
    const page = all.slice(from, from + BILL_PAGE_SIZE)
    if (refresh) {
      relatedBills.value = page
    } else {
      relatedBills.value = [...relatedBills.value, ...page]
    }
    if (from + BILL_PAGE_SIZE >= all.length) {
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
    .eq('room_id', roomId.value)
    .or(`shared_by.cs.{${myMember.value.id}},created_by.eq.${myMember.value.id},payer_id.eq.${myMember.value.id}`)

  if (!includeSelfPay.value) {
    query.or(`not.and(shared_by.eq.{${myMember.value.id}},payer_id.eq.${myMember.value.id})`)
  }

  const { data } = await query
    .order('paid_at', { ascending: false })
    .range(from, from + BILL_PAGE_SIZE - 1)

  let synced = (data ?? []).map(b => ({ ...b, local_id: b.id, synced: true } as Bill))

  if (refresh) {
    allLocalBills = synced
  } else {
    allLocalBills = [...allLocalBills, ...synced]
  }

  if (synced.length < BILL_PAGE_SIZE) {
    billListFinished.value = true
  }
  billPage++

  // Merge with local unsynced bills
  let local = getBills(roomId.value).filter(
    b => !b.synced && (b.shared_by.includes(memberId) || b.created_by === memberId || (b.payer_id ?? b.created_by) === memberId)
    && (includeSelfPay.value || !isSelfPayBill(b)),
  )
  relatedBills.value = [...local, ...allLocalBills]

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
    if (roomMode.value === 'local') {
      const v2 = getRoom(roomId.value)
      if (!v2) return
      aaResult.value = {
        id: '',
        room_id: roomId.value,
        version: v2.version,
        results: calculateAAFromData(v2, getBills(roomId.value)),
        calculated_at: new Date().toISOString(),
      }
      saveLocalResult(roomId.value, aaResult.value)
      staleAA.value = false
      showToast('已重新计算')
      return
    }
    if (roomMode.value === 'online') {
      aaResult.value = await getOrCalculateAA(roomId.value, -1) // force recalculate
      showToast('已重新计算')
    }
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '计算失败')
  }
}

onMounted(() => {
  loadData()
})

watch(() => route.params.id, () => {
  loading.value = true
  aaResult.value = null
  staleAA.value = false
  roomMode.value = 'online'
  room.value = null
  myMember.value = null
  members.value = []
  relatedBills.value = []
  allLocalBills = []
  billPage = 0
  billListFinished.value = false
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
