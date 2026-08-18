/**
 * hello-world — CLIENT 半端（自带 React 页面）
 *
 * 渲染进程执行：宿主提供 React/lucide-react，
 * 插件组件在 lib/client.js 预编译后求值加载。
 */
import React, { useState } from 'react'

export function HelloPage() {
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')

  return (
    <div className="p-8 max-w-md">
      <h2 className="text-lg font-bold mb-4">Hello World 插件（新范式）</h2>
      <p className="text-xs text-muted-foreground mb-4">
        这是插件自带的 React 页面，通过 CLIENT 半端加载。工具在 HOST 半端（主进程 Cordis）。
      </p>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="输入你的名字"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="px-3 h-8 rounded-md bg-primary text-primary-foreground text-sm"
          onClick={() => setGreeting(`Hello, ${name || 'World'}!`)}
        >
          打招呼
        </button>
      </div>
      {greeting && (
        <p className="text-sm text-primary bg-primary/10 rounded-md px-3 py-2">{greeting}</p>
      )}
    </div>
  )
}

export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'hello-world', label: 'Hello World', icon: 'Package', order: 90 })
  ctx.registerRoute('hello-world', () => Promise.resolve({ default: HelloPage }))
}
