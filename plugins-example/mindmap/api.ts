// ============================================================
// Mind Map Plugin — Supabase 数据操作层
// ============================================================

import type { MindMap, MindMapNode } from './types'

let supabase: any = null
let currentUserId: string | null = null

export function initApi(client: any, userId: string) {
  supabase = client
  currentUserId = userId
}

function db() {
  if (!supabase) throw new Error('Supabase client not initialized')
  return supabase
}

// ============================================================
// Mind Maps
// ============================================================

export async function listMaps(): Promise<MindMap[]> {
  const { data, error } = await db()
    .from('mindmaps')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createMap(name: string): Promise<MindMap> {
  const { data, error } = await db()
    .from('mindmaps')
    .insert({ user_id: currentUserId, name })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMap(id: string, updates: Partial<MindMap>): Promise<MindMap> {
  const { data, error } = await db()
    .from('mindmaps')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMap(id: string): Promise<void> {
  const { error } = await db().from('mindmaps').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// Nodes
// ============================================================

export async function listNodes(mapId: string): Promise<MindMapNode[]> {
  const { data, error } = await db()
    .from('mindmap_nodes')
    .select('*')
    .eq('map_id', mapId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createNode(
  mapId: string,
  parentId: string | null,
  text: string,
  color: string,
  sortOrder: number
): Promise<MindMapNode> {
  const { data, error } = await db()
    .from('mindmap_nodes')
    .insert({ map_id: mapId, parent_id: parentId, text, color, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateNode(id: string, updates: Partial<MindMapNode>): Promise<MindMapNode> {
  const { data, error } = await db()
    .from('mindmap_nodes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteNode(id: string): Promise<void> {
  const { error } = await db().from('mindmap_nodes').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// 批量操作（用于 local-first 全量同步）
// ============================================================

/** 删除指定 map 下的所有节点 */
export async function deleteAllNodes(mapId: string): Promise<void> {
  const { error } = await db().from('mindmap_nodes').delete().eq('map_id', mapId)
  if (error) throw error
}

/** 批量插入节点（每批 100 个），接受客户端生成的 UUID */
export async function batchCreateNodes(nodes: MindMapNode[]): Promise<void> {
  const BATCH_SIZE = 100
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE)
    const rows = batch.map(n => ({
      id: n.id,
      map_id: n.map_id,
      parent_id: n.parent_id,
      text: n.text,
      color: n.color,
      sort_order: n.sort_order,
      created_at: n.created_at,
      updated_at: n.updated_at,
    }))
    const { error } = await db().from('mindmap_nodes').insert(rows)
    if (error) throw error
  }
}
