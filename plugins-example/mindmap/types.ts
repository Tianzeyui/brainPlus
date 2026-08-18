// ============================================================
// Mind Map Plugin — 类型定义
// ============================================================

/** 思维导图 */
export interface MindMap {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

/** 节点 */
export interface MindMapNode {
  id: string
  map_id: string
  parent_id: string | null
  text: string
  color: string
  sort_order: number
  created_at: string
  updated_at: string
}

/** 布局后的节点（含计算坐标） */
export interface LayoutNode {
  node: MindMapNode
  x: number
  y: number
  width: number       // 子树垂直跨度
  nodeW: number       // 节点自身宽度
  nodeH: number       // 节点自身高度
  lines: string[]     // 文字分行
  children: LayoutNode[]
}

/** 颜色选项 */
export const DEFAULT_COLOR = '#6b7280'

export const NODE_COLORS = [
  '#6b7280', // gray
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]
