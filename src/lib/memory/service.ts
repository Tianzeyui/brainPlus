/**
 * MemoryService — Claude Code 风格记忆服务
 * 双层存储：项目级 (.stardust/memory/) + 全局用户级 (~/.stardust/memory/)
 */
import type { MemoryEntry, MemoryIndex, MemoryStore } from './types'
import { createMemoryStore, createGlobalMemoryStore } from './store'

let _store: MemoryStore | null = null
let _globalStore: MemoryStore | null = null
let _projectPath: string | null = null

/** 初始化/切换项目的记忆存储 */
export function initMemoryStore(getProjectPath: () => string | null): MemoryStore {
  _store = createMemoryStore(getProjectPath)
  _globalStore = createGlobalMemoryStore()
  return _store
}

function store(): MemoryStore {
  if (!_store) throw new Error('MemoryStore 未初始化，请先调用 initMemoryStore')
  return _store
}

function globalStore(): MemoryStore {
  if (!_globalStore) throw new Error('GlobalMemoryStore 未初始化')
  return _globalStore
}

export function getCurrentProjectPath(): string | null {
  return _projectPath
}

export function setCurrentProjectPath(path: string | null) {
  _projectPath = path
}

// ====== CRUD（供 auto-extract 和 MemoryPanel UI 使用） ======

export async function listMemories(): Promise<MemoryIndex[]> {
  const local = await store().list()
  const global = await globalStore().list()
  return [...local, ...global]
}

export async function readMemory(name: string): Promise<MemoryEntry | null> {
  return (await store().read(name)) || (await globalStore().read(name))
}

export async function writeMemory(
  name: string,
  description: string,
  body: string,
  type: MemoryEntry['metadata']['type'] = 'user',
  expiresAt?: number,
): Promise<void> {
  const target = type === 'user' ? globalStore() : store()
  await target.write({ name, description, metadata: { type }, body, expiresAt })
}

export async function deleteMemory(name: string): Promise<void> {
  await store().delete(name).catch(() => {})
  await globalStore().delete(name).catch(() => {})
}

/** 注入系统提示的记忆文本（STARDUST.md 或 MEMORY.md 内容，对齐 Claude Code） */
export async function getInjectionText(): Promise<string | null> {
  return store().getInjectionText()
}

/** 检查指定 slug 是否已存在 */
export async function memoryExists(name: string): Promise<boolean> {
  return (await store().read(name)) !== null || (await globalStore().read(name)) !== null
}
