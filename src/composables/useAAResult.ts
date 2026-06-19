import { shallowRef } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { STORAGE_KEYS } from '@/utils/constants'
import type { AAResult, LocalAAResultStore } from '@/lib/types'

const store: LocalAAResultStore = loadFromStorage()
const revision = shallowRef(0)

function loadFromStorage(): LocalAAResultStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_AA_RESULTS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEYS.LOCAL_AA_RESULTS, JSON.stringify(store))
  revision.value++
}

function wrapResult(roomId: string, raw: { version: number; results: AAResult['results'] }): AAResult {
  return {
    id: '',
    room_id: roomId,
    version: raw.version,
    results: raw.results,
    calculated_at: new Date().toISOString(),
  }
}

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

  function getLocalAAResult(roomId: string): AAResult | null {
    revision.value
    return store[roomId] ?? null
  }

  function saveLocalResult(roomId: string, result: AAResult) {
    store[roomId] = result
    persist()
  }

  async function getOrCalculateAA(roomId: string, roomVersion: number): Promise<AAResult> {
    // Layer 1: localStorage — fastest, zero network
    const local = getLocalAAResult(roomId)
    if (local && local.version === roomVersion) {
      return local
    }

    // Layer 2: server aa_results table — 1 SELECT
    const cached = await getCachedResult(roomId)
    if (cached && cached.version === roomVersion) {
      saveLocalResult(roomId, cached)
      return cached
    }

    // Layer 3: RPC calculation — full compute + DB upsert
    const raw = await calculateAA(roomId)
    const result = wrapResult(roomId, raw)
    saveLocalResult(roomId, result)
    return result
  }

  function clearAAResult(roomId: string) {
    if (!(roomId in store)) return
    delete store[roomId]
    persist()
  }

  return { calculateAA, getCachedResult, getLocalAAResult, getOrCalculateAA, clearAAResult }
}
