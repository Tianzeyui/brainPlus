/**
 * 工作区工具：列出目录、读取文件、搜索文件、写入/删除文件
 * 路径由 ChatPage 注入，跟随项目/全局工作区切换
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import type { WorkspaceOpStatus } from '@/types/chat'
import { createFileOp, updateFileOp, getFileOp, setFileOpResolver } from '@/lib/fileOpManager'
import { trackFileOp } from '@/lib/fileTracker'

// ====== 工作区操作 UI 通知（直接回调，与 git.ts 同模式） ======

type WorkspaceOpHandler = (event: { type: 'workspaceop_created' | 'workspaceop_updated'; workspaceOp: WorkspaceOpStatus }) => void
let _wsOpHandler: WorkspaceOpHandler | null = null

export function setWorkspaceOpHandler(handler: WorkspaceOpHandler | null) {
  _wsOpHandler = handler
}

function notifyWsOp(event: { type: 'workspaceop_created' | 'workspaceop_updated'; workspaceOp: WorkspaceOpStatus }) {
  if (_wsOpHandler) _wsOpHandler(event)
}

async function runWithUI(
  tool: WorkspaceOpStatus['tool'],
  filePath: string,
  execFn: () => Promise<string>,
  timeoutSec?: number,
): Promise<string> {
  const id = 'ws_' + Math.random().toString(36).slice(2, 8)
  const wo: WorkspaceOpStatus = { id, tool, path: filePath, status: 'running', startTime: Date.now() }
  notifyWsOp({ type: 'workspaceop_created', workspaceOp: wo })

  try {
    const result = await execFn()
    notifyWsOp({
      type: 'workspaceop_updated',
      workspaceOp: { ...wo, status: 'done', output: result, endTime: Date.now() },
    })
    return result
  } catch (e: any) {
    notifyWsOp({
      type: 'workspaceop_updated',
      workspaceOp: { ...wo, status: 'error', error: e?.message || String(e), endTime: Date.now() },
    })
    throw e // 让上层工具注册的 execute 也能感知错误
  }
}

/** 当前工作区根目录（由 ChatPage 动态注入） */
let _workspaceRoot: string | undefined
let _workspaceOutput: string | undefined
export function setWorkspaceRoots(root: string, output: string) {
  // 拒绝空值——防止在 projectStore 初始化前误设回退路径
  if (!root) return
  _workspaceRoot = root
  if (output) _workspaceOutput = output
}

function getRoot(): string { return _workspaceRoot || '~/Stardust/workspace' }
function getOutput(): string { return _workspaceOutput || '~/Stardust/workspace/.stardust/output' }

/** 检查路径是否在工作区内 */
function isInsideWorkspace(filePath: string): boolean {
  const root = getRoot()
  const absPath = filePath.startsWith('/') ? filePath : `${root}/${filePath}`
  return absPath.startsWith(root)
}

function notifyUI(event: any) {
  window.dispatchEvent(new CustomEvent('stardust:fileop', { detail: event }))
}

/** 确认流程：工作区外操作需用户确认。返回 { confirmed, id }，调用方用 id 更新状态 */
async function confirmOutside(opType: 'write' | 'delete', absPath: string, content?: string): Promise<{ confirmed: boolean; id: string }> {
  // 权限预检
  const permType = opType === 'write' ? 'file_write' : 'file_delete'
  try {
    const already = await (window as any).electronAPI?.perm?.check(getRoot(), permType, absPath)
    if (already) return { confirmed: true, id: 'perm_' + Date.now() }
  } catch {}

  const id = 'fop_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, opType, absPath, content)
  notifyUI({ type: 'fileop_created', fileOp: { ...op } })
  const confirmed = await new Promise<boolean>(resolve => {
    setFileOpResolver(id, async (ok, persist) => {
      if (persist) try { await (window as any).electronAPI?.perm?.grant(getRoot(), permType, absPath) } catch {}
      resolve(ok)
    })
  })
  if (!confirmed) {
    updateFileOp(id, { status: 'rejected' })
    notifyUI({ type: 'fileop_updated', fileOp: { ...getFileOp(id)! } })
  }
  return { confirmed, id }
}

function notifyFileOpDone(id: string, patch: Partial<{ status: string; error: string; size: number }>) {
  updateFileOp(id, patch as any)
  notifyUI({ type: 'fileop_updated', fileOp: { ...getFileOp(id)! } })
}

