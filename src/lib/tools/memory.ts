/**
 * 记忆工具：memory_write / memory_read / memory_list / memory_delete
 * Claude Code 风格 — 模型通过工具直接管理文件系统记忆
 */
import { jsonSchema } from '../api'
import {
  writeMemory, readMemory, listMemories, deleteMemory,
  memoryExists, listMemorySlugs,
} from '../memory/service'
import { scoreByKeywords } from '../toolDisclosure'
import type { ToolMap } from './registry'

export function registerMemoryTools(tools: ToolMap) {
  tools['memory_write'] = {
    description:
      'Write a persistent memory to the project. Use when the user explicitly asks to remember something, ' +
      'or when you detect important facts about the user (role, preferences, project goals) worth persisting. ' +
      'Each memory is one markdown file. Use [[slug]] to link to related memories. ' +
      'If updating an existing memory, the file will be overwritten.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short kebab-case slug, e.g. "user-is-frontend-engineer"' },
        description: { type: 'string', description: 'One-line summary used in the memory index' },
        type: { type: 'string', enum: ['user', 'project', 'reference', 'feedback'], description: 'Memory type. user=about the user, project=project context, reference=external pointers, feedback=user guidance' },
        body: { type: 'string', description: 'The memory content. First line should be a brief title. Include **Why:** and **How to apply:** lines. Link related memories with [[their-slug]].' },
        expiresAt: { type: 'number', description: 'Optional Unix timestamp (seconds) when this memory expires. Use for temporary facts.' },
      },
      required: ['name', 'description', 'body'],
    }),
    execute: async ({ name, description, type, body, expiresAt }: {
      name: string; description: string; type?: string; body: string; expiresAt?: number
    }) => {
      const exists = await memoryExists(name)
      await writeMemory(name, description, body, (type as any) || 'user', expiresAt)
      const action = exists ? '更新' : '写入'
      return ` 记忆 "${name}" 已${action}。\n描述: ${description}`
    },
  }

  tools['memory_read'] = {
    description: 'Read a memory by its slug name. Use to recall previously stored facts about the user or project.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Memory slug, e.g. "user-is-frontend-engineer"' },
      },
      required: ['name'],
    }),
    execute: async ({ name }: { name: string }) => {
      const entry = await readMemory(name)
      if (!entry) {
        const slugs = await listMemorySlugs()
        return `未找到记忆 "${name}"。${slugs.length > 0 ? `可用记忆: ${slugs.join(', ')}` : '当前项目无记忆文件。'}`
      }
      return [
        `---`,
        `name: ${entry.name}`,
        `description: ${entry.description}`,
        `type: ${entry.metadata.type}`,
        `links: ${entry.links.join(', ') || '(none)'}`,
        `---`,
        '',
        entry.body,
      ].join('\n')
    },
  }

  tools['memory_list'] = {
    description: 'List all memory slugs in the current project. Use to see what memories are available before reading.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {},
    }),
    execute: async () => {
      const entries = await listMemories()
      if (entries.length === 0) return '（无记忆）'
      return entries.map(e => `- ${e.title} (\`${e.name}\`): ${e.hook}`).join('\n')
    },
  }

  tools['memory_search'] = {
    description: 'Search memories by keyword. Returns matching memories ranked by relevance score. Use to find memories related to a topic without listing all of them.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or phrase' },
      },
      required: ['query'],
    }),
    execute: async ({ query }: { query: string }) => {
      const entries = await listMemories()
      if (entries.length === 0) return '（无记忆）'

      // 过滤过期记忆
      const now = Date.now() / 1000
      const validEntries = []
      for (const e of entries) {
        const full = await readMemory(e.name)
        if (full?.expiresAt && full.expiresAt < now) continue
        validEntries.push(e)
      }
      if (validEntries.length === 0) return '（无有效记忆）'

      // 关键词匹配
      const scored = validEntries
        .map(e => ({ entry: e, score: scoreByKeywords(query, e.name, e.hook) }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
      if (scored.length === 0) return `未找到与 "${query}" 相关的记忆`
      return scored.map(s => `- [kw:${s.score}] ${s.entry.title} (\`${s.entry.name}\`): ${s.entry.hook}`).join('\n')
    },
  }

  tools['memory_delete'] = {
    description: 'Delete a memory by its slug name. Use when the user asks to forget something or when a memory is no longer accurate.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Memory slug to delete' },
      },
      required: ['name'],
    }),
    execute: async ({ name }: { name: string }) => {
      const slugs = await listMemorySlugs()
      if (!slugs.includes(name)) {
        return `未找到记忆 "${name}"。可用记忆: ${slugs.join(', ') || '(无)'}`
      }
      await deleteMemory(name)
      return ` 记忆 "${name}" 已删除。`
    },
  }
}
