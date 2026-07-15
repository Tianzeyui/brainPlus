import { useState, useEffect, useCallback } from 'react'
import {
  FolderKanban, Plus, Trash2, ExternalLink, Terminal,
  Settings2, ChevronRight, FolderSearch, ArrowRight, Loader2,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/ui/confirmDialog'
import { projectStore } from '@/lib/projectStore'
import type { Project } from '@/types/project'
import { getServers, getAllTools } from '@/lib/mcpClient'
import type { MCPServerConfig } from '@/types/electron'
import { pluginSystem } from '@/lib/pluginSystem'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

// ====== 精致 Toggle 开关 ======
function Toggle({ checked, onChange, size = 'sm' }: { checked: boolean; onChange: () => void; size?: 'sm' | 'xs' }) {
  const isXs = size === 'xs'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors',
        isXs ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'bg-primary' : 'bg-muted hover:bg-muted/80',
      )}
      onClick={(e) => { e.stopPropagation(); onChange() }}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow-sm transition-transform',
          isXs ? 'h-3 w-3' : 'h-4 w-4',
          checked ? (isXs ? 'translate-x-3.5' : 'translate-x-4.5') : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function ProjectsPage() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPath, setNewPath] = useState('')
  const [createRules, setCreateRules] = useState(true)
  const [migrateTarget, setMigrateTarget] = useState<Project | null>(null)
  const [migratePath, setMigratePath] = useState('')
  const [migrateCopy, setMigrateCopy] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [editingName, setEditingName] = useState('')

  // Settings
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([])
  const [mcpServerTools, setMcpServerTools] = useState<Record<string, Array<{ name: string; description: string }>>>({})
  const [pluginToolList, setPluginToolList] = useState<Array<{ name: string; description: string }>>([])
  const [expandedMcp, setExpandedMcp] = useState<Set<string>>(new Set())

  const refresh = useCallback(() => {
    setProjects(projectStore.getAll())
    getServers().then(setMcpServers)
    getAllTools().then(result => {
      const byServer: Record<string, Array<{ name: string; description: string }>> = {}
      for (const t of result.tools) {
        if (!byServer[t.serverId]) byServer[t.serverId] = []
        byServer[t.serverId].push({ name: t.name, description: t.description })
      }
      setMcpServerTools(byServer)
    }).catch(() => {})
    const pTools = pluginSystem.getPluginTools()
    setPluginToolList(Object.entries(pTools).map(([name, t]: [string, any]) => ({
      name,
      description: t.description || '',
    })))
  }, [])

  useEffect(() => {
    projectStore.init().then(() => {
      refresh()
    })
    return projectStore.onChange(refresh)
  }, [refresh])

  const selected = projects.find(p => p.id === selectedId)

  const handleCreate = async () => {
    if (!newName.trim()) return
    const p = await projectStore.create(newName.trim(), newDesc.trim(), newPath.trim() || undefined)
    if (p) {
      if (createRules && window.electronAPI?.fs) {
        const content = `# ${newName.trim()}\n\n${newDesc.trim() || '项目规则文件。AI 每次对话自动读取。'}`
        await window.electronAPI.fs.writeFile(`${p.path}/.stardust/rules.md`, content).catch(() => {})
      }
      setNewName(''); setNewDesc(''); setNewPath(''); setShowCreate(false)
      setSelectedId(p.id)
    }
  }

  const browseProjectPath = async () => {
    const result = await window.electronAPI?.dialog?.openDirectory()
    if (result?.success && result.path) {
      setNewPath(result.path)
    }
  }

  const browseMigratePath = async () => {
    const result = await window.electronAPI?.dialog?.openDirectory()
    if (result?.success && result.path) {
      setMigratePath(result.path)
    }
  }

  const handleMigrate = async () => {
    if (!migrateTarget || !migratePath.trim()) return
    setMigrating(true)
    const ok = await projectStore.migratePath(migrateTarget.id, migratePath.trim(), migrateCopy)
    setMigrating(false)
    if (ok) {
      setMigrateTarget(null); setMigratePath(''); setMigrateCopy(true)
      refresh()
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await projectStore.delete(deleteTarget)
    if (selectedId === deleteTarget) setSelectedId(null)
    setDeleteTarget(null)
  }

  const openInExplorer = (p: Project) => {
    window.electronAPI?.shell?.openInExplorer(p.path)
  }
  const openInTerminal = (p: Project) => {
    window.electronAPI?.shell?.openInTerminal(p.path)
  }

  return (
    <div className="flex h-full flex-col">
      {/* ====== 顶栏 — 统一日记风格 ====== */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <FolderKanban className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">项目</h2>
        <div className="flex-1" />
        {selected && (
          <p className="text-xs text-muted-foreground truncate max-w-[200px] hidden sm:block">
            {selected.name}
          </p>
        )}
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setShowCreate(true); setSelectedId(null) }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新建项目
        </Button>
      </div>

      {/* ====== 内容区：左侧列表 + 右侧详情 ====== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ====== 左侧项目列表 ====== */}
        <div className="flex w-60 shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-auto">
            {projects.length === 0 ? (
              /* 空状态 */
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
                <FolderKanban className="h-10 w-10 opacity-20" />
                <p className="text-xs">暂无项目</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  新建项目
                </Button>
              </div>
            ) : (
              /* 项目列表 — 借鉴 Timeline 风格 */
              <div className="py-1">
                {projects.map(p => {
                  const isActive = selectedId === p.id
                  return (
                    <button
                      key={p.id}
                      className={cn(
                        'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/70',
                        isActive && 'bg-accent border-r-2 border-primary',
                      )}
                      onClick={() => { setSelectedId(p.id); setShowCreate(false) }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
                        <FolderKanban className={cn(
                          'h-4 w-4 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'truncate text-sm font-medium transition-colors',
                          isActive && 'text-primary',
                        )}>
                          {p.name}
                        </p>
                        {p.description ? (
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {p.description}
                          </p>
                        ) : (
                          <p className="truncate text-xs text-muted-foreground/40 italic mt-0.5">
                            暂无描述
                          </p>
                        )}
                        <p className="truncate text-[10px] text-muted-foreground/40 font-mono mt-1">
                          {p.path.split('/').slice(-2).join('/')}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* 底部项目计数 */}
          {projects.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2">
              <p className="text-[10px] text-muted-foreground/50">
                共 {projects.length} 个项目
              </p>
            </div>
          )}
        </div>

        {/* ====== 右侧详情 / 新建表单 ====== */}
        <div className="flex-1 overflow-auto">
          {showCreate ? (
            /* ====== 新建项目表单 ====== */
            <div className="max-w-lg p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">新建项目</h3>
              </div>

              <div className="space-y-4">
                {/* 名称 */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">项目名称</Label>
                  <Input
                    className="h-9 text-sm"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="输入项目名称"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    autoFocus
                  />
                </div>

                {/* 描述 */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">项目描述（可选）</Label>
                  <Input
                    className="h-9 text-sm"
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="简要描述项目用途"
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>

                {/* 工作区目录 */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">工作区目录（可选）</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9 text-xs font-mono flex-1"
                      value={newPath}
                      onChange={e => setNewPath(e.target.value)}
                      placeholder="留空则自动创建到 ~/Stardust/projects/"
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    />
                    <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 p-0" onClick={browseProjectPath}>
                      <FolderSearch className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Rules.md 开关 */}
                <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">自动创建 rules.md</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      在项目目录下创建 .stardust/rules.md
                    </p>
                  </div>
                  <Toggle checked={createRules} onChange={() => setCreateRules(!createRules)} />
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 pt-2">
                  <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                    创建项目
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowCreate(false); setNewName(''); setNewDesc(''); setNewPath('') }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            </div>
          ) : selected ? (
            /* ====== 项目详情 ====== */
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <FolderKanban className="h-5 w-5 text-muted-foreground" />
                  </div>
                  {editingName ? (
                    <Input
                      className="h-8 w-56 text-sm font-semibold"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const t = editingName.trim()
                          if (t && t !== selected.name) projectStore.update(selected.id, { name: t })
                          setEditingName('')
                        }
                        if (e.key === 'Escape') setEditingName('')
                      }}
                      onBlur={() => setEditingName('')}
                      autoFocus
                    />
                  ) : (
                    <h3
                      className="text-base font-semibold cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setEditingName(selected.name)}
                      title="点击修改名称"
                    >
                      {selected.name}
                    </h3>
                  )}
                </div>

                {/* 描述 + 路径 */}
                <div className="ml-[3.25rem] space-y-1.5">
                  {selected.description ? (
                    <p className="text-sm text-muted-foreground">{selected.description}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/40 italic">暂无描述</p>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground/50 font-mono truncate flex-1">{selected.path}</p>
                    <button
                      className="shrink-0 text-[11px] text-muted-foreground/50 hover:text-primary transition-colors"
                      onClick={() => { setMigrateTarget(selected); setMigratePath(''); setMigrateCopy(true) }}
                    >
                      更换目录
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/40">
                    创建于 {new Date(selected.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>

                {/* 迁移面板 */}
                {migrateTarget && migrateTarget.id === selected.id && (
                  <div className="ml-[3.25rem] mt-3 rounded-lg border border-border/50 bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ArrowRight className="h-3.5 w-3.5" />
                      更换工作区目录
                    </div>
                    <div className="flex gap-2">
                      <Input
                        className="h-8 text-xs font-mono flex-1"
                        value={migratePath}
                        onChange={e => setMigratePath(e.target.value)}
                        placeholder="选择或输入新目录路径"
                      />
                      <Button size="sm" variant="outline" className="h-8 w-8 shrink-0 p-0" onClick={browseMigratePath}>
                        <FolderSearch className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs">复制现有文件到新目录</p>
                      <Toggle checked={migrateCopy} onChange={() => setMigrateCopy(!migrateCopy)} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8 text-xs" onClick={handleMigrate}
                        disabled={!migratePath.trim() || migrating}>
                        {migrating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        确认迁移
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs"
                        onClick={() => { setMigrateTarget(null); setMigratePath('') }}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 快捷操作 */}
              <div className="flex items-center gap-2 ml-[3.25rem]">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  onClick={() => openInExplorer(selected)}>
                  <ExternalLink className="h-3.5 w-3.5" /> 打开文件目录
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  onClick={() => openInTerminal(selected)}>
                  <Terminal className="h-3.5 w-3.5" /> 打开终端
                </Button>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" className="h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/5"
                  onClick={() => setDeleteTarget(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  删除项目
                </Button>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-border/50" />

              {/* 项目设置 */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">项目设置</h4>
                </div>

                <div className="space-y-5">
                  {/* MCP 服务器 */}
                  <div>
                    <Label className="text-xs font-medium mb-2 block">MCP 服务器</Label>
                    {mcpServers.length === 0 ? (
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-6 text-center">
                        <Package className="h-6 w-6 mx-auto mb-2 opacity-20" />
                        <p className="text-xs text-muted-foreground/50">暂无已配置的 MCP 服务器</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {mcpServers.map(srv => {
                          const serverEnabled = selected.settings.mcpServers.includes(srv.id)
                          const tools = mcpServerTools[srv.id] || []
                          const expanded = expandedMcp.has(srv.id)
                          return (
                            <div key={srv.id} className="rounded-lg border border-border/50 overflow-hidden transition-colors">
                              <div
                                className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 cursor-pointer transition-colors"
                                onClick={() => {
                                  const next = serverEnabled
                                    ? selected.settings.mcpServers.filter(id => id !== srv.id)
                                    : [...selected.settings.mcpServers, srv.id]
                                  projectStore.updateSettings(selected.id, { mcpServers: next })
                                }}
                              >
                                <div
                                  className="flex items-center gap-2 min-w-0 flex-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedMcp(prev => {
                                      const next = new Set(prev)
                                      if (next.has(srv.id)) next.delete(srv.id)
                                      else next.add(srv.id)
                                      return next
                                    })
                                  }}
                                >
                                  <ChevronRight className={cn(
                                    'h-3.5 w-3.5 transition-transform shrink-0 text-muted-foreground',
                                    expanded && 'rotate-90',
                                  )} />
                                  <span className="text-xs font-medium truncate">{srv.name}</span>
                                  <span className={cn(
                                    'text-[10px]',
                                    srv.enabled ? 'text-muted-foreground/50' : 'text-destructive/50',
                                  )}>
                                    {srv.enabled ? `${tools.length} 个工具` : '未启用'}
                                  </span>
                                </div>
                                <Toggle
                                  checked={serverEnabled}
                                  onChange={() => {
                                    const next = serverEnabled
                                      ? selected.settings.mcpServers.filter(id => id !== srv.id)
                                      : [...selected.settings.mcpServers, srv.id]
                                    projectStore.updateSettings(selected.id, { mcpServers: next })
                                  }}
                                />
                              </div>
                              {/* 展开的工具列表 */}
                              {expanded && srv.enabled && serverEnabled && (
                                <div className="border-t border-border/30 bg-muted/10">
                                  {tools.length === 0 ? (
                                    <p className="px-4 py-4 text-[11px] text-muted-foreground/50 text-center">暂无工具</p>
                                  ) : (
                                    tools.map(t => {
                                      const fullName = `${(srv.name).replace(/[^a-zA-Z0-9_-]/g, '_')}__${t.name}`
                                      const currentMCPTools = selected.settings.mcpTools || []
                                      const toolEnabled = currentMCPTools.length === 0 ? true
                                        : currentMCPTools[0] === '' ? false
                                        : currentMCPTools.includes(fullName)
                                      return (
                                        <div key={t.name}
                                          className="flex items-center justify-between px-4 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                                          onClick={() => {
                                            let next: string[]
                                            if (toolEnabled) {
                                              if (currentMCPTools.length === 0) {
                                                const all: string[] = []
                                                for (const tt of tools) all.push(`${(srv.name).replace(/[^a-zA-Z0-9_-]/g, '_')}__${tt.name}`)
                                                next = all.filter(n => n !== fullName)
                                                if (next.length === 0) next = ['']
                                              } else {
                                                next = currentMCPTools.filter(n => n !== fullName)
                                                if (next.length === 0) next = ['']
                                              }
                                            } else {
                                              if (currentMCPTools.length === 1 && currentMCPTools[0] === '') {
                                                next = [fullName]
                                              } else {
                                                next = [...currentMCPTools, fullName]
                                              }
                                            }
                                            projectStore.updateSettings(selected.id, { mcpTools: next })
                                          }}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <span className="font-mono text-[11px]">{t.name}</span>
                                            <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{t.description}</p>
                                          </div>
                                          <Toggle checked={toolEnabled} onChange={() => {}} size="xs" />
                                        </div>
                                      )
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* 插件工具 */}
                  <div>
                    <Label className="text-xs font-medium mb-2 block">插件工具</Label>
                    {pluginToolList.length === 0 ? (
                      <div className="rounded-lg border border-border/50 bg-muted/20 px-4 py-6 text-center">
                        <Package className="h-6 w-6 mx-auto mb-2 opacity-20" />
                        <p className="text-xs text-muted-foreground/50">暂无注册工具的插件</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {pluginToolList.map(t => {
                          const pluginTools = selected.settings.pluginTools || []
                          const enabled = pluginTools.length === 0 ? true
                            : pluginTools[0] === '' ? false
                            : pluginTools.includes(t.name)
                          return (
                            <div key={t.name}
                              className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => {
                                let next: string[]
                                if (enabled) {
                                  if (pluginTools.length === 0) {
                                    next = pluginToolList.map(p => p.name).filter(n => n !== t.name)
                                    if (next.length === 0) next = ['']
                                  } else {
                                    next = pluginTools.filter(n => n !== t.name)
                                    if (next.length === 0) next = ['']
                                  }
                                } else {
                                  if (pluginTools.length === 1 && pluginTools[0] === '') {
                                    next = [t.name]
                                  } else {
                                    next = [...pluginTools, t.name]
                                  }
                                }
                                projectStore.updateSettings(selected.id, { pluginTools: next })
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <span className="font-mono text-[11px] text-primary/70">{t.name.replace(/^plugin__[^_]+_/, '')}</span>
                                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{t.description}</p>
                              </div>
                              <Toggle checked={enabled} onChange={() => {}} size="xs" />
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* 过期插件工具引用 */}
                    {(selected.settings.pluginTools || []).filter(t => t && !pluginToolList.some(p => p.name === t)).length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-muted-foreground/40 mb-1">已卸载的插件</p>
                        {(selected.settings.pluginTools || []).filter(t => t && !pluginToolList.some(p => p.name === t)).map(stale => (
                          <div key={stale} className="flex items-center justify-between px-3 py-1.5 rounded border border-border/30 bg-muted/10">
                            <span className="text-[10px] text-muted-foreground/30 line-through truncate">
                              {stale.replace(/^plugin__[^_]+_/, '')}
                            </span>
                            <button className="text-[10px] text-destructive/50 hover:text-destructive transition-colors shrink-0 ml-2"
                              onClick={() => projectStore.updateSettings(selected.id, { pluginTools: (selected.settings.pluginTools || []).filter(t => t !== stale) })}>
                              清除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ====== 未选择项目空状态 ====== */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
                <FolderKanban className="h-8 w-8 opacity-25" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">选择左侧项目</p>
                <p className="text-xs text-muted-foreground/50 mt-1">或新建一个项目开始工作</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs mt-1"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                新建项目
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ====== 删除确认弹窗 ====== */}
      {deleteTarget && (
        <ConfirmDialog
          title="删除项目"
          description="确定要删除此项目吗？项目工作区内的文件不会被删除。"
          confirmLabel="删除"
          variant="destructive"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
