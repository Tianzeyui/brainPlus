import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { ToastProvider } from './hooks/useToast'
import { ToastViewport } from './components/ui/toast'
import { useToast } from './hooks/useToast'
import { initConfig } from './lib/config'
import { initSupabaseConfig } from './lib/supabase'
import App from './App'
import './index.css'

// 渲染进程 console → 主进程 stdout（dev 调试：插件加载/路由问题可直接在终端观察）
try {
  const api = (window as any).electronAPI
  if (api?.rendererLog) {
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      const orig = console[level].bind(console)
      console[level] = (...args: any[]) => {
        orig(...args)
        try { api.rendererLog(level, args) } catch {}
      }
    }
  }
} catch {}

// 启动时从磁盘加载配置
Promise.all([initConfig(), initSupabaseConfig()]).catch(() => {})

function ToastContainer() {
  const { toasts, dismiss } = useToast()
  return <ToastViewport toasts={toasts} onDismiss={dismiss} />
}

// HMR 安全：复用已存在的 root，避免 "createRoot() on a container that has already been passed to createRoot()" 警告
const container = document.getElementById('root')!
const root = (container as any)._reactRoot || ReactDOM.createRoot(container)
;(container as any)._reactRoot = root

root.render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <NotificationProvider>
          <App />
          <ToastContainer />
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
)

// 代码块语言标签：给所有 pre[class*="language-"] 注入 data-lang
const LANG_RE = /language-(\S+)/
function stampCodeLangs() {
  document.querySelectorAll('pre[class*="language-"]').forEach((pre) => {
    if (pre.hasAttribute('data-lang')) return
    const m = pre.className.match(LANG_RE)
    if (m) pre.setAttribute('data-lang', m[1])
  })
}
stampCodeLangs()
new MutationObserver(stampCodeLangs).observe(document.body, { childList: true, subtree: true })
