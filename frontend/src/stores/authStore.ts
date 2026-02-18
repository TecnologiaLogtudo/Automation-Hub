import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '../services/api'

interface User {
  id: number
  email: string
  full_name: string
  is_admin: boolean
  role: string
  is_active: boolean
  sector_id: number
  created_at: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const response = await authApi.login(email, password)
          const { access_token } = response.data
          
          localStorage.setItem('token', access_token)
          set({ token: access_token, isLoading: false })
          
          // Fetch user info
          await get().fetchUser()
        } catch (error: any) {
          const message = error.response?.data?.detail || 'Erro ao fazer login'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ user: null, token: null, isAuthenticated: false, error: null })
      },

      fetchUser: async () => {
        try {
          const response = await authApi.getMe()
          set({ 
            user: response.data, 
            isAuthenticated: true 
          })
        } catch (error) {
          get().logout()
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
)

// Initialize user on app load if token exists
const initializeAuth = async () => {
  const token = localStorage.getItem('token')
  if (token) {
    useAuthStore.setState({ isLoading: true })
    try {
      await useAuthStore.getState().fetchUser()
    } finally {
      useAuthStore.setState({ isLoading: false })
    }
  }
}

initializeAuth()
