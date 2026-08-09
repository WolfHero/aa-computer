import { shallowRef } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'
import type {
  AAResult,
  Bill,
  CachedRoom,
  LegacyRoomStore,
  LocalAAResultStore,
  LocalBillStore,
  LocalRoom,
  LocalRoomStore,
  RoomMode,
} from '@/lib/types'

const EXPIRED_ROOMS_KEY = 'aa_expired_rooms'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const store: LocalRoomStore = loadFromStorage()
const revision = shallowRef(0)

function loadFromStorage(): LocalRoomStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS_V2)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS_V2, JSON.stringify(store))
  } catch {
    // localStorage 配额不足时保留内存态，避免旧数据被覆盖丢失
  }
  revision.value++
}

function readLegacyRooms(): LegacyRoomStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_ROOMS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readLegacyBills(): LocalBillStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_BILLS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readLegacyAAResults(): LocalAAResultStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_AA_RESULTS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readLegacyVersions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_VERSIONS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readExpiredSet(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPIRED_ROOMS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useLocalRooms() {
  function getRoom(roomId: string): LocalRoom | null {
    revision.value
    return store[roomId] ?? null
  }

  function getAllRooms(): LocalRoom[] {
    revision.value
    return Object.values(store).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }

  function createLocalRoom(name: string, description: string, creatorName: string): LocalRoom {
    const id = crypto.randomUUID()
    const selfMemberId = crypto.randomUUID()
    const now = new Date().toISOString()
    const room: LocalRoom = {
      id,
      name,
      description,
      created_at: now,
      updated_at: now,
      settings: {},
      version: 1,
      owner_id: null,
      mode: 'local',
      self_member_id: selfMemberId,
      members: [{
        id: selfMemberId,
        name: creatorName,
        user_id: null,
        is_unsubmitted: false,
        created_at: now,
      }],
    }
    store[id] = room
    persist()
    return room
  }

  function saveRoom(room: LocalRoom, force = false) {
    const existing = store[room.id]
    if (!force && existing && existing.updated_at >= room.updated_at) return
    store[room.id] = { ...room, members: room.members.map(m => ({ ...m })) }
    persist()
  }

  function removeRoom(roomId: string) {
    if (!(roomId in store)) return
    delete store[roomId]
    const expired = readExpiredSet()
    expired.delete(roomId)
    try {
      localStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify([...expired]))
    } catch { /* ignore */ }
    persist()
  }

  function bumpRoomVersion(roomId: string): number {
    const room = store[roomId]
    if (!room) return -1
    room.version = (room.version ?? 0) + 1
    room.updated_at = new Date().toISOString()
    persist()
    return room.version
  }

  function setRoomMode(roomId: string, mode: RoomMode) {
    const room = store[roomId]
    if (!room || room.mode === mode) return
    room.mode = mode
    room.updated_at = new Date().toISOString()
    persist()
  }

  /** 在线房间确认过期后：清空成员 user_id，标记自己的成员 */
  function markExpired(roomId: string, selfUserId: string | null) {
    const room = store[roomId]
    if (!room || room.mode === 'expired') return
    const selfMember = selfUserId
      ? room.members.find(m => m.user_id === selfUserId)
      : null
    store[roomId] = {
      ...room,
      mode: 'expired',
      owner_id: null,
      self_member_id: selfMember?.id ?? room.self_member_id ?? room.members[0]?.id ?? null,
      members: room.members.map(m => ({
        ...m,
        user_id: null,
        is_unsubmitted: false,
      })),
      updated_at: new Date().toISOString(),
    }
    const expired = readExpiredSet()
    expired.add(roomId)
    try {
      localStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify([...expired]))
    } catch { /* ignore */ }
    persist()
  }

  /** 房间恢复在线后清理过期标记 */
  function clearExpired(roomId: string) {
    const expired = readExpiredSet()
    if (!expired.has(roomId)) return
    expired.delete(roomId)
    try {
      localStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify([...expired]))
    } catch { /* ignore */ }
  }

  // --- Legacy (v1) 只读访问 ---

  function getLegacyRoomIds(): string[] {
    revision.value
    return Object.keys(readLegacyRooms()).filter(id => !(id in store))
  }

  function getLegacyRoomData(roomId: string): {
    room: CachedRoom
    bills: Bill[]
    version: number
    aaResult: AAResult | null
  } | null {
    revision.value
    const legacyRooms = readLegacyRooms()
    const room = legacyRooms[roomId]
    if (!room) return null
    const bills = readLegacyBills()[roomId] ?? []
    const versions = readLegacyVersions()
    const aaResult = readLegacyAAResults()[roomId] ?? null
    return {
      room,
      bills,
      version: versions[roomId] ?? room.version ?? 1,
      aaResult,
    }
  }

  function removeLegacyRoom(roomId: string) {
    const legacyRooms = readLegacyRooms()
    if (roomId in legacyRooms) {
      delete legacyRooms[roomId]
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_ROOMS, JSON.stringify(legacyRooms))
      } catch { /* ignore */ }
    }
    const legacyBills = readLegacyBills()
    if (roomId in legacyBills) {
      delete legacyBills[roomId]
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_BILLS, JSON.stringify(legacyBills))
      } catch { /* ignore */ }
    }
    const legacyAA = readLegacyAAResults()
    if (roomId in legacyAA) {
      delete legacyAA[roomId]
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_AA_RESULTS, JSON.stringify(legacyAA))
      } catch { /* ignore */ }
    }
    const versions = readLegacyVersions()
    if (roomId in versions) {
      delete versions[roomId]
      try {
        localStorage.setItem(STORAGE_KEYS.ROOM_VERSIONS, JSON.stringify(versions))
      } catch { /* ignore */ }
    }
    const expired = readExpiredSet()
    expired.delete(roomId)
    try {
      localStorage.setItem(EXPIRED_ROOMS_KEY, JSON.stringify([...expired]))
    } catch { /* ignore */ }
  }

  function isUuid(value: string): boolean {
    return UUID_RE.test(value)
  }

  return {
    getRoom,
    getAllRooms,
    createLocalRoom,
    saveRoom,
    removeRoom,
    bumpRoomVersion,
    setRoomMode,
    markExpired,
    clearExpired,
    getLegacyRoomIds,
    getLegacyRoomData,
    removeLegacyRoom,
    isUuid,
  }
}
