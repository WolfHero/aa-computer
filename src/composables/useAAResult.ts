import { supabase } from '@/lib/supabaseClient'
import type { AAResult } from '@/lib/types'

export function useAAResult() {
  async function calculateAA(roomId: string) {
    const { data, error } = await supabase
      .rpc('calculate_aa', { p_room_id: roomId })
    if (error) throw error
    return data as { version: number; results: AAResult['results'] }
  }

  async function getCachedResult(roomId: string) {
    const { data, error } = await supabase
      .from('aa_results')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()

    if (error) throw error
    return data as AAResult | null
  }

  async function getOrCalculateAA(roomId: string, roomVersion: number) {
    const cached = await getCachedResult(roomId)
    if (cached && cached.version === roomVersion) {
      return cached
    }
    return await calculateAA(roomId)
  }

  return { calculateAA, getCachedResult, getOrCalculateAA }
}
