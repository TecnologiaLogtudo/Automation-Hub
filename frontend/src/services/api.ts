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
  changeMyPassword: (data: { current_password: string; new_password: string }) =>
    api.post('/users/me/change-password', data),
}

// Sectors API
export const sectorsApi = {
  getAll: () => api.get('/sectors'),
  getById: (id: number) => api.get(`/sectors/${id}`),
  create: (data: any) => api.post('/sectors', data),
  update: (id: number, data: any) => api.put(`/sectors/${id}`, data),
  delete: (id: number) => api.delete(`/sectors/${id}`),
}

// Audit API
export const auditApi = {
  trackAccess: (automation_id: number) => api.post('/audit/access', { automation_id }),
  getLogs: (params: {
    start_date?: string
    end_date?: string
    user_id?: number
    automation_id?: number
    page?: number
    page_size?: number
  }) => api.get('/audit/logs', { params }),
  getAnalytics: (params: { start_date?: string; end_date?: string }) =>
    api.get('/audit/analytics', { params }),
}

// Access Requests API
export const accessRequestsApi = {
  create: (data: { automation_id: number }) => api.post('/access-requests', data),
  getMine: () => api.get('/access-requests/mine'),
  getPending: () => api.get('/access-requests/pending'),
  approve: (id: number, data?: { decision_note?: string }) =>
    api.post(`/access-requests/${id}/approve`, data || {}),
  reject: (id: number, data?: { decision_note?: string }) =>
    api.post(`/access-requests/${id}/reject`, data || {}),
}
