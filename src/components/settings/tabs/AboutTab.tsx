import { useState, useEffect, useCallback } from 'react'
import { APP_VERSION } from '@/lib/version'

type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'none' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export function AboutTab() {
  const [changelog, setChangelog] = useState<Array<{ version: string; date: string; items: string[] }>>([])
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

  useEffect(() => {
    const CDN_URL = 'https://cdn.jsdelivr.net/gh/Tianzeyui/stardust@main/CHANGELOG.md'
    const parse = (text: string) => {
      const entries: typeof changelog = []
      const sections = text.split(/\n## /).slice(1)
      for (const sec of sections) {
        const lines = sec.trim().split('\n')
        const m = lines[0].match(/^v([\d.]+)\s*(?:\((.+?)\))?/)
        if (!m) continue
        entries.push({
          version: `v${m[1]}`, date: m[2] || '',
          items: lines.slice(1).filter(l => l.trim().startsWith('- ')).map(l => l.replace(/^-\s*/, '')),
        })
      }
      return entries
    }
    ;(async () => {
      try { const r = await fetch('/CHANGELOG.md'); if (r.ok) { setChangelog(parse(await r.text())); return } } catch {}
      try {
        const api = (window as any).electronAPI?.http
        if (api) { const r = await api.fetch(CDN_URL); if (r.success && r.status === 200) setChangelog(parse(r.data)) }
      } catch {}
    })()
  }, [])

  const isElectron = !!updater

  return (
    <div className="flex flex-col items-center text-center flex-1 overflow-auto">
      <div className="flex flex-col items-center pt-10 pb-8">
        <img src="assets/icons/icon2.png" alt="Stardust" className="w-16 h-16 rounded-2xl mb-4 shadow-sm" />
        <h2 className="text-lg font-bold text-foreground">Stardust</h2>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">v{APP_VERSION}</span>
          {isElectron && (
            <button
              onClick={handleCheck}
              disabled={update.type === 'checking' || update.type === 'downloading' || update.type === 'downloaded'}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-[10px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
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
        <p className="text-xs text-muted-foreground/50 mt-3">开源自由的 AI Agent 平台</p>

        {/* 更新操作区 */}
        {update.type === 'available' && (
          <button
            onClick={handleDownload}
            className="mt-3 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            下载 v{update.version}
          </button>
        )}
        {update.type === 'downloaded' && (
          <button
            onClick={handleInstall}
            className="mt-3 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            重启并安装更新
          </button>
        )}
        {update.type === 'error' && (
          <p className="mt-3 text-[10px] text-destructive max-w-[220px] break-all">{update.message}</p>
        )}
      </div>
      {changelog.length > 0 && (
        <div className="w-full max-w-[260px] text-left mb-8">
          <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider mb-3 text-center">更新日志</p>
          <div className="relative pl-5 space-y-4 max-h-56 overflow-auto">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
            {changelog.map((entry, i) => (
              <div key={entry.version} className="relative">
                <div className={`absolute -left-5 top-1.5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center ${i === 0 ? 'border-primary bg-primary/10' : 'border-muted-foreground/20 bg-card'}`}>
                  <div className={`w-[5px] h-[5px] rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{entry.version}</span>
                  {entry.date && <span className="text-[9px] text-muted-foreground/40">{entry.date}</span>}
                </div>
                <ul className="space-y-0.5">
                  {entry.items.map((item, j) => <li key={j} className="text-[10px] text-muted-foreground/50 leading-relaxed">{item}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto pb-8">
        <a href="https://immersionvoid.cc/" target="_blank" className="inline-block hover:opacity-75 transition-opacity" title="沉浸位工作室官网">
          <img src="assets/logo/immersionBitLogo.svg" alt="沉浸位工作室" className="w-24" />
        </a>
        <p className="text-[10px] text-muted-foreground/30 mt-2">© {__BUILD_YEAR__} 沉浸位工作室 · Apache 2.0</p>
      </div>
    </div>
  )
}
