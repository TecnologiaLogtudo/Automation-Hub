import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { auditApi, automationsApi, usersApi, sectorsApi } from '../services/api'
import { 
  Bot, Users, Building2, Plus, Trash2, Edit, 
  AlertCircle, CheckCircle, LogOut, X, Power, Shield
} from 'lucide-react'

type Tab = 'automations' | 'users' | 'sectors' | 'audit'

type HelpType = 'pdf' | 'video'

interface AutomationConfig {
  help_url?: string
  help_type?: HelpType
  help_title?: string
  [key: string]: any
}

interface Automation {
  id: number
  title: string
  description: string
  target_url: string
  icon: string
  is_active: boolean
  sectors: { id: number; name: string }[]
  config?: AutomationConfig
}

interface User {
  id: number
  email: string
  full_name: string
  is_admin: boolean
  role: string
  is_active: boolean
  sector_id: number
  sector?: { name: string }
  extra_automations?: { id: number; title: string }[]
}

interface Sector {
  id: number
  name: string
  slug: string
  description: string
}

interface FeedbackMessage {
  type: 'success' | 'error'
  message: string
}

interface AuditLogItem {
  id: number
  user_id: number
  user_name: string
  user_email: string
  user_sector_id: number
  user_sector_name: string
  automation_id: number
  automation_title: string
  occurred_at: string
}

interface PaginatedAuditLogs {
  items: AuditLogItem[]
  total: number
  page: number
  page_size: number
}

const safeSubstring = (value: string | undefined | null, start = 0, end?: number) => {
  const str = value || ''
  return end !== undefined ? str.substring(start, end) : str.substring(start)
}

const isValidHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const parseApiError = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail

  if (Array.isArray(detail)) {
    const validation = detail
      .map((item: any) => `${item?.loc?.join('.') || 'campo'}: ${item?.msg || 'valor inválido'}`)
      .join(' | ')
    return validation || fallback
  }

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  return fallback
}

