/**
 * 自定义右键菜单组件
 * 用于侧边栏菜单项的"在新窗口打开"等操作
 */
import { useEffect, useRef, useCallback, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

export interface ContextMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  onClick: () => void
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    const handleScroll = () => handleClose()

    // 延迟绑定，避免触发右键的 click 事件立即关闭菜单
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
    }, 0)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleClick)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [handleClose])

  // 调整菜单位置，防止溢出视口
  const adjustedPos = (() => {
    const menuW = 180
    const menuH = items.length * 36 + 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    return {
      left: Math.min(x, vw - menuW - 8),
      top: Math.min(y, vh - menuH - 8),
    }
  })()

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{ left: adjustedPos.left, top: adjustedPos.top }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            item.onClick()
            handleClose()
          }}
        >
          {item.icon && <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">{item.icon}</span>}
          <span className="flex-1 text-left">{item.label}</span>
          {item.shortcut && (
            <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-2">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  )
}
