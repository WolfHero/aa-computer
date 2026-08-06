import { STORAGE_KEYS } from '@/utils/constants'
import { useLocalAA } from './useLocalAA'
import { useLocalBills } from './useLocalBills'
import { useLocalRooms } from './useLocalRooms'
import type { Bill, LocalRoom } from '@/lib/types'

function clearRoomVersion(roomId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_VERSIONS)
    if (raw) {
      const map = JSON.parse(raw)
      delete map[roomId]
      localStorage.setItem(STORAGE_KEYS.ROOM_VERSIONS, JSON.stringify(map))
    }
  } catch { /* ignore */ }
}

export function useRoomLifecycle() {
  /** 删除一个房间的全部本地数据（v2 + 可选旧缓存） */
  function removeRoomData(roomId: string, legacy = false) {
    useLocalRooms().removeRoom(roomId)
    useLocalBills().clearRoom(roomId)
    useLocalAA().clearAAResult(roomId)
    clearRoomVersion(roomId)
    if (legacy) {
      useLocalRooms().removeLegacyRoom(roomId)
    }
  }

  /**
   * 过期只读房间 → 新的本地房间：
   * 新 id、成员全部未绑定、账单重映射、version 重置、旧条目移除。
   */
  function rebuildFromExpired(roomId: string): LocalRoom {
    const localRooms = useLocalRooms()
    const localBills = useLocalBills()
    const localAA = useLocalAA()

    const old = localRooms.getRoom(roomId)
    if (!old || old.mode !== 'expired') {
      throw new Error('仅过期房间可重建为本地房间')
    }

    const newId = crypto.randomUUID()
    const now = new Date().toISOString()
    const memberIdMap = new Map<string, string>()
    const members = old.members.map(m => {
      const newMemberId = crypto.randomUUID()
      memberIdMap.set(m.id, newMemberId)
      return {
        ...m,
        id: newMemberId,
        user_id: null,
        is_unsubmitted: false,
        created_at: now,
      }
    })
    const selfMemberId = memberIdMap.get(old.self_member_id ?? '') ?? members[0]?.id ?? null

    const room: LocalRoom = {
      id: newId,
      name: old.name,
      description: old.description,
      created_at: now,
      updated_at: now,
      settings: {},
      version: 1,
      owner_id: null,
      mode: 'local',
      self_member_id: selfMemberId,
      members,
    }

    const bills: Bill[] = localBills.getBills(roomId).map(b => ({
      ...b,
      room_id: newId,
      id: undefined,
      created_by: memberIdMap.get(b.created_by) ?? b.created_by,
      payer_id: b.payer_id ? (memberIdMap.get(b.payer_id) ?? b.payer_id) : undefined,
      shared_by: b.shared_by.map(mid => memberIdMap.get(mid) ?? mid),
      synced: false,
    }))

    localRooms.saveRoom(room)
    localBills.replaceBills(newId, bills)
    localRooms.removeRoom(roomId)
    localBills.clearRoom(roomId)
    localAA.clearAAResult(roomId)
    clearRoomVersion(roomId)
    return room
  }

  /** v1 旧缓存 → v2 本地房间；保留合法 UUID 的房间/成员/账单 id */
  function migrateLegacyRoom(roomId: string, selfUserId: string | null = null): LocalRoom {
    const localRooms = useLocalRooms()
    const localBills = useLocalBills()
    const legacy = localRooms.getLegacyRoomData(roomId)
    if (!legacy) throw new Error('未找到旧缓存数据')

    const memberIdMap = new Map<string, string>()
    let selfMemberId: string | null = null
    const members = legacy.room.members.map(m => {
      const newId = localRooms.isUuid(m.id) ? m.id : crypto.randomUUID()
      memberIdMap.set(m.id, newId)
      if (m.user_id === selfUserId) selfMemberId = newId
      return {
        ...m,
        id: newId,
        user_id: null,
        is_unsubmitted: false,
      }
    })
    if (!selfMemberId) selfMemberId = members[0]?.id ?? null

    const id = localRooms.isUuid(roomId) ? roomId : crypto.randomUUID()
    const now = new Date().toISOString()
    const room: LocalRoom = {
      id,
      name: legacy.room.name,
      description: legacy.room.description,
      created_at: legacy.room.created_at || now,
      updated_at: now,
      settings: legacy.room.settings ?? {},
      version: legacy.version || 1,
      owner_id: null,
      mode: 'local',
      self_member_id: selfMemberId,
      members,
    }

    const bills: Bill[] = legacy.bills.map(b => ({
      ...b,
      room_id: id,
      local_id: localRooms.isUuid(b.local_id) ? b.local_id : crypto.randomUUID(),
      id: undefined,
      created_by: memberIdMap.get(b.created_by) ?? b.created_by,
      payer_id: b.payer_id ? (memberIdMap.get(b.payer_id) ?? b.payer_id) : undefined,
      shared_by: b.shared_by.map(mid => memberIdMap.get(mid) ?? mid),
      synced: false,
    }))

    localRooms.saveRoom(room)
    localBills.replaceBills(id, bills)
    localRooms.removeLegacyRoom(roomId)
    return room
  }

  return { removeRoomData, rebuildFromExpired, migrateLegacyRoom }
}
