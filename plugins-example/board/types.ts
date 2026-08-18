// ============================================================
// Board Plugin — 类型定义
// ============================================================

/** 看板 */
export interface BoardPool {
  id: string
  user_id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

/** 泳道（纵向分组） */
export interface BoardLane {
  id: string
  pool_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

/** 阶段（横向分组） */
export interface BoardStage {
  id: string
  pool_id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

/** 卡片 */
export interface BoardCard {
  id: string
  pool_id: string
  lane_id: string | null
  stage_id: string | null
  title: string
  content: string
  note: string
  priority: string
  order_in_cell: number
  created_by: string
  created_at: string
  updated_at: string
}

/** 完整的看板数据 */
export interface BoardData {
  pool: BoardPool
  lanes: BoardLane[]
  stages: BoardStage[]
  cards: BoardCard[]
}

/** 看板列表视图 vs 详情视图 */
export type BoardView = 'list' | 'board'

/** 优先级 */
export const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const
export type Priority = (typeof PRIORITY_OPTIONS)[number]

export const PRIORITY_LABELS: Record<string, string> = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
}

export const PRIORITY_COLORS: Record<string, string> = {
  P0: 'bg-red-100 text-red-700 border-red-300',
  P1: 'bg-orange-100 text-orange-700 border-orange-300',
  P2: 'bg-blue-100 text-blue-700 border-blue-300',
  P3: 'bg-gray-100 text-gray-600 border-gray-300',
}
