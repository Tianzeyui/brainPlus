/**
 * 独立窗口布局——精简版 AppLayout，无侧边栏
 * 通过 URL 参数 standalone=1&nav=xxx 进入此模式
 * 窗口标题由主进程在创建时设置为插件名
 */
import { useState, useEffect } from 'react'
import { DynamicRoute } from './DynamicRoute'
import { pluginSystem } from '@/lib/pluginSystem'
import { initCorePlugins } from '@/lib/corePlugins'

interface Props {
  nav: string
}

export function StandaloneLayout({ nav }: Props) {
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    initCorePlugins()
    const paths = pluginSystem.getInstalledPaths()
    if (paths.length > 0) {
      Promise.all(paths.map(p => pluginSystem.restoreInstalled(p))).then(() => {
        setVersion(pluginSystem.getVersion())
        setReady(true)
      })
    } else {
      setReady(true)
    }
    return pluginSystem.onChange(() => setVersion(pluginSystem.getVersion()))
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* 拖拽区（macOS hidden titleBar 需要） */}
      <div className="h-9 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <div className="flex-1 overflow-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <DynamicRoute key={`${nav}-${version}`} nav={nav} />
      </div>
    </div>
  )
}
