// ============================================================
// Board Plugin — 卡片组件（3D tilt 动效）
// ============================================================

import React, { useRef, useState, useCallback } from 'react'
import { cn } from './ui'
import type { BoardCard as BoardCardType } from './types'
import { PRIORITY_LABELS, PRIORITY_COLORS } from './types'

interface Props {
  card: BoardCardType
  onClick: (card: BoardCardType) => void
  onDragStart: (e: React.DragEvent, card: BoardCardType) => void
}

const priorityBorderColor = (p: string): string => {
  switch (p) {
    case 'P0': return '#ef4444'
    case 'P1': return '#f97316'
    case 'P2': return '#3b82f6'
    case 'P3': return '#9ca3af'
    default: return '#9ca3af'
  }
}

export const BoardCard: React.FC<Props> = ({ card, onClick, onDragStart }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [rotateX, setRotateX] = useState(0)
  const [rotateY, setRotateY] = useState(0)
  const [scale, setScale] = useState(1)
  const [glareX, setGlareX] = useState(50)
  const [glareY, setGlareY] = useState(50)
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    const rotateYVal = ((x - centerX) / centerX) * 9
    const rotateXVal = ((centerY - y) / centerY) * 9

    setRotateX(rotateXVal)
    setRotateY(rotateYVal)
    setGlareX((x / rect.width) * 100)
    setGlareY((y / rect.height) * 100)
  }, [])

  const handleMouseEnter = useCallback(() => {
    setScale(1.04)
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setRotateX(0)
    setRotateY(0)
    setScale(1)
    setIsHovered(false)
  }, [])

  const borderColor = priorityBorderColor(card.priority)
  const priorityLabel = PRIORITY_LABELS[card.priority] || card.priority
  const priorityColorClass = PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.P2

  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        // 用可见 clone 创建拖拽幽灵图，再隐藏原卡片
        const el = e.currentTarget as HTMLElement
        const rect = el.getBoundingClientRect()
        const clone = el.cloneNode(true) as HTMLElement
        clone.style.position = 'absolute'
        clone.style.top = '-9999px'
        clone.style.left = '0'
        clone.style.width = `${rect.width}px`
        clone.style.opacity = '0.85'
        clone.style.transform = 'none'
        document.body.appendChild(clone)
        e.dataTransfer.setDragImage(clone, 0, 0)
        requestAnimationFrame(() => document.body.removeChild(clone))

        setIsDragging(true)
        onDragStart(e, card)
      }}
      onDragEnd={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick(card)}
      style={{
        transform: `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        transition: isHovered
          ? 'transform 0.1s ease-out'
          : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        borderColor: 'hsl(var(--border) / 0.45)',
        borderLeftColor: borderColor,
        borderLeftWidth: 3,
        boxShadow: isHovered
          ? `0 2px 10px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)`
          : '0 1px 2px rgba(0,0,0,0.04)',
        position: 'relative',
        overflow: 'hidden',
        opacity: isDragging ? 0 : 1,
      }}
      className={cn(
        'rounded-md border bg-card px-2.5 py-2 cursor-grab',
        'active:cursor-grabbing'
      )}
    >
      {/* 光泽扫过效果 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isHovered
            ? `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.15) 0%, transparent 60%)`
            : 'none',
          pointerEvents: 'none',
          zIndex: 0,
          borderRadius: 'inherit',
          transition: 'opacity 0.2s',
        }}
      />

      {/* 内容层（在光泽上方） */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* 第一行：标题层 — translateZ 大，浮在最前 */}
        <div style={{
          transform: 'translateZ(45px)',
          paddingBottom: (card.content || card.note) ? 6 : 0,
          marginBottom: (card.content || card.note) ? 4 : 0,
          borderBottom: (card.content || card.note) ? '1px solid hsl(var(--border) / 0.2)' : 'none',
        }}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0', priorityColorClass)}>
              {priorityLabel}
            </span>
            <span className="text-[12px] font-semibold leading-tight line-clamp-2">{card.title}</span>
          </div>
        </div>
        {/* 第二行：内容/备注层 — translateZ 小，沉在后面 */}
        <div style={{ transform: 'translateZ(8px)' }}>
          {card.content && (
            <p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2">
              {card.content}
            </p>
          )}
          {card.note && (
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-3 mt-1">
              {card.note}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
