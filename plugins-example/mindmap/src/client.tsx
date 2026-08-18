/**
 * mindmap — CLIENT 半端（页面挂载）
 *
 * 渲染进程执行：挂载思维导图画布页面（SVG 画布渲染、树形布局、节点增删改、平移缩放）。
 * 数据读写走渲染进程已登录的 Supabase client（ctx.supabase.getClient()）。
 * 数据存储：Supabase（mindmaps / mindmap_nodes 表）。AI 工具在主进程 Cordis 半端。
 */
import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { MindMapPage } from '../MindMapPage'
import { initApi } from '../api'

// registerClient 时注入的宿主 supabase 获取函数（渲染进程已登录的 client）
let getSupabaseClient: (() => any) | null = null

function MindMapApp() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function setup() {
      try {
        const client = getSupabaseClient?.()
        if (!client) {
          if (!cancelled) setError('Supabase 未配置，请在设置中配置 Supabase 后使用思维导图功能。')
          return
        }
        const { data } = await client.auth.getUser()
        if (cancelled) return
        if (!data.user) {
          setError('未登录。请先在设置中登录 Supabase 账号后再使用思维导图功能。')
          return
        }
        initApi(client, data.user.id)
        setReady(true)
      } catch (e: any) {
        if (!cancelled) setError('初始化失败: ' + (e.message || '未知错误'))
      }
    }
    setup()
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background">
        <p className="text-xs">{error}</p>
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return <MindMapPage />
}

export function registerClient(ctx: any) {
  getSupabaseClient = ctx.supabase?.getClient?.bind(ctx.supabase) || null
  ctx.registerNav({ id: 'mindmap', label: '思维导图', icon: 'Workflow', order: 75 })
  ctx.registerRoute('mindmap', () => Promise.resolve({ default: MindMapApp }))
}
