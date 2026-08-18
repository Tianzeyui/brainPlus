// ============================================================
// Board Plugin — Supabase 数据操作层
// ============================================================

import type { BoardPool, BoardLane, BoardStage, BoardCard, BoardData } from './types'

// Supabase client 由宿主注入
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
// Board Pool — 看板
// ============================================================

export async function listBoards(): Promise<BoardPool[]> {
  const { data, error } = await db()
    .from('board_pools')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function createBoard(name: string, description: string): Promise<BoardPool> {
  const { data, error } = await db()
    .from('board_pools')
    .insert({
      user_id: currentUserId,
      name,
      description,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBoard(id: string, updates: Partial<BoardPool>): Promise<BoardPool> {
  const { data, error } = await db()
    .from('board_pools')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteBoard(id: string): Promise<void> {
  const { error } = await db().from('board_pools').delete().eq('id', id)
  if (error) throw error
}

// ============================================================
// Lanes — 泳道
// ============================================================

export async function listLanes(poolId: string): Promise<BoardLane[]> {
  const { data, error } = await db()
    .from('board_lanes')
    .select('*')
    .eq('pool_id', poolId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createLane(poolId: string, name: string, sortOrder: number): Promise<BoardLane> {
  const { data, error } = await db()
    .from('board_lanes')
    .insert({ pool_id: poolId, name, sort_order: sortOrder })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLane(id: string, updates: Partial<BoardLane>): Promise<BoardLane> {
  const { data, error } = await db()
    .from('board_lanes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteLane(id: string): Promise<void> {
  const { error } = await db().from('board_lanes').delete().eq('id', id)
  if (error) throw error
}

export async function reorderLanes(items: { id: string; sort_order: number }[]): Promise<void> {
  for (const item of items) {
    const { error } = await db()
      .from('board_lanes')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
    if (error) throw error
  }
}

// ============================================================
// Stages — 阶段
// ============================================================

export async function listStages(poolId: string): Promise<BoardStage[]> {
  const { data, error } = await db()
    .from('board_stages')
    .select('*')
    .eq('pool_id', poolId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createStage(poolId: string, name: string, sortOrder: number): Promise<BoardStage> {
  const { data, error } = await db()
    .from('board_stages')
    .insert({ pool_id: poolId, name, sort_order: sortOrder })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateStage(id: string, updates: Partial<BoardStage>): Promise<BoardStage> {
  const { data, error } = await db()
    .from('board_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteStage(id: string): Promise<void> {
  const { error } = await db().from('board_stages').delete().eq('id', id)
  if (error) throw error
}

export async function reorderStages(items: { id: string; sort_order: number }[]): Promise<void> {
  for (const item of items) {
    const { error } = await db()
      .from('board_stages')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
    if (error) throw error
  }
}

// ============================================================
// Cards — 卡片
// ============================================================

export async function listCards(poolId: string): Promise<BoardCard[]> {
  const { data, error } = await db()
    .from('board_cards')
    .select('*')
    .eq('pool_id', poolId)
    .order('order_in_cell', { ascending: true })

  if (error) throw error
  return data || []
}

export async function createCard(card: Partial<BoardCard> & { pool_id: string; title: string }): Promise<BoardCard> {
  const { data, error } = await db()
    .from('board_cards')
    .insert({
      pool_id: card.pool_id,
      lane_id: card.lane_id || null,
      stage_id: card.stage_id || null,
      title: card.title,
      content: card.content || '',
      note: card.note || '',
      priority: card.priority || 'P2',
      order_in_cell: card.order_in_cell || 0,
      created_by: card.created_by || '',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateCard(id: string, updates: Partial<BoardCard>): Promise<BoardCard> {
  const { data, error } = await db()
    .from('board_cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await db().from('board_cards').delete().eq('id', id)
  if (error) throw error
}

export async function moveCard(
  id: string,
  laneId: string | null,
  stageId: string | null,
  orderInCell: number
): Promise<void> {
  const { error } = await db()
    .from('board_cards')
    .update({
      lane_id: laneId,
      stage_id: stageId,
      order_in_cell: orderInCell,
    })
    .eq('id', id)

  if (error) throw error
}

// ============================================================
// 加载完整看板数据
// ============================================================

export async function loadBoardData(poolId: string): Promise<BoardData> {
  const [poolRes, lanes, stages, cards] = await Promise.all([
    db().from('board_pools').select('*').eq('id', poolId).single(),
    listLanes(poolId),
    listStages(poolId),
    listCards(poolId),
  ])

  if (poolRes.error) throw poolRes.error

  return {
    pool: poolRes.data,
    lanes,
    stages,
    cards,
  }
}