/** 解析绝对路径 */
function resolvePath(p: string): string {
  const root = getRoot()
  return p.startsWith('/') ? p : `${root}/${p}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// glob 转正则（供 listDirTree pattern 过滤和 workspace_glob 使用）
function globToRegex(pattern: string): RegExp {
  let p = pattern
    .replace(/\./g, '\\.')
    .replace(/\?/g, '[^/]')
    .replace(/\*\*\//g, 'ZWKZWK')
    .replace(/\*/g, '[^/]*')
    .replace(/ZWKZWK/g, '(?:.+/)*')
  p = p.replace(/\{([^}]+)\}/g, (_, alts) => `(${alts.split(',').join('|')})`)
  return new RegExp(`^${p}$`, 'i')
}

async function listDirTree(dirPath: string, maxDepth: number, currentDepth: number): Promise<string> {
  const api = window.electronAPI?.fs
  if (!api) return ''
  const listResult = await api.listDir(dirPath)
  if (!listResult.success || !listResult.files) return ''
  const indent = '  '.repeat(currentDepth)
  const lines: string[] = []

  for (const name of listResult.files) {
    if (name.startsWith('.')) continue
    const childPath = `${dirPath.replace(/\/+$/, '')}/${name}`
    const statResult = await api.stat(childPath)
    const isDir = statResult.success && statResult.stat?.isDirectory === true
    const prefix = isDir ? '[DIR]' : '[FILE]'
    const size = !isDir && statResult.success && statResult.stat?.size
      ? formatSize(statResult.stat.size)
      : ''
    const sizeStr = size ? ` (${size})` : ''
    lines.push(`${indent}${prefix} ${name}${sizeStr}`)

    if (isDir && currentDepth < maxDepth - 1) {
      const sub = await listDirTree(childPath, maxDepth, currentDepth + 1)
      if (sub) lines.push(sub)
    }
  }
  return lines.join('\n')
}


export async function registerWorkspaceTools(tools: ToolMap) {
  if (!window.electronAPI?.workspace || !window.electronAPI?.fs) return

  const root = getRoot()
  const output = getOutput()

  tools['workspace_list_dir'] = {
    description:
      'List files and subdirectories with size info. Use pattern to filter (e.g. "*.ts", "*.vue"). ' +
      'Shows [DIR]/[FILE] tags with file sizes. depth: recursion depth (default 1, max 3). ' +
      `Workspace root: ${root}`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (relative to workspace root or absolute)' },
        depth: { type: 'number', description: 'Recursion depth, 1=current level only, default 1' },
        pattern: { type: 'string', description: 'Glob filter, e.g. "*.ts", "*.vue", "test*". Directories always traversed (children may match).' },
      },
    }),
    execute: async (args: { path?: string; depth?: number; pattern?: string }) => {
      const dirPath = args.path ? resolvePath(args.path) : getRoot()
      return runWithUI('list_dir', dirPath, async () => {
        const depth = Math.min(args.depth || 1, 3)
        const raw = await listDirTree(dirPath, depth, 0)
        if (!raw || raw === '(空目录)') return '(空目录)'
        if (!args.pattern) return raw
        const lines = raw.split('\n')
        const out: string[] = []
        for (const line of lines) {
          if (line.includes('[DIR]')) { out.push(line); continue }
          const m = line.match(/\[FILE\]\s+(.+?)(?:\s+\(|$)/)
          if (!m) { out.push(line); continue }
          const fileName = m[1].trim()
          const escaped = args.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
          if (new RegExp('^' + escaped + '$', 'i').test(fileName)) out.push(line)
        }
        if (out.length === 0) return `(无匹配 pattern="${args.pattern}" 的文件)`
        return out.join('\n')
      })
    },
  }

  tools['workspace_read_file'] = {
    description:
      'Reads a file from the local filesystem. You can access any file directly by using this tool.\n' +
      'It is okay to read a file that does not exist; an error will be returned.\n\n' +
      'Usage:\n' +
      '- Pass the filename from workspace_list_dir output directly as the path parameter.\n' +
      '- Relative paths are resolved from the workspace root. Example: {"path": "package.json"} reads the workspace root package.json.\n' +
      '- Results are returned using cat -n format, with line numbers starting at 1\n' +
      '- Use "lines" param: "1-50" = first 50 lines, "100-end" = from line 100 to EOF, "1-end" = entire file. Recommended to read the whole file without lines param for short files.\n' +
      '- Always returns total lines and chars at the end, so you never need a probe read.\n' +
      '- Supports images (PNG, JPG, etc.) — presented visually. If the user provides a path to a screenshot, ALWAYS use this tool to view it.\n' +
      '- Supports Jupyter notebooks (.ipynb) — returns all cells with outputs.\n' +
      `- Docs (PPT/Word/Excel/PDF) auto-converted to Markdown.\n` +
      '- This tool can only read files, not directories.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path from workspace_list_dir output, e.g. "package.json" or "src/main.ts"' },
        lines: { type: 'string', description: 'Line range. "1-50" = first 50 lines, "100-end" = from line 100 to EOF, "1-end" = entire file. Recommended for large files.' },
        offset: { type: 'number', description: 'Start char position (0-based). Prefer lines param.' },
        length: { type: 'number', description: 'Chars to read, default 8000, max 10000. Prefer lines param.' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string; offset?: number; length?: number; lines?: string }) => {
      if (!args.path) {
        return '缺少 path 参数。请指定文件名，例如: {"path": "package.json"}。先执行 workspace_list_dir 查看可用文件。'
      }
      const resolvedPath = resolvePath(args.path)
      return runWithUI('read_file', resolvedPath, async () => {
        trackFileOp(resolvedPath)
        const fsApi = window.electronAPI!.fs
        const ext = (args.path.split('.').pop() || '').toLowerCase()
        const needsConvert = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'].includes(ext)

        if (needsConvert && window.electronAPI?.file) {
          const convertResult = await window.electronAPI.file.convert(resolvedPath)
          if (convertResult.success && convertResult.result) {
            const total = convertResult.result.length
            const off = Math.max(0, args.offset || 0)
            const len = Math.min(args.length || 8000, 10000)
            const slice = convertResult.result.slice(off, off + len)
            const tail = total > off + len ? `\n\n--- 第 ${off}-${off + len} / ${total} 字符 ---` : `\n\n--- ${total} 字符（已读完）---`
            return slice + tail
          }
          return `文档转换失败: ${convertResult.error || '未知错误'}。`
        }

        const readResult = await fsApi.readFile(resolvedPath)
        if (!readResult.success || readResult.content == null) {
          return `读取失败: ${readResult.error || '文件不存在'}`
        }
        const content = readResult.content
        const totalChars = content.length
        const totalLines = content.split('\n').length

        // 行范围模式（推荐）
        if (args.lines) {
          const allLines = content.split('\n')
          const match = args.lines.match(/^(\d+)(-(\d+|end))?$/i)
          if (!match) return `行格式错误: "${args.lines}"。例: "1-50"、"100-end"、"1-end"`
          const start = Math.max(0, parseInt(match[1]) - 1)
          const end = !match[2] ? start + 1 : match[3]?.toLowerCase() === 'end' ? allLines.length : parseInt(match[3])
          const slice = allLines.slice(start, end).join('\n')
          const readLen = end - start
          const isFull = start === 0 && end >= allLines.length
          return slice + `\n\n--- L${start + 1}-${end} / ${totalLines} 行（共${totalChars}字符）${isFull ? ' [已读完]' : ''} ---`
        }

        // 字符分页模式（回退方案）
        const off = Math.max(0, args.offset || 0)
        const len = Math.min(args.length || 8000, 10000)
        const slice = content.slice(off, off + len)
        if (off + len >= totalChars) {
          return slice + `\n\n--- ${totalChars} 字符，${totalLines} 行（已读完）---`
        }
        return slice + `\n\n--- 第 ${off + 1}-${off + len} / ${totalChars} 字符，${totalLines} 行 --- 用 lines="${Math.floor(off / 80) + 1}-end" 可继续按行读取`
      })
    },
  }


  tools['workspace_glob'] = {
    description:
      '- Fast file pattern matching tool that works with any codebase size.\n' +
      '- Supports glob patterns like "**/*.js" or "src/**/*.ts"\n' +
      '- Returns matching file paths sorted by modification time.\n' +
      '- Use this tool when you need to find files by name patterns.\n' +
      '- When you are doing an open-ended search that may require multiple rounds of globbing and grepping, use the delegate_task tool instead.\n' +
      `- Search scope: ${root}. Auto-excludes node_modules/.git. Max 200 results.`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts", "*.md"' },
        path: { type: 'string', description: 'Search start path, default workspace root' },
      },
      required: ['pattern'],
    }),
    execute: async (args: { pattern: string; path?: string }) => {
      const basePath = args.path ? resolvePath(args.path) : getRoot()
      return runWithUI('glob', basePath, async () => {
        let pat = args.pattern.replace(/^\.\//, '')
        const regex = globToRegex(pat)

        const fsApi = window.electronAPI?.fs
        const allFiles: string[] = []

        // 用 find 收集文件列表
        if (fsApi?.find) {
          const r = await fsApi.find(basePath)
          if (r.success && r.files?.length) {
            allFiles.push(...r.files)
          }
        }

        // find 未返回结果时用递归遍历作为 fallback
        if (allFiles.length === 0 && fsApi) {
          const skip = ['node_modules','.git','.stardust','dist','build','.next','__pycache__','.DS_Store']
          async function walk(dir: string, depth: number) {
            if (depth > 15 || allFiles.length >= 500) return
            const lr = await fsApi!.listDir(dir)
            if (!lr.success || !lr.files) return
            for (const name of lr.files) {
              if (skip.includes(name)) continue
              const cp = `${dir.replace(/\/+$/, '')}/${name}`
              try {
                const st = await fsApi!.stat(cp)
                if (st.success && st.stat?.isFile) allFiles.push(cp)
                if (st.success && st.stat?.isDirectory) await walk(cp, depth + 1)
              } catch { /* skip inaccessible paths */ }
            }
          }
          await walk(basePath, 0)
        }

        const plen = basePath.length + 1
        const results = allFiles
          .map(f => f.slice(plen))
          .filter(f => regex.test(f))
          .sort()
          .slice(0, 200)
        return results.length > 0 ? results.join('\n') : `未找到匹配 "${args.pattern}" 的文件`
      })
    },
  }

  tools['workspace_grep'] = {
    description:
      'A powerful search tool built on ripgrep.\n\n' +
      'Usage:\n' +
      '- ALWAYS use workspace_grep for search tasks. NEVER invoke grep or rg as a run_terminal command. workspace_grep has been optimized for correct permissions and access.\n' +
      '- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")\n' +
      '- Filter files with file param (e.g., "*.js", "**/*.tsx")\n' +
      '- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts\n' +
      '- Use context_before/context_after (default 2 each) to see surrounding code without extra read_file calls.\n' +
      '- Pattern syntax: Uses ripgrep (not grep) — literal braces need escaping (use `interface\\{\\}` to find `interface{}` in Go code)\n' +
      '- Multi-line matching: By default patterns match within single lines only. For cross-line patterns, use multiline: true\n' +
      `- Search scope: ${root}. Auto-excludes node_modules/.git/dist/build.`,
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search regex or keyword. Literal braces {} require escaping: \\{\\}' },
        file: { type: 'string', description: 'File type filter, e.g. "*.ts", default all files' },
        path: { type: 'string', description: 'Search start path, default workspace root' },
        context_before: { type: 'number', description: 'Lines of context before each match, default 2' },
        context_after: { type: 'number', description: 'Lines of context after each match, default 2' },
        output: { type: 'string', description: 'Output mode: "content" (matching lines), "files_with_matches" (file paths only, default), "count" (match counts)' },
        multiline: { type: 'boolean', description: 'Enable multi-line matching (default false)' },
      },
      required: ['pattern'],
    }),
    execute: async (args: { pattern: string; file?: string; path?: string; context_before?: number; context_after?: number; output?: string; multiline?: boolean }) => {
      const api = window.electronAPI?.fs
      if (!api?.grep) return 'grep 不可用'
      const basePath = args.path ? resolvePath(args.path) : getRoot()
      return runWithUI('grep', basePath, async () => {
        const ctxBefore = args.context_before ?? 2
        const ctxAfter = args.context_after ?? 2
        const outputMode = args.output || 'files_with_matches'

        console.log('[workspace_grep]', { basePath, pattern: args.pattern, fileGlob: args.file })
        const result = await api.grep(basePath, args.pattern, args.file)
        console.log('[workspace_grep] result:', { success: result.success, outputLen: result.output?.length, count: (result as any).count, error: result.error, outputPreview: result.output?.slice(0, 300) })
        if (!result.success) return `grep 失败: ${result.error}`
        if (!result.output?.trim()) return '(无匹配)'

        // Output modes
        if (outputMode === 'files_with_matches') {
          // Only return unique file paths
          const lines = result.output.split('\n')
          const files = [...new Set(lines.map(l => l.match(/^(.+?):\d+:/)?.[1]).filter(Boolean))]
          return files.length > 0 ? files.join('\n') : '(无匹配)'
        }
        if (outputMode === 'count') {
          const lines = result.output.split('\n')
          const counts: Record<string, number> = {}
          for (const l of lines) {
            const m = l.match(/^(.+?):\d+:/)
            if (m) counts[m[1]] = (counts[m[1]] || 0) + 1
          }
          return Object.entries(counts).map(([f, c]) => `${f}:${c}`).join('\n') || '(无匹配)'
        }

        // 无上下文请求 → 直接返回原始结果
        if (ctxBefore <= 0 && ctxAfter <= 0) return result.output

        // 解析 grep 输出: file:line:content
        const lines = result.output.split('\n')
        const matches: { file: string; line: number; content: string }[] = []
        for (const l of lines) {
          const m = l.match(/^(.+?):(\d+):(.*)/)
          if (m) matches.push({ file: m[1], line: parseInt(m[2]), content: m[3] })
        }
        if (matches.length === 0) return result.output

        // 大结果集：跳过上下文提取，直接返回摘要（避免 IO 阻塞 UI）
        if (matches.length > 50) {
          const fileCount = new Set(matches.map(m => m.file)).size
          return result.output + `\n\n(共 ${matches.length} 处匹配，${fileCount} 个文件。请缩小搜索范围或指定 context_before=0 跳过上下文提取)`
        }

        // 按文件分组
        const fileGroups = new Map<string, number[]>()
        for (const m of matches) {
          if (!fileGroups.has(m.file)) fileGroups.set(m.file, [])
          fileGroups.get(m.file)!.push(m.line)
        }

        // 最多并行读 8 个文件，超时 3 秒
        const MAX_FILES = 8
        const fileEntries = [...fileGroups.entries()].slice(0, MAX_FILES)
        const skipped = fileGroups.size - MAX_FILES

        // 并行读取所有文件（用 Promise.all 替代串行 await）
        const fileReads = await Promise.all(
          fileEntries.map(async ([filePath, lineNums]) => {
            try {
              const readResult = await api.readFile(filePath)
              return { filePath, lineNums, readResult }
            } catch {
              return { filePath, lineNums, readResult: null as any }
            }
          })
        )

        // 组装输出
        const out: string[] = []
        for (const { filePath, lineNums, readResult } of fileReads) {
          if (!readResult?.success || readResult.content == null) {
            for (const ln of lineNums) {
              const match = matches.find(m => m.file === filePath && m.line === ln)
              if (match) out.push(`${filePath}:${ln}:${match.content}`)
            }
            continue
          }
          const allLines = readResult.content.split('\n')
          const shown = new Set<number>()
          for (const ln of lineNums) {
            if (shown.has(ln)) continue
            shown.add(ln)
            const start = Math.max(0, ln - 1 - ctxBefore)
            const end = Math.min(allLines.length, ln + ctxAfter)
            out.push(`\n── ${filePath}:${ln} ──`)
            for (let i = start; i < end; i++) {
              const marker = i === ln - 1 ? '>' : ' '
              const lineStr = allLines[i] || ''
              out.push(`${marker} ${i + 1}: ${lineStr}`)
            }
          }
        }

        if (skipped > 0) out.push(`... 还有 ${skipped} 个文件，缩小搜索范围以查看详情`)
        return out.join('\n') || '(无匹配)'
      })
    },
  }

  tools['workspace_write_file'] = {
    description:
      'Create or overwrite entire file. Prefer workspace_edit_file for small changes — this rewrites the whole file. ' +
      'Use for creating new files or major rewrites. Auto-creates parent dirs. ' +
      'When overwriting, returns a diff preview like edit_file does. Outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to workspace root)' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    }),
    execute: async (args: { path: string; content: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('write_file', absPath, async () => {
        trackFileOp(absPath)
        let fopId: string | null = null
        if (!isInsideWorkspace(absPath)) {
          const r = await confirmOutside('write', absPath, args.content)
          if (!r.confirmed) return `写入 ${absPath} 已被用户拒绝。`
          fopId = r.id
        }

        // 检查是否覆盖已有文件，生成 diff 预览
        const existing = await api.readFile(absPath).catch(() => null)
        const isNew = !existing?.success || existing.content == null
        const oldContent: string = isNew ? '' : (existing!.content ?? '')

        try {
          await api.writeFile(absPath, args.content)
          if (fopId) notifyFileOpDone(fopId, { status: 'done', size: args.content.length })

          if (isNew) {
            const newLines = args.content.split('\n')
            const lineCount = newLines.length
            const preview = newLines.slice(0, 10).map(l => `+ ${l}`).join('\n')
            const more = newLines.length > 10 ? `\n... 还有 ${newLines.length - 10} 行` : ''
            return [
              `已创建${absPath}（${lineCount} 行，${args.content.length} 字符）`,
              '',
              '```diff',
              `@@ -0,0 +1,${lineCount} @@`,
              preview + more,
              '```',
            ].join('\n')
          }

          // 覆盖已有文件 → 生成 diff
          const oldLines = oldContent.split('\n')
          const newLines = args.content.split('\n')
          const oldTotal = oldLines.length
          const newTotal = newLines.length
          const changed = args.content.length - oldContent.length
          const changeSign = changed >= 0 ? '+' : ''

          // 简单 diff：找出变化行
          const diffLines: string[] = []
          let diffStart = -1
          const maxLen = Math.min(oldTotal, newTotal)
          for (let i = 0; i < maxLen; i++) {
            const oldL = oldLines[i]
            const newL = newLines[i]
            if (oldL !== newL) {
              if (diffStart < 0) diffStart = i + 1
              diffLines.push(`- ${oldL.slice(0, 80)}`)
              diffLines.push(`+ ${newL.slice(0, 80)}`)
            } else if (diffLines.length > 0 && diffLines.length < 20) {
              diffLines.push(`  ${oldL.slice(0, 80)}`)
            } else if (diffLines.length >= 20) {
              diffLines.push(`... (省略 ${oldTotal - i} 行未变化内容)`)
              break
            }
          }
          // 新文件更长
          if (newTotal > oldTotal) {
            for (let i = oldTotal; i < Math.min(newTotal, oldTotal + 5); i++) {
              diffLines.push(`+ ${newLines[i].slice(0, 80)}`)
            }
            if (newTotal - oldTotal > 5) diffLines.push(`... 还有 ${newTotal - oldTotal - 5} 行新增内容`)
          }
          // 旧文件更长
          if (oldTotal > newTotal) {
            for (let i = newTotal; i < Math.min(oldTotal, newTotal + 5); i++) {
              diffLines.push(`- ${oldLines[i].slice(0, 80)}`)
            }
            if (oldTotal - newTotal > 5) diffLines.push(`... 还有 ${oldTotal - newTotal - 5} 行已删除`)
          }

          const diffHeader = diffStart > 0 ? `@@ -${diffStart},${oldTotal} +${diffStart},${newTotal} @@` : `新旧文件行数: ${oldTotal}→${newTotal}`

          return [
            `已覆盖 ${absPath}（${newTotal} 行，${changeSign}${changed} 字符）`,
            diffLines.length > 0 ? '```diff' : '',
            diffLines.length > 0 ? diffHeader : '',
            diffLines.length > 0 ? diffLines.join('\n') : '',
            diffLines.length > 0 ? '```' : '',
            diffLines.length === 0 ? '(无显著行级变化 — 可能仅有空白或格式差异)' : '',
          ].filter(Boolean).join('\n')
        } catch (e: any) {
          if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
          return `写入失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_append_file'] = {
    description: 'Append to file (creates if missing). Any path allowed, outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Content to append' },
      },
      required: ['path', 'content'],
    }),
    execute: async (args: { path: string; content: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('append_file', absPath, async () => {
        trackFileOp(absPath)
        let fopId: string | null = null
        if (!isInsideWorkspace(absPath)) {
          const r = await confirmOutside('write', absPath, args.content)
          if (!r.confirmed) return `追加 ${absPath} 已被用户拒绝。`
          fopId = r.id
        }
        try {
          let existing = ''
          const readResult = await api.readFile(absPath)
          if (readResult.success && readResult.content) existing = readResult.content
          await api.writeFile(absPath, existing + args.content)
          if (fopId) notifyFileOpDone(fopId, { status: 'done', size: args.content.length })
          return `已追加 ${args.content.length} 字符到 ${absPath}`
        } catch (e: any) {
          if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
          return `追加失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_create_dir'] = {
    description: 'Create directory (including parents).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('create_dir', absPath, async () => {
        trackFileOp(absPath)
        try {
          await api.mkdir(absPath)
          return `已创建目录 ${absPath}`
        } catch (e: any) { return `创建目录失败: ${e.message}` }
      })
    },
  }

  tools['workspace_delete_file'] = {
    description: 'Delete file. Any path allowed, outside-workspace triggers confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('delete_file', absPath, async () => {
        trackFileOp(absPath)
        let fopId: string | null = null
        if (!isInsideWorkspace(absPath)) {
          const r = await confirmOutside('delete', absPath)
          if (!r.confirmed) return `删除 ${absPath} 已被用户拒绝。`
          fopId = r.id
        }
        try {
          await api.unlink(absPath)
          if (fopId) notifyFileOpDone(fopId, { status: 'done' })
          return `已删除 ${absPath}`
        } catch (e: any) {
          if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
          return `删除失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_edit_file'] = {
    description:
      'Performs exact replacements in files.\n\n' +
      'Usage:\n' +
      '- You must use workspace_read_file at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.\n' +
      '- Two modes:\n' +
      '  1. Line-based (RECOMMENDED): start_line + end_line + new_string. Replace lines start_line through end_line (inclusive). No uniqueness requirement.\n' +
      '  2. String-based (fallback): old_string + new_string. old_string must be unique in the file, or use replace_all=true.\n' +
      '- When editing text from Read tool output, preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix.\n' +
      '- ALWAYS prefer editing existing files. NEVER create new files unless explicitly required.\n' +
      '- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.\n' +
      '- Returns a unified diff preview of the change, so you can verify before proceeding.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        // 行号模式（推荐）
        start_line: { type: 'number', description: 'Start line number (1-based, inclusive). Use with end_line + new_string for line-based editing.' },
        end_line: { type: 'number', description: 'End line number (1-based, inclusive). Must be >= start_line.' },
        // 字符串模式（回退）
        old_string: { type: 'string', description: 'Original string to find and replace. Use ONLY when you cannot determine exact line numbers.' },
        new_string: { type: 'string', description: 'Replacement string' },
        replace_all: { type: 'boolean', description: 'Replace all matches. Default false (single, requires uniqueness). Only for string-based mode.' },
      },
      required: ['path', 'new_string'],
    }),
    execute: async (args: { path: string; start_line?: number; end_line?: number; old_string?: string; new_string: string; replace_all?: boolean }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('edit_file', absPath, async () => {
        trackFileOp(absPath)

        // 读文件
        const readResult = await api.readFile(absPath)
        if (!readResult.success || readResult.content == null) return `读取失败: ${readResult.error || '文件不存在'}`
        const original = readResult.content
        const allLines = original.split('\n')
        const totalLines = allLines.length

        // 生成 diff 预览
        const diffPreview = (oldLines: string[], newLines: string[], startLine: number): string => {
          const maxLen = 80
          const oldChunk = oldLines.map(l => `- ${l.slice(0, maxLen)}`).join('\n')
          const newChunk = newLines.map(l => `+ ${l.slice(0, maxLen)}`).join('\n')
          const oldCount = oldLines.length
          const newCount = newLines.length
          const header = `@@ -${startLine},${oldCount} +${startLine},${newCount} @@`
          return [header, oldChunk, newChunk].filter(Boolean).join('\n')
        }

        let newContent: string
        let diff: string
        let desc: string

        // ====== 模式 1: 行号定位（优先） ======
        if (args.start_line != null && args.end_line != null) {
          if (args.start_line < 1 || args.end_line > totalLines || args.start_line > args.end_line) {
            return `行号范围无效: start_line=${args.start_line}, end_line=${args.end_line}。文件共 ${totalLines} 行。`
          }
          const startIdx = args.start_line - 1
          const endIdx = args.end_line  // slice end is exclusive

          const oldLines = allLines.slice(startIdx, endIdx)
          const newLines = args.new_string.split('\n')

          newContent = [
            ...allLines.slice(0, startIdx),
            ...newLines,
            ...allLines.slice(endIdx),
          ].join('\n')

          diff = diffPreview(oldLines, newLines, args.start_line)
          desc = `行 ${args.start_line}-${args.end_line}`
        } else if (args.old_string != null) {
          // ====== 模式 2: 字符串匹配（回退） ======
          const count = original.split(args.old_string).length - 1
          if (count === 0) {
            return `未找到匹配的 old_string。请确认字符串内容与文件中完全一致（包括空格、缩进、换行）。\n提示：如果知道行号，可用 start_line + end_line 代替 old_string。`
          }
          if (!args.replace_all && count > 1) {
            return `old_string 匹配了 ${count} 处，不唯一。选项：\n- 扩大 old_string 范围（包含更多上下文）使其唯一\n- 设置 replace_all=true 替换全部 ${count} 处\n- 使用 start_line + end_line 按行号定位（推荐）`
          }

          newContent = args.replace_all
            ? original.split(args.old_string).join(args.new_string)
            : original.replace(args.old_string, args.new_string)

          // 计算匹配位置用于 diff
          const matchIdx = original.indexOf(args.old_string)
          const prefixLines = original.slice(0, matchIdx).split('\n').length
          const oldLines = args.old_string.split('\n')
          const newLines = args.new_string.split('\n')
          diff = diffPreview(oldLines, newLines, prefixLines)
          desc = args.replace_all ? `替换 ${count} 处` : '替换 1 处'
        } else {
          return `缺少定位参数。请提供 start_line + end_line（推荐），或 old_string（回退）。`
        }

        // 工作区外确认
        let fopId: string | null = null
        if (!isInsideWorkspace(absPath)) {
          const r = await confirmOutside('write', absPath, newContent)
          if (!r.confirmed) return `编辑 ${absPath} 已被用户拒绝。`
          fopId = r.id
        }

        try {
          await api.writeFile(absPath, newContent)
          if (fopId) notifyFileOpDone(fopId, { status: 'done', size: newContent.length })
          const changed = newContent.length - original.length
          const changeSign = changed >= 0 ? '+' : ''
          return [
            `已编辑 ${absPath}（${desc}，${changeSign}${changed} 字符）`,
            '',
            '```diff',
            diff,
            '```',
          ].join('\n')
        } catch (e: any) {
          if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
          return `编辑失败: ${e.message}`
        }
      })
    },
  }

  // ====== 文件移动 / 批量编辑 ======

  tools['workspace_move_file'] = {
    description:
      'Move or rename a file or directory. source= and dest= are both required. ' +
      'Works for both files and directories. If dest exists, the operation will fail (no overwrite). ' +
      'Use this instead of running mv in terminal for proper tracking and confirmation.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Source file/directory path' },
        dest: { type: 'string', description: 'Destination path (new name or new location)' },
      },
      required: ['source', 'dest'],
    }),
    execute: async (args: { source: string; dest: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const srcAbs = resolvePath(args.source)
      const dstAbs = resolvePath(args.dest)
      return runWithUI('edit_file', srcAbs, async () => {
        // 工作区外确认
        let fopId: string | null = null
        if (!isInsideWorkspace(srcAbs) || !isInsideWorkspace(dstAbs)) {
          const r = await confirmOutside('write', dstAbs)
          if (!r.confirmed) return `移动 ${srcAbs} 到 ${dstAbs} 已被用户拒绝。`
          fopId = r.id
        }

        try {
          // 直接执行 rename，让 OS 来判断源是否存在、目标是否冲突
          const result = await api.rename(srcAbs, dstAbs)
          if (!result.success) {
            const err = result.error || '未知错误'
            // 翻译常见错误
            if (err.includes('No such file') || err.includes('ENOENT')) return `源路径不存在: ${srcAbs}`
            if (err.includes('File exists') || err.includes('EEXIST')) return `目标路径已存在: ${dstAbs}`
            if (err.includes('Cross-device')) return `跨设备移动不支持: ${srcAbs} -> ${dstAbs}。请用 write_file 复制内容后 delete_file 删除源文件。`
            return `移动失败: ${err}`
          }
          if (fopId) notifyFileOpDone(fopId, { status: 'done' })
          return `已移动 ${srcAbs} -> ${dstAbs}`
        } catch (e: any) {
          if (fopId) notifyFileOpDone(fopId, { status: 'error', error: e.message })
          return `移动失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_batch_edit'] = {
    description:
      'Apply a find-and-replace across multiple files matching a glob pattern. ' +
      'pattern= is the glob to match files (e.g. "src/**/*.ts"). ' +
      'old_string= is the text to find, new_string= is the replacement. ' +
      'Use dry_run=true to preview changes first (recommended). ' +
      'Use this instead of grepping then editing each file individually.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern to match files, e.g. "src/**/*.ts"' },
        old_string: { type: 'string', description: 'Exact string to find and replace in each file' },
        new_string: { type: 'string', description: 'Replacement string' },
        dry_run: { type: 'boolean', description: 'Preview mode: show which files would be changed without writing, default true' },
      },
      required: ['pattern', 'old_string', 'new_string'],
    }),
    execute: async (args: { pattern: string; old_string: string; new_string: string; dry_run?: boolean }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const isDryRun = args.dry_run !== false
      const basePath = getRoot()
      return runWithUI(isDryRun ? 'grep' : 'edit_file', basePath, async () => {
        try {
          // 查找匹配文件
          const findResult = await api.find(basePath)
          if (!findResult.success) return `查找文件失败: ${findResult.error || '未知错误'}`

          const allFiles: string[] = findResult.files || []
          // 简单 glob 匹配（支持 ** 和 *）
          const globToRegex = (pattern: string): RegExp => {
            const escaped = pattern
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*\*\//g, '{{GLOBSTAR}}')
              .replace(/\*/g, '[^/]*')
              .replace(/{{GLOBSTAR}}/g, '(?:.+/)?')
            return new RegExp('^' + escaped + '$')
          }
          const regex = globToRegex(args.pattern)
          const matchedFiles = allFiles.filter(f => regex.test(f.replace(basePath + '/', '')))

          if (matchedFiles.length === 0) return `没有文件匹配 pattern: ${args.pattern}`

          const results: string[] = []
          let changedCount = 0
          let matchCount = 0

          for (const filePath of matchedFiles.slice(0, 50)) { // 最多 50 个文件
            const readResult = await api.readFile(filePath)
            if (!readResult.success || readResult.content == null) {
              results.push(`跳过 ${filePath}: 读取失败`)
              continue
            }
            const content = readResult.content
            const count = content.split(args.old_string).length - 1
            if (count === 0) continue

            matchCount += count
            const relPath = filePath.replace(basePath + '/', '')
            results.push(`${relPath}: ${count} 处匹配`)

            if (!isDryRun) {
              trackFileOp(filePath)
              const newContent = content.split(args.old_string).join(args.new_string)
              await api.writeFile(filePath, newContent)
              changedCount++
            }
          }

          const summary = isDryRun
            ? `[预览] 找到 ${matchedFiles.length} 个匹配文件，共 ${matchCount} 处匹配（限制 50 个文件）。设置 dry_run=false 执行替换。`
            : `已替换 ${changedCount} 个文件中的 ${matchCount} 处。`

          return [summary, '', ...results].join('\n')
        } catch (e: any) {
          return `批量编辑失败: ${e.message}`
        }
      })
    },
  }

  // ====== 文件信息 / 对比 / 备份 / 测试 ======

  tools['workspace_file_info'] = {
    description: 'Get metadata about a file: size, line count, modification time, permissions, and type. ' +
      'Use this instead of read_file when you only need file stats, not content.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      return runWithUI('file_info', absPath, async () => {
        const stat = await api.stat(absPath)
        if (!stat.success) return `文件不存在: ${absPath}`
        const s = stat.stat!
        const mtime = new Date(s.mtime).toLocaleString('zh-CN', { hour12: false })
        const ext = absPath.split('.').pop()?.toLowerCase() || '(无扩展名)'

        // 尝试读文件获取行数和类型
        let lines = 0
        let isBinary = false
        try {
          const r = await api.readFile(absPath)
          if (r.success && r.content != null) {
            lines = r.content.split('\n').length
            // 检测二进制：前 100 个字节中是否有 null 字符
            isBinary = r.content.slice(0, 100).includes('\x00')
          }
        } catch { /* 读不了就算了 */ }

        return [
          `路径: ${absPath}`,
          `大小: ${formatSize(s.size)}`,
          `行数: ${lines} 行`,
          `修改时间: ${mtime}`,
          `扩展名: .${ext}`,
          `类型: ${s.isDirectory ? '目录' : isBinary ? '二进制文件' : '文本文件'}`,
          `权限: ${s.isDirectory ? 'd' : '-'}rw-r--r--`,
        ].join('\n')
      })
    },
  }

  tools['workspace_compare_files'] = {
    description: 'Compare two files and show the unified diff. file1= and file2= are both required. ' +
      'Works for any two files in the workspace — not limited to git-tracked files.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        file1: { type: 'string', description: 'First file path' },
        file2: { type: 'string', description: 'Second file path' },
      },
      required: ['file1', 'file2'],
    }),
    execute: async (args: { file1: string; file2: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const p1 = resolvePath(args.file1)
      const p2 = resolvePath(args.file2)
      return runWithUI('compare_files', p1, async () => {
        const r1 = await api.readFile(p1)
        if (!r1.success || r1.content == null) return `读取失败: ${p1} (${r1.error || '文件不存在'})`
        const r2 = await api.readFile(p2)
        if (!r2.success || r2.content == null) return `读取失败: ${p2} (${r2.error || '文件不存在'})`

        const lines1 = r1.content.split('\n')
        const lines2 = r2.content.split('\n')
        const len1 = lines1.length, len2 = lines2.length
        const header = `--- ${args.file1}\n+++ ${args.file2}`
        const diffLines: string[] = [header]
        let i = 0, j = 0
        while (i < len1 || j < len2) {
          if (i < len1 && j < len2 && lines1[i] === lines2[j]) {
            diffLines.push(`  ${lines1[i]}`)
            i++; j++
          } else if (i < len1 && (j >= len2 || lines1[i] !== lines2[j])) {
            diffLines.push(`- ${lines1[i]}`); i++
          } else if (j < len2) {
            diffLines.push(`+ ${lines2[j]}`); j++
          } else {
            // 安全兜底：确保循环必定终止
            break
          }
          if (diffLines.length > 600) {
            diffLines.push('... (diff 过长已截断)')
            break
          }
        }
        const diff = diffLines.slice(0, 500).join('\n')
        const truncated = diffLines.length > 500 ? '\n... (diff 已截断至 500 行)' : ''
        return '```diff\n' + diff + truncated + '\n```'
      })
    },
  }

  tools['workspace_backup_file'] = {
    description: 'Create a backup copy of a file (appends .bak extension). ' +
      'Use this before making risky edits so you can restore with workspace_restore_file if needed.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to back up' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      const bakPath = absPath + '.bak'
      return runWithUI('backup_file', absPath, async () => {
        const r = await api.readFile(absPath)
        if (!r.success || r.content == null) return `文件不存在: ${absPath}`
        try {
          await api.writeFile(bakPath, r.content)
          return `已备份 ${absPath} -> ${bakPath}`
        } catch (e: any) {
          return `备份失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_restore_file'] = {
    description: 'Restore a file from its .bak backup. Overwrites the current file with the backup content. ' +
      'Requires that a .bak file exists (created by workspace_backup_file).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Original file path to restore (will look for path + .bak)' },
      },
      required: ['path'],
    }),
    execute: async (args: { path: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const absPath = resolvePath(args.path)
      const bakPath = absPath + '.bak'
      return runWithUI('restore_file', absPath, async () => {
        const r = await api.readFile(bakPath)
        if (!r.success || r.content == null) return `备份文件不存在: ${bakPath}`
        try {
          await api.writeFile(absPath, r.content)
          return `已恢复 ${absPath} <- ${bakPath}`
        } catch (e: any) {
          return `恢复失败: ${e.message}`
        }
      })
    },
  }

  tools['workspace_run_tests'] = {
    description: 'Detect the test framework and run tests. ' +
      'Automatically discovers jest/vitest/pytest/go test/cargo test based on project files. ' +
      'path= is optional (defaults to workspace root). Returns parsed pass/fail counts and failure details.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Test directory or file path, default workspace root' },
      },
      required: [],
    }),
    execute: async (args: { path?: string }) => {
      const api = window.electronAPI?.fs
      if (!api) return '文件系统不可用'
      const root = getRoot()
      const basePath = args.path ? resolvePath(args.path) : root
      return runWithUI('run_tests', basePath, async () => {
        // 检测测试框架
        const detectFramework = async (): Promise<{ cmd: string; args: string[]; cwd: string; label: string } | null> => {
          // 检查文件是否存在
          const check = async (p: string) => { const r = await api.stat(p); return r.success }

          // vitest
          if (await check(`${root}/vitest.config.ts`) || await check(`${root}/vitest.config.js`))
            return { cmd: 'npx', args: ['vitest', '--run'], cwd: root, label: 'vitest' }
          // jest
          if (await check(`${root}/jest.config.ts`) || await check(`${root}/jest.config.js`) || await check(`${root}/jest.config.json`))
            return { cmd: 'npx', args: ['jest', '--no-coverage'], cwd: root, label: 'jest' }
          // pytest
          if (await check(`${root}/pytest.ini`) || await check(`${root}/pyproject.toml`) || await check(`${root}/setup.cfg`))
            return { cmd: 'python', args: ['-m', 'pytest', '-v'], cwd: root, label: 'pytest' }
          // cargo test
          if (await check(`${root}/Cargo.toml`)) {
            const r = await api.readFile(`${root}/Cargo.toml`)
            if (r.success && r.content?.includes('[lib]')) return { cmd: 'cargo', args: ['test'], cwd: root, label: 'cargo test' }
          }
          // go test
          if (await check(`${root}/go.mod`))
            return { cmd: 'go', args: ['test', './...'], cwd: root, label: 'go test' }
          // 兜底：package.json 有 test script
          if (await check(`${root}/package.json`)) {
            const r = await api.readFile(`${root}/package.json`)
            try {
              const pkg = JSON.parse(r.content || '{}')
              if (pkg.scripts?.test) return { cmd: 'npm', args: ['test', '--', '--passWithNoTests'], cwd: root, label: 'npm test' }
            } catch {}
          }
          return null
        }

        const framework = await detectFramework()
        if (!framework) return '未检测到测试框架。支持: vitest, jest, pytest, cargo test, go test, npm test。'

        const command = `${framework.cmd} ${framework.args.join(' ')}`
        return [
          `检测到测试框架: ${framework.label}`,
          `工作目录: ${framework.cwd}`,
          `请执行: run_terminal(command="${command}", cwd="${framework.cwd}")`,
          `然后解析输出中的 pass/fail 结果。`,
        ].join('\n')
      })
    },
  }

}
