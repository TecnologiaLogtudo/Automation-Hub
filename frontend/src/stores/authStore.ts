import { create } from 'zustand'
import { authApi, API_URL } from '../services/api'

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
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  logout: () => void
  fetchUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Começa carregando para verificar a sessão
  error: null,

  logout: () => {
    set({ user: null, isAuthenticated: false, error: null })
    // Redireciona para o logout do backend (que limpa cookies e chama Keycloak)
    window.location.href = `${API_URL}/auth/logout`
  },

  fetchUser: async () => {
    set({ isLoading: true })
    try {
      const response = await authApi.getMe()
      set({ 
        user: response.data, 
        isAuthenticated: true,
        isLoading: false,
        error: null
      })
    } catch (error) {
      set({ 
        user: null, 
        isAuthenticated: false, 
        isLoading: false 
        // Não definimos erro aqui para não mostrar mensagem na tela de login inicial
      })
    }
  },

  clearError: () => set({ error: null }),
}))
