import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { accessRequestsApi, auditApi, automationsApi, usersApi } from '../services/api'
import {
  Bot, Search, LogOut, Settings, ExternalLink, HelpCircle, FileText, Video,
  LayoutGrid, ChevronRight, Lock, KeyRound, X
} from 'lucide-react'
import * as LucideIcons from 'lucide-react'

type HelpType = 'pdf' | 'video'
type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | null

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
  has_access: boolean
  access_request_status: AccessRequestStatus
  config?: AutomationConfig
}

const getIconComponent = (iconName: string) => {
  const cleanName = iconName?.trim() || ''
  if (!cleanName) return LucideIcons.Bot

  const pascalCaseName = cleanName.replace(/(^\w|-\w)/g, (clear) => clear.replace(/-/, '').toUpperCase())
  const manualMap: Record<string, any> = {
    dollar: LucideIcons.Banknote,
    robot: LucideIcons.Bot,
  }

  const Icon = (LucideIcons as any)[cleanName] || (LucideIcons as any)[pascalCaseName] || manualMap[cleanName]
  return Icon || LucideIcons.Bot
}

const safeSubstring = (value: string | undefined | null, start = 0, end?: number) => {
  const str = value || ''
  return end !== undefined ? str.substring(start, end) : str.substring(start)
}

const safe = (v?: string) => (v || '').toLowerCase()

const parseApiError = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail
  if (Array.isArray(detail)) {
    const validation = detail
      .map((item: any) => `${item?.loc?.join('.') || 'campo'}: ${item?.msg || 'valor inválido'}`)
      .join(' | ')
    return validation || fallback
  }
  if (typeof detail === 'string' && detail.trim()) return detail
  return fallback
}

const requestStatusLabel: Record<Exclude<AccessRequestStatus, null>, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Reprovada',
  cancelled: 'Cancelada',
}

