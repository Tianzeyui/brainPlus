// ============================================================
// Draw.io Plugin — SVG 画布（iframe 嵌入 + postMessage 通信）
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Plus, Loader2, Pencil, X, Save, ChevronDown,
} from 'lucide-react'
import type { DrawioDiagram } from './types'
import * as api from './api'

// ============================================================
// 常量
// ============================================================
const EMBED_URL = 'https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=1'
const AUTOSAVE_DEBOUNCE_MS = 2000

// ============================================================
// 空模板 XML
// ============================================================
const EMPTY_XML = `<mxfile host="stardust">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

// ============================================================
// Props
// ============================================================
interface Props {
  onBack: () => void
}

// ============================================================
// 组件
// ============================================================
export const DrawioCanvas: React.FC<Props> = ({ onBack }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [diagrams, setDiagrams] = useState<DrawioDiagram[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved')

  // 下拉菜单
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 重命名
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  // iframe 就绪
  const [iframeReady, setIframeReady] = useState(false)

  // Refs
  const currentIdRef = useRef(currentId); currentIdRef.current = currentId
  const currentNameRef = useRef('')
  const iframeReadyRef = useRef(iframeReady); iframeReadyRef.current = iframeReady
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)
  const loadedXmlRef = useRef('') // 当前在 iframe 中加载的 xml

  // ============================================================
  // 卸载标记
  // ============================================================
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ============================================================
  // 加载图表列表
  // ============================================================
  const loadDiagrams = useCallback(async () => {
    try {
      const list = await api.listDiagrams()
      if (!mountedRef.current) return
      setDiagrams(list)

      // 检查 AI 指定的目标图表 ID（localStorage 桥接）
      let targetId: string | null = null
      try {
        targetId = localStorage.getItem('stardust_drawio_activeId')
        if (targetId) localStorage.removeItem('stardust_drawio_activeId')
      } catch { /* ignore */ }

      // 自动选中目标图表，或第一个，或创建默认
      if (list.length === 0) {
        const d = await api.createDiagram('未命名图表', EMPTY_XML)
        if (mountedRef.current) {
          setDiagrams([d])
          setCurrentId(d.id)
        }
      } else {
        // 优先使用 AI 指定的图表 ID
        const target = targetId ? list.find(d => d.id === targetId) : null
        setCurrentId(target ? target.id : list[0].id)
      }
    } catch (e) {
      console.error('加载图表列表失败:', e)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { loadDiagrams() }, [loadDiagrams])

  // ============================================================
  // 当前图表数据
  // ============================================================
  const currentDiagram = diagrams.find(d => d.id === currentId) || null
  currentNameRef.current = currentDiagram?.name || ''

  // ============================================================
  // 监听外部更新（AI 工具通过自定义事件通知；同时保留轮询作为兜底）
  // ============================================================
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string }
      if (detail.id === currentIdRef.current && iframeReadyRef.current) {
        api.getDiagram(detail.id).then(d => {
          if (!mountedRef.current) return
          loadedXmlRef.current = d.xml
          sendToIframe('load', { xml: d.xml, autosave: 1 })
        }).catch(console.error)
      }
    }
    document.addEventListener('drawio:updated', handler)
    return () => document.removeEventListener('drawio:updated', handler)
  }, [])

  // ============================================================
  // 切换图表
  // ============================================================
  const switchDiagram = useCallback((id: string) => {
    setCurrentId(id)
    setIframeReady(false)
    setSaveStatus('saved')
    setShowDropdown(false)
    loadedXmlRef.current = ''
  }, [])

  // ============================================================
  // postMessage 通信
  // ============================================================
  const sendToIframe = useCallback((action: string, payload: Record<string, any> = {}) => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    iframe.contentWindow.postMessage(JSON.stringify({ action, ...payload }), '*')
  }, [])

  // 当 iframe 就绪 + 图表切换时，加载 xml 到 iframe
  useEffect(() => {
    if (!iframeReady || !currentDiagram) return

    // 小幅延迟确保 iframe 完全初始化
    const timer = setTimeout(() => {
      const xml = currentDiagram.xml
      if (!xml || xml === EMPTY_XML) {
        // 空图表：加载空模板
        loadedXmlRef.current = EMPTY_XML
        sendToIframe('load', { xml: EMPTY_XML, autosave: 1 })
      } else {
        loadedXmlRef.current = xml
        sendToIframe('load', { xml, autosave: 1 })
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [iframeReady, currentDiagram?.id]) // 仅在 iframe 就绪或图表切换时触发

  // ============================================================
  // postMessage 事件处理
  // ============================================================
  useEffect(() => {
    const handler = (evt: MessageEvent) => {
      if (evt.origin !== 'https://embed.diagrams.net') return

      let msg: any
      try { msg = JSON.parse(evt.data) } catch { return }

      switch (msg.event) {
        case 'init':
          // iframe 就绪
          setIframeReady(true)
          break

        case 'autosave':
        case 'save':
          // 自动保存 / 手动保存 → 防抖写入 Supabase
          if (msg.xml && msg.xml !== loadedXmlRef.current) {
            loadedXmlRef.current = msg.xml
            setSaveStatus('unsaved')
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
            autosaveTimerRef.current = setTimeout(async () => {
              const id = currentIdRef.current
              if (!id || !mountedRef.current) return
              setSaving(true)
              setSaveStatus('saving')
              try {
                await api.updateDiagram(id, { xml: msg.xml })
                if (mountedRef.current) {
                  setSaveStatus('saved')
                  // 更新本地列表中的 xml
                  setDiagrams(prev => prev.map(d =>
                    d.id === id ? { ...d, xml: msg.xml, updated_at: new Date().toISOString() } : d
                  ))
                }
              } catch (e) {
                console.error('保存失败:', e)
                if (mountedRef.current) setSaveStatus('unsaved')
              } finally {
                if (mountedRef.current) setSaving(false)
              }
            }, AUTOSAVE_DEBOUNCE_MS)
          }

          // save 事件且 exit=true → 不处理（我们不用 saveAndExit）
          if (msg.event === 'save' && msg.exit) {
            setSaveStatus('saved')
          }
          break

        case 'export':
          // 导出完成 → 触发浏览器下载
          if (msg.data && msg.format === 'xmlpng') {
            const link = document.createElement('a')
            link.download = `${currentNameRef.current || 'diagram'}.png`
            link.href = msg.data
            link.click()
          }
          break

        case 'exit':
          // 用户点了退出 → 忽略
          break
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, []) // 稳定引用，通过 ref 读取最新名称

  // ============================================================
  // 图表操作
  // ============================================================
  const handleCreate = async () => {
    try {
      const d = await api.createDiagram('未命名图表', EMPTY_XML)
      if (!mountedRef.current) return
      setDiagrams(prev => [d, ...prev])
      setCurrentId(d.id)
      setIframeReady(false)
    } catch (e) { console.error('创建图表失败:', e) }
  }

  const handleRenameStart = (d: DrawioDiagram) => {
    setRenamingId(d.id)
    setRenameText(d.name)
  }

  const handleRenameSave = async () => {
    if (!renamingId || !renameText.trim()) {
      setRenamingId(null)
      return
    }
    try {
      await api.updateDiagram(renamingId, { name: renameText.trim() })
      if (mountedRef.current) {
        setDiagrams(prev => prev.map(d =>
          d.id === renamingId ? { ...d, name: renameText.trim() } : d
        ))
      }
    } catch (e) { console.error('重命名失败:', e) }
    setRenamingId(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDiagram(id)
      if (!mountedRef.current) return
      setDiagrams(prev => prev.filter(d => d.id !== id))
      if (currentId === id) {
        const remaining = diagrams.filter(d => d.id !== id)
        setCurrentId(remaining[0]?.id || null)
        setIframeReady(false)
      }
    } catch (e) { console.error('删除失败:', e) }
  }

  const handleExport = () => {
    sendToIframe('export', { format: 'xmlpng', scale: 2, border: 10 })
  }

  // ============================================================
  // 点击外部关闭下拉
  // ============================================================
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as HTMLElement)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  // ============================================================
  // 保存状态颜色
  // ============================================================
  const statusColor =
    saveStatus === 'saved' ? '#16a34a'
    : saveStatus === 'unsaved' ? '#d97706'
    : saveStatus === 'saving' ? undefined
    : '#16a34a'

  // ============================================================
  // Loading
  // ============================================================
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-background select-none">
      {/* ===== 工具栏 ===== */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
        {/* 返回 */}
        <button onClick={onBack} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent shrink-0">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        {/* 图表选择下拉 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 h-7 px-2 rounded hover:bg-accent text-sm font-semibold max-w-[200px]"
          >
            <span className="truncate">{currentDiagram?.name || '选择图表'}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 rounded-md border border-border bg-card shadow-lg z-50 py-1 max-h-64 overflow-auto">
              {diagrams.map(d => (
                <div key={d.id}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-xs ${d.id === currentId ? 'bg-accent/50 font-medium' : ''}`}
                  onClick={() => switchDiagram(d.id)}
                >
                  {renamingId === d.id ? (
                    <input
                      value={renameText}
                      onChange={e => setRenameText(e.target.value)}
                      className="flex-1 bg-background border border-input rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                      onBlur={handleRenameSave}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameSave()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">
                        {new Date(d.updated_at).toLocaleDateString('zh-CN')}
                      </span>
                      <button
                        className="h-5 w-5 rounded hover:bg-accent flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                        onClick={e => { e.stopPropagation(); handleRenameStart(d) }}
                      >
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                      <button
                        className="h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center shrink-0"
                        onClick={e => { e.stopPropagation(); handleDelete(d.id) }}
                      >
                        <X className="h-2.5 w-2.5 text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-xs text-muted-foreground border-t border-border mt-1 pt-1"
                onClick={handleCreate}
              >
                <Plus className="h-3 w-3" /> 新建图表
              </div>
            </div>
          )}
        </div>

        {/* 新建按钮 */}
        <button onClick={handleCreate} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent shrink-0"
          title="新建图表">
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="flex-1" />

        {/* 保存状态 */}
        <div className="flex items-center gap-1.5">
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <span className="text-[10px]" style={{ color: statusColor }}>
            {saveStatus === 'saved' && '已保存'}
            {saveStatus === 'unsaved' && '未保存'}
            {saveStatus === 'saving' && '保存中...'}
          </span>
        </div>

        {/* 导出 */}
        <button
          onClick={handleExport}
          className="h-7 text-[11px] px-2 rounded-md border border-input bg-background hover:bg-accent flex items-center gap-1 shrink-0"
        >
          <Save className="h-3 w-3" />导出 PNG
        </button>
      </div>

      {/* ===== Draw.io iframe ===== */}
      <div className="flex-1 relative">
        {/* iframe 加载中遮罩 */}
        {!iframeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <iframe
          key={currentId || 'empty'}
          ref={iframeRef}
          src={EMBED_URL}
          className="w-full h-full border-0"
          title="Draw.io Editor"
        />
      </div>
    </div>
  )
}

export default DrawioCanvas
