/**
 * Git 工具：status / diff / log / add / reset / commit / branch / checkout / push / pull / fetch / stash / merge / remote
 * 在工作区根目录执行，commit 需用户确认，push/pull/fetch 支持动态超时。
 * 所有操作通过 CustomEvent 向 UI 发送状态更新（GitOpBubble）。
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import type { GitOpStatus } from '@/types/chat'
import { createFileOp, setFileOpResolver } from '@/lib/fileOpManager'

/** 工作区根（由 ChatPage 注入） */
let _workspaceRoot: string | undefined
export function setGitWorkspaceRoot(root: string) { if (root) _workspaceRoot = root }

function cwd(): string { return _workspaceRoot || process.cwd() }
function api() { return (window as any).electronAPI?.git }

/** 执行 git 命令，返回结构化结果 */
interface GitResult {
  success: boolean
  output: string
  stderr: string
  exitCode: number | null
}

async function exec(args: string[], timeoutSec?: number): Promise<GitResult> {
  const a = api()
  if (!a) return { success: false, output: 'Git API 不可用（仅桌面版本）', stderr: '', exitCode: null }
  const r = await a.exec(cwd(), args, timeoutSec)
  return {
    success: r.success,
    output: (r.output || '').trim(),
    stderr: (r.stderr || '').trim(),
    exitCode: r.exitCode ?? (r.success ? 0 : -1),
  }
}

/** 便捷包装：返回 AI 友好的字符串 */
async function execStr(args: string[], timeoutSec?: number): Promise<string> {
  const r = await exec(args, timeoutSec)
  if (r.success) return r.output
  const parts = [r.output, r.stderr].filter(Boolean)
  return `Git 错误 (exit ${r.exitCode ?? '?'}): ${parts.join('\n')}`
}

function notifyFileOp(event: any) {
  window.dispatchEvent(new CustomEvent('stardust:fileop', { detail: event }))
}

// ====== Git 操作 UI 通知（直接回调，比 CustomEvent 更可靠） ======

type GitOpHandler = (event: { type: 'gitop_created' | 'gitop_updated'; gitOp: GitOpStatus }) => void
let _gitOpHandler: GitOpHandler | null = null

export function setGitOpHandler(handler: GitOpHandler | null) {
  _gitOpHandler = handler
}

function notifyGitOp(event: { type: 'gitop_created' | 'gitop_updated'; gitOp: GitOpStatus }) {
  if (_gitOpHandler) {
    _gitOpHandler(event)
  }
}

/**
 * 执行 git 命令并自动发送 UI 通知。
 * 内部辅助操作（如 rev-parse、branch --list）不通过此函数，直接调 exec()/execStr() 即可。
 */
async function runWithUI(
  args: string[],
  description: string,
  timeoutSec?: number,
): Promise<string> {
  const id = 'git_' + Math.random().toString(36).slice(2, 8)
  const command = 'git ' + args.join(' ')
  const go: GitOpStatus = { id, command, description, status: 'running', startTime: Date.now() }
  notifyGitOp({ type: 'gitop_created', gitOp: go })

  try {
    const r = await exec(args, timeoutSec)
    const status = r.success ? 'done' as const : 'error' as const
    notifyGitOp({
      type: 'gitop_updated',
      gitOp: { ...go, status, output: r.output, error: r.stderr || undefined, endTime: Date.now() },
    })

    if (r.success) return r.output
    const parts = [r.output, r.stderr].filter(Boolean)
    return `Git 错误 (exit ${r.exitCode ?? '?'}): ${parts.join('\n')}`
  } catch (e: any) {
    notifyGitOp({
      type: 'gitop_updated',
      gitOp: { ...go, status: 'error' as const, error: e?.message || String(e), endTime: Date.now() },
    })
    return `Git 异常: ${e?.message || e}`
  }
}

async function confirmCommit(msg: string): Promise<{ confirmed: boolean; id: string }> {
  const id = 'gcm_' + Math.random().toString(36).slice(2, 8)
  const op = createFileOp(id, 'write', `git commit -m "${msg.slice(0, 60)}"`, msg)
  notifyFileOp({ type: 'fileop_created', fileOp: { ...op } })
  const confirmed = await new Promise<boolean>(resolve => { setFileOpResolver(id, resolve) })
  if (!confirmed) {
    const o = { ...op, status: 'rejected' as const }
    notifyFileOp({ type: 'fileop_updated', fileOp: o })
  }
  return { confirmed, id }
}

