import { useState } from 'react'
import { Settings, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { SettingsDialog } from './SettingsDialog'
import { isSupabaseConfigured } from '@/lib/supabase'
import { APP_VERSION } from '@/lib/version'

type AuthView = 'login' | 'register'

export function AuthPage() {
  const [view, setView] = useState<AuthView>('login')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hasConfig = isSupabaseConfigured()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      {/* 拖拽条（macOS hidden titleBar 需要） */}
      <div className="absolute top-0 left-0 right-0 h-9" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <img src="/assets/icons/icon.svg" alt="Stardust" className="h-10 w-10 shrink-0" />
        <h1 className="text-3xl font-bold tracking-tight">Stardust</h1>
      </div>

      {/* 右上角按钮 */}
      <div className="absolute right-4 top-4 flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <a
          href="https://github.com/Tianzeyui/stardust"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center h-9 w-9 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="GitHub"
        >
          <Github className="h-5 w-5" />
        </a>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          title="设置"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* 未配置提示 */}
      {!hasConfig && (
        <Card className="w-full max-w-md border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
               尚未配置 Supabase 连接信息。请点击右上角的{' '}
              <Settings className="inline h-4 w-4" /> 设置按钮进行配置。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 认证卡片 */}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {view === 'login' ? '欢迎回来' : '创建账号'}
          </CardTitle>
          <CardDescription>
            {view === 'login'
              ? '使用邮箱和密码登录您的 Stardust 账号'
              : '注册一个新的 Stardust 账号'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === 'login' ? (
            <LoginForm onSwitchToRegister={() => setView('register')} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setView('login')} />
          )}
        </CardContent>
      </Card>

      {/* 设置弹窗 */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* 底部信息 — 绝对定位，不影响卡片居中 */}
      <div className="absolute bottom-4 left-0 right-0 text-center space-y-1">
        <p className="text-[11px] text-muted-foreground/30">v{APP_VERSION}</p>
        <p className="text-[11px] text-muted-foreground/30">
          Licensed under Apache License 2.0
        </p>
        <p className="text-[11px] text-muted-foreground/30">
          沉浸位工作室 © {__BUILD_YEAR__}
        </p>
      </div>
    </div>
  )
}
