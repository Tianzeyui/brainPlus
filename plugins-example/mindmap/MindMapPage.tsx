// ============================================================
// Mind Map Plugin — 主页面
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, Trash2, Pencil, Lightbulb, AlertTriangle } from 'lucide-react'
import { Button } from './ui'
import type { MindMap } from './types'
import { MindMapCanvas } from './MindMapCanvas'
import * as api from './api'

type View = 'list' | 'canvas'

export const MindMapPage: React.FC = () => {
  const [view, setView] = useState<View>('list')
  const [maps, setMaps] = useState<MindMap[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 表单
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  // 画布
  const [selectedMap, setSelectedMap] = useState<MindMap | null>(null)

  // 重命名
  const [renameTarget, setRenameTarget] = useState<MindMap | null>(null)
  const [renameName, setRenameName] = useState('')

  // 删除
  const [deleteTarget, setDeleteTarget] = useState<MindMap | null>(null)

  // ============================================================
  // 加载列表
  // ============================================================
  const loadMaps = useCallback(async () => {
    setLoading(true); setError(null)
    try { setMaps(await api.listMaps()) }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadMaps() }, [loadMaps])

  // ============================================================
  // 画布切换
  // ============================================================
  const openCanvas = (m: MindMap) => {
    setSelectedMap(m); setView('canvas')
  }

  const closeCanvas = () => {
    setView('list'); setSelectedMap(null); loadMaps()
  }

  // ============================================================
  // CRUD
  // ============================================================
  const handleCreate = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const m = await api.createMap(formName.trim())
      setShowForm(false); setFormName(''); setMaps(prev => [m, ...prev])
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return
    try {
      await api.updateMap(renameTarget.id, { name: renameName.trim() })
      setMaps(prev => prev.map(m => m.id === renameTarget.id ? { ...m, name: renameName.trim() } : m))
      setRenameTarget(null)
    } catch (e) { console.error(e) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteMap(deleteTarget.id)
      setDeleteTarget(null); setMaps(prev => prev.filter(m => m.id !== deleteTarget.id))
    } catch (e) { console.error(e) }
  }

  // ============================================================
  // 相对时间
  // ============================================================
  const relTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins} 分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} 天前`
    return new Date(d).toLocaleDateString('zh-CN')
  }

  // ============================================================
  // 列表视图
  // ============================================================
  const ListView = () => (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
        <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0" />
        <h1 className="text-sm font-semibold">思维导图</h1>
        <span className="text-[10px] text-muted-foreground">{maps.length} 个导图</span>
        <div className="flex-1" />
        <Button size="sm" className="h-7 text-[11px] px-3" onClick={() => { setShowForm(true); setFormName('') }}>
          <Plus className="h-3.5 w-3.5 mr-1" />新建导图
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs">{error}</p>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={loadMaps}>重试</Button>
          </div>
        ) : maps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <Lightbulb className="h-10 w-10 text-muted-foreground/25" />
            <p className="text-xs">还没有思维导图，创建一个开始吧</p>
            <Button size="sm" className="h-7 text-[11px]" onClick={() => { setShowForm(true); setFormName('') }}>
              <Plus className="h-3.5 w-3.5 mr-1" />新建导图
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {maps.map(m => (
              <div key={m.id}
                className="group flex flex-col gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer aspect-[4/3]"
                onClick={() => openCanvas(m)}
              >
                <div className="flex items-start justify-between">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setRenameTarget(m); setRenameName(m.name) }}>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(m) }}>
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-semibold leading-tight line-clamp-2">{m.name}</h3>
                </div>
                <span className="text-[10px] text-muted-foreground/40">{relTime(m.updated_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="h-full">
      {view === 'list' && <ListView />}
      {view === 'canvas' && selectedMap && (
        <MindMapCanvas
          map={selectedMap}
          onBack={closeCanvas}
        />
      )}

      {/* 创建表单 */}
      {showForm && (
        <div data-backdrop="true"
          style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setShowForm(false) }}
        >
          <div style={{ backgroundColor: 'hsl(var(--card))', borderRadius: 10, border: '1px solid hsl(var(--border))', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 380 }}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>新建思维导图</h3>
              <input
                placeholder="输入导图名称"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid hsl(var(--border))' }}>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setShowForm(false)}>取消</Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={handleCreate} disabled={saving}>
                {saving ? '创建中…' : '创建'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 重命名弹窗 */}
      {renameTarget && (
        <div data-backdrop="true"
          style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setRenameTarget(null) }}
        >
          <div style={{ backgroundColor: 'hsl(var(--card))', borderRadius: 10, border: '1px solid hsl(var(--border))', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 380 }}>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>重命名</h3>
              <input value={renameName} onChange={(e) => setRenameName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid hsl(var(--border))' }}>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setRenameTarget(null)}>取消</Button>
              <Button size="sm" className="h-7 text-[11px]" onClick={handleRename}>确定</Button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div data-backdrop="true"
          style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
          onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setDeleteTarget(null) }}
        >
          <div style={{ backgroundColor: 'hsl(var(--card))', borderRadius: 10, border: '1px solid hsl(var(--border))', boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 360, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600 }}>确认删除</h3>
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>确定要删除「{deleteTarget.name}」吗？所有节点将被一并删除。</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="destructive" size="sm" className="h-7 text-[11px]" onClick={handleDelete}>确认删除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MindMapPage
