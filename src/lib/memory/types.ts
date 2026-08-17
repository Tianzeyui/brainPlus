/**
 * 记忆系统类型 — Claude Code 风格
 * 文件系统存储，一个记忆一个 markdown 文件，MEMORY.md 做索引
 */

/** frontmatter 元数据 */
export interface MemoryMeta {
  type: 'user' | 'project' | 'reference' | 'feedback'
}

/** 一条记忆（对应一个 .md 文件） */
export interface MemoryEntry {
  /** 文件名 slug（不含 .md），如 "user-is-frontend-engineer" */
  name: string
  /** 一行摘要，用于 MEMORY.md 索引 */
  description: string
  /** 元数据 */
  metadata: MemoryMeta
  /** 正文内容（不含 frontmatter） */
  body: string
  /** 引用的其他记忆 slug 列表（从 [[wikilinks]] 解析） */
  links: string[]
  /** 文件修改时间 */
  updatedAt: number
  /** 过期时间戳（可选），超过此时间自动跳过不注入 */
  expiresAt?: number
}

/** MEMORY.md 中的一行索引 */
export interface MemoryIndex {
  /** slug */
  name: string
  /** 显示标题（从 description 或 body 首行提取） */
  title: string
  /** 一行摘要 */
  hook: string
}

/** 记忆存储接口 */
export interface MemoryStore {
  /** 列出所有记忆（从 MEMORY.md） */
  list(): Promise<MemoryIndex[]>
  /** 读取一条记忆的完整内容 */
  read(name: string): Promise<MemoryEntry | null>
  /** 写入一条记忆（自动更新 MEMORY.md） */
  write(entry: Omit<MemoryEntry, 'links' | 'updatedAt'>): Promise<void>
  /** 删除一条记忆（自动更新 MEMORY.md） */
  delete(name: string): Promise<void>
  /** 获取注入系统提示的文本（MEMORY.md 内容） */
  getInjectionText(): Promise<string | null>
}
