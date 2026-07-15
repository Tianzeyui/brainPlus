import { AuthPage } from '@/components/auth/AuthPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { StandaloneLayout } from '@/components/layout/StandaloneLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'

function App() {
  const { user, loading } = useAuth()
  const hasConfig = isSupabaseConfigured()

  // 检测独立窗口模式（URL 参数 standalone=1&nav=xxx）
  const params = new URLSearchParams(window.location.search)
  const isStandalone = params.get('standalone') === '1'
  const standaloneNav = params.get('nav')

  // 独立窗口模式：不渲染完整布局，只渲染目标页面
  if (isStandalone && standaloneNav) {
    return <StandaloneLayout nav={standaloneNav} />
  }

  // 加载中
  if (loading && hasConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  // 未登录或未配置 → 显示认证页
  if (!user) {
    return <AuthPage />
  }

  // 已登录 → 显示主应用布局
  return <AppLayout />
}

export default App
