import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const userId = ref<string | null>(null)
const initialized = ref(false)

export function useAuth() {
  async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      userId.value = session.user.id
    } else {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      userId.value = data.user!.id
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

  return { userId, initialized, initAuth }
}
