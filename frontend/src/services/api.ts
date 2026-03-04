import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Necessário para enviar/receber cookies de sessão
  headers: {
    'Content-Type': 'application/json',
  },
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Evita loop de redirecionamento se já estiver na página de login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  getMe: () => api.get('/auth/me'),
}

// Automations API
export const automationsApi = {
  getAll: () => api.get('/automations'),
  getById: (id: number) => api.get(`/automations/${id}`),
  create: (data: any) => api.post('/automations', data),
  update: (id: number, data: any) => api.put(`/automations/${id}`, data),
  delete: (id: number) => api.delete(`/automations/${id}`),
}

// Users API
export const usersApi = {
  getAll: () => api.get('/users'),
  getById: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
}

// Sectors API
export const sectorsApi = {
  getAll: () => api.get('/sectors'),
  getById: (id: number) => api.get(`/sectors/${id}`),
  create: (data: any) => api.post('/sectors', data),
  update: (id: number, data: any) => api.put(`/sectors/${id}`, data),
  delete: (id: number) => api.delete(`/sectors/${id}`),
}
