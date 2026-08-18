// ============================================================
// Board Plugin — 看板表单组件
// ============================================================

import React, { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from './ui'
import type { BoardPool } from './types'

interface Props {
  mode: 'create' | 'edit'
  board?: BoardPool | null
  saving: boolean
  onSave: (data: { name: string; description: string }) => void
  onClose: () => void
}

export const BoardForm: React.FC<Props> = ({ mode, board, saving, onSave, onClose }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (mode === 'edit' && board) {
      setName(board.name)
      setDescription(board.description || '')
    } else {
      setName('')
      setDescription('')
      setErrors({})
    }
  }, [mode, board])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = '请输入看板名称'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSave({ name: name.trim(), description: description.trim() })
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
        width: 420, maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid hsl(var(--border))',
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
            {mode === 'create' ? '新建看板' : '编辑看板'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>看板名称 *</span>
            <input
              placeholder="输入看板名称"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })) }}
              className={inputCls(!!errors.name)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            />
            {errors.name && <span style={{ fontSize: 10, color: 'hsl(var(--destructive))' }}>{errors.name}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'hsl(var(--muted-foreground))' }}>描述</span>
            <textarea
              placeholder="看板描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
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
