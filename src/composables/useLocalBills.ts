import { shallowRef } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'
import type { Bill, LocalBillStore } from '@/lib/types'

const store: LocalBillStore = loadFromStorage()

// Revision counter for reactivity tracking
const revision = shallowRef(0)

function loadFromStorage(): LocalBillStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_BILLS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_BILLS, JSON.stringify(store))
  revision.value++
}

export function useLocalBills() {
  function getBills(roomId: string): Bill[] {
    // Track reactivity
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
    return newBill
  }

  function updateBill(roomId: string, localId: string, updates: Partial<Bill>) {
    const bills = store[roomId]
    if (!bills) return
    const idx = bills.findIndex(b => b.local_id === localId)
    if (idx === -1) return
    bills[idx] = { ...bills[idx], ...updates }
    persist()
  }

  function deleteBill(roomId: string, localId: string) {
    const bills = store[roomId]
    if (!bills) return
    store[roomId] = bills.filter(b => b.local_id !== localId)
    persist()
  }

  function getUnsyncedBills(roomId: string): Bill[] {
    // Access revision to track reactivity
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
    const localBills = store[roomId] ?? []
    const unsynced = localBills.filter(b => !b.synced)
    store[roomId] = [
      ...unsynced,
      ...serverBills.map(b => ({ ...b, local_id: b.id, synced: true })),
    ]
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
    getBills, addBill, updateBill, deleteBill,
    getUnsyncedBills, markAsSynced, mergeFetchedBills, syncBillsFromServer, clearRoom, getLocalBillCount,
  }
}
