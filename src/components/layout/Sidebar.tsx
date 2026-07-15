import { useState, useMemo, useEffect } from 'react'
import {
  Bot, MessageSquare, Package, FolderOpen, FolderKanban, BookOpen, Lightbulb, BarChart3, Puzzle, Blocks,
  Settings, LogOut, ChevronLeft, ChevronRight, User, ChevronDown, Bell, XCircle, Info, AlertTriangle, AlertCircle, ArrowRight, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/contexts/NotificationContext'
import { pluginSystem } from '@/lib/pluginSystem'
import type { NavItemDef } from '@/lib/pluginTypes'
import { ContextMenu } from '@/components/ui/contextMenu'
import type { ContextMenuItem } from '@/components/ui/contextMenu'

import { initCorePlugins } from '@/lib/corePlugins'

export type NavItem = string

interface SidebarProps {
  activeNav: NavItem
  onNavChange: (item: NavItem) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSettings: () => void
  onCloseSettings: () => void
}

const iconMap: Record<string, any> = {
  Bot, MessageSquare, Package, FolderOpen, FolderKanban, BookOpen, Lightbulb, BarChart3, Puzzle, Blocks,
}

export function Sidebar({ activeNav, onNavChange, collapsed, onToggleCollapse, onOpenSettings, onCloseSettings }: SidebarProps) {
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  const navItems = useMemo(() => ready ? pluginSystem.getNavItems() : [], [ready, version])

  useEffect(() => { initCorePlugins(); setReady(true) }, [])
  useEffect(() => {
    // 异步恢复第三方插件
    const paths = pluginSystem.getInstalledPaths()
    if (paths.length > 0) {
      Promise.all(paths.map(p => pluginSystem.restoreInstalled(p))).then(() => setVersion(pluginSystem.getVersion()))
    }
    // 监听插件变更（安装/卸载/启停）
    return pluginSystem.onChange(() => setVersion(pluginSystem.getVersion()))
  }, [])
  const { user, signOut } = useAuth()
  const { notifications, unreadCount, dismiss, resolveConfirm, markAllRead } = useNotifications()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifInMenu, setShowNotifInMenu] = useState(false)

  // 右键菜单状态
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  const handleOpenInNewWindow = (navId: string, label: string) => {
    const api = (window as any).electronAPI
    api?.window?.openNav?.(navId, label)
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card py-4 transition-all duration-200',
        collapsed ? 'w-16 items-center' : 'w-52 items-stretch px-3',
      )}
    >
      {/* 顶部：Logo + 折叠按钮 */}
      <div className={cn('flex items-center', collapsed ? 'flex-col gap-3 mb-3' : 'justify-between mb-6')}>
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <img src="/assets/icons/icon.svg" alt="Stardust" className="h-6 w-6 shrink-0 ml-2" />
          {!collapsed && <span className="text-lg font-bold tracking-tight">Stardust</span>}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={onToggleCollapse} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* 中间导航——从 PluginSystem 动态渲染 */}
      <nav className={cn('flex flex-1 gap-2 overflow-auto', collapsed ? 'flex-col items-center' : 'flex-col')}>
        {navItems.map(item => {
          const IconComponent = iconMap[item.icon] || Bot
          const isActive = activeNav === item.id
          const isPlugin = pluginSystem.isPlugin(item.id)
          return (
            <Button key={item.id} variant={isActive ? 'default' : 'ghost'}
              size={collapsed ? 'icon' : 'default'}
              className={cn('transition-all relative', collapsed ? 'h-10 w-10' : 'justify-start gap-3', !isActive && 'text-muted-foreground hover:text-foreground')}
              onClick={() => { onCloseSettings(); onNavChange(item.id) }}
              onContextMenu={(e) => {
                e.preventDefault()
                setCtxMenu({
                  x: e.clientX, y: e.clientY,
                  items: [
                    {
                      label: '在新窗口打开',
                      icon: <ExternalLink className="h-3.5 w-3.5" />,
                      shortcut: '⌘+点击',
                      onClick: () => handleOpenInNewWindow(item.id, item.label),
                    },
                  ],
                })
              }}
              onMouseDown={(e) => {
                // 中键点击 或 Cmd/Ctrl + 左键 → 新窗口打开
                if (e.button === 1 || (e.button === 0 && (e.metaKey || e.ctrlKey))) {
                  e.preventDefault()
                  handleOpenInNewWindow(item.id, item.label)
                }
              }}
              title={collapsed ? (isPlugin ? `${item.label}（插件）— 右键或中键新窗口打开` : `${item.label} — 右键或中键新窗口打开`) : undefined}>
              <IconComponent className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1 min-w-0 text-left">{item.label}</span>
                  {isPlugin && (
                    <span className="text-[9px] leading-none text-muted-foreground/35 shrink-0 ml-1 select-none">插件</span>
                  )}
                </>
              )}
              {collapsed && isPlugin && (
                <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/25" title="插件" />
              )}
            </Button>
          )
        })}
      </nav>


      {/* 底部：用户信息 + 菜单 */}
      <div className={cn('relative', collapsed ? 'flex flex-col items-center' : '')}>
        <button
          className={cn(
            'flex items-center gap-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            collapsed ? 'p-1.5' : 'w-full px-2 py-1.5',
          )}
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs truncate">{user?.email || '用户'}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </>
          )}
        </button>

        {showUserMenu && (
          <div className={cn(
            'absolute z-50 rounded-lg border border-border bg-card shadow-lg',
            collapsed ? 'left-full bottom-0 ml-1 w-72' : 'bottom-full left-0 mb-1 w-72',
          )}>
            {/* 通知预览 */}
            <div className="border-b border-border">
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowNotifInMenu(!showNotifInMenu)}
                >
                  <Bell className="h-3.5 w-3.5" />
                  <span>通知</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground">{unreadCount}</span>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  {notifications.length > 0 && (
                    <button className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground" onClick={markAllRead}>全部已读</button>
                  )}
                  <button className="text-[10px] text-primary/60 hover:text-primary flex items-center gap-0.5"
                    onClick={() => { setShowUserMenu(false); onNavChange('notifications') }}>
                    查看全部 <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {showNotifInMenu && (
                <div className="max-h-48 overflow-auto border-t border-border/50">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-muted-foreground text-center">暂无通知</p>
                  ) : (
                    notifications.slice(0, 10).map(n => {
                      const iconMap: Record<string, any> = { info: Info, warning: AlertTriangle, error: AlertCircle, confirm: AlertTriangle }
                      const colorMap: Record<string, string> = { info: 'text-blue-500', warning: 'text-yellow-500', error: 'text-destructive', confirm: 'text-yellow-500' }
                      const IconComp = iconMap[n.type] || Info
                      return (
                        <div key={n.id} className={`border-b border-border/30 last:border-0 px-3 py-2 ${n.read ? '' : 'bg-accent/30'}`}>
                          <div className="flex items-start gap-2">
                            <IconComp className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${colorMap[n.type]}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium">{n.title}</p>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5 line-clamp-2">{n.message}</p>
                              {n.type === 'confirm' && n.actions && !n.resolved && (
                                <div className="flex gap-1.5 mt-1.5">
                                  {n.actions.map(a => (
                                    <button key={a.key}
                                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                        a.variant === 'destructive'
                                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                          : 'bg-primary/10 text-primary hover:bg-primary/20'
                                      }`}
                                      onClick={() => resolveConfirm(n.id, a.key)}
                                    >{a.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {n.type !== 'confirm' && (
                              <button className="shrink-0 text-muted-foreground/20 hover:text-muted-foreground"
                                onClick={() => dismiss(n.id)}>
                                <XCircle className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
            <div className="py-1">
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() => { setShowUserMenu(false); onNavChange('usage') }}>
                <BarChart3 className="h-3.5 w-3.5" /> 用量统计
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() => { setShowUserMenu(false); onOpenSettings() }}>
                <Settings className="h-3.5 w-3.5" /> 设置
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => { setShowUserMenu(false); signOut() }}>
                <LogOut className="h-3.5 w-3.5" /> 退出登录
              </button>
            </div>
          </div>
        )}
      </div>

      {showUserMenu && <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />}

      {/* 右键菜单 */}
      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
      )}
    </aside>
  )
}
