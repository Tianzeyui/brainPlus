// ============================================================
// Board Plugin — 卡片表单组件
// ============================================================

import React, { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from './ui'
import type { BoardCard } from './types'
import { PRIORITY_OPTIONS, PRIORITY_LABELS, PRIORITY_COLORS } from './types'

interface Props {
  mode: 'create' | 'edit'
  card?: BoardCard | null
  poolId: string
  defaultLaneId?: string | null
  defaultStageId?: string | null
  defaultOrder?: number
  saving: boolean
  onSave: (data: CardFormData) => void
  onClose: () => void
}

export interface CardFormData {
  title: string
  content: string
  note: string
  priority: string
  lane_id: string | null
  stage_id: string | null
  order_in_cell: number
}

export const BoardCardForm: React.FC<Props> = ({
  mode, card, poolId, defaultLaneId, defaultStageId, defaultOrder,
  saving, onSave, onClose,
}) => {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [note, setNote] = useState('')
  const [priority, setPriority] = useState('P2')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (mode === 'edit' && card) {
      setTitle(card.title)
      setContent(card.content || '')
      setNote(card.note || '')
      setPriority(card.priority || 'P2')
    } else {
      setTitle('')
      setContent('')
      setNote('')
      setPriority('P2')
      setErrors({})
    }
  }, [mode, card])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = '请输入卡片标题'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSave({
      title: title.trim(),
      content,
      note,
      priority,
      lane_id: card?.lane_id ?? defaultLaneId ?? null,
      stage_id: card?.stage_id ?? defaultStageId ?? null,
      order_in_cell: card?.order_in_cell ?? defaultOrder ?? 0,
    })
  }

  const inputCls = (hasErr: boolean) =>
    `w-full rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring ${hasErr ? 'border-destructive' : 'border-input'}`

  return (
    <div
      data-backdrop="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      }}
      onClick={(ev) => { if ((ev.target as HTMLElement).dataset.backdrop === 'true') onClose() }}
      onKeyDown={(ev) => { if (ev.key === 'Escape') onClose() }}
    >
      <div style={{
        backgroundColor: 'hsl(var(--card))', borderRadius: 10,
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        width: 480, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid hsl(var(--border))',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            {mode === 'create' ? '新增卡片' : '编辑卡片'}
          </h3>
          <button
            style={{
              width: 20, height: 20, borderRadius: 4, border: 'none',
              background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
          >
            <X size={14} color="hsl(var(--muted-foreground))" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 标题 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>标题 *</span>
            <input
              placeholder="输入卡片标题"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setErrors(prev => ({ ...prev, title: '' })) }}
              className={inputCls(!!errors.title)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            />
            {errors.title && <span style={{ fontSize: 10, color: 'hsl(var(--destructive))' }}>{errors.title}</span>}
          </div>

          {/* 内容 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>内容</span>
            <textarea
              placeholder="卡片详细内容（可选）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className={inputCls(false)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* 优先级 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>优先级</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRIORITY_OPTIONS.map(p => (
                <button key={p} type="button"
                  onClick={() => setPriority(p)}
                  style={{
                    flex: 1, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 500,
                    border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                    ...(priority === p ? {
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                      borderColor: 'hsl(var(--primary))',
                    } : {
                      backgroundColor: 'hsl(var(--background))',
                      color: 'hsl(var(--muted-foreground))',
                      borderColor: 'hsl(var(--input))',
                    }),
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 备注 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>备注</span>
            <textarea
              placeholder="备注信息（可选）"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={inputCls(false)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
          padding: '14px 24px', borderTop: '1px solid hsl(var(--border))',
          borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
        }}>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] px-3" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button size="sm" className="h-7 text-[11px] px-4" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {saving ? '保存中…' : mode === 'create' ? '创建' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}
