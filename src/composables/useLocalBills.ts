import { shallowRef } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'
import { useLocalRooms } from './useLocalRooms'
import type { Bill, LocalBillStore } from '@/lib/types'

const store: LocalBillStore = loadFromStorage()

// Revision counter for reactivity tracking
const revision = shallowRef(0)

function loadFromStorage(): LocalBillStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_BILLS_V2)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_BILLS_V2, JSON.stringify(store))
  } catch {
    // localStorage 配额不足时保留内存态
  }
  revision.value++
}

/** 仅本地模式房间在账单变更时递增版本（用于本地 AA 缓存失效） */
function bumpIfLocalRoom(roomId: string) {
  const room = useLocalRooms().getRoom(roomId)
  if (room?.mode === 'local') {
    useLocalRooms().bumpRoomVersion(roomId)
  }
}

export function useLocalBills() {
  function getBills(roomId: string): Bill[] {
    revision.value
    return store[roomId] ?? []
  }

  function addBill(roomId: string, bill: Omit<Bill, 'local_id' | 'synced' | 'created_at'>) {
    const newBill: Bill = {
      ...bill,
      local_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      synced: false,
    }
    if (!store[roomId]) store[roomId] = []
    store[roomId].push(newBill)
    persist()
    bumpIfLocalRoom(roomId)
    return newBill
  }

  function addBills(roomId: string, bills: Omit<Bill, 'local_id' | 'synced' | 'created_at'>[]) {
    if (bills.length === 0) return []
    const newBills: Bill[] = bills.map(b => ({
      ...b,
      local_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      synced: false,
    }))
    if (!store[roomId]) store[roomId] = []
    store[roomId].push(...newBills)
    persist()
    bumpIfLocalRoom(roomId)
    return newBills
  }

  function updateBill(roomId: string, localId: string, updates: Partial<Bill>) {
    const bills = store[roomId]
    if (!bills) return
    const idx = bills.findIndex(b => b.local_id === localId)
    if (idx === -1) return
    bills[idx] = { ...bills[idx], ...updates } as Bill
    persist()
    bumpIfLocalRoom(roomId)
  }

  function deleteBill(roomId: string, localId: string) {
    const bills = store[roomId]
    if (!bills) return
    store[roomId] = bills.filter(b => b.local_id !== localId)
    persist()
    bumpIfLocalRoom(roomId)
  }

  function getUnsyncedBills(roomId: string): Bill[] {
    revision.value
    return (store[roomId] ?? []).filter(b => !b.synced)
  }

  function markAsSynced(roomId: string, localIds: string[], serverIds?: string[]) {
    const bills = store[roomId]
    if (!bills) return
    const idSet = new Set(localIds)
    for (const bill of bills) {
      if (idSet.has(bill.local_id)) {
        bill.synced = true
      }
    }
    if (serverIds) {
      localIds.forEach((localId, i) => {
        const bill = bills.find(b => b.local_id === localId)
        if (bill && serverIds[i]) {
          bill.id = serverIds[i]
        }
      })
    }
    persist()
  }

  /** 转换成功后按 local_id → 服务端 id 映射标记全部账单已同步 */
  function markAllSynced(roomId: string, idMap: Record<string, string>) {
    const bills = store[roomId]
    if (!bills) return
    for (const bill of bills) {
      const serverId = idMap[bill.local_id]
      if (serverId) {
        bill.id = serverId
        bill.synced = true
      }
    }
    persist()
  }

  function mergeFetchedBills(roomId: string, fetched: any[]) {
    if (!store[roomId]) store[roomId] = []
    const existingIds = new Set(store[roomId].map(b => b.id).filter(Boolean))
    for (const bill of fetched) {
      if (!existingIds.has(bill.id)) {
        store[roomId].push({ ...bill, local_id: bill.id, synced: true })
        existingIds.add(bill.id)
      }
    }
    persist()
  }

  /** Replace cached synced bills with fresh server data, preserving unsynced local bills */
  function syncBillsFromServer(roomId: string, serverBills: any[]) {
    if (serverBills.length === 0 && !store[roomId]) return
    const localBills = store[roomId] ?? []
    const unsynced = localBills.filter(b => !b.synced)
    store[roomId] = [
      ...unsynced,
      ...serverBills.map(b => ({ ...b, local_id: b.id, synced: true })),
    ]
    persist()
  }

  function replaceBills(roomId: string, bills: Bill[]) {
    store[roomId] = bills.map(b => ({ ...b }))
    persist()
  }

  function clearRoom(roomId: string) {
    delete store[roomId]
    persist()
  }

  function getLocalBillCount(roomId: string): number {
    revision.value
    return (store[roomId] ?? []).length
  }

  return {
    getBills,
    addBill,
    addBills,
    updateBill,
    deleteBill,
    getUnsyncedBills,
    markAsSynced,
    markAllSynced,
    mergeFetchedBills,
    syncBillsFromServer,
    replaceBills,
    clearRoom,
    getLocalBillCount,
  }
}