export function registerGitTools(tools: ToolMap) {
  if (!api()) return

  // ====== 仓库初始化 ======

  tools['git_init'] = {
    description: 'Initialize a new git repository in the current workspace directory. ' +
      'Use this when starting a new project that needs version control. Optional branch= to set initial branch name.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Initial branch name, default depends on git config (usually master)' },
      },
      required: [],
    }),
    execute: async (args: { branch?: string }) => {
      const initArgs = ['init']
      if (args.branch) initArgs.push('--initial-branch', args.branch)
      return runWithUI(initArgs, args.branch ? `初始化仓库 (默认分支: ${args.branch})` : '初始化 Git 仓库')
    },
  }

  // ====== 查看类 ======

  tools['git_status'] = {
    description: 'Show git working tree status: modified, staged, untracked files, and current branch info.',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => runWithUI(['status', '--short', '--branch'], '查看工作区状态'),
  }

  tools['git_diff'] = {
    description: 'Show unstaged diff (working tree vs HEAD). Optional path to view single file, optional stat=true for summary only.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (optional, all if empty)' },
        stat: { type: 'boolean', description: 'Show diffstat summary only, default false' },
      },
      required: [],
    }),
    execute: async (args: { path?: string; stat?: boolean }) => {
      const a = args.stat ? ['diff', '--stat'] : ['diff']
      if (args.path) a.push('--', args.path)
      return runWithUI(a, args.stat ? '查看差异摘要' : args.path ? `查看 ${args.path} 差异` : '查看未暂存差异')
    },
  }

  tools['git_diff_staged'] = {
    description: 'Show staged diff (staging area vs HEAD).',
    inputSchema: jsonSchema({ type: 'object', properties: {}, required: [] }),
    execute: async () => runWithUI(['diff', '--staged'], '查看已暂存差异'),
  }

  tools['git_log'] = {
    description: 'Show commit history. n=number of commits (1-100, default 10). oneline=true for compact view. ' +
      'Optional branch and path filters.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        n: { type: 'number', description: 'Number of commits (1-100, default 10)' },
        oneline: { type: 'boolean', description: 'One-line mode, default true' },
        branch: { type: 'string', description: 'Branch name filter, default current' },
        path: { type: 'string', description: 'File path filter — only commits touching this file' },
      },
      required: [],
    }),
    execute: async (args: { n?: number; oneline?: boolean; branch?: string; path?: string }) => {
      let count = args.n ?? 10
      if (!Number.isFinite(count) || count < 1) count = 10
      if (count > 100) count = 100
      const a = ['log', `-${Math.round(count)}`]
      if (args.oneline !== false) a.push('--oneline')
      if (args.branch) a.push(args.branch)
      if (args.path) a.push('--', args.path)
      return runWithUI(a, `查看最近 ${Math.round(count)} 条提交`)
    },
  }

  // ====== 暂存 / 取消暂存 ======

  tools['git_add'] = {
    description: 'Stage files for commit. Empty path stages all (git add .). Use git_unstage to undo.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, stages all if empty' } },
      required: [],
    }),
    execute: async (args: { path?: string }) =>
      runWithUI(args.path ? ['add', args.path] : ['add', '.'], args.path ? `暂存 ${args.path}` : '暂存所有文件'),
  }

  tools['git_unstage'] = {
    description: 'Unstage files from the staging area (keeps working tree changes). Empty path unstages all.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { path: { type: 'string', description: 'File path to unstage, unstages all if empty' } },
      required: [],
    }),
    execute: async (args: { path?: string }) =>
      runWithUI(args.path ? ['reset', 'HEAD', '--', args.path] : ['reset', 'HEAD'], args.path ? `取消暂存 ${args.path}` : '取消暂存所有文件'),
  }

  // ====== 重置 / 提交 ======

  tools['git_reset'] = {
    description: 'Reset HEAD to a commit. mode=soft keeps changes staged; mode=mixed (default) unstages but keeps changes; ' +
      'mode=hard discards all changes (DANGEROUS). commit defaults to HEAD. ' +
      'If path is specified, only unstages that file (mode is ignored, equivalent to git_unstage).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['soft', 'mixed', 'hard'], description: 'Reset mode. soft=keep staged, mixed=unstage but keep, hard=discard. Default mixed.' },
        commit: { type: 'string', description: 'Target commit ref, default HEAD' },
        path: { type: 'string', description: 'Single file path — only unstage/reset this file (HEAD is not moved)' },
      },
      required: [],
    }),
    execute: async (args: { mode?: 'soft' | 'mixed' | 'hard'; commit?: string; path?: string }) => {
      if (args.path) {
        // 单文件：只 unstage/restore，不移动 HEAD
        if (args.mode === 'hard') {
          return runWithUI(['checkout', 'HEAD', '--', args.path], `丢弃 ${args.path} 的本地修改`)
        }
        return runWithUI(['reset', 'HEAD', '--', args.path], `取消暂存 ${args.path}`)
      }
      const mode = args.mode || 'mixed'
      const target = args.commit || 'HEAD'
      const desc = mode === 'soft' ? `软重置到 ${target}` : mode === 'hard' ? `硬重置到 ${target}` : `混合重置到 ${target}`
      if (mode === 'soft') return runWithUI(['reset', '--soft', target], desc)
      if (mode === 'hard') return runWithUI(['reset', '--hard', target], desc)
      return runWithUI(['reset', target], desc)
    },
  }

  tools['git_commit'] = {
    description: 'Commit staged changes. message=commit message. User confirmation required before committing.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { message: { type: 'string', description: 'Commit message' } },
      required: ['message'],
    }),
    execute: async (args: { message: string }) => {
      const r = await confirmCommit(args.message)
      if (!r.confirmed) return '提交已被用户拒绝。'
      const id = 'git_' + Math.random().toString(36).slice(2, 8)
      const go: GitOpStatus = { id, command: `git commit -m "${args.message.slice(0, 60)}"`, description: '提交变更', status: 'running', startTime: Date.now() }
      notifyGitOp({ type: 'gitop_created', gitOp: go })
      try {
        const result = await exec(['commit', '-m', args.message])
        const success = result.success
        notifyGitOp({ type: 'gitop_updated', gitOp: { ...go, status: success ? 'done' : 'error', output: result.output, error: result.stderr || undefined, endTime: Date.now() } })
        notifyFileOp({
          type: 'fileop_updated',
          fileOp: { id: r.id, type: 'write', path: 'git commit', status: success ? 'done' : 'error', error: success ? undefined : result.stderr },
        })
        return result.success ? result.output : `Git 错误 (exit ${result.exitCode}): ${result.stderr || result.output}`
      } catch (e: any) {
        notifyGitOp({ type: 'gitop_updated', gitOp: { ...go, status: 'error' as const, error: e?.message || String(e), endTime: Date.now() } })
        notifyFileOp({
          type: 'fileop_updated',
          fileOp: { id: r.id, type: 'write', path: 'git commit', status: 'error' as const, error: e?.message || String(e) },
        })
        return `Git 异常: ${e?.message || e}`
      }
    },
  }

  // ====== 分支操作 ======

  tools['git_branch'] = {
    description: 'List all branches (default includes local + remote), delete a branch, or rename the current branch. ' +
      'delete=<name> to delete. rename=<newName> to rename current branch. ' +
      'To create a new branch, use git_checkout with a new branch name — git will create and switch to it.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        delete: { type: 'string', description: 'Branch name to delete (safe delete, rejects if not merged)' },
        rename: { type: 'string', description: 'New name to rename the current branch to' },
        remote: { type: 'boolean', description: 'Include remote branches in listing, default true' },
      },
      required: [],
    }),
    execute: async (args: { delete?: string; rename?: string; remote?: boolean }) => {
      if (args.delete && args.rename) return '错误: 不能同时指定 delete 和 rename。'
      if (args.delete) {
        return runWithUI(['branch', '-d', args.delete], `删除分支 ${args.delete}`)
      }
      if (args.rename) {
        return runWithUI(['branch', '-m', args.rename], `重命名当前分支为 ${args.rename}`)
      }
      return runWithUI(args.remote !== false ? ['branch', '-a'] : ['branch'], '列出所有分支')
    },
  }

  tools['git_checkout'] = {
    description: 'Switch to a branch (use branch= param) OR restore a file to HEAD (use file= param). ' +
      'Specify exactly one of branch or file. ' +
      'If the branch does not exist, a new branch will be created from current HEAD (-b flag). ' +
      'Use git_branch to list all branches, git_stash to save uncommitted changes before switching.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to switch to. Creates a new branch if it does not exist.' },
        file: { type: 'string', description: 'File path to restore to HEAD state (discards working tree changes!)' },
      },
      required: [],
    }),
    execute: async (args: { branch?: string; file?: string }) => {
      if (args.branch && args.file) return '错误: 不能同时指定 branch 和 file 参数，请二选一。'
      if (!args.branch && !args.file) return '错误: 必须指定 branch 或 file 参数。'

      if (args.branch) {
        // 检查分支是否已存在（内部操作，不产生 UI）
        const branchCheck = await exec(['branch', '--list', args.branch])
        const exists = branchCheck.success && branchCheck.output.includes(args.branch)
        if (exists) {
          return runWithUI(['checkout', args.branch], `切换到分支 ${args.branch}`)
        }
        // 不存在则创建新分支
        return runWithUI(['checkout', '-b', args.branch], `创建并切换到新分支 ${args.branch}`)
      }

      // file 模式：restore to HEAD（用 -- 消除歧义）
      return runWithUI(['checkout', 'HEAD', '--', args.file!], `恢复 ${args.file} 到 HEAD 状态`)
    },
  }

  // ====== 远程同步 ======

  tools['git_push'] = {
    description: 'Push current branch to remote. Auto-detects whether --set-upstream is needed for new branches. ' +
      'remote defaults to origin, branch defaults to current. Use force=true for --force-with-lease (safer force push).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name, default origin' },
        branch: { type: 'string', description: 'Branch name, default current' },
        force: { type: 'boolean', description: 'Use --force-with-lease (safer force push). Default false.' },
      },
      required: [],
    }),
    execute: async (args: { remote?: string; branch?: string; force?: boolean }) => {
      const remote = args.remote || 'origin'
      // 获取当前分支（内部操作，不产生 UI）
      const currentBranchResult = await exec(['rev-parse', '--abbrev-ref', 'HEAD'])
      const currentBranch = currentBranchResult.success ? currentBranchResult.output : ''
      const branch = args.branch || currentBranch

      if (!branch) return '无法确定当前分支，请显式指定 branch 参数。'

      // 检查是否已有上游追踪（内部操作，不产生 UI）
      const upstreamResult = await exec(['rev-parse', '--abbrev-ref', `${branch}@{upstream}`])
      const hasUpstream = upstreamResult.success

      const pushArgs = ['push']
      if (args.force) pushArgs.push('--force-with-lease')
      if (!hasUpstream) {
        pushArgs.push('--set-upstream', remote, branch)
      } else {
        pushArgs.push(remote, branch)
      }
      return runWithUI(pushArgs, `推送 ${branch} → ${remote}`, 120)
    },
  }

  tools['git_pull'] = {
    description: 'Pull changes from remote (fetch + merge). remote defaults to origin. ' +
      'Use rebase=true to rebase instead of merge. Use this to sync latest changes from remote.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name, default origin' },
        branch: { type: 'string', description: 'Branch name, default current tracking branch' },
        rebase: { type: 'boolean', description: 'Use --rebase instead of merge, default false' },
      },
      required: [],
    }),
    execute: async (args: { remote?: string; branch?: string; rebase?: boolean }) => {
      const pullArgs = ['pull']
      if (args.rebase) pullArgs.push('--rebase')
      pullArgs.push(args.remote || 'origin')
      if (args.branch) pullArgs.push(args.branch)
      return runWithUI(pullArgs, args.rebase ? `变基拉取 ${args.remote || 'origin'}` : `拉取 ${args.remote || 'origin'}`, 120)
    },
  }

  tools['git_fetch'] = {
    description: 'Fetch changes from remote without merging. Safe read-only operation — use this to check what changed ' +
      'before pulling. remote defaults to origin. prune=true removes stale remote-tracking refs.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        remote: { type: 'string', description: 'Remote name, default origin' },
        prune: { type: 'boolean', description: 'Remove remote-tracking refs that no longer exist on remote, default false' },
      },
      required: [],
    }),
    execute: async (args: { remote?: string; prune?: boolean }) => {
      const fetchArgs = ['fetch', args.remote || 'origin']
      if (args.prune) fetchArgs.push('--prune')
      return runWithUI(fetchArgs, args.prune ? `获取并清理 ${args.remote || 'origin'}` : `获取 ${args.remote || 'origin'}`, 120)
    },
  }

  // ====== 暂存 / 合并 ======

  tools['git_stash'] = {
    description: 'Stash (temporarily save) or restore uncommitted changes. ' +
      'action=push saves working tree changes to stash (default), ' +
      'action=pop restores the latest stash and removes it from stash list, ' +
      'action=list shows all stashes. ' +
      'Use this before checkout/pull when you have uncommitted changes that would conflict.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['push', 'pop', 'list'], description: 'push=save to stash (default), pop=restore latest, list=show all' },
        message: { type: 'string', description: 'Optional description for the stash (only for push)' },
      },
      required: [],
    }),
    execute: async (args: { action?: 'push' | 'pop' | 'list'; message?: string }) => {
      const action = args.action || 'push'
      if (action === 'list') return runWithUI(['stash', 'list'], '列出暂存区')
      if (action === 'pop') return runWithUI(['stash', 'pop'], '恢复最近暂存')
      if (action === 'push') {
        const stashArgs = ['stash', 'push']
        if (args.message) stashArgs.push('-m', args.message)
        return runWithUI(stashArgs, args.message ? `暂存: ${args.message}` : '暂存工作区')
      }
      return '无效的 action 参数，可选值: push, pop, list。'
    },
  }

  tools['git_merge'] = {
    description: 'Merge a branch into the current branch. branch= parameter is required. ' +
      'Use no_ff=true to always create a merge commit (preserves branch history). ' +
      'If conflicts occur, the merge will report them — resolve conflicts manually and commit.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        branch: { type: 'string', description: 'Branch name to merge into current branch' },
        no_ff: { type: 'boolean', description: 'Create a merge commit even if fast-forward is possible, default false' },
        message: { type: 'string', description: 'Merge commit message (only used with no_ff=true)' },
      },
      required: ['branch'],
    }),
    execute: async (args: { branch: string; no_ff?: boolean; message?: string }) => {
      const mergeArgs = ['merge']
      if (args.no_ff) {
        mergeArgs.push('--no-ff')
        if (args.message) mergeArgs.push('-m', args.message)
      }
      mergeArgs.push(args.branch)
      return runWithUI(mergeArgs, `合并 ${args.branch} 到当前分支`)
    },
  }

  // ====== 远程管理 ======

  tools['git_remote'] = {
    description: 'Manage git remotes. action=list (default) shows all remotes with URLs. ' +
      'action=add requires name + url. action=remove requires name.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove'], description: 'list=show remotes (default), add=add new remote, remove=delete remote' },
        name: { type: 'string', description: 'Remote name (required for add/remove)' },
        url: { type: 'string', description: 'Remote URL (required for add)' },
      },
      required: [],
    }),
    execute: async (args: { action?: 'list' | 'add' | 'remove'; name?: string; url?: string }) => {
      const action = args.action || 'list'
      if (action === 'list') return runWithUI(['remote', '-v'], '列出远程仓库')
      if (action === 'add') {
        if (!args.name || !args.url) return '错误: add 操作需要 name 和 url 参数。'
        return runWithUI(['remote', 'add', args.name, args.url], `添加远程仓库 ${args.name}`)
      }
      if (action === 'remove') {
        if (!args.name) return '错误: remove 操作需要 name 参数。'
        return runWithUI(['remote', 'remove', args.name], `移除远程仓库 ${args.name}`)
      }
      return '无效的 action 参数，可选值: list, add, remove。'
    },
  }

  // ====== 变基 / 挑选 / 撤销 ======

  tools['git_rebase'] = {
    description: 'Rebase current branch onto another branch. target= is required. ' +
      'Use interactive=true for interactive rebase (opens editor). Use onto= to rebase a range of commits onto a different base. ' +
      'WARNING: rebase rewrites history. Avoid rebasing already-pushed branches.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Branch or commit to rebase onto' },
        onto: { type: 'string', description: 'Rebase commits from target..HEAD onto this branch (git rebase --onto)' },
        interactive: { type: 'boolean', description: 'Interactive rebase (opens editor to edit/squash commits), default false' },
      },
      required: ['target'],
    }),
    execute: async (args: { target: string; onto?: string; interactive?: boolean }) => {
      const rebaseArgs = ['rebase']
      if (args.interactive) rebaseArgs.push('-i')
      if (args.onto) {
        rebaseArgs.push('--onto', args.onto, args.target)
        return runWithUI(rebaseArgs, `变基 (--onto ${args.onto}) ${args.target}`)
      }
      rebaseArgs.push(args.target)
      return runWithUI(rebaseArgs, args.interactive ? `交互式变基到 ${args.target}` : `变基到 ${args.target}`)
    },
  }

  tools['git_cherry_pick'] = {
    description: 'Apply a specific commit (or range) to the current branch. commits= is required — can be a single hash or a range like A..B. ' +
      'Use no_commit=true to stage changes without committing (for review).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        commits: { type: 'string', description: 'Commit hash or revision range (e.g. "abc123" or "abc123..def456")' },
        no_commit: { type: 'boolean', description: 'Stage changes without committing, default false' },
      },
      required: ['commits'],
    }),
    execute: async (args: { commits: string; no_commit?: boolean }) => {
      const cpArgs = ['cherry-pick']
      if (args.no_commit) cpArgs.push('--no-commit')
      cpArgs.push(args.commits)
      return runWithUI(cpArgs, `挑选提交 ${args.commits}`)
    },
  }

  tools['git_revert'] = {
    description: 'Revert a commit by creating a new commit that undoes it. Safer than reset — preserves history. ' +
      'commit= is required. Use no_commit=true to stage the revert without committing.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        commit: { type: 'string', description: 'Commit hash to revert' },
        no_commit: { type: 'boolean', description: 'Stage revert without committing, default false' },
      },
      required: ['commit'],
    }),
    execute: async (args: { commit: string; no_commit?: boolean }) => {
      const revertArgs = ['revert']
      if (args.no_commit) revertArgs.push('--no-commit')
      revertArgs.push(args.commit)
      return runWithUI(revertArgs, `撤销提交 ${args.commit.slice(0, 8)}`)
    },
  }

  // ====== 标签 / 查看 / 追溯 ======

  tools['git_tag'] = {
    description: 'Manage tags. action=list (default) shows all tags. action=create creates a tag (requires name, optional message for annotated tag). ' +
      'action=delete removes a tag (requires name).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'delete'], description: 'list=show all tags (default), create=create new tag, delete=remove tag' },
        name: { type: 'string', description: 'Tag name (required for create/delete)' },
        message: { type: 'string', description: 'Annotation message for annotated tag (only for create)' },
      },
      required: [],
    }),
    execute: async (args: { action?: 'list' | 'create' | 'delete'; name?: string; message?: string }) => {
      const action = args.action || 'list'
      if (action === 'list') return runWithUI(['tag', '-l'], '列出所有标签')
      if (action === 'delete') {
        if (!args.name) return '错误: delete 操作需要 name 参数。'
        return runWithUI(['tag', '-d', args.name], `删除标签 ${args.name}`)
      }
      if (action === 'create') {
        if (!args.name) return '错误: create 操作需要 name 参数。'
        const tagArgs = ['tag']
        if (args.message) tagArgs.push('-a', args.name, '-m', args.message)
        else tagArgs.push(args.name)
        return runWithUI(tagArgs, args.message ? `创建注释标签 ${args.name}` : `创建轻量标签 ${args.name}`)
      }
      return '无效的 action 参数，可选值: list, create, delete。'
    },
  }

  tools['git_show'] = {
    description: 'Show details of a commit: full diff, author, date, and message. ' +
      'target= defaults to HEAD. Use stat=true for summary only (files changed, no diff).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Commit hash, tag, or ref. Default HEAD.' },
        stat: { type: 'boolean', description: 'Show --stat summary only (no full diff), default false' },
      },
      required: [],
    }),
    execute: async (args: { target?: string; stat?: boolean }) => {
      const showArgs = ['show']
      if (args.stat) showArgs.push('--stat')
      if (args.target) showArgs.push(args.target)
      return runWithUI(showArgs, `查看提交详情 ${args.target || 'HEAD'}`)
    },
  }

  tools['git_blame'] = {
    description: 'Show who last modified each line of a file, with commit hash and timestamp. ' +
      'file= is required. Use lines= for a specific line range (e.g. "1-50").',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path to blame' },
        lines: { type: 'string', description: 'Line range, e.g. "1-50" or "100-end"' },
      },
      required: ['file'],
    }),
    execute: async (args: { file: string; lines?: string }) => {
      const blameArgs = ['blame']
      if (args.lines) blameArgs.push('-L', args.lines)
      blameArgs.push('--', args.file)
      return runWithUI(blameArgs, `追溯 ${args.file}${args.lines ? ` (L${args.lines})` : ''}`)
    },
  }

  // ====== 清理 / 日志 ======

  tools['git_clean'] = {
    description: 'Remove untracked files from the working tree. ' +
      'Use dry_run=true to preview what would be deleted (recommended first). ' +
      'Use dirs=true to also remove untracked directories. WARNING: cannot be undone.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        dry_run: { type: 'boolean', description: 'Preview mode — shows what would be deleted without actually removing, default true' },
        dirs: { type: 'boolean', description: 'Also remove untracked directories, default false' },
        force: { type: 'boolean', description: 'Force delete (required for actual deletion), default false' },
      },
      required: [],
    }),
    execute: async (args: { dry_run?: boolean; dirs?: boolean; force?: boolean }) => {
      const cleanArgs = ['clean']
      if (args.dry_run !== false) cleanArgs.push('-n')
      else if (args.force) cleanArgs.push('-f')
      if (args.dirs) cleanArgs.push('-d')
      if (args.dry_run !== false || args.force) {
        return runWithUI(cleanArgs, args.dry_run !== false ? '预览清理未跟踪文件' : '清理未跟踪文件')
      }
      return '提示: 请设置 force=true 确认删除，或使用 dry_run=true (默认) 预览。'
    },
  }

  tools['git_reflog'] = {
    description: 'Show the reference log — a history of all HEAD movements (commits, checkouts, resets, rebases). ' +
      'Essential for recovering "lost" commits after reset or rebase. n= limits entries (default 20).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        n: { type: 'number', description: 'Number of entries, default 20, max 100' },
        branch: { type: 'string', description: 'Show reflog for a specific branch/ref instead of HEAD' },
      },
      required: [],
    }),
    execute: async (args: { n?: number; branch?: string }) => {
      let count = args.n ?? 20
      if (!Number.isFinite(count) || count < 1) count = 20
      if (count > 100) count = 100
      const reflogArgs = ['reflog', `-${Math.round(count)}`]
      if (args.branch) { reflogArgs.pop(); reflogArgs.push(args.branch) }
      return runWithUI(reflogArgs, args.branch ? `查看 ${args.branch} 操作历史` : `查看最近 ${Math.round(count)} 条操作历史`)
    },
  }

  tools['git_bisect'] = {
    description: 'Start or interact with a binary search to find the commit that introduced a bug. ' +
      'action=start begins bisect (good= and bad= commit refs required). ' +
      'action=good marks current HEAD as good. action=bad marks current HEAD as bad. ' +
      'action=reset aborts the bisect and returns to original HEAD. ' +
      'Use this when you need to locate which commit caused a regression across many commits.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'good', 'bad', 'reset'], description: 'start=begin bisect (requires good/bad), good=mark as good, bad=mark as bad, reset=abort' },
        good: { type: 'string', description: 'Known good commit ref (for start)' },
        bad: { type: 'string', description: 'Known bad commit ref (for start)' },
      },
      required: [],
    }),
    execute: async (args: { action?: 'start' | 'good' | 'bad' | 'reset'; good?: string; bad?: string }) => {
      const action = args.action || 'start'
      if (action === 'reset') return runWithUI(['bisect', 'reset'], '终止二分查找')
      if (action === 'good') return runWithUI(['bisect', 'good'], '标记当前为 good')
      if (action === 'bad') return runWithUI(['bisect', 'bad'], '标记当前为 bad')
      if (action === 'start') {
        if (!args.good || !args.bad) return '错误: start 需要 good 和 bad 参数（已知的 good commit 和 bad commit 引用）。'
        return runWithUI(['bisect', 'start', args.bad, args.good], `开始二分查找 ${args.good.slice(0, 7)}..${args.bad.slice(0, 7)}`)
      }
      return '无效的 action 参数，可选值: start, good, bad, reset。'
    },
  }
}