export default function Admin() {
  const { user, logout } = useAuthStore()
  const isGlobalAdmin = Boolean(user?.is_admin)
  const isSectorAdmin = Boolean(user && !user.is_admin && user.role === 'sector_admin')
  const isManager = Boolean(user && !user.is_admin && user.role === 'manager')
  const profileLabel = isGlobalAdmin
    ? 'Administrador'
    : isSectorAdmin
      ? 'Chefe de Setor'
      : isManager
        ? 'Gerente'
        : 'Usuário'
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (isGlobalAdmin) return 'automations'
    if (isSectorAdmin) return 'users'
    if (isManager) return 'audit'
    return 'users'
  })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState<any>({})
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [auditFilters, setAuditFilters] = useState({
    startDate: '',
    endDate: '',
    userId: '',
    automationId: '',
  })
  const [auditPage, setAuditPage] = useState(1)
  const auditPageSize = 50
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type: 'danger' | 'warning'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'danger' })

  useEffect(() => {
    if (isManager && activeTab !== 'audit') {
      setActiveTab('audit')
      return
    }
    if (isSectorAdmin && !['users', 'audit'].includes(activeTab)) {
      setActiveTab('users')
    }
  }, [activeTab, isSectorAdmin, isManager])

  // Queries
  const { data: automations = [], isLoading: loadingAutomations } = useQuery<Automation[]>({
    queryKey: ['automations-admin'],
    queryFn: () => automationsApi.getAll().then(res => res.data),
    enabled: !isManager,
  })

  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll().then(res => res.data),
    enabled: !isManager,
  })

  const { data: sectors = [], isLoading: loadingSectors } = useQuery<Sector[]>({
    queryKey: ['sectors'],
    queryFn: () => sectorsApi.getAll().then(res => res.data),
    enabled: !isManager,
  })

  const { data: auditLogs, isLoading: loadingAuditLogs } = useQuery<PaginatedAuditLogs>({
    queryKey: ['audit-logs', auditFilters, auditPage, auditPageSize],
    queryFn: () => auditApi.getLogs({
      start_date: auditFilters.startDate ? `${auditFilters.startDate}T00:00:00` : undefined,
      end_date: auditFilters.endDate ? `${auditFilters.endDate}T23:59:59` : undefined,
      user_id: auditFilters.userId ? Number(auditFilters.userId) : undefined,
      automation_id: auditFilters.automationId ? Number(auditFilters.automationId) : undefined,
      page: auditPage,
      page_size: auditPageSize,
    }).then(res => res.data),
    enabled: Boolean(isGlobalAdmin || isSectorAdmin || isManager),
  })

  // Mutations
  const createAutomation = useMutation({
    mutationFn: (data: any) => automationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations-admin'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Automação criada com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível criar a automação.') })
    },
  })

  const updateAutomation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => automationsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations-admin'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Automação atualizada com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível atualizar a automação.') })
    },
  })

  const deleteAutomation = useMutation({
    mutationFn: (id: number) => automationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations-admin'] })
      setFeedback({ type: 'success', message: 'Automação excluída com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível excluir a automação.') })
    },
  })

  const createUser = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Usuário criado com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível criar o usuário.') })
    },
  })

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Usuário atualizado com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível atualizar o usuário.') })
    },
  })

  const deleteUser = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFeedback({ type: 'success', message: 'Usuário excluído com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível excluir o usuário.') })
    },
  })

  const toggleUserStatus = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => usersApi.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFeedback({ type: 'success', message: 'Status do usuário atualizado com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível atualizar o status do usuário.') })
    },
  })

  const createSector = useMutation({
    mutationFn: (data: any) => sectorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Setor criado com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível criar o setor.') })
    },
  })

  const updateSector = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => sectorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] })
      setIsModalOpen(false)
      setFeedback({ type: 'success', message: 'Setor atualizado com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível atualizar o setor.') })
    },
  })

  const deleteSector = useMutation({
    mutationFn: (id: number) => sectorsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] })
      setFeedback({ type: 'success', message: 'Setor excluído com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível excluir o setor.') })
    },
  })

  const tabs = isManager
    ? [{ id: 'audit' as Tab, label: 'Auditoria', icon: Shield, count: auditLogs?.total || 0 }]
    : isSectorAdmin
      ? [
          { id: 'users' as Tab, label: 'Usuários', icon: Users, count: users.length },
          { id: 'audit' as Tab, label: 'Auditoria', icon: Shield, count: auditLogs?.total || 0 },
        ]
      : [
          { id: 'automations' as Tab, label: 'Automações', icon: Bot, count: automations.length },
          { id: 'users' as Tab, label: 'Usuários', icon: Users, count: users.length },
          { id: 'sectors' as Tab, label: 'Setores', icon: Building2, count: sectors.length },
          { id: 'audit' as Tab, label: 'Auditoria', icon: Shield, count: auditLogs?.total || 0 },
        ]

  const handleLogout = () => {
    logout()
  }

  const handleOpenCreate = () => {
    setFeedback(null)
    setEditingId(null)
    setFormData({})
    // Defaults
    if (activeTab === 'automations') {
      setFormData({ is_active: true, sector_ids: [], help_url: '', help_type: '' })
    } else if (activeTab === 'users') {
      setFormData({
        is_active: true,
        is_admin: false,
        role: 'user',
        automation_ids: [],
        sector_id: isSectorAdmin ? user?.sector_id : undefined
      })
    }
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: any) => {
    setFeedback(null)
    setEditingId(item.id)
    if (activeTab === 'automations') {
      const config = item.config || {}
      setFormData({
        ...item,
        config,
        help_url: config.help_url || '',
        help_type: config.help_type || '',
        help_title: config.help_title || '',
        sector_ids: item.sectors?.map((s: any) => s.id) || []
      })
    } else {
      setFormData({ 
        ...item,
        is_admin: isSectorAdmin ? false : item.is_admin,
        sector_id: isSectorAdmin ? user?.sector_id : item.sector_id,
        automation_ids: item.extra_automations?.map((a: any) => a.id) || []
      })
    }
    setIsModalOpen(true)
  }

  const handleConfirmAction = (
    title: string, 
    message: string, 
    action: () => void, 
    type: 'danger' | 'warning' = 'danger'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: action,
      type
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeTab === 'automations') {
      const helpUrl = (formData.help_url || '').trim()
      const helpType = formData.help_type as HelpType | ''
      const helpTitle = (formData.help_title || '').trim()

      if (helpUrl && !isValidHttpUrl(helpUrl)) {
        setFeedback({ type: 'error', message: 'URL de dúvidas inválida. Use http:// ou https://.' })
        return
      }

      if (helpUrl && !helpType) {
        setFeedback({ type: 'error', message: 'Selecione o tipo de dúvidas (PDF ou Vídeo).' })
        return
      }

      const {
        help_url: _helpUrl,
        help_type: _helpType,
        help_title: _helpTitle,
        ...automationPayload
      } = formData

      const nextConfig: AutomationConfig = { ...(automationPayload.config || {}) }

      if (helpUrl) {
        nextConfig.help_url = helpUrl
        nextConfig.help_type = helpType as HelpType
        if (helpTitle) nextConfig.help_title = helpTitle
        else delete nextConfig.help_title
      } else {
        delete nextConfig.help_url
        delete nextConfig.help_type
        delete nextConfig.help_title
      }

      automationPayload.config = nextConfig

      if (editingId) updateAutomation.mutate({ id: editingId, data: automationPayload })
      else createAutomation.mutate(automationPayload)
    } else if (activeTab === 'users') {
      const data = { ...formData }
      if (isSectorAdmin) {
        data.is_admin = false
        data.sector_id = user?.sector_id
      }
      if (!data.password) delete data.password // Don't send empty password on update
      if (editingId) updateUser.mutate({ id: editingId, data })
      else createUser.mutate(data)
    } else if (activeTab === 'sectors') {
      if (editingId) updateSector.mutate({ id: editingId, data: formData })
      else createSector.mutate(formData)
    }
  }

  const auditItems = auditLogs?.items || []
  const auditTotalPages = Math.max(1, Math.ceil((auditLogs?.total || 0) / auditPageSize))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl shadow-lg shadow-blue-500/25">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Painel Admin</h1>
                <p className="text-xs text-slate-500">Gerenciamento do Sistema</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Voltar ao Dashboard
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{user?.full_name}</p>
                  <p className="text-xs text-slate-500">{profileLabel}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center text-white font-medium">
                  {safeSubstring(user?.full_name, 0, 1).toUpperCase()}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }
                `}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                <span className={`
                  ml-1 px-2 py-0.5 text-xs rounded-full
                  ${activeTab === tab.id
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-slate-100 text-slate-600'
                  }
                `}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {feedback && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <p>{feedback.message}</p>
              <button
                type="button"
                className="text-current/70 hover:text-current"
                onClick={() => setFeedback(null)}
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Automations Tab */}
        {!isSectorAdmin && activeTab === 'automations' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Gerenciar Automações</h2>
              <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nova Automação
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Nome</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">URL</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Setores</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loadingAutomations ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : automations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                        Nenhuma automação encontrada
                      </td>
                    </tr>
                  ) : (
                    (automations || []).map((automation) => (
                      <tr key={automation.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{automation.title}</div>
                          <div className="text-sm text-slate-500">{automation.description}</div>
                        </td>
                        <td className="px-6 py-4">
                          <a
                            href={automation.target_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            {safeSubstring(automation.target_url, 0, 40)}...
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(automation.sectors || []).map((sector) => (
                              <span
                                key={sector.id}
                                className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md"
                              >
                                {sector.name}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {automation.is_active ? (
                            <span className="flex items-center gap-1 text-green-600 text-sm">
                              <CheckCircle className="w-4 h-4" />
                              Ativo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500 text-sm">
                              <AlertCircle className="w-4 h-4" />
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleOpenEdit(automation)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConfirmAction(
                                'Excluir Automação',
                                `Tem certeza que deseja excluir a automação "${automation.title}"?`,
                                () => deleteAutomation.mutate(automation.id)
                              )}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Gerenciar Usuários</h2>
              <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo Usuário
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Nome</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">E-mail</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Setor</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Tipo</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Função</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Acessos Extras</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        Nenhum usuário encontrado
                      </td>
                    </tr>
                  ) : (
                    (users || []).map((userItem) => (
                      <tr key={userItem.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {userItem.full_name}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{userItem.email}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">
                            {sectors.find(s => s.id === userItem.sector_id)?.name || userItem.sector?.name || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {userItem.is_admin ? (
                            <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-md">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">
                              Usuário
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-md capitalize ${
                            userItem.role === 'manager' ? 'bg-orange-100 text-orange-700' :
                            userItem.role === 'analyst' ? 'bg-cyan-100 text-cyan-700' :
                            userItem.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                            userItem.role === 'sector_admin' ? 'bg-indigo-100 text-indigo-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {userItem.role === 'manager' ? 'Gerente' : 
                             userItem.role === 'analyst' ? 'Analista' :
                             userItem.role === 'sector_admin' ? 'Chefe de Setor' : userItem.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {(userItem.extra_automations || []).length > 0 ? (
                              (userItem.extra_automations || []).map((a) => (
                                <span key={a.id} className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-md border border-yellow-200">
                                  {a.title}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {userItem.is_active ? (
                            <span className="flex items-center gap-1 text-green-600 text-sm">
                              <CheckCircle className="w-4 h-4" />
                              Ativo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-slate-500 text-sm">
                              <AlertCircle className="w-4 h-4" />
                              Inativo
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleOpenEdit(userItem)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConfirmAction(
                                userItem.is_active ? 'Inativar Usuário' : 'Ativar Usuário',
                                `Deseja realmente ${userItem.is_active ? 'inativar' : 'ativar'} o usuário "${userItem.full_name}"?`,
                                () => toggleUserStatus.mutate({ id: userItem.id, is_active: !userItem.is_active }),
                                'warning'
                              )}
                              className={`p-2 rounded-lg transition-colors ${
                                userItem.is_active 
                                  ? 'text-slate-400 hover:text-orange-600 hover:bg-orange-50' 
                                  : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={userItem.is_active ? "Inativar" : "Ativar"}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleConfirmAction(
                                'Excluir Usuário',
                                `Tem certeza que deseja excluir o usuário "${userItem.full_name}"? Esta ação não pode ser desfeita.`,
                                () => deleteUser.mutate(userItem.id)
                              )}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sectors Tab */}
        {!isSectorAdmin && activeTab === 'sectors' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Gerenciar Setores</h2>
              <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Novo Setor
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingSectors ? (
                <div className="col-span-full text-center py-8 text-slate-500">
                  Carregando...
                </div>
              ) : sectors.length === 0 ? (
                <div className="col-span-full text-center-slate-500 py-8 text">
                  Nenhum setor encontrado
                </div>
              ) : (
                (sectors || []).map((sector) => (
                  <div
                    key={sector.id}
                    className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">{sector.name}</h3>
                        <p className="text-sm text-slate-500 mt-1">{sector.description}</p>
                        <span className="inline-block mt-2 px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md">
                          {sector.slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleOpenEdit(sector)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleConfirmAction(
                            'Excluir Setor',
                            `Tem certeza que deseja excluir o setor "${sector.name}"?`,
                            () => deleteSector.mutate(sector.id)
                          )}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {activeTab === 'audit' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Logs de Auditoria</h2>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Data inicial</label>
                  <input
                    type="date"
                    value={auditFilters.startDate}
                    onChange={(e) => {
                      setAuditPage(1)
                      setAuditFilters({ ...auditFilters, startDate: e.target.value })
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Data final</label>
                  <input
                    type="date"
                    value={auditFilters.endDate}
                    onChange={(e) => {
                      setAuditPage(1)
                      setAuditFilters({ ...auditFilters, endDate: e.target.value })
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">ID do usuário</label>
                  <input
                    type="number"
                    min="1"
                    value={auditFilters.userId}
                    onChange={(e) => {
                      setAuditPage(1)
                      setAuditFilters({ ...auditFilters, userId: e.target.value })
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Ex: 12"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">ID da automação</label>
                  <input
                    type="number"
                    min="1"
                    value={auditFilters.automationId}
                    onChange={(e) => {
                      setAuditPage(1)
                      setAuditFilters({ ...auditFilters, automationId: e.target.value })
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    placeholder="Ex: 7"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setAuditPage(1)
                      setAuditFilters({ startDate: '', endDate: '', userId: '', automationId: '' })
                    }}
                    className="w-full px-3 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
                  >
                    Limpar filtros
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Data/Hora</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Usuário</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Setor</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Automação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loadingAuditLogs ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Carregando...</td>
                    </tr>
                  ) : auditItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhum log encontrado</td>
                    </tr>
                  ) : (
                    auditItems.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-slate-700 text-sm">
                          {new Date(log.occurred_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="font-medium text-slate-900">{log.user_name}</div>
                          <div className="text-slate-500">{log.user_email} (ID {log.user_id})</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700 text-sm">
                          {log.user_sector_name} (ID {log.user_sector_id})
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="font-medium text-slate-900">{log.automation_title}</div>
                          <div className="text-slate-500">ID {log.automation_id}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-600">
                Total: {auditLogs?.total || 0} registros
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  disabled={auditPage <= 1}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-700">
                  Página {auditPage} de {auditTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                  disabled={auditPage >= auditTotalPages}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">
                {editingId ? 'Editar' : 'Novo'} {
                  activeTab === 'automations' ? 'Automação' :
                  activeTab === 'users' ? 'Usuário' : 'Setor'
                }
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Automation Fields */}
              {activeTab === 'automations' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.title || ''}
                      onChange={e => setFormData({...formData, title: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.description || ''}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">URL de Destino</label>
                    <input
                      type="url"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.target_url || ''}
                      onChange={e => setFormData({...formData, target_url: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ícone (código)</label>
                    <input
                      type="text"
                      placeholder="Ex: robot, clock, users"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.icon || ''}
                      onChange={e => setFormData({...formData, icon: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">URL de Dúvidas</label>
                    <input
                      type="url"
                      pattern="https?://.+"
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.help_url || ''}
                      onChange={e => setFormData({...formData, help_url: e.target.value})}
                    />
                    <p className="text-xs text-slate-500 mt-1">Link para PDF ou vídeo de instrução (opcional).</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Dúvidas</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.help_type || ''}
                      required={Boolean((formData.help_url || '').trim())}
                      onChange={e => setFormData({...formData, help_type: e.target.value})}
                    >
                      <option value="">Selecione (opcional)</option>
                      <option value="pdf">PDF</option>
                      <option value="video">Vídeo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Título de Dúvidas (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Manual rápido"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.help_title || ''}
                      onChange={e => setFormData({...formData, help_title: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Setores Permitidos</label>
                    <select
                      multiple
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
                      value={formData.sector_ids?.map(String) || []}
                      onChange={e => {
                        const selected = Array.from(e.target.selectedOptions, option => parseInt(option.value))
                        setFormData({...formData, sector_ids: selected})
                      }}
                    >
                      {(sectors || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Segure Ctrl para selecionar múltiplos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active ?? true}
                      onChange={e => setFormData({...formData, is_active: e.target.checked})}
                    />
                    <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Ativo</label>
                  </div>
                </>
              )}

              {/* User Fields */}
              {activeTab === 'users' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.full_name || ''}
                      onChange={e => setFormData({...formData, full_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.email || ''}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha {editingId && '(deixe em branco para manter)'}</label>
                    <input
                      type="password"
                      required={!editingId}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.password || ''}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Setor</label>
                    <select
                      required
                      disabled={isSectorAdmin}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.sector_id || (isSectorAdmin ? user?.sector_id || '' : '')}
                      onChange={e => setFormData({...formData, sector_id: parseInt(e.target.value)})}
                    >
                      {!isSectorAdmin && <option value="">Selecione um setor</option>}
                      {(isSectorAdmin
                        ? (sectors || []).filter(s => s.id === user?.sector_id)
                        : (sectors || [])
                      ).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {isSectorAdmin && (
                      <p className="text-xs text-slate-500 mt-1">Setor bloqueado para chefe de setor.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Função</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.role || 'user'}
                      onChange={e => setFormData({...formData, role: e.target.value})}
                    >
                      <option value="user">Usuário Padrão</option>
                      <option value="manager">Gerente (Vê tudo)</option>
                      <option value="analyst">Analista de Dados (Vê tudo)</option>
                      <option value="sector_admin">Chefe de Setor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Automações Extras (Bônus)</label>
                    
                    {/* Lista de automações selecionadas com opção de remover */}
                    <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
                      {(formData.automation_ids || []).map((id: number) => {
                        const automation = automations.find(a => a.id === id)
                        if (!automation) return null
                        return (
                          <span key={id} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded-md border border-blue-100">
                            {automation.title}
                            <button
                              type="button"
                              onClick={() => setFormData({
                                ...formData,
                                automation_ids: formData.automation_ids.filter((i: number) => i !== id)
                              })}
                              className="hover:text-red-600 ml-1"
                              title="Revogar acesso"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        )
                      })}
                    </div>

                    <select
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value=""
                      onChange={e => {
                        const id = parseInt(e.target.value)
                        if (id && !formData.automation_ids?.includes(id)) {
                          setFormData({
                            ...formData,
                            automation_ids: [...(formData.automation_ids || []), id]
                          })
                        }
                      }}
                    >
                      <option value="">Adicionar automação...</option>
                      {(automations || [])
                        .filter(a => !formData.automation_ids?.includes(a.id))
                        .map(a => (
                          <option key={a.id} value={a.id}>{a.title}</option>
                        ))
                      }
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Selecione na lista para conceder acesso. Clique no X para revogar.</p>
                  </div>
                  {!isSectorAdmin && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_admin"
                        checked={formData.is_admin || false}
                        onChange={e => setFormData({...formData, is_admin: e.target.checked})}
                      />
                      <label htmlFor="is_admin" className="text-sm font-medium text-slate-700">Administrador</label>
                    </div>
                  )}
                </>
              )}

              {/* Sector Fields */}
              {activeTab === 'sectors' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Slug (código)</label>
                    <input
                      type="text"
                      required
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.slug || ''}
                      onChange={e => setFormData({...formData, slug: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                    <textarea
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.description || ''}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-full ${confirmModal.type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{confirmModal.title}</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              {confirmModal.message}
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm()
                  setConfirmModal({ ...confirmModal, isOpen: false })
                }}
                className={`px-4 py-2 text-white rounded-lg transition-colors ${
                  confirmModal.type === 'danger' 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
