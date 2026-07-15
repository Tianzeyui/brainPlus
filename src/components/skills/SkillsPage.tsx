import { useState, useEffect, useCallback } from 'react'
import {
  Plus, FolderSearch, Loader2, BookOpen, Globe, ExternalLink,
  Trash2, Package, ChevronDown, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  validateInstallPath,
} from '@/lib/skillService'
import { toast } from '@/hooks/useToast'
import { SkillDetailDialog } from './SkillDetailDialog'
import type { InstalledSkill } from '@/types/skill'
import { cn } from '@/lib/utils'

export function SkillsPage() {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [installPath, setInstallPath] = useState('')
  const [installing, setInstalling] = useState(false)
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | null>(null)
  const [gitUrl, setGitUrl] = useState('')
  const [gitInstalling, setGitInstalling] = useState(false)
  const [showInstallPanel, setShowInstallPanel] = useState(false)

  useEffect(() => {
    setSkills(getInstalledSkills())
  }, [])

  const selected = skills.find(s => s.id === selectedId)

  // 原生文件夹选择器
  const handleBrowse = useCallback(async () => {
    if (!window.electronAPI?.dialog) {
      toast({ title: '文件选择器不可用', description: '请在桌面应用中操作', variant: 'destructive' })
      return
    }
    const result = await window.electronAPI.dialog.openDirectory()
    if (result.success && result.path) {
      setInstallPath(result.path)
    }
  }, [])

  // 安装
  const handleInstall = useCallback(async () => {
    const path = installPath.trim()
    if (!path) return

    setInstalling(true)
    try {
      const validation = await validateInstallPath(path)
      if (validation.errors.length > 0) {
        toast({
          title: '安装验证失败',
          description: validation.errors.join('；'),
          variant: 'destructive',
        })
        return
      }

      const skill = await installSkill(path)
      setSkills(prev => [...prev, skill])
      setInstallPath('')
      setSelectedId(skill.id)
      toast({
        title: `「${skill.name}」安装成功`,
        description: `${skill.fileCount} 个文件已就绪`,
      })
    } catch (e: any) {
      toast({
        title: '安装失败',
        description: e.message || '未知错误',
        variant: 'destructive',
      })
    } finally {
      setInstalling(false)
    }
  }, [installPath])

  // 从 GitHub URL 安装
  const handleGitInstall = useCallback(async () => {
    const url = gitUrl.trim()
    if (!url) return
    setGitInstalling(true)
    const api = (window as any).electronAPI?.skills
    let tempDir: string | undefined
    try {
      if (!api) throw new Error('仅 Electron 环境支持')
      const cloneResult = await api.cloneFromUrl(url)
      if (!cloneResult.success) throw new Error(cloneResult.error)
      tempDir = cloneResult.tempDir
      const validation = await validateInstallPath(cloneResult.localPath)
      if (validation.errors.length > 0) throw new Error(validation.errors.join('；'))
      const skill = await installSkill(cloneResult.localPath)
      setSkills(prev => [...prev, skill])
      setGitUrl('')
      setSelectedId(skill.id)
      toast({ title: `「${skill.name}」安装成功`, description: `来自 ${url}` })
    } catch (e: any) {
      toast({ title: 'GitHub 安装失败', description: e.message || '未知错误', variant: 'destructive' })
    } finally {
      if (tempDir) api?.cleanupTemp(tempDir).catch(() => {})
      setGitInstalling(false)
    }
  }, [gitUrl])

  // 卸载
  const handleUninstall = useCallback(async (id: string) => {
    const skill = skills.find(s => s.id === id)
    if (!skill) return

    if (!confirm(`确定卸载「${skill.name}」？此操作将删除所有相关文件。`)) return

    try {
      await uninstallSkill(id)
      setSkills(prev => prev.filter(s => s.id !== id))
      if (selectedId === id) setSelectedId(null)
      toast({ title: `「${skill.name}」已卸载` })
    } catch (e: any) {
      toast({
        title: '卸载失败',
        description: e.message || '未知错误',
        variant: 'destructive',
      })
    }
  }, [skills, selectedId])

  return (
    <div className="flex h-full flex-col">
      {/* ====== 顶栏 — 统一日记风格 ====== */}
      <div className="flex h-11 items-center gap-2 border-b border-border px-4">
        <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <h2 className="text-sm font-semibold">Skills</h2>
        <span className="text-[10px] text-muted-foreground/50 ml-0.5">
          {skills.length} 个已安装
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setShowInstallPanel(true); setSelectedId(null) }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          安装 Skill
        </Button>
      </div>

      {/* ====== 内容区：左侧列表 + 右侧详情 ====== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ====== 左侧 Skill 列表 ====== */}
        <div className="flex w-60 shrink-0 flex-col border-r border-border">
          <div className="flex-1 overflow-auto">
            {skills.length === 0 ? (
              /* 空状态 */
              <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30">
                  <BookOpen className="h-6 w-6 opacity-25" />
                </div>
                <p className="text-xs">暂无已安装的 Skill</p>
                <p className="text-[10px] text-muted-foreground/50 text-center">
                  从本地目录或 GitHub 安装
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowInstallPanel(true)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  安装 Skill
                </Button>
              </div>
            ) : (
              /* Skill 列表 — 借鉴 Timeline 风格 */
              <div className="py-1">
                {skills.map(skill => {
                  const isActive = selectedId === skill.id
                  return (
                    <button
                      key={skill.id}
                      className={cn(
                        'group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/70',
                        isActive && 'bg-accent border-r-2 border-primary',
                      )}
                      onClick={() => { setSelectedId(skill.id); setShowInstallPanel(false) }}
                    >
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive ? 'bg-primary/10' : 'bg-muted/50 group-hover:bg-muted',
                      )}>
                        <Package className={cn(
                          'h-4 w-4 transition-colors',
                          isActive ? 'text-primary' : 'text-muted-foreground',
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className={cn(
                            'truncate text-sm font-medium transition-colors',
                            isActive && 'text-primary',
                          )}>
                            {skill.name}
                          </p>
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {skill.description || '暂无描述'}
                        </p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">
                          {skill.fileCount} 个文件
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* 底部计数 */}
          {skills.length > 0 && (
            <div className="border-t border-border/50 px-4 py-2">
              <p className="text-[10px] text-muted-foreground/50">
                共 {skills.length} 个 Skill
              </p>
            </div>
          )}
        </div>

        {/* ====== 右侧详情 / 安装面板 ====== */}
        <div className="flex-1 overflow-auto">
          {showInstallPanel ? (
            /* ====== 安装面板 ====== */
            <div className="max-w-xl p-6 space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">安装 Skill</h3>
              </div>

              {/* 本地目录安装 */}
              <div className="rounded-lg border border-border/50 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <FolderSearch className="h-3.5 w-3.5 text-muted-foreground" />
                  <h4 className="text-xs font-medium">本地目录安装</h4>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 h-8 font-mono text-xs"
                    placeholder="选择包含 SKILL.md 的目录..."
                    value={installPath}
                    onChange={e => setInstallPath(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleInstall()}
                  />
                  <Button size="sm" variant="outline" className="h-8 w-8 shrink-0 p-0" onClick={handleBrowse}>
                    <FolderSearch className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground/50">
                    选择包含 SKILL.md 的本地目录进行安装
                  </p>
                  <Button size="sm" className="h-7 text-xs" onClick={handleInstall} disabled={installing || !installPath.trim()}>
                    {installing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    安装
                  </Button>
                </div>
              </div>

              {/* GitHub 安装 */}
              <div className="rounded-lg border border-border/50 p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <h4 className="text-xs font-medium">从 GitHub 安装</h4>
                </div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 h-8 font-mono text-xs"
                    placeholder="https://github.com/user/repo"
                    value={gitUrl}
                    onChange={e => setGitUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGitInstall()}
                  />
                  <Button size="sm" className="h-8 text-xs shrink-0" onClick={handleGitInstall} disabled={gitInstalling || !gitUrl.trim()}>
                    {gitInstalling ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    安装
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50">
                  支持仓库根目录或子目录（/tree/branch/path），需安装 Git
                </p>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => { setShowInstallPanel(false); setInstallPath(''); setGitUrl('') }}
              >
                取消
              </Button>
            </div>
          ) : selected ? (
            /* ====== Skill 详情 ====== */
            <div className="p-6 space-y-5">
              {/* 头部 */}
              <div className="flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold">{selected.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {selected.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 基本信息 */}
              <div className="ml-[3.25rem] grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums">{selected.fileCount}</p>
                  <p className="text-[10px] text-muted-foreground/50">文件数</p>
                </div>
                <div className="rounded-lg border border-border/50 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums">{selected.sections.length}</p>
                  <p className="text-[10px] text-muted-foreground/50">段落</p>
                </div>
                <div className="rounded-lg border border-border/50 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold tabular-nums">{selected.codeBlocks.length}</p>
                  <p className="text-[10px] text-muted-foreground/50">代码块</p>
                </div>
              </div>

              {/* 安装路径 */}
              <div className="ml-[3.25rem]">
                <p className="text-[11px] text-muted-foreground/50 font-mono truncate">
                  {selected.path}
                </p>
              </div>

              {/* 依赖 */}
              {(selected.deps.pip.length > 0 || selected.deps.npm.length > 0) && (
                <div className="ml-[3.25rem] space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">依赖</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.deps.pip.map(pkg => (
                      <span key={`pip-${pkg}`} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground font-mono">
                        pip: {pkg}
                      </span>
                    ))}
                    {selected.deps.npm.map(pkg => (
                      <span key={`npm-${pkg}`} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground font-mono">
                        npm: {pkg}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="ml-[3.25rem] flex items-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  onClick={() => setDetailSkill(selected)}>
                  <ExternalLink className="h-3.5 w-3.5" /> 查看详情
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-destructive/60 hover:text-destructive hover:bg-destructive/5 text-xs"
                  onClick={() => handleUninstall(selected.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  卸载
                </Button>
              </div>
            </div>
          ) : (
            /* ====== 未选择 Skill 空状态 ====== */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
                <BookOpen className="h-8 w-8 opacity-25" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">选择左侧 Skill</p>
                <p className="text-xs text-muted-foreground/50 mt-1">或安装新的 Skill</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs mt-1"
                onClick={() => setShowInstallPanel(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                安装 Skill
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ====== 详情弹窗 ====== */}
      <SkillDetailDialog
        skill={detailSkill}
        open={detailSkill !== null}
        onOpenChange={(open) => { if (!open) setDetailSkill(null) }}
      />
    </div>
  )
}
