/**
 * gantt — CLIENT 半端
 *
 * 工具已在主进程可用；UI 页面待迁移（暂显示占位说明）。
 */
import React from 'react'

export function PlaceholderPage() {
  return (
    <div className="p-10 max-w-lg">
      <h2 className="text-lg font-bold mb-3">甘特图 插件</h2>
      <p className="text-sm text-muted-foreground mb-4">
        AI 工具已通过主进程 Cordis 注册（可用）。此插件的图形界面正在迁移中，敬请期待。
      </p>
      <div className="text-xs text-muted-foreground/60 bg-muted rounded-md p-3">
        可用工具：见工具列表（AI 对话中可直接调用）
      </div>
    </div>
  )
}

export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'gantt', label: '甘特图', icon: 'BarChart3', order: 80 })
  ctx.registerRoute('gantt', () => Promise.resolve({ default: PlaceholderPage }))
}
