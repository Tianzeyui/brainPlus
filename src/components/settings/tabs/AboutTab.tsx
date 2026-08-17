import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { APP_VERSION } from '@/lib/version'

type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

type ReleaseEntry = {
  tag: string
  name: string
  date: string
  body: string
}

export function AboutTab() {
  const [releases, setReleases] = useState<ReleaseEntry[]>([])
  const [update, setUpdate] = useState<UpdateStatus>({ type: 'idle' })

  const updater = (window as any).electronAPI?.updater

  // 订阅主进程推送的更新状态
  useEffect(() => {
    if (!updater?.onStatus) return
    return updater.onStatus((status: any) => {
      switch (status.type) {
        case 'checking': setUpdate({ type: 'checking' }); break
        case 'available': setUpdate({ type: 'available', version: status.version }); break
        case 'none': setUpdate({ type: 'none' }); break
        case 'progress': setUpdate({ type: 'downloading', percent: status.percent }); break
        case 'downloaded': setUpdate({ type: 'downloaded', version: status.version }); break
        case 'error': setUpdate({ type: 'error', message: status.message }); break
      }
    })
  }, [updater])

  const handleCheck = useCallback(async () => {
    if (!updater?.check) return
    setUpdate({ type: 'checking' })
    const r = await updater.check()
    if (r?.status === 'available') setUpdate({ type: 'available', version: r.version })
    else if (r?.status === 'none') setUpdate({ type: 'none' })
    else if (r?.status === 'downloaded') setUpdate({ type: 'downloaded', version: '' })
    else if (r?.status === 'dev') setUpdate({ type: 'error', message: '开发模式不可用，请使用打包版' })
    else if (r?.status === 'error') setUpdate({ type: 'error', message: r.message })
  }, [updater])

  const handleDownload = useCallback(async () => {
    if (!updater?.download) return
    setUpdate({ type: 'downloading', percent: 0 })
    await updater.download()
  }, [updater])

  const handleInstall = useCallback(async () => {
    if (!updater?.install) return
    await updater.install()
  }, [updater])

  // 拉取更新日志：从 docs/releases/ 读取各版本发布说明（jsDelivr CDN，无 GitHub API 限流）
  useEffect(() => {
    const DIR_API = 'https://data.jsdelivr.com/v1/packages/gh/Tianzeyui/stardust@main'
    // 用 gcore 域名避免 301 重定向到 raw.githubusercontent.com（no_proxy 下直连不通）
    const BASE_URL = 'https://gcore.jsdelivr.net/gh/Tianzeyui/stardust@main/docs/releases/'

    const fetchViaHttp = async (url: string) => {
      const api = (window as any).electronAPI?.http
      if (api) {
        try {
          const r = await api.fetch(url)
          if (r.success && r.status === 200) {
            // sidecar http.fetch 始终返回字符串，JSON 响应需手动解析
            if (typeof r.data === 'string') {
              try { return JSON.parse(r.data) } catch { return r.data }
            }
            return r.data
          }
        } catch {}
      }
      try {
        const r = await fetch(url)
        if (r.ok) return await r.json()
      } catch {}
      return null
    }

    const fetchText = async (url: string): Promise<string | null> => {
      const api = (window as any).electronAPI?.http
      if (api) {
        try {
          const r = await api.fetch(url)
          if (r.success && r.status === 200 && typeof r.data === 'string' && r.data.trim().length > 0) return r.data
        } catch {}
      }
      try {
        const r = await fetch(url)
        if (r.ok) return await r.text()
      } catch {}
      return null
    }

    const load = async () => {
      // 1. 列目录拿版本文件列表
      const dirData = await fetchViaHttp(DIR_API)
      let files: string[] = []
      try {
        const walk = (nodes: any[], path: string[] = []): void => {
          for (const n of nodes || []) {
            const cur = [...path, n.name]
            if (n.type === 'directory') walk(n.files, cur)
            else if (n.name.endsWith('.md')) files.push(cur.join('/'))
          }
        }
        walk(dirData?.files)
        files = files.filter((p) => p.includes('/releases/')).sort().reverse()
      } catch {}
      if (files.length === 0) return

      // 2. 逐个读取发布说明
      const entries: ReleaseEntry[] = []
      for (const file of files) {
        const m = file.match(/v([\d.]+)\.md$/)
        if (!m) continue
        const content = await fetchText(BASE_URL + file.split('/').pop())
        if (content) {
          entries.push({
            tag: `v${m[1]}`,
            name: `v${m[1]}`,
            date: '',
            body: content,
          })
        }
      }
      if (entries.length > 0) setReleases(entries)
    }
    load().catch(() => {})
  }, [])

  const isElectron = !!updater

  return (
    <div className="w-full h-full flex flex-col">
      {/* 主区域：左右分栏 */}
      <div className="flex gap-10 flex-1 min-h-0">
      {/* ===== 左侧：应用信息（沉浸式，垂直居中） ===== */}
      <aside className="w-72 shrink-0 flex flex-col text-center">
        {/* 图标+信息组：占据上部空间并真正垂直居中 */}
        <div className="flex-1 flex flex-col items-center justify-center pb-8">
          <div className="flex items-center gap-3">
            <img src="assets/icons/icon.svg" alt="Stardust" className="w-10 h-10 shrink-0" />
            <div className="text-left">
              <h2 className="text-lg font-bold text-foreground leading-tight">Stardust</h2>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">开源自由的 AI Agent 平台</p>
            </div>
          </div>

        <div className="flex items-center gap-2 mt-5">
          <span className="inline-block px-2.5 py-1 rounded-full bg-primary/10 text-xs font-semibold text-primary">v{APP_VERSION}</span>
          {isElectron && (
            <button
              onClick={handleCheck}
              disabled={update.type === 'checking' || update.type === 'downloading' || update.type === 'downloaded'}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
            >
              {update.type === 'checking' && '检查中…'}
              {update.type === 'idle' && '检查更新'}
              {update.type === 'none' && '已是最新'}
              {update.type === 'available' && `发现 v${update.version}`}
              {update.type === 'downloading' && `下载中 ${update.percent}%`}
              {update.type === 'downloaded' && '已下载'}
              {update.type === 'error' && '检查失败'}
            </button>
          )}
        </div>

        {/* 更新操作区 */}
        <div className="mt-5 w-full flex flex-col items-center gap-2">
          {update.type === 'available' && (
            <button
              onClick={handleDownload}
              className="w-full max-w-[200px] px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              下载 v{update.version}
            </button>
          )}
          {update.type === 'downloaded' && (
            <button
              onClick={handleInstall}
              className="w-full max-w-[200px] px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              重启并安装更新
            </button>
          )}
          {update.type === 'downloading' && (
            <div className="w-full max-w-[200px]">
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${update.percent}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1 text-center">{update.percent}%</p>
            </div>
          )}
          {update.type === 'error' && (
            <p className="text-[10px] text-destructive max-w-[220px] break-all text-center">{update.message}</p>
          )}
        </div>
        </div>{/* /图标组 flex-1 居中 */}
      </aside>

      {/* ===== 右侧：更新日志（沉浸式，无容器边框） ===== */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* 标题（固定） */}
        <div className="flex items-center gap-2.5 pb-4 mb-3 border-b border-border/60 shrink-0">
          <h3 className="text-base font-bold text-foreground">更新日志</h3>
          <span className="text-[11px] text-muted-foreground/40">{releases.length > 0 ? `${releases.length} 个版本` : ''}</span>
        </div>
        {/* 列表（独立滚动，上下内容渐隐 mask） */}
        <div className="flex-1 min-h-0 relative">
          <div
            className="h-full overflow-y-auto py-4"
            style={{
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)',
              maskImage: 'linear-gradient(to bottom, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)',
            }}
          >
          {releases.length > 0 ? (
            <div className="divide-y divide-border/50">
              {releases.map((rel, i) => (
                <details
                  key={rel.tag}
                  open={i === 0}
                  className="group"
                >
                  <summary className="flex items-center gap-3 px-2 -mx-2 rounded-md py-3 cursor-pointer select-none hover:bg-accent/30 transition-colors">
                    <span className={`w-1 h-4 rounded-full shrink-0 ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                    <span className="text-sm font-semibold text-foreground">{rel.tag}</span>
                    {rel.date && <span className="text-[10px] text-muted-foreground/40">{rel.date}</span>}
                    <span className="ml-auto text-xs text-muted-foreground/40 group-open:rotate-90 transition-transform">▸</span>
                  </summary>
                  <div className="px-2 pb-4 pt-2">
                    <div className="release-notes text-[13px] leading-relaxed text-muted-foreground/80 space-y-1.5">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <p className="text-sm font-bold text-foreground">{children}</p>,
                          h2: ({ children }) => <p className="text-sm font-bold text-foreground mt-3">{children}</p>,
                          h3: ({ children }) => <p className="text-[13px] font-semibold text-foreground">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
                          code: ({ children }) => <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="p-3 rounded-lg bg-muted overflow-x-auto text-xs">{children}</pre>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{children}</a>,
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        }}
                      >
                        {rel.body}
                      </ReactMarkdown>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/40">加载中…</p>
          )}
          </div>{/* /列表内容 */}
        </div>{/* /渐隐 wrapper */}
      </main>
      </div>{/* /左右分栏主区域 */}

      {/* 版权（底部居中，单起一行，mt-auto 推底） */}
      <div className="w-full self-center flex flex-col items-center mt-auto pt-6 pb-3 shrink-0">
        <a href="https://immersionvoid.cc/" target="_blank" className="inline-block hover:opacity-75 transition-opacity" title="沉浸位工作室官网">
          <img src="assets/logo/immersionBitLogo.svg" alt="沉浸位工作室" className="w-28 opacity-50" />
        </a>
        <p className="text-[11px] text-muted-foreground/60 mt-1.5">© {__BUILD_YEAR__} 沉浸位工作室 · Apache 2.0</p>
      </div>
    </div>
  )
}
