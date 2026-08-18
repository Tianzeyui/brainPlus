// ============================================================
// Draw.io Plugin — 类型定义
// ============================================================

export interface DrawioDiagram {
  id: string
  user_id: string
  name: string
  xml: string
  created_at: string
  updated_at: string
}

/** AI 工具返回：创建/替换整个图表 */
export interface DisplayDiagramInput {
  name: string
  xml: string
}

/** AI 工具返回：编辑图表中特定元素 */
export interface EditDiagramInput {
  diagram_id: string
  operations: EditOperation[]
}

export type EditOperation =
  | { action: 'update'; cell_id: string; new_xml: string }
  | { action: 'add'; xml: string; after_cell_id?: string }
  | { action: 'delete'; cell_id: string }
