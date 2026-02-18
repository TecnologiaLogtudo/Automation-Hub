import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { automationsApi, usersApi, sectorsApi } from '../services/api'
import { 
  Bot, Users, Building2, Plus, Trash2, Edit, 
  AlertCircle, CheckCircle, LogOut, X, Power
} from 'lucide-react'

type Tab = 'automations' | 'users' | 'sectors'

interface Automation {
  id: number
  title: string
  description: string
  target_url: string
  icon: string
  is_active: boolean
  sectors: { id: number; name: string }[]
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

const safeSubstring = (value: string | undefined | null, start = 0, end?: number) => {
  const str = value || ''
  return end !== undefined ? str.substring(start, end) : str.substring(start)
}

export default function Admin() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('automations')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState<any>({})
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    type: 'danger' | 'warning'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, type: 'danger' })

  // Queries
  const { data: automations = [], isLoading: loadingAutomations } = useQuery<Automation[]>({
    queryKey: ['automations-admin'],
    queryFn: () => automationsApi.getAll().then(res => res.data),
  })

  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll().then(res => res.data),
  })

  const { data: sectors = [], isLoading: loadingSectors } = useQuery<Sector[]>({
    queryKey: ['sectors'],
    queryFn: () => sectorsApi.getAll().then(res => res.data),
  })

  // Mutations
  const createAutomation = useMutation({
    mutationFn: (data: any) => automationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations-admin'] })
      setIsModalOpen(false)
    },
  })

  const updateAutomation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => automationsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations-admin'] })
      setIsModalOpen(false)
    },
  })

  const deleteAutomation = useMutation({
    mutationFn: (id: number) => automationsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations-admin'] }),
  })

  const createUser = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
    },
  })

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
    },
  })

  const deleteUser = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const toggleUserStatus = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => usersApi.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const createSector = useMutation({
    mutationFn: (data: any) => sectorsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] })
      setIsModalOpen(false)
    },
  })

  const updateSector = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => sectorsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] })
      setIsModalOpen(false)
    },
  })

  const deleteSector = useMutation({
    mutationFn: (id: number) => sectorsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sectors'] }),
  })

  const tabs = [
    { id: 'automations' as Tab, label: 'Automações', icon: Bot, count: automations.length },
    { id: 'users' as Tab, label: 'Usuários', icon: Users, count: users.length },
    { id: 'sectors' as Tab, label: 'Setores', icon: Building2, count: sectors.length },
  ]

  const handleLogout = () => {
    logout()
  }

  const handleOpenCreate = () => {
    setEditingId(null)
    setFormData({})
    // Defaults
    if (activeTab === 'automations') {
      setFormData({ is_active: true, sector_ids: [] })
    } else if (activeTab === 'users') {
      setFormData({ is_active: true, is_admin: false, role: 'user', automation_ids: [] })
    }
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: any) => {
    setEditingId(item.id)
    if (activeTab === 'automations') {
      setFormData({
        ...item,
        sector_ids: item.sectors?.map((s: any) => s.id) || []
      })
    } else {
      setFormData({ 
        ...item,
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
      if (editingId) updateAutomation.mutate({ id: editingId, data: formData })
      else createAutomation.mutate(formData)
    } else if (activeTab === 'users') {
      const data = { ...formData }
      if (!data.password) delete data.password // Don't send empty password on update
      if (editingId) updateUser.mutate({ id: editingId, data })
      else createUser.mutate(formData)
    } else if (activeTab === 'sectors') {
      if (editingId) updateSector.mutate({ id: editingId, data: formData })
      else createSector.mutate(formData)
    }
  }

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
                  <p className="text-xs text-slate-500">Administrador</p>
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
        {/* Automations Tab */}
        {activeTab === 'automations' && (
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
                            {userItem.sector?.name || 'N/A'}
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
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {userItem.role === 'manager' ? 'Gerente' : 
                             userItem.role === 'analyst' ? 'Analista' : userItem.role}
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
        {activeTab === 'sectors' && (
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
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.sector_id || ''}
                      onChange={e => setFormData({...formData, sector_id: parseInt(e.target.value)})}
                    >
                      <option value="">Selecione um setor</option>
                      {(sectors || []).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
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
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_admin"
                      checked={formData.is_admin || false}
                      onChange={e => setFormData({...formData, is_admin: e.target.checked})}
                    />
                    <label htmlFor="is_admin" className="text-sm font-medium text-slate-700">Administrador</label>
                  </div>
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
