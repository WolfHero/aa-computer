import { useLocalAA } from './useLocalAA'
import { useLocalBills } from './useLocalBills'
import { useLocalRooms } from './useLocalRooms'
import type { AAResult, LocalRoom, LocalRoomFile } from '@/lib/types'

export function useLocalBackup() {
  function buildLocalRoomFile(roomId: string): LocalRoomFile {
    const { getRoom } = useLocalRooms()
    const { getBills } = useLocalBills()
    const { getLocalAAResult } = useLocalAA()
    const room = getRoom(roomId)
    if (!room) throw new Error('房间不存在')
    if (room.mode !== 'local') throw new Error('仅本地房间支持导出')
    return {
      format: 'aa-local-room',
      version: 1,
      exported_at: new Date().toISOString(),
      room,
      bills: getBills(roomId),
      aa_result: getLocalAAResult(roomId),
    }
  }

  function downloadLocalRoom(roomId: string) {
    const file = buildLocalRoomFile(roomId)
    const safeName = file.room.name
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || roomId
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aa-room-${safeName}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseLocalRoomFile(text: string): LocalRoomFile {
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('文件不是有效的 JSON')
    }
    const file = data as LocalRoomFile
    if (
      file?.format !== 'aa-local-room'
      || file?.version !== 1
      || !file?.room?.id
      || !Array.isArray(file?.bills)
    ) {
      throw new Error('不是有效的本地房间备份文件')
    }
    return file
  }

  /**
   * 导入本地房间备份。返回 conflict=true 表示存在同名本地房间，需要确认覆盖。
   */
  function importLocalRoomFile(file: LocalRoomFile, overwrite: boolean): { roomId: string; conflict: boolean } {
    const { getRoom, saveRoom } = useLocalRooms()
    const { replaceBills } = useLocalBills()
    const { saveLocalResult } = useLocalAA()

    const existing = getRoom(file.room.id)
    if (existing) {
      if (existing.mode !== 'local') {
        throw new Error('备份的房间 id 与在线/过期房间冲突，无法导入')
      }
      if (!overwrite) {
        return { roomId: file.room.id, conflict: true }
      }
    }

    const room: LocalRoom = {
      ...file.room,
      mode: 'local',
      owner_id: null,
      self_member_id: file.room.self_member_id ?? file.room.members[0]?.id ?? null,
      updated_at: new Date().toISOString(),
    }
    saveRoom(room)
    replaceBills(room.id, file.bills.map(b => ({
      ...b,
      room_id: room.id,
      id: undefined,
      synced: false,
    })))
    // 兼容旧版导出的 aaResult 字段
    const aaResult = file.aa_result ?? (file as unknown as { aaResult?: AAResult | null }).aaResult
    if (aaResult) {
      saveLocalResult(room.id, { ...aaResult, room_id: room.id })
    }
    return { roomId: room.id, conflict: !!existing }
  }

  return { buildLocalRoomFile, downloadLocalRoom, parseLocalRoomFile, importLocalRoomFile }
}
