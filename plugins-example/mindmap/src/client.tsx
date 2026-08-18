/**
 * mindmap — CLIENT 半端（占位页面，UI 待迁移）
 */
import React from 'react'

export function PlaceholderPage() {
  return (
    <div className="p-10 max-w-lg">
      <h2 className="text-lg font-bold mb-3">思维导图插件</h2>
      <p className="text-sm text-muted-foreground mb-4">
        AI 工具已通过主进程 Cordis 注册（可用）。思维导图画布界面正在迁移中。
      </p>
    </div>
  )
}

export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'mindmap', label: '思维导图', icon: 'Workflow', order: 75 })
  ctx.registerRoute('mindmap', () => Promise.resolve({ default: PlaceholderPage }))
}
