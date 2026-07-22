/**
 * GitHub 工具：issue/PR 管理，通过 gh CLI 执行
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'
import type { GitHubOpStatus } from '@/types/chat'

let _workspaceRoot: string | undefined
export function setGitHubWorkspaceRoot(root: string) { if (root) _workspaceRoot = root }

// ====== GitHub 操作 UI 通知 ======

type GitHubOpHandler = (event: { type: 'githubop_created' | 'githubop_updated'; githubOp: GitHubOpStatus }) => void
let _ghOpHandler: GitHubOpHandler | null = null

export function setGitHubOpHandler(handler: GitHubOpHandler | null) { _ghOpHandler = handler }

function notifyGhOp(event: { type: 'githubop_created' | 'githubop_updated'; githubOp: GitHubOpStatus }) {
  if (_ghOpHandler) _ghOpHandler(event)
}

async function runWithUI(args: string[], description: string, timeoutSec?: number): Promise<string> {
  const id = 'gh_' + Math.random().toString(36).slice(2, 8)
  const command = 'gh ' + args.join(' ')
  const go: GitHubOpStatus = { id, command, description, status: 'running', startTime: Date.now() }
  notifyGhOp({ type: 'githubop_created', githubOp: go })

  try {
    const r = await exec(args, timeoutSec)
    const status = r.success ? 'done' as const : 'error' as const
    notifyGhOp({ type: 'githubop_updated', githubOp: { ...go, status, output: r.output, error: r.stderr || undefined, endTime: Date.now() } })
    return r.success ? r.output : `gh 错误 (exit ${r.exitCode ?? '?'}): ${[r.output, r.stderr].filter(Boolean).join('\n')}`
  } catch (e: any) {
    notifyGhOp({ type: 'githubop_updated', githubOp: { ...go, status: 'error' as const, error: e?.message || String(e), endTime: Date.now() } })
    return `gh 异常: ${e?.message || e}`
  }
}

function cwd(): string { return _workspaceRoot || '/tmp' }
function api() { return (window as any).electronAPI?.gh }

interface GhResult { success: boolean; output: string; stderr: string; exitCode: number | null }

async function exec(args: string[], timeoutSec?: number): Promise<GhResult> {
  const a = api()
  if (!a) return { success: false, output: 'GitHub CLI 不可用（仅桌面版本）', stderr: '', exitCode: null }
  const r = await a.exec(cwd(), args, timeoutSec)
  return {
    success: r.success,
    output: (r.output || '').trim(),
    stderr: (r.stderr || '').trim(),
    exitCode: r.exitCode ?? (r.success ? 0 : -1),
  }
}

async function execStr(args: string[], timeoutSec?: number): Promise<string> {
  const r = await exec(args, timeoutSec)
  if (r.success) return r.output || '(无输出)'
  const parts = [r.output, r.stderr].filter(Boolean)
  return `gh 错误 (exit ${r.exitCode ?? '?'}): ${parts.join('\n')}`
}

export function registerGitHubTools(tools: ToolMap) {
  // 检测 gh CLI 是否可用
  if (!api()) return

  tools['github_list_issues'] = {
    description: 'List GitHub issues. state=open (default), closed, or all. ' +
      'Optional label= filter and limit= (default 20, max 50). ' +
      'Uses --json for structured output (number,title,state,labels,assignees).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state, default open' },
        label: { type: 'string', description: 'Filter by label, e.g. "bug"' },
        limit: { type: 'number', description: 'Max results, default 20, max 50' },
        assignee: { type: 'string', description: 'Filter by assignee, e.g. "@me"' },
      },
      required: [],
    }),
    execute: async (args: { state?: string; label?: string; limit?: number; assignee?: string }) => {
      const ghArgs = ['issue', 'list', '--state', args.state || 'open']
      let limit = args.limit ?? 20
      if (!Number.isFinite(limit) || limit < 1) limit = 20
      if (limit > 50) limit = 50
      ghArgs.push('--limit', String(Math.round(limit)))
      if (args.label) ghArgs.push('--label', args.label)
      if (args.assignee) ghArgs.push('--assignee', args.assignee)
      ghArgs.push('--json', 'number,title,state,labels,assignees,updatedAt')
      return runWithUI(ghArgs, '列出 issues', 30)
    },
  }

  tools['github_list_prs'] = {
    description: 'List GitHub pull requests. state=open (default), closed, merged, or all. ' +
      'Optional limit= (default 20, max 30). Uses --json for structured output.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['open', 'closed', 'merged', 'all'], description: 'PR state, default open' },
        limit: { type: 'number', description: 'Max results, default 20, max 30' },
      },
      required: [],
    }),
    execute: async (args: { state?: string; limit?: number }) => {
      const ghArgs = ['pr', 'list', '--state', args.state || 'open']
      let limit = args.limit ?? 20
      if (!Number.isFinite(limit) || limit < 1) limit = 20
      if (limit > 30) limit = 30
      ghArgs.push('--limit', String(Math.round(limit)))
      ghArgs.push('--json', 'number,title,state,author,headRefName,baseRefName,updatedAt')
      return runWithUI(ghArgs, '列出 PRs', 30)
    },
  }

  tools['github_view_pr'] = {
    description: 'View details of a specific PR: diff, status, comments. number= is required. ' +
      'Use diff=true to show the full diff, comments=true to include review comments.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        number: { type: 'number', description: 'PR number' },
        diff: { type: 'boolean', description: 'Show full diff, default false (summary only)' },
        comments: { type: 'boolean', description: 'Include review comments, default false' },
      },
      required: ['number'],
    }),
    execute: async (args: { number: number; diff?: boolean; comments?: boolean }) => {
      const ghArgs = ['pr', 'view', String(args.number)]
      if (args.diff) ghArgs.push('--json', 'number,title,state,body,additions,deletions,files,reviews')
      else ghArgs.push('--json', 'number,title,state,body,additions,deletions')
      if (args.comments) ghArgs.push('--comments')
      return runWithUI(ghArgs, '查看 PR 详情', 30)
    },
  }

  tools['github_create_pr'] = {
    description: 'Create a GitHub pull request. title= and body= are required. ' +
      'Optional base= (target branch, default main) and draft=true for draft PRs.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        body: { type: 'string', description: 'PR description (markdown supported)' },
        base: { type: 'string', description: 'Target branch, default main or master' },
        draft: { type: 'boolean', description: 'Create as draft PR, default false' },
      },
      required: ['title', 'body'],
    }),
    execute: async (args: { title: string; body: string; base?: string; draft?: boolean }) => {
      const ghArgs = ['pr', 'create', '--title', args.title, '--body', args.body]
      if (args.base) ghArgs.push('--base', args.base)
      if (args.draft) ghArgs.push('--draft')
      return runWithUI(ghArgs, '创建 PR', 30)
    },
  }

  tools['github_pr_diff'] = {
    description: 'Show the diff of a pull request. number= is required. ' +
      'Use this to review what changes a PR introduces.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        number: { type: 'number', description: 'PR number' },
      },
      required: ['number'],
    }),
    execute: async (args: { number: number }) => {
      return runWithUI(['pr', 'diff', String(args.number)], '查看 PR diff', 30)
    },
  }

  tools['github_pr_checks'] = {
    description: 'Show CI checks for a pull request. number= is required. ' +
      'Use this to check if a PR passes CI before reviewing.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        number: { type: 'number', description: 'PR number' },
      },
      required: ['number'],
    }),
    execute: async (args: { number: number }) => {
      return runWithUI(['pr', 'checks', String(args.number)], '查看 PR CI', 30)
    },
  }
}
