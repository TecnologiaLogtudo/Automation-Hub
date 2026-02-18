import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { automationsApi, usersApi, sectorsApi } from '../services/api'
import { 
  Bot, Users, Building2, Plus, Trash2, Edit, 
  AlertCircle, CheckCircle
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
  is_active: boolean
  sector_id: number
  sector?: { name: string }
}

interface Sector {
  id: number
  name: string
  slug: string
  description: string
}

export default function Admin() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('automations')

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
  const deleteAutomation = useMutation({
    mutationFn: (id: number) => automationsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations-admin'] }),
  })

  const deleteUser = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
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
                  {user?.full_name?.charAt(0).toUpperCase()}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Bot className="w-5 h-5" />
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
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
                    automations.map((automation) => (
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
                            {automation.target_url.substring(0, 40)}...
                          </a>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {automation.sectors.map((sector) => (
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
                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteAutomation.mutate(automation.id)}
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
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-600">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                        Nenhum usuário encontrado
                      </td>
                    </tr>
                  ) : (
                    users.map((userItem) => (
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
                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteUser.mutate(userItem.id)}
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

        {/* Sectors Tab */}
        {activeTab === 'sectors' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Gerenciar Setores</h2>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
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
                sectors.map((sector) => (
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
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteSector.mutate(sector.id)}
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
    </div>
  )
}
