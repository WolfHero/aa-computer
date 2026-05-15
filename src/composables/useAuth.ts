import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const userId = ref<string | null>(null)
const initialized = ref(false)

export function useAuth() {
  async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      userId.value = session.user.id
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        userId.value = session.user.id
      } else {
        userId.value = null
      }
    })

    initialized.value = true
  }

  async function ensureAuth() {
    if (userId.value) return
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    userId.value = data.user!.id
  }

  async function getRefreshToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.refresh_token ?? null
  }

  async function refreshSession(token: string) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: token })
    if (error) throw error
    userId.value = data.user!.id
  }

  return { userId, initialized, initAuth, ensureAuth, getRefreshToken, refreshSession }
}
