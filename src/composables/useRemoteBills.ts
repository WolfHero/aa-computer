import { supabase } from '@/lib/supabaseClient'
import { useLocalBills } from './useLocalBills'
import { useRooms } from './useRooms'
import type { BillFilter, SortMode } from '@/lib/types'

export function useRemoteBills() {
  const { getUnsyncedBills, markAsSynced } = useLocalBills()
  const { incrementRoomVersion, setUnsubmitted } = useRooms()

  async function submitBills(roomId: string) {
    const unsynced = getUnsyncedBills(roomId)
    if (unsynced.length === 0) return

    const { data, error } = await supabase.from('bills').insert(
      unsynced.map(b => ({
        room_id: b.room_id,
        content: b.content,
        amount: b.amount,
        paid_at: b.paid_at,
        shared_by: b.shared_by,
        created_by: b.created_by,
        creator_name: b.creator_name,
      }))
    ).select()
    if (error) throw error

    markAsSynced(roomId, unsynced.map(b => b.local_id), data?.map(d => d.id))
    await incrementRoomVersion(roomId)
    await setUnsubmitted(roomId, false)
  }

  async function markForNextBill(roomId: string) {
    await setUnsubmitted(roomId, true)
  }

  async function checkUnsubmittedMembers(roomId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('room_members')
      .select('name')
      .eq('room_id', roomId)
      .eq('is_unsubmitted', true)

    if (error) throw error

    if (data.length > 0) {
      return `用户 ${data.map(m => m.name).join('、')} 未提交付账记录`
    }
    return null
  }

  async function fetchBills(
    roomId: string,
    options: {
      sortBy?: SortMode
      page?: number
      pageSize?: number
      filters?: BillFilter
    } = {}
  ) {
    let query = supabase
      .from('bills')
      .select('*')
      .eq('room_id', roomId)
      .order(options.sortBy ?? 'created_at', { ascending: false })
      .range(
        (options.page ?? 0) * (options.pageSize ?? 20),
        ((options.page ?? 0) + 1) * (options.pageSize ?? 20) - 1
      )

    if (options.filters?.content) {
      query = query.ilike('content', `%${options.filters.content}%`)
    }
    if (options.filters?.creator_id) {
      query = query.eq('created_by', options.filters.creator_id)
    }
    if (options.filters?.paid_at_start) {
      query = query.gte('paid_at', options.filters.paid_at_start)
    }
    if (options.filters?.paid_at_end) {
      query = query.lte('paid_at', options.filters.paid_at_end)
    }

    const { data, error } = await query
    if (error) throw error
    return data
  }

  return { submitBills, markForNextBill, checkUnsubmittedMembers, fetchBills }
}
