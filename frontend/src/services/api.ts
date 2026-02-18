import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
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
