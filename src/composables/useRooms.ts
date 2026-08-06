import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from './useAuth'
import { useLocalBills } from './useLocalBills'
import { useLocalRooms } from './useLocalRooms'
import { ROOM_PAGE_SIZE } from '@/utils/constants'
import type { RoomMember, RoomWithMembers } from '@/lib/types'

export function useRooms() {
  const { userId, ensureAuth } = useAuth()
  const rooms = ref<RoomWithMembers[]>([])
  const loading = ref(false)
  const finished = ref(false)
  const page = ref(0)

  let cachedUserRoomIds: string[] | null = null

  async function fetchRooms(refresh = false) {
    if (!userId.value) {
      finished.value = true
      return
    }
    if (refresh) {
      page.value = 0
      finished.value = false
      rooms.value = []
      cachedUserRoomIds = null
    }
    if (finished.value) return

    loading.value = true

    if (!cachedUserRoomIds) {
      const userRoomIds = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', userId.value!)
      cachedUserRoomIds = userRoomIds.data?.map(m => m.room_id) ?? []
    }
    const ids = cachedUserRoomIds
    if (ids.length === 0) {
      loading.value = false
      finished.value = true
      return
    }

    const from = page.value * ROOM_PAGE_SIZE
    const to = from + ROOM_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        members:room_members!inner(id, name, user_id, is_unsubmitted)
      `)
      .in('id', ids)
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    if (data && data.length > 0) {
      rooms.value = refresh ? data as unknown as RoomWithMembers[] : [...rooms.value, ...data as unknown as RoomWithMembers[]]
      page.value++
    } else {
      finished.value = true
    }

    loading.value = false
  }

  /** 新房间一律本地创建，不触发匿名登录 */
  async function createRoom(name: string, description: string, creatorName: string) {
    const room = useLocalRooms().createLocalRoom(name, description, creatorName)
    return { room: { id: room.id, name, description }, memberId: room.self_member_id! }
  }

  /**
   * 本地房间 → 在线房间：
   * 确认后调用 convert_local_room 原子上传房间/成员/账单，再标记本地数据已同步。
   */
  async function convertLocalRoomToOnline(roomId: string) {
    const localRooms = useLocalRooms()
    const localBills = useLocalBills()
    const room = localRooms.getRoom(roomId)
    if (!room) throw new Error('房间不存在')
    if (room.mode !== 'local') throw new Error('仅本地房间可转换为在线房间')

    await ensureAuth()

    const bills = localBills.getBills(roomId)
    const { data, error } = await supabase.rpc('convert_local_room', {
      p_room_id: room.id,
      p_name: room.name,
      p_description: room.description,
      p_settings: room.settings ?? {},
      p_self_member_id: room.self_member_id,
      p_members: room.members.map(m => ({
        id: m.id,
        name: m.name,
        is_unsubmitted: !!m.is_unsubmitted,
      })),
      p_bills: bills.map(b => ({
        id: b.id ?? b.local_id,
        local_id: b.local_id,
        content: b.content,
        amount: b.amount,
        paid_at: b.paid_at,
        shared_by: b.shared_by,
        created_by: b.created_by,
        payer_id: b.payer_id ?? b.created_by,
        creator_name: b.creator_name,
        created_at: b.created_at,
      })),
      p_version: room.version,
      p_created_at: room.created_at,
    })
    if (error) throw error

    const result = data as {
      success: boolean
      already_converted?: boolean
      message?: string
      bill_ids?: Record<string, string>
    }
    if (!result.success) {
      throw new Error(result.message ?? '转换失败')
    }

    if (!result.already_converted && result.bill_ids) {
      localBills.markAllSynced(roomId, result.bill_ids)
    }
    localRooms.saveRoom({
      ...room,
      mode: 'online',
      owner_id: userId.value,
      self_member_id: null,
      updated_at: new Date().toISOString(),
      members: room.members.map(m => (
        m.id === room.self_member_id ? { ...m, user_id: userId.value } : m
      )),
    })
    return result
  }

  async function joinRoom(roomId: string, name: string) {
    const { error } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId.value!, name })
    if (error) throw error
  }

  async function getRoomById(roomId: string) {
    const { data, error } = await supabase
      .from('rooms')
      .select(`
        *,
        members:room_members(id, name, user_id, is_unsubmitted, created_at)
      `)
      .eq('id', roomId)
      .order('created_at', { foreignTable: 'members', ascending: true })
      .single()

    if (error) throw error
    return data as unknown as RoomWithMembers
  }

  async function getMyMemberRecord(roomId: string) {
    const { data, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId.value!)
      .single()

    if (error) throw error
    return data as RoomMember
  }

  async function setUnsubmitted(roomId: string, unsubmitted: boolean) {
    const member = await getMyMemberRecord(roomId)
    const { error } = await supabase
      .from('room_members')
      .update({ is_unsubmitted: unsubmitted })
      .eq('id', member.id)
    if (error) throw error
  }

  async function incrementRoomVersion(roomId: string) {
    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('version')
      .eq('id', roomId)
      .single()
    if (fetchError) throw fetchError

    const { error: updateError } = await supabase
      .from('rooms')
      .update({ version: room.version + 1, updated_at: new Date().toISOString() })
      .eq('id', roomId)
    if (updateError) throw updateError
  }

  // --- Owner management functions ---

  async function addMember(roomId: string, name: string) {
    const { data, error } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: null, name })
      .select()
      .single()
    if (error) throw error
    return data as RoomMember
  }

  async function updateMemberName(memberId: string, name: string) {
    const { error } = await supabase
      .from('room_members')
      .update({ name })
      .eq('id', memberId)
    if (error) throw error
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('id', memberId)
    if (error) throw error
  }

  async function generateInviteToken(memberId: string) {
    const { data, error } = await supabase.rpc('generate_member_invite_token', { p_member_id: memberId })
    if (error) throw error
    return data as string
  }

  async function getMemberByInviteToken(token: string) {
    const { data, error } = await supabase.rpc('get_member_by_invite_token', { p_token: token })
    if (error) throw error
    return data as { id: string; name: string; room_id: string; room_name: string; room_owner_id: string; is_bound: boolean; creator_name: string } | null
  }

  async function acceptInvite(token: string) {
    const { data, error } = await supabase.rpc('accept_invite', { p_token: token })
    if (error) throw error
    return data as { success: boolean; error?: string; member_id?: string; name?: string; room_id?: string }
  }

  return {
    rooms, loading, finished, page,
    fetchRooms, createRoom, convertLocalRoomToOnline, joinRoom, getRoomById,
    getMyMemberRecord, setUnsubmitted, incrementRoomVersion,
    addMember, updateMemberName, removeMember,
    generateInviteToken, getMemberByInviteToken, acceptInvite,
  }
}