// Componente para animar a contagem de números usando requestAnimationFrame
const AnimatedCount = ({ value }: { value: number }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const duration = 1200 // 1.2s de duração
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Curva de ease-out suave (easeOutQuart)
      const easeProgress = 1 - Math.pow(1 - progress, 4)
      
      setCount(Math.floor(easeProgress * value))

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setCount(value)
      }
    }

    requestAnimationFrame(animate)
  }, [value])

  return <span>{count}</span>
}

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const canAccessManagement = Boolean(user?.is_admin || user?.role === 'sector_admin' || user?.role === 'manager')
  const isGlobalAdmin = Boolean(user?.is_admin)
  const isSectorAdmin = Boolean(user?.role === 'sector_admin' && !user?.is_admin)
  const isManager = Boolean(user?.role === 'manager' && !user?.is_admin)
  const [searchQuery, setSearchQuery] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })

  // Efeito de Máquina de Escrever (Typewriter)
  const [displayedGreeting, setDisplayedGreeting] = useState('')
  const fullGreeting = `Bem-vindo, ${user?.full_name}!`

  useEffect(() => {
    let currentLength = 0
    setDisplayedGreeting('')
    const interval = setInterval(() => {
      currentLength++
      setDisplayedGreeting(fullGreeting.slice(0, currentLength))
      if (currentLength >= fullGreeting.length) {
        clearInterval(interval)
      }
    }, 60) // Velocidade da digitação (ms)
    return () => clearInterval(interval)
  }, [fullGreeting])

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ['automations'],
    queryFn: () => automationsApi.getAll().then(res => res.data),
  })

  const requestAccessMutation = useMutation({
    mutationFn: (automation_id: number) => accessRequestsApi.create({ automation_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] })
      setFeedback({ type: 'success', message: 'Solicitação enviada com sucesso.' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível enviar a solicitação.') })
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { current_password: string; new_password: string }) =>
      usersApi.changeMyPassword(payload),
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Senha alterada com sucesso.' })
      setIsPasswordModalOpen(false)
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (error: any) => {
      setFeedback({ type: 'error', message: parseApiError(error, 'Não foi possível alterar a senha.') })
    },
  })

  const filteredActiveAutomations = automations.filter((automation) => {
    if (!automation.is_active) return false
    const search = safe(searchQuery)
    return safe(automation.title).includes(search) || safe(automation.description).includes(search)
  })

  const availableAutomations = filteredActiveAutomations.filter((automation) => automation.has_access)
  const blockedAutomations = filteredActiveAutomations.filter((automation) => !automation.has_access)

  const handleLogout = () => {
    logout()
  }

  const openInNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openAutomation = (automation: Automation) => {
    if (!automation.has_access) return
    auditApi.trackAccess(automation.id).catch(() => {
      // Tracking is non-blocking by design.
    })
    openInNewTab(automation.target_url)
  }

  const openHelp = (event: React.MouseEvent<HTMLButtonElement>, url: string) => {
    event.stopPropagation()
    openInNewTab(url)
  }

  const getHelpIcon = (type?: HelpType) => {
    if (type === 'video') return Video
    if (type === 'pdf') return FileText
    return HelpCircle
  }

  const handleRequestAccess = (event: React.MouseEvent<HTMLButtonElement>, automationId: number) => {
    event.stopPropagation()
    requestAccessMutation.mutate(automationId)
  }

  const handleSubmitPassword = (event: React.FormEvent) => {
    event.preventDefault()

    if (!passwordData.current_password || !passwordData.new_password) {
      setFeedback({ type: 'error', message: 'Preencha todos os campos de senha.' })
      return
    }
    if (passwordData.new_password !== passwordData.confirm_password) {
      setFeedback({ type: 'error', message: 'A confirmação da nova senha não confere.' })
      return
    }
    if (passwordData.current_password === passwordData.new_password) {
      setFeedback({ type: 'error', message: 'A nova senha deve ser diferente da atual.' })
      return
    }

    changePasswordMutation.mutate({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password,
    })
  }

  // Lida com o Hover Tilt 3D
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    const rotateX = ((y / rect.height) - 0.5) * -8
    const rotateY = ((x / rect.width) - 0.5) * 8
    
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget
    card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`
  }

  const renderAutomationCard = (automation: Automation, index: number, blocked = false) => {
    const Icon = getIconComponent(automation.icon)
    const helpUrl = automation.config?.help_url?.trim()
    const HelpIcon = getHelpIcon(automation.config?.help_type)
    const requestStatus = automation.access_request_status
    const isPending = requestStatus === 'pending'

    return (
      <div
        key={automation.id}
        className={`group/card automation-card relative p-6 animate-fade-in ${
          blocked ? 'blocked' : 'cursor-pointer hover:bg-white/10'
        }`}
        style={{ animationDelay: `${index * 80}ms` }}
        onClick={() => openAutomation(automation)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border border-white/5 shadow-inner ${
          blocked
            ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400'
            : 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400'
        }`}>
          <Icon className="w-6 h-6 icon-bounce" />
        </div>

        <h3 className="text-lg font-semibold text-white mb-2">
          {automation.title}
        </h3>
        <p className="text-sm text-slate-400 mb-4 line-clamp-2">
          {automation.description}
        </p>

        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          {!blocked ? (
            <div className="flex items-center gap-3">
              <span className="shimmer-btn inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm font-medium text-blue-400 transition-colors group-hover/card:bg-blue-500/20 group-hover/card:text-blue-300 group-hover/card:border-blue-500/30">
                Acessar
                <ChevronRight className="w-4 h-4" />
              </span>
              {helpUrl && (
                <div className="relative group/tooltip flex items-center">
                  <button
                    type="button"
                    onClick={(event) => openHelp(event, helpUrl)}
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    <HelpIcon className="w-4 h-4" />
                    Dúvidas
                  </button>
                  {/* Tooltip Customizado animado */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-800 text-xs font-medium text-white rounded-lg opacity-0 translate-y-1 group-hover/tooltip:opacity-100 group-hover/tooltip:translate-y-0 transition-all pointer-events-none whitespace-nowrap z-20 shadow-xl border border-white/10">
                    {automation.config?.help_title || 'Abrir documentação'}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isPending || requestAccessMutation.isPending}
                onClick={(event) => handleRequestAccess(event, automation.id)}
                className="shimmer-btn relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/30 hover:text-amber-300 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock className="w-4 h-4" />
                Solicitar Acesso
              </button>
              <span className="text-xs text-slate-400">
                Status: {requestStatus ? requestStatusLabel[requestStatus] : 'Sem solicitação'}
              </span>
            </div>
          )}
          {!blocked ? (
            <ExternalLink className="w-5 h-5 text-blue-400" />
          ) : (
            <Lock className="w-5 h-5 text-amber-500" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-slate-300">
      <header className="glass-header sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl shadow-lg shadow-blue-500/25">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Automation Hub</h1>
                <p className="text-xs text-slate-400">Portal de Automações</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {!isGlobalAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null)
                    setIsPasswordModalOpen(true)
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  <span className="hidden sm:inline">Alterar senha</span>
                </button>
              )}
              {canAccessManagement && (
                <Link
                  to="/admin"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Gestão</span>
                </Link>
              )}

              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white">{user?.full_name}</p>
                  <p className="text-xs text-slate-400">{user?.email}</p>
                </div>
                <div className="w-10 h-10 avatar-animated-border">
                  <div className="avatar-animated-border-inner text-white font-medium">
                    {safeSubstring(user?.full_name, 0, 1).toUpperCase()}
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {feedback && (
          <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}>
            {feedback.message}
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white flex items-center h-8">
            {displayedGreeting}
            <span className="typewriter-cursor h-[0.9em]"></span>
          </h2>
          <p className="text-slate-400 mt-1">
            {isGlobalAdmin
              ? 'Você está no modo Administrador, com visão global das automações.'
              : isManager
                ? 'Você está no modo Gerente, com visão global dos logs de auditoria em Gestão.'
                : isSectorAdmin
                  ? 'Você está no modo Chefe de Setor. Use Gestão para administrar os usuários do seu setor.'
                  : 'Aqui estão as automações disponíveis para o seu setor'}
          </p>
        </div>

        <div className="mb-8">
          <div className="relative max-w-md group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-slate-400 transition-colors group-focus-within:text-blue-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar automações..."
              className="w-full pl-11 pr-10 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 shadow-sm transition-all hover:bg-white/10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
                title="Limpar busca"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div className="h-6 w-48 bg-white/10 rounded-lg animate-pulse"></div>
                <div className="h-4 w-24 bg-white/10 rounded-lg animate-pulse"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 animate-pulse">
                    <div className="w-12 h-12 rounded-xl bg-white/10 mb-4"></div>
                    <div className="h-6 w-3/4 bg-white/10 rounded-lg mb-2"></div>
                    <div className="h-4 w-full bg-white/10 rounded-lg mb-1"></div>
                    <div className="h-4 w-2/3 bg-white/10 rounded-lg mb-4"></div>
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="h-8 w-24 bg-white/10 rounded-lg"></div>
                      <div className="h-5 w-5 bg-white/10 rounded-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : filteredActiveAutomations.length === 0 ? (
          <div className="text-center py-20 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
            <LayoutGrid className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {searchQuery ? 'Nenhuma automação encontrada' : 'Nenhuma automação disponível'}
            </h3>
            <p className="text-slate-400">
              {searchQuery
                ? 'Tente buscar por outro termo'
                : 'Entre em contato com o administrador para solicitar acesso'}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Disponíveis para você</h3>
                <span className="text-sm text-slate-400">
                  <AnimatedCount value={availableAutomations.length} /> automações
                </span>
              </div>
              {availableAutomations.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 text-sm text-slate-400">
                  Nenhuma automação disponível com os filtros atuais.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableAutomations.map((automation, index) => renderAutomationCard(automation, index))}
                </div>
              )}
            </section>

            {!isGlobalAdmin && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">Sem acesso</h3>
                  <span className="text-sm text-slate-400">
                    <AnimatedCount value={blockedAutomations.length} /> automações
                  </span>
                </div>
                {blockedAutomations.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 text-sm text-slate-400">
                    Você já possui acesso a todas as automações ativas listadas.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {blockedAutomations.map((automation, index) => renderAutomationCard(automation, index, true))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-400">
            © {new Date().getFullYear()} Automation Hub. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 shadow-xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-6 py-4">
              <KeyRound className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-white">Alterar senha</h3>
            </div>
            <form onSubmit={handleSubmitPassword} className="space-y-4 px-6 py-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Senha atual</label>
                <input
                  type="password"
                  required
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  className="w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false)
                    setPasswordData({ current_password: '', new_password: '', confirm_password: '' })
                  }}
                  className="rounded-lg px-4 py-2 text-slate-300 hover:text-white hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  Salvar senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
