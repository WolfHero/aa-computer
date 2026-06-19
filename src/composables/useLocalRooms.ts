import { shallowRef } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'
import type { RoomWithMembers, LocalRoomStore } from '@/lib/types'

const store: LocalRoomStore = loadFromStorage()

const revision = shallowRef(0)

const EXPIRED_ROOMS_KEY = 'aa_expired_rooms'

function loadFromStorage(): LocalRoomStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function loadExpiredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPIRED_ROOMS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function persistExpiredSet(set: Set<string>) {
  localStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify([...set]))
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS, JSON.stringify(store))
  revision.value++
}

export function useLocalRooms() {
  function getCachedRoom(roomId: string): RoomWithMembers | null {
    revision.value
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS)
      if (!raw) return null
      const rooms = JSON.parse(raw)
      return rooms[roomId] ?? null
    } catch {
      return null
    }
  }

  function saveRoom(room: RoomWithMembers) {
    const existing = store[room.id]
    if (existing && existing.updated_at >= room.updated_at) return
    store[room.id] = {
      id: room.id,
      name: room.name,
      description: room.description,
      created_at: room.created_at,
      settings: room.settings,
      version: room.version,
      updated_at: room.updated_at,
      owner_id: room.owner_id,
      members: room.members,
    }
    persist()
  }

  function removeRoom(roomId: string) {
    if (!(roomId in store)) return
    delete store[roomId]
    // 清除过期标记
    const expired = loadExpiredSet()
    expired.delete(roomId)
    persistExpiredSet(expired)
    persist()
  }

  function getAllCachedRooms() {
    revision.value
    return Object.values(store).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }

  function markRoomExpired(roomId: string) {
    const expired = loadExpiredSet()
    expired.add(roomId)
    persistExpiredSet(expired)
  }

  function isRoomExpired(roomId: string): boolean {
    revision.value
    return loadExpiredSet().has(roomId)
  }

  return { getCachedRoom, saveRoom, removeRoom, getAllCachedRooms, markRoomExpired, isRoomExpired }
}
