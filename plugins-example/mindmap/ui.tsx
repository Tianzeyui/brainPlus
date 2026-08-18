// ============================================================
// MindMap Plugin — 轻量 UI 助手（client 半端内联，替代宿主 @/ 组件）
// 宿主 client 半端只提供 react/jsx-runtime/lucide-react，这里提供
// Button / cn 两个最小实现，供 UI 在插件 bundle 内使用。
// ============================================================

import React from 'react'

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive'
  size?: 'default' | 'sm' | 'icon'
}

export function Button({ variant = 'default', size = 'default', className, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
  const variants: Record<string, string> = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  }
  const sizes: Record<string, string> = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 rounded-md px-3 text-xs',
    icon: 'h-9 w-9',
  }
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />
}
