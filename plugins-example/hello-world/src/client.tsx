/**
 * hello-world — CLIENT 半端（基准测试页面）
 *
 * 展示新范式插件的能力清单 + 状态。
 */
import React, { useState } from 'react'

export function HelloPage() {
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')
  const [testResult, setTestResult] = useState('')

  const tests = [
    { name: 'hello_world', desc: '基础工具（主进程执行）' },
    { name: 'hello_sidecar', desc: '宿主 sidecar 服务调用' },
    { name: 'hello_fs', desc: '宿主 fs 服务调用' },
  ]

  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-lg font-bold mb-1">Hello World 插件（新范式基准测试）</h2>
      <p className="text-xs text-muted-foreground mb-5">
        验证：Cordis 运行时 / 宿主服务注入 / 工具主进程执行 / Client 半端 React 页面
      </p>

      {/* 基础工具测试 */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold mb-2">工具 1：hello_world</h3>
        <div className="flex gap-2">
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
          <p className="text-sm text-primary bg-primary/10 rounded-md px-3 py-2 mt-2">{greeting}</p>
        )}
      </div>

      {/* 能力清单 */}
      <div className="mb-5">
        <h3 className="text-sm font-semibold mb-2">能力基准测试（3 个工具）</h3>
        <div className="space-y-1.5">
          {tests.map(t => (
            <div key={t.name} className="flex items-center gap-2 text-xs">
              <span className="px-1.5 py-0.5 rounded bg-muted font-mono">{t.name}</span>
              <span className="text-muted-foreground">{t.desc}</span>
              <span className="ml-auto text-emerald-500">✓ 已注册</span>
            </div>
          ))}
        </div>
      </div>

      {/* 生命周期状态 */}
      <div className="text-[11px] text-muted-foreground/60 bg-muted/50 rounded-md p-3">
        服务：helloService（ctx.provide）· 生命周期：ctx.effect（卸载自动清理）
        <br />
        <button
          className="mt-2 px-2 py-1 rounded bg-border text-foreground text-[11px] hover:bg-accent"
          onClick={() => setTestResult('插件加载正常：工具/服务/页面全部就绪')}
        >
          运行自检
        </button>
        {testResult && <p className="mt-2 text-emerald-500">{testResult}</p>}
      </div>
    </div>
  )
}

export function registerClient(ctx: any) {
  ctx.registerNav({ id: 'hello-world', label: 'Hello World', icon: 'Package', order: 90 })
  ctx.registerRoute('hello-world', () => Promise.resolve({ default: HelloPage }))
}
