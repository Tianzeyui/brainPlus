/**
 * 记忆文件存储 — Claude Code 风格
 * 目录结构:
 *   <projectPath>/.stardust/memory/
 *   ├── MEMORY.md          ← 索引文件
 *   ├── user-is-engineer.md ← 一条记忆一个文件
 *   └── ...
 *
 * 文件格式:
 *   ---
 *   name: <slug>
 *   description: <one-line>
 *   metadata:
 *     type: user | project | reference
 *   ---
 *   <body with [[wikilinks]]>
 */
import type { MemoryEntry, MemoryIndex, MemoryStore } from './types'

const MEMORY_DIR = '.stardust/memory'
const INDEX_FILE = 'MEMORY.md'

function fs() {
  const api = window.electronAPI?.fs
  if (!api) throw new Error('Electron FS API 不可用')
  return api
}

/** 解析 markdown frontmatter */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/)
  if (!match) return null
  const yaml = match[1]
  const body = content.slice(match[0].length)

  const meta: Record<string, any> = {}
  let currentKey = ''
  for (const line of yaml.split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)/)
    if (kv) {
      currentKey = kv[1]
      meta[currentKey] = kv[2].trim().replace(/^['"]|['"]$/g, '')
    } else if (currentKey === 'metadata') {
      // 简单处理缩进子字段
      const sub = line.match(/^\s+(\w+):\s*(.+)/)
      if (sub) {
        if (typeof meta.metadata !== 'object') meta.metadata = {}
        meta.metadata[sub[1]] = sub[2].trim().replace(/^['"]|['"]$/g, '')
      }
    }
  }
  return { meta, body }
}

/** 构建 frontmatter 字符串 */
function buildFrontmatter(entry: Omit<MemoryEntry, 'links' | 'updatedAt'>): string {
  const lines: string[] = [
    '---',
    `name: ${entry.name}`,
    `description: ${entry.description}`,
    'metadata:',
    `  type: ${entry.metadata.type}`,
  ]
  if ((entry as any).expiresAt) lines.push(`expires_at: ${(entry as any).expiresAt}`)
  lines.push('---', '', entry.body)
  return lines.join('\n') + '\n'
}

/** 从 body 解析 [[wikilinks]] */
function parseLinks(body: string): string[] {
  const links: string[] = []
  const re = /\[\[([^\]]+)\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    links.push(m[1])
  }
  return [...new Set(links)]
}

/** 读取 MEMORY.md 并解析为索引 */
async function readIndex(dirPath: string): Promise<MemoryIndex[]> {
  const indexPath = `${dirPath}/${INDEX_FILE}`
  try {
    const exists = await fs().exists(indexPath)
    if (!exists) return []
    const result = await fs().readFile(indexPath)
    if (!result.success || !result.content) return []

    const entries: MemoryIndex[] = []
    // 格式: - [Title](file.md) — hook
    const lines = result.content.split('\n')
    for (const line of lines) {
      const match = line.match(/^-\s+\[(.+?)\]\((.+?)\)\s*[—–-]\s*(.+)/)
      if (match) {
        entries.push({
          name: match[2].replace(/\.md$/, ''),
          title: match[1],
          hook: match[3],
        })
      }
    }
    return entries
  } catch {
    return []
  }
}

/** 写 MEMORY.md 索引 */
async function writeIndex(dirPath: string, entries: MemoryIndex[]): Promise<void> {
  const indexPath = `${dirPath}/${INDEX_FILE}`
  await fs().mkdir(dirPath).catch(() => {})
  const content = entries
    .map(e => `- [${e.title}](${e.name}.md) — ${e.hook}`)
    .join('\n') + '\n'
  await fs().writeFile(indexPath, content)
}

/** 同步 STARDUST.md 到项目根目录 */
async function syncToRoot(getProjectPath: () => string | null, entries: MemoryIndex[]): Promise<void> {
  const pp = getProjectPath()
  if (!pp) return
  const rootPath = `${pp}/STARDUST.md`
  const content = entries
    .map(e => `- [${e.title}](${MEMORY_DIR}/${e.name}.md) — ${e.hook}`)
    .join('\n') + '\n'
  await fs().writeFile(rootPath, content).catch(() => {})
}

/** 创建记忆存储，可指定自定义基础目录 */
function createStore(baseDir: () => string, getProjectRoot?: () => string | null): MemoryStore {
  function memoryDir(): string { return baseDir() }

  return {
    async list(): Promise<MemoryIndex[]> {
      try {
        return await readIndex(memoryDir())
      } catch {
        return []
      }
    },

    async read(name: string): Promise<MemoryEntry | null> {
      try {
        const dir = memoryDir()
        const filePath = `${dir}/${name}.md`
        const exists = await fs().exists(filePath)
        if (!exists) return null
        const result = await fs().readFile(filePath)
        if (!result.success || !result.content) return null

        const parsed = parseFrontmatter(result.content)
        if (!parsed) return null

        const links = parseLinks(parsed.body)
        const stat = await fs().stat(filePath)
        return {
          name: parsed.meta.name || name,
          description: parsed.meta.description || '',
          metadata: {
            type: parsed.meta.metadata?.type || 'user',
          },
          body: parsed.body.trim(),
          links,
          updatedAt: stat.success && stat.stat ? new Date(stat.stat.mtime).getTime() : Date.now(),
          expiresAt: parsed.meta.expires_at ? Number(parsed.meta.expires_at) : undefined,
        }
      } catch {
        return null
      }
    },

    async write(entry: Omit<MemoryEntry, 'links' | 'updatedAt'>): Promise<void> {
      const dir = memoryDir()
      await fs().mkdir(dir).catch(() => {})

      // 写入记忆文件
      const content = buildFrontmatter(entry)
      const filePath = `${dir}/${entry.name}.md`
      await fs().writeFile(filePath, content)

      // 更新 MEMORY.md 索引
      const entries = await readIndex(dir)
      const idx = entries.findIndex(e => e.name === entry.name)
      const title = entry.body.split('\n')[0]?.replace(/^#+\s*/, '') || entry.description
      if (idx !== -1) {
        entries[idx] = { name: entry.name, title, hook: entry.description }
      } else {
        entries.push({ name: entry.name, title, hook: entry.description })
      }
      await writeIndex(dir, entries)
      if (getProjectRoot) await syncToRoot(getProjectRoot, entries)
    },

    async delete(name: string): Promise<void> {
      const dir = memoryDir()

      // 删除记忆文件
      const filePath = `${dir}/${name}.md`
      const exists = await fs().exists(filePath)
      if (exists) {
        await fs().unlink(filePath)
      }

      // 更新 MEMORY.md 索引
      const entries = (await readIndex(dir)).filter(e => e.name !== name)
      await writeIndex(dir, entries)
      if (getProjectRoot) await syncToRoot(getProjectRoot, entries)
    },

    async getInjectionText(): Promise<string | null> {
      try {
        // 优先读项目根目录的 STARDUST.md，fallback 到 .stardust/memory/MEMORY.md
        const pp = getProjectRoot?.()
        if (pp) {
          for (const name of ['STARDUST.md', 'MEMORY.md']) {
            const rootPath = `${pp}/${name}`
            const rootExists = await fs().exists(rootPath)
            if (rootExists) {
              const result = await fs().readFile(rootPath)
              if (result.success && result.content?.trim()) return result.content.trim()
            }
          }
        }
        const dir = memoryDir()
        const indexPath = `${dir}/${INDEX_FILE}`
        const exists = await fs().exists(indexPath)
        if (!exists) return null
        const result = await fs().readFile(indexPath)
        if (!result.success || !result.content) return null
        const trimmed = result.content.trim()
        return trimmed || null
      } catch {
        return null
      }
    },

  }
}

/** 项目级记忆存储（.stardust/memory/） */
export function createMemoryStore(getProjectPath: () => string | null): MemoryStore {
  return createStore(
    () => {
      const pp = getProjectPath()
      if (!pp) throw new Error('未选择项目')
      return `${pp}/${MEMORY_DIR}`
    },
    getProjectPath,
  )
}

/** 全局用户记忆存储（~/.stardust/memory/），跨项目共享 */
export function createGlobalMemoryStore(): MemoryStore {
  // Electron 环境，用户主目录
  const home = typeof window !== 'undefined'
    ? (window as any).electronAPI?.app?.getPath?.('home') || ''
    : ''
  return createStore(() => `${home}/.stardust/memory`)
}
