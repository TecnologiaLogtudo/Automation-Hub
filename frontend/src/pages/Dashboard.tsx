import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { automationsApi } from '../services/api'
import { 
  Bot, Search, LogOut, Settings, ExternalLink, 
  Clock, Calendar, Banknote, Folder, Headset, CreditCard,
  TrendingUp, Users, Mail, Package, Lock, BarChart,
  LayoutGrid, ChevronRight
} from 'lucide-react'

interface Automation {
  id: number
  title: string
  description: string
  target_url: string
  icon: string
  is_active: boolean
}

const iconMap: Record<string, React.ReactNode> = {
  clock: <Clock className="w-6 h-6" />,
  calendar: <Calendar className="w-6 h-6" />,
  dollar: <Banknote className="w-6 h-6" />,
  folder: <Folder className="w-6 h-6" />,
  headset: <Headset className="w-6 h-6" />,
  'credit-card': <CreditCard className="w-6 h-6" />,
  'trending-up': <TrendingUp className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  mail: <Mail className="w-6 h-6" />,
  package: <Package className="w-6 h-6" />,
  lock: <Lock className="w-6 h-6" />,
  'bar-chart': <BarChart className="w-6 h-6" />,
  robot: <Bot className="w-6 h-6" />,
}

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const [searchQuery, setSearchQuery] = useState('')

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ['automations'],
    queryFn: () => automationsApi.getAll().then(res => res.data),
  })

  const filteredAutomations = automations.filter(automation =>
    automation.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    automation.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleLogout = () => {
    logout()
  }

  const openAutomation = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl shadow-lg shadow-blue-500/25">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Automation Hub</h1>
                <p className="text-xs text-slate-500">Portal de Automações</p>
              </div>
            </div>

            {/* User Info */}
            <div className="flex items-center gap-4">
              {user?.is_admin && (
                <a
                  href="/admin"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </a>
              )}
              
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{user?.full_name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center text-white font-medium">
                  {user?.full_name?.charAt(0).toUpperCase()}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Bem-vindo, {user?.full_name}!
          </h2>
          <p className="text-slate-600 mt-1">
            Aqui estão as automações disponíveis para o seu setor
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar automações..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
            />
          </div>
        </div>

        {/* Automations Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-slate-500">
              <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Carregando automações...
            </div>
          </div>
        ) : filteredAutomations.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200">
            <LayoutGrid className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchQuery ? 'Nenhuma automação encontrada' : 'Nenhuma automação disponível'}
            </h3>
            <p className="text-slate-500">
              {searchQuery 
                ? 'Tente buscar por outro termo' 
                : 'Entre em contato com o administrador para solicitar acesso'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAutomations.map((automation, index) => (
              <div
                key={automation.id}
                className="automation-card bg-white rounded-2xl border border-slate-200 p-6 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => openAutomation(automation.target_url)}
              >
                {/* Icon */}
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-xl flex items-center justify-center text-blue-600 mb-4">
                  {iconMap[automation.icon] || iconMap.robot}
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {automation.title}
                </h3>
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                  {automation.description}
                </p>

                {/* Action */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <span className="text-sm text-slate-500 flex items-center gap-1">
                    Acessar
                    <ChevronRight className="w-4 h-4" />
                  </span>
                  <ExternalLink className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Automation Hub. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}
