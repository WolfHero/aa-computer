import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from './useAuth'
import { ROOM_PAGE_SIZE } from '@/utils/constants'
import type { Room, RoomMember, RoomWithMembers } from '@/lib/types'

export function useRooms() {
  const { userId } = useAuth()
  const rooms = ref<RoomWithMembers[]>([])
  const loading = ref(false)
  const finished = ref(false)
  const page = ref(0)

  let cachedUserRoomIds: string[] | null = null

  async function fetchRooms(refresh = false) {
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

  async function createRoom(name: string, description: string, creatorName: string) {
    const roomId = crypto.randomUUID()

    const { error: roomError } = await supabase
      .from('rooms')
      .insert({ id: roomId, name, description })
    if (roomError) throw roomError

    const { data: member, error: memberError } = await supabase
      .from('room_members')
      .insert({ room_id: roomId, user_id: userId.value!, name: creatorName })
      .select()
      .single()
    if (memberError) throw memberError

    return { room: { id: roomId, name, description }, memberId: member.id }
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

  return {
    rooms, loading, finished, page,
    fetchRooms, createRoom, joinRoom, getRoomById,
    getMyMemberRecord, setUnsubmitted, incrementRoomVersion,
  }
}
