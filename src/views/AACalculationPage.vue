<template>
  <div class="aa-page">
    <AppNavBar
      title="AA计算"
      :right-actions="[
        { text: '重新计算', onClick: onRecalculate },
      ]"
    />

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
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { showToast } from 'vant'
import { useRooms } from '@/composables/useRooms'
import { useAAResult } from '@/composables/useAAResult'
import { useLocalBills } from '@/composables/useLocalBills'
import { supabase } from '@/lib/supabaseClient'
import AppNavBar from '@/components/AppNavBar.vue'
import AACalculationChart from '@/components/AACalculationChart.vue'
import BillCard from '@/components/BillCard.vue'
import type { AAResult, Bill, RoomMember, RoomWithMembers } from '@/lib/types'

const route = useRoute()
const roomId = route.params.id as string
const { getRoomById, getMyMemberRecord } = useRooms()
const { getOrCalculateAA } = useAAResult()
const { getBills } = useLocalBills()

const BILL_PAGE_SIZE = 10

type MemberInfo = { id: string; name: string; user_id: string; is_unsubmitted: boolean; created_at: string }
const loading = ref(true)
const aaResult = ref<AAResult | null>(null)
const room = ref<RoomWithMembers | null>(null)
const myMember = ref<MemberInfo | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name'>[]>([])
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
    room.value = await getRoomById(roomId)
    myMember.value = room.value.members.find(m => m.user_id === myMember.value?.user_id) ?? null
    if (!myMember.value) myMember.value = await getMyMemberRecord(roomId)
    members.value = (room.value?.members ?? []).map(m => ({ id: m.id, name: m.name }))

    const result = await getOrCalculateAA(roomId, room.value?.version ?? 0)
    if ('results' in result && 'members' in result.results) {
      aaResult.value = result as AAResult
    } else {
      aaResult.value = {
        id: '',
        room_id: roomId,
        version: result.version,
        results: result.results,
        calculated_at: new Date().toISOString(),
      }
    }

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
  const memberId = myMember.value.id
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
    // Re-fetch room to check version change
    const updatedRoom = await getRoomById(roomId)
    const versionChanged = updatedRoom.version !== room.value?.version
    room.value = updatedRoom

    // Refresh member info and related bills if version changed
    if (versionChanged) {
      myMember.value = updatedRoom.members.find(m => m.user_id === myMember.value?.user_id) ?? null
      await loadRelatedBills()
    }

    const result = await getOrCalculateAA(roomId, -1) // force recalculate
    if ('results' in result && 'members' in result.results) {
      aaResult.value = result as AAResult
    } else {
      aaResult.value = {
        id: '',
        room_id: roomId,
        version: result.version,
        results: result.results,
        calculated_at: new Date().toISOString(),
      }
    }
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
</style>
