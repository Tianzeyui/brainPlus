// ============================================================
// Board Plugin — 看板网格组件（核心）
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft, Plus, X, Pencil, Trash2,
  Loader2, StickyNote, Ban, ClipboardList,
  CheckSquare, Search, Rocket, Square,
} from 'lucide-react'
import { Button } from './ui'
import { cn } from './ui'
import type { BoardData, BoardLane, BoardStage, BoardCard, Priority } from './types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from './types'
import { BoardCardForm } from './BoardCardForm'
import type { CardFormData } from './BoardCardForm'
import { BoardCard } from './BoardCard'
import * as api from './api'

interface Props {
  boardData: BoardData
  loading: boolean
  onBack: () => void
  onBoardUpdated: () => void
}

// 无泳道/无阶段的虚拟 ID
const NO_LANE = '__no_lane__'
const NO_STAGE = '__no_stage__'

export const KanbanBoard: React.FC<Props> = ({ boardData, loading, onBack, onBoardUpdated }) => {
  const { pool } = boardData
  const [lanes, setLanes] = useState<BoardLane[]>([])
  const [stages, setStages] = useState<BoardStage[]>([])
  const [cards, setCards] = useState<BoardCard[]>([])

  // 同步初始数据
  useEffect(() => {
    setLanes(boardData.lanes || [])
    setStages(boardData.stages || [])
    setCards(boardData.cards || [])
  }, [boardData])

  // 卡片表单
  const [cardForm, setCardForm] = useState<{
    mode: 'create' | 'edit'
    card?: BoardCard | null
    defaultLaneId?: string | null
    defaultStageId?: string | null
  } | null>(null)
  const [savingCard, setSavingCard] = useState(false)

  // 行内编辑：泳道/阶段名称
  const [editingLane, setEditingLane] = useState<string | null>(null)
  const [editingStage, setEditingStage] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // 新增泳道/阶段
  const [addingLane, setAddingLane] = useState(false)
  const [addingStage, setAddingStage] = useState(false)
  const [newItemName, setNewItemName] = useState('')

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string; name: string } | null>(null)

  // 拖拽状态
  const [dragOverCell, setDragOverCell] = useState<string | null>(null) // `${laneId}|${stageId}`

  // 展开的卡片（查看详情）
  const [expandedCard, setExpandedCard] = useState<BoardCard | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  // ============================================================
  // 数据刷新
  // ============================================================
  const refresh = useCallback(async () => {
    try {
      const [freshLanes, freshStages, freshCards] = await Promise.all([
        api.listLanes(pool.id),
        api.listStages(pool.id),
        api.listCards(pool.id),
      ])
      setLanes(freshLanes)
      setStages(freshStages)
      setCards(freshCards)
    } catch (e) {
      console.error('[Board] Refresh failed:', e)
    }
  }, [pool.id])

  // ============================================================
  // 卡片 CRUD
  // ============================================================
  const handleSaveCard = async (data: CardFormData) => {
    setSavingCard(true)
    try {
      if (cardForm?.mode === 'create') {
        await api.createCard({
          pool_id: pool.id,
          title: data.title,
          content: data.content,
          note: data.note,
          priority: data.priority,
          lane_id: data.lane_id,
          stage_id: data.stage_id,
          order_in_cell: data.order_in_cell,
        })
      } else if (cardForm?.card) {
        await api.updateCard(cardForm.card.id, {
          title: data.title,
          content: data.content,
          note: data.note,
          priority: data.priority,
        })
      }
      setCardForm(null)
      await refresh()
    } catch (e: any) {
      console.error('[Board] Save card failed:', e)
    } finally {
      setSavingCard(false)
    }
  }

  const handleDeleteCard = async (id: string) => {
    try {
      await api.deleteCard(id)
      if (expandedCard?.id === id) setExpandedCard(null)
      await refresh()
    } catch (e) {
      console.error('[Board] Delete card failed:', e)
    }
  }

  // ============================================================
  // 拖拽处理
  // ============================================================
  const handleDragStart = (e: React.DragEvent, card: BoardCard) => {
    e.dataTransfer.setData('cardId', card.id)
    e.dataTransfer.setData('fromLane', card.lane_id || NO_LANE)
    e.dataTransfer.setData('fromStage', card.stage_id || NO_STAGE)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverCell = (e: React.DragEvent, laneId: string, stageId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCell(`${laneId}|${stageId}`)
  }

  const handleDragLeaveCell = () => {
    setDragOverCell(null)
  }

  const handleDropCell = async (e: React.DragEvent, toLaneId: string, toStageId: string) => {
    e.preventDefault()
    setDragOverCell(null)
    const cardId = e.dataTransfer.getData('cardId')
    if (!cardId) return

    const realLaneId = toLaneId === NO_LANE ? null : toLaneId
    const realStageId = toStageId === NO_STAGE ? null : toStageId

    // 更新本地状态（乐观更新）
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, lane_id: realLaneId, stage_id: realStageId } : c
    ))

    try {
      await api.moveCard(cardId, realLaneId, realStageId, 0)
      await refresh()
    } catch (e) {
      console.error('[Board] Move card failed:', e)
      await refresh()
    }
  }

  // ============================================================
  // 泳道 CRUD
  // ============================================================
  const handleAddLane = async () => {
    if (!newItemName.trim()) return
    try {
      await api.createLane(pool.id, newItemName.trim(), lanes.length)
      setNewItemName('')
      setAddingLane(false)
      await refresh()
    } catch (e) {
      console.error('[Board] Add lane failed:', e)
    }
  }

  const handleRenameLane = async (id: string) => {
    if (!editValue.trim()) return
    try {
      await api.updateLane(id, { name: editValue.trim() })
      setEditingLane(null)
      await refresh()
    } catch (e) {
      console.error('[Board] Rename lane failed:', e)
    }
  }

  const handleDeleteLane = async (id: string) => {
    try {
      await api.deleteLane(id)
      setDeleteConfirm(null)
      await refresh()
    } catch (e) {
      console.error('[Board] Delete lane failed:', e)
    }
  }

  // ============================================================
  // 阶段 CRUD
  // ============================================================
  const handleAddStage = async () => {
    if (!newItemName.trim()) return
    try {
      await api.createStage(pool.id, newItemName.trim(), stages.length)
      setNewItemName('')
      setAddingStage(false)
      await refresh()
    } catch (e) {
      console.error('[Board] Add stage failed:', e)
    }
  }

  const handleRenameStage = async (id: string) => {
    if (!editValue.trim()) return
    try {
      await api.updateStage(id, { name: editValue.trim() })
      setEditingStage(null)
      await refresh()
    } catch (e) {
      console.error('[Board] Rename stage failed:', e)
    }
  }

  const handleDeleteStage = async (id: string) => {
    try {
      await api.deleteStage(id)
      setDeleteConfirm(null)
      await refresh()
    } catch (e) {
      console.error('[Board] Delete stage failed:', e)
    }
  }

  // ============================================================
  // 获取单元格中的卡片
  // ============================================================
  const getCardsInCell = (laneId: string | null, stageId: string | null): BoardCard[] => {
    return cards.filter(c => (c.lane_id || null) === laneId && (c.stage_id || null) === stageId)
  }

  // ============================================================
  // 生命周期
  // ============================================================
  useEffect(() => {
    if (addingLane || addingStage) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [addingLane, addingStage])

  // ============================================================
  // Render helpers
  // ============================================================
  const inputCls = (hasErr = false) =>
    cn('w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring',
      hasErr ? 'border-destructive' : 'border-input')

  const stageColumns = stages.length > 0 ? stages : [{ id: NO_STAGE, pool_id: pool.id, name: '待分类', sort_order: 0, created_at: '', updated_at: '' } as BoardStage]
  const laneRows = lanes.length > 0 ? lanes : [{ id: NO_LANE, pool_id: pool.id, name: '默认', sort_order: 0, created_at: '', updated_at: '' } as BoardLane]

  const LANE_LABEL_WIDTH = 140
  const COLUMN_WIDTH = 220

  const priorityBadge = (p: string) => (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', PRIORITY_COLORS[p] || PRIORITY_COLORS.P2)}>
      {PRIORITY_LABELS[p] || p}
    </span>
  )

  // ============================================================
  // 删除确认弹窗
  // ============================================================
  const DeleteConfirmDialog = () => {
    if (!deleteConfirm) return null
    return (
      <div data-backdrop="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
        }}
        onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setDeleteConfirm(null) }}
      >
        <div style={{
          backgroundColor: 'hsl(var(--card))', borderRadius: 10,
          border: '1px solid hsl(var(--border) / 0.5)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 360,
          padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ban className="h-4 w-4 text-destructive" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>确认删除</span>
          </div>
          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
            确定要删除{deleteConfirm.type === 'lane' ? '泳道' : '阶段'}「{deleteConfirm.name}」吗？该操作不可撤销，关联的卡片也会被删除。
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button variant="destructive" size="sm" className="h-7 text-[11px]"
              onClick={() => {
                if (deleteConfirm.type === 'lane') handleDeleteLane(deleteConfirm.id)
                else handleDeleteStage(deleteConfirm.id)
              }}>
              确认删除
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // Loading
  // ============================================================
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ============================================================
  // 按模板初始化看板
  // ============================================================
  const [initLoading, setInitLoading] = useState(false)

  const createFromTemplate = async (template: typeof TEMPLATES[0]) => {
    setInitLoading(true)
    try {
      // 批量创建阶段
      for (let i = 0; i < template.stages.length; i++) {
        await api.createStage(pool.id, template.stages[i], i)
      }
      // 批量创建泳道
      for (let i = 0; i < template.lanes.length; i++) {
        await api.createLane(pool.id, template.lanes[i], i)
      }
      await refresh()
    } catch (e) {
      console.error('[Board] Template init failed:', e)
    } finally {
      setInitLoading(false)
    }
  }

  const TEMPLATES = [
    {
      Icon: CheckSquare,
      name: '任务看板',
      desc: '经典待办/进行中/已完成',
      stages: ['待办', '进行中', '已完成'],
      lanes: [] as string[],
    },
    {
      Icon: Search,
      name: '需求分析',
      desc: '收集/评审/通过/驳回',
      stages: ['收集', '评审中', '已通过', '已驳回'],
      lanes: [] as string[],
    },
    {
      Icon: Rocket,
      name: '开发迭代',
      desc: 'Backlog→开发→测试→发布，配合前后端泳道',
      stages: ['Backlog', '开发中', '测试', '已发布'],
      lanes: ['前端', '后端'],
    },
    {
      Icon: Square,
      name: '空白看板',
      desc: '默认一个泳道+阶段，自由搭建',
      stages: ['阶段 1'],
      lanes: ['泳道 1'],
    },
  ]

  // ============================================================
  // 空状态
  // ============================================================
  const isEmpty = stages.length === 0 && lanes.length === 0 && cards.length === 0

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
          <button onClick={onBack} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent transition-colors">
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <h1 className="text-sm font-semibold">{pool.name}</h1>
        </div>
        {/* Empty */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-muted-foreground px-6">
          <ClipboardList className="h-10 w-10 text-muted-foreground/25" />
          <div className="text-center mb-3">
            <p className="text-xs font-medium">选择模板快速开始</p>
            <p className="text-[10px] text-muted-foreground/50 mt-1.5">后续可自由增删泳道和阶段</p>
          </div>

          {initLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="grid grid-cols-2 gap-3 max-w-md">
              {TEMPLATES.map((t, i) => {
                const Icon = t.Icon
                return (
                  <button
                    key={i}
                    onClick={() => createFromTemplate(t)}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <Icon className="h-6 w-6 text-muted-foreground" />
                    <span className="text-[12px] font-medium">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 leading-relaxed text-center">{t.desc}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================================
  // Main Render
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-background select-none">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
        <button onClick={onBack} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <h1 className="text-sm font-semibold">{pool.name}</h1>
        <span className="text-[10px] text-muted-foreground">{cards.length} 卡片</span>
        <div className="flex-1" />
        <Button size="sm" className="h-7 text-[11px] px-3"
          onClick={() => {
            const firstLane = lanes.length > 0 ? lanes[0].id : null
            const firstStage = stages.length > 0 ? stages[0].id : null
            setCardForm({ mode: 'create', defaultLaneId: firstLane, defaultStageId: firstStage })
          }}>
          <Plus className="h-3.5 w-3.5 mr-1" />添加卡片
        </Button>
      </div>

      {/* ================================================================ */}
      {/* 阶段表头 + 网格主体 — 统一滚动容器（保证列对齐 + 粘性表头/泳道标签） */}
      {/* ================================================================ */}
      <div className="flex-1 overflow-auto">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 'fit-content', minHeight: '100%' }}>

          {/* ---- 阶段表头行 (sticky top) ---- */}
          <div style={{
            display: 'flex', position: 'sticky', top: 0, zIndex: 20,
            backgroundColor: 'hsl(var(--background))',
            borderBottom: '1px solid hsl(var(--border) / 0.45)',
          }}>
            {/* 角格（sticky top + left） */}
            {stages.length > 0 && (
              <div style={{
                width: LANE_LABEL_WIDTH, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 30,
                backgroundColor: 'hsl(var(--background))',
                display: 'flex', alignItems: 'center', paddingLeft: 12,
                borderRight: '1px solid hsl(var(--border) / 0.45)',
                height: 32,
              }}>
                <span className="text-[10px] font-medium text-muted-foreground">泳道 \ 阶段</span>
              </div>
            )}
            {stageColumns.map(stage => (
              <div key={stage.id}
                className="group"
                style={{
                  width: COLUMN_WIDTH, flexShrink: 0, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 12px', borderRight: '1px solid hsl(var(--border) / 0.45)',
                }}
              >
                {editingStage === stage.id ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className={inputCls()}
                    style={{ height: 22, fontSize: 10 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameStage(stage.id)
                      if (e.key === 'Escape') setEditingStage(null)
                    }}
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="text-[11px] font-medium truncate">{stage.name}</span>
                    {stages.length > 0 && stage.id !== NO_STAGE && (
                      <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="h-5 w-5 rounded hover:bg-accent flex items-center justify-center"
                          onClick={() => { setEditingStage(stage.id); setEditValue(stage.name) }}>
                          <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                        <button className="h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center"
                          onClick={() => setDeleteConfirm({ type: 'stage', id: stage.id, name: stage.name })}>
                          <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {/* 添加阶段列 */}
            <div style={{
              width: 60, flexShrink: 0, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {addingStage ? (
                <div className="flex items-center gap-1 px-1">
                  <input ref={inputRef} value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="阶段名"
                    className={inputCls()}
                    style={{ width: 80, height: 20, fontSize: 10 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddStage()
                      if (e.key === 'Escape') { setAddingStage(false); setNewItemName('') }
                    }} />
                </div>
              ) : (
                <button className="h-5 w-5 rounded hover:bg-accent flex items-center justify-center"
                  onClick={() => { setAddingStage(true); setNewItemName('') }}>
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* ---- 泳道行 ---- */}
          {laneRows.map(lane => (
            <div key={lane.id} style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border) / 0.45)', minHeight: 100 }}>
              {/* 泳道标签（sticky left） */}
              {stages.length > 0 && (
                <div
                  className="group"
                  style={{
                  width: LANE_LABEL_WIDTH, flexShrink: 0,
                  position: 'sticky', left: 0, zIndex: 10,
                  backgroundColor: 'hsl(var(--background))',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  padding: '12px 12px', borderRight: '1px solid hsl(var(--border) / 0.45)',
                }}>
                  {editingLane === lane.id ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className={inputCls()}
                        style={{ height: 22, fontSize: 10 }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameLane(lane.id)
                          if (e.key === 'Escape') setEditingLane(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="text-[11px] font-medium truncate">{lane.name}</span>
                        {lanes.length > 0 && lane.id !== NO_LANE && (
                          <div className="flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="h-5 w-5 rounded hover:bg-accent flex items-center justify-center"
                              onClick={() => { setEditingLane(lane.id); setEditValue(lane.name) }}>
                              <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                            <button className="h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center"
                              onClick={() => setDeleteConfirm({ type: 'lane', id: lane.id, name: lane.name })}>
                              <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                </div>
              )}

              {/* 该泳道下的各阶段单元格 */}
              {stageColumns.map(stage => {
                const cellCards = getCardsInCell(
                  lane.id === NO_LANE ? null : lane.id,
                  stage.id === NO_STAGE ? null : stage.id
                )
                const cellKey = `${lane.id}|${stage.id}`
                const isDragOver = dragOverCell === cellKey

                return (
                  <div key={cellKey}
                    style={{ width: COLUMN_WIDTH, flexShrink: 0, padding: 8, borderRight: '1px solid hsl(var(--border) / 0.45)' }}
                    className={cn(
                      'flex flex-col gap-1.5 transition-colors min-h-[60px]',
                      isDragOver && 'bg-primary/5 ring-1 ring-primary/30'
                    )}
                    onDragOver={(e) => handleDragOverCell(e, lane.id, stage.id)}
                    onDragLeave={handleDragLeaveCell}
                    onDrop={(e) => handleDropCell(e, lane.id, stage.id)}
                  >
                    {cellCards.map(card => (
                      <BoardCard
                        key={card.id}
                        card={card}
                        onClick={(c) => setExpandedCard(c)}
                        onDragStart={handleDragStart}
                      />
                    ))}
                  </div>
                )
              })}
              {/* 空单元格对齐 +阶段 列 */}
              <div style={{ width: 60, flexShrink: 0, borderRight: '1px solid hsl(var(--border) / 0.25)' }} />
            </div>
          ))}
          {/* ---- 添加泳道行 ---- */}
          <div style={{ display: 'flex', borderBottom: '1px solid hsl(var(--border) / 0.45)', minHeight: 40 }}>
            {stages.length > 0 && (
              <div style={{
                width: LANE_LABEL_WIDTH, flexShrink: 0,
                position: 'sticky', left: 0, zIndex: 10,
                backgroundColor: 'hsl(var(--background))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRight: '1px solid hsl(var(--border) / 0.45)',
              }}>
                {addingLane ? (
                  <input ref={inputRef} value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="泳道名"
                    className={inputCls()}
                    style={{ width: 80, height: 22, fontSize: 10 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddLane()
                      if (e.key === 'Escape') { setAddingLane(false); setNewItemName('') }
                    }} />
                ) : (
                  <button className="h-5 w-5 rounded hover:bg-accent flex items-center justify-center"
                    onClick={() => { setAddingLane(true); setNewItemName('') }}>
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
            {stageColumns.map((stage, i) => (
              <div key={stage.id} style={{ width: COLUMN_WIDTH, flexShrink: 0 }} />
            ))}
            <div style={{ width: 60, flexShrink: 0 }} />
          </div>
        </div>
      </div>

      {/* 卡片表单弹窗 */}
      {cardForm && (
        <BoardCardForm
          mode={cardForm.mode}
          card={cardForm.card || null}
          poolId={pool.id}
          defaultLaneId={cardForm.defaultLaneId}
          defaultStageId={cardForm.defaultStageId}
          saving={savingCard}
          onSave={handleSaveCard}
          onClose={() => setCardForm(null)}
        />
      )}

      {/* 卡片详情弹窗（展开查看/编辑） */}
      {expandedCard && (
        <div data-backdrop="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
          }}
          onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') setExpandedCard(null) }}
          onKeyDown={(ev) => { if (ev.key === 'Escape') setExpandedCard(null) }}
        >
          <div style={{
            backgroundColor: 'hsl(var(--card))', borderRadius: 10,
            border: '1px solid hsl(var(--border) / 0.5)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: 520, maxHeight: '90vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 24px', borderBottom: '1px solid hsl(var(--border) / 0.5)',
            }}>
              <div className="flex items-center gap-2">
                {priorityBadge(expandedCard.priority)}
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{expandedCard.title}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="h-6 w-6 rounded hover:bg-accent flex items-center justify-center"
                  onClick={() => {
                    setExpandedCard(null)
                    setCardForm({ mode: 'edit', card: expandedCard })
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  className="h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center"
                  onClick={() => handleDeleteCard(expandedCard.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: 'none',
                    background: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: 4,
                  }}
                  onClick={() => setExpandedCard(null)}
                >
                  <X size={14} color="hsl(var(--muted-foreground))" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 内容 */}
              <div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))', display: 'block', marginBottom: 4 }}>内容</span>
                <p style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
                  {expandedCard.content || '(无内容)'}
                </p>
              </div>

              {/* 备注 */}
              <div>
                <span className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))', marginBottom: 4 }}>
                  <StickyNote className="h-3 w-3" />备注
                </span>
                <div
                  className="rounded-md border border-border bg-muted/20 p-3"
                  style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', minHeight: 40 }}
                >
                  {expandedCard.note || '(暂无备注)'}
                </div>
              </div>

              {/* 元信息 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>创建人</span>
                  <p style={{ fontSize: 11, margin: '2px 0 0' }}>{expandedCard.created_by || '未知'}</p>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>创建时间</span>
                  <p style={{ fontSize: 11, margin: '2px 0 0' }}>{new Date(expandedCard.created_at).toLocaleString('zh-CN')}</p>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>更新时间</span>
                  <p style={{ fontSize: 11, margin: '2px 0 0' }}>{new Date(expandedCard.updated_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <DeleteConfirmDialog />
    </div>
  )
}
