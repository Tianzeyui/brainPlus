/**
 * 动态路由——根据 nav ID 从 PluginSystem 加载组件
 * 用 ErrorBoundary 包裹插件组件，单个插件崩溃不影响整体
 * 第三方插件自动包裹系统顶栏（名称、版本、描述、返回按钮）
 */
import { useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { pluginSystem } from '@/lib/pluginSystem'
import { ErrorBoundary } from '@/components/plugins/ErrorBoundary'
import type { ComponentType } from 'react'

const CORE_IDS = new Set(['chat', 'ai', 'skills', 'agents', 'usage', 'plugins', 'notifications', 'projects'])

interface Props {
  nav: string
  onNavChange?: (nav: string) => void
}

export function DynamicRoute({ nav, onNavChange }: Props) {
  const [Comp, setComp] = useState<ComponentType<any> | null>(null)
  const [loading, setLoading] = useState(false)
  const isCore = CORE_IDS.has(nav)

  // 从 PluginSystem 获取插件信息
  const pluginInfo = useMemo(() => {
    const item = pluginSystem.getNavItems().find(i => i.id === nav)
    const all = pluginSystem.getAllPlugins()
    const p = all.find(p => p.manifest.id === nav)
    return {
      name: item?.label || nav,
      version: p?.manifest.version || '',
      description: p?.manifest.description || '',
      systemHeader: p?.manifest?.systemHeader !== false,  // 默认 true
    }
  }, [nav])

  useEffect(() => {
    const loader = pluginSystem.getRoute(nav)
    if (!loader) {
      // 调试：打印插件系统完整状态，定位路由缺失原因
      console.warn(`[DynamicRoute] 路由 "${nav}" 不存在`, JSON.stringify(pluginSystem.debugState()))
      setComp(null)
      return
    }
    setLoading(true)
    loader().then(mod => {
      setComp(() => mod.default || Object.values(mod)[0])
      setLoading(false)
    }).catch((e) => {
      console.error(`[DynamicRoute] 路由 "${nav}" 加载失败:`, e.message)
      setComp(null)
      setLoading(false)
    })
  }, [nav])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!Comp) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">页面未找到</p>
      </div>
    )
  }

  const inner = (nav === 'usage' || nav === 'notifications') ? <Comp onClose={() => onNavChange?.('chat')} /> : <Comp />

  return (
    <ErrorBoundary pluginName={pluginInfo.name}>
      {isCore || !pluginInfo.systemHeader ? (
        inner
      ) : (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 h-10 shrink-0">
            <span className="text-xs font-semibold text-foreground truncate">{pluginInfo.name}</span>
            {pluginInfo.version && (
              <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground shrink-0">v{pluginInfo.version}</span>
            )}
            {pluginInfo.description && (
              <span className="text-[10px] text-muted-foreground/50 truncate hidden sm:block">— {pluginInfo.description}</span>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {inner}
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
