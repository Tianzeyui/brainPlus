// ============================================================
// Board Plugin — 主页面
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Loader2, FolderKanban, Trash2, Pencil, AlertTriangle, ClipboardList } from 'lucide-react'
import { Button } from './ui'
import type { BoardPool, BoardData, BoardView } from './types'
import { BoardForm } from './BoardForm'
import { KanbanBoard } from './KanbanBoard'
import * as api from './api'

export const BoardPage: React.FC = () => {
  const [view, setView] = useState<BoardView>('list')
  const [boards, setBoards] = useState<BoardPool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 看板表单
  const [boardForm, setBoardForm] = useState<{ mode: 'create' | 'edit'; board?: BoardPool } | null>(null)
  const [savingBoard, setSavingBoard] = useState(false)

  // 看板详情
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [boardData, setBoardData] = useState<BoardData | null>(null)
  const [boardLoading, setBoardLoading] = useState(false)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<BoardPool | null>(null)

  // ============================================================
  // 加载看板列表
  // ============================================================
  const loadBoards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listBoards()
      setBoards(data)
    } catch (e: any) {
      setError(e.message || '加载失败')
      console.error('[Board] Load boards failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  // ============================================================
  // 加载看板详情
  // ============================================================
  const loadBoardDetail = useCallback(async (poolId: string) => {
    setBoardLoading(true)
    try {
      const data = await api.loadBoardData(poolId)
      setBoardData(data)
    } catch (e: any) {
      console.error('[Board] Load board detail failed:', e)
    } finally {
      setBoardLoading(false)
    }
  }, [])

  const openBoard = (id: string) => {
    setSelectedBoardId(id)
    setView('board')
    loadBoardDetail(id)
  }

  const closeBoard = () => {
    setView('list')
    setSelectedBoardId(null)
    setBoardData(null)
    loadBoards() // 刷新列表
  }

  // ============================================================
  // 看板 CRUD
  // ============================================================
  const handleSaveBoard = async (data: { name: string; description: string }) => {
    setSavingBoard(true)
    try {
      if (boardForm?.mode === 'create') {
        await api.createBoard(data.name, data.description)
      } else if (boardForm?.board) {
        await api.updateBoard(boardForm.board.id, data)
      }
      setBoardForm(null)
      await loadBoards()
    } catch (e: any) {
      console.error('[Board] Save board failed:', e)
    } finally {
      setSavingBoard(false)
    }
  }

  const handleDeleteBoard = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteBoard(deleteTarget.id)
      setDeleteTarget(null)
      await loadBoards()
    } catch (e: any) {
      console.error('[Board] Delete board failed:', e)
    }
  }

  // ============================================================
  // 格式化相对时间
  // ============================================================
  const relativeTime = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins} 分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} 小时前`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} 天前`
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  // ============================================================
  // 列表视图
  // ============================================================
  const ListView = () => (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
        <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
        <h1 className="text-sm font-semibold">卡片看板</h1>
        <span className="text-[10px] text-muted-foreground">{boards.length} 个看板</span>
        <div className="flex-1" />
        <Button size="sm" className="h-7 text-[11px] px-3"
          onClick={() => setBoardForm({ mode: 'create' })}>
          <Plus className="h-3.5 w-3.5 mr-1" />新建看板
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs">{error}</p>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={loadBoards}>重试</Button>
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-xs">还没有看板，创建一个开始使用吧</p>
            <Button size="sm" className="h-7 text-[11px]"
              onClick={() => setBoardForm({ mode: 'create' })}>
              <Plus className="h-3.5 w-3.5 mr-1" />新建看板
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {boards.map(board => (
              <div key={board.id}
                className="group flex flex-col gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer aspect-[4/3]"
                onClick={() => openBoard(board.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setBoardForm({ mode: 'edit', board }) }}
                    >
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button
                      className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(board) }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-semibold leading-tight line-clamp-2">{board.name}</h3>
                  <p className="text-[11px] text-muted-foreground/60 line-clamp-2 mt-1">
                    {board.description || '暂无描述'}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/40">{relativeTime(board.updated_at)}</span>
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

      {view === 'board' && boardData && (
        <KanbanBoard
          boardData={boardData}
          loading={boardLoading}
          onBack={closeBoard}
          onBoardUpdated={() => loadBoardDetail(selectedBoardId!)}
        />
      )}

      {/* 看板表单弹窗 */}
      {boardForm && (
        <BoardForm
          mode={boardForm.mode}
          board={boardForm.board || null}
          saving={savingBoard}
          onSave={handleSaveBoard}
          onClose={() => setBoardForm(null)}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <div data-backdrop="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
          }}
          onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setDeleteTarget(null) }}
        >
          <div style={{
            backgroundColor: 'hsl(var(--card))', borderRadius: 10,
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 360,
            padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600 }}>确认删除看板</h3>
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
              确定要删除看板「{deleteTarget.name}」吗？该操作不可撤销，所有关联的泳道、阶段和卡片都会被删除。
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setDeleteTarget(null)}>取消</Button>
              <Button variant="destructive" size="sm" className="h-7 text-[11px]" onClick={handleDeleteBoard}>确认删除</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BoardPage
