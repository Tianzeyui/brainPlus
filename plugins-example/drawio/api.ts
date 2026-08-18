// ============================================================
// Draw.io Plugin — Supabase 数据操作层
// ============================================================

import type { DrawioDiagram } from './types'

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
// CRUD
// ============================================================

export async function listDiagrams(): Promise<DrawioDiagram[]> {
  const { data, error } = await db()
    .from('drawios')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getDiagram(id: string): Promise<DrawioDiagram> {
  const { data, error } = await db()
    .from('drawios')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createDiagram(name: string, xml: string = ''): Promise<DrawioDiagram> {
  const { data, error } = await db()
    .from('drawios')
    .insert({ user_id: currentUserId, name, xml })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDiagram(id: string, updates: Partial<Pick<DrawioDiagram, 'name' | 'xml'>>): Promise<DrawioDiagram> {
  const { data, error } = await db()
    .from('drawios')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDiagram(id: string): Promise<void> {
  const { error } = await db().from('drawios').delete().eq('id', id)
  if (error) throw error
}
