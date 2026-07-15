import { useState, useEffect } from 'react'
import { Loader2, FileText, List, Code, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { loadSkillFile } from '@/lib/skillStore'
import type { InstalledSkill } from '@/types/skill'

interface SkillDetailDialogProps {
  skill: InstalledSkill | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TabId = 'files' | 'sections' | 'code'

export function SkillDetailDialog({ skill, open, onOpenChange }: SkillDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('files')
  const [selectedFile, setSelectedFile] = useState('SKILL.md')
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileExpanded, setFileExpanded] = useState(true)

  useEffect(() => {
    if (!skill || !open) return
    const defaultFile = skill.fileList.includes('SKILL.md') ? 'SKILL.md' : skill.fileList[0]
    setSelectedFile(defaultFile || '')
    setActiveTab('files')
    setFileExpanded(true)
  }, [skill, open])

  useEffect(() => {
    if (!skill || !selectedFile || !open || activeTab !== 'files') {
      setFileContent(null)
      return
    }
    setLoading(true)
    setFileExpanded(true)
    loadSkillFile(skill.id, selectedFile)
      .then(content => setFileContent(content))
      .catch(() => setFileContent(null))
      .finally(() => setLoading(false))
  }, [skill, selectedFile, open, activeTab])

  if (!skill) return null

  const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
    { id: 'files', label: '文件预览', icon: FileText },
    { id: 'sections', label: '段落索引', icon: List },
    { id: 'code', label: '代码块', icon: Code },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {skill.name}
            <span className="text-xs font-normal text-muted-foreground">
              {skill.fileCount} 个文件
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 标签栏 */}
        <div className="flex gap-1 border-b border-border pb-2">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* 文件预览 */}
        {activeTab === 'files' && (
          <div className="flex-1 flex gap-3 min-h-0">
            {/* 文件列表 */}
            <div className="w-48 shrink-0 overflow-auto border-r border-border pr-2">
              {skill.fileList.map(f => (
                <button
                  key={f}
                  className={`block w-full text-left px-2 py-1 rounded text-xs font-mono truncate transition-colors ${
                    selectedFile === f
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  onClick={() => setSelectedFile(f)}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* 文件内容 */}
            <div className="flex-1 overflow-auto min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : fileContent != null ? (
                <div>
                  {fileContent.length > 300 ? (
                    <>
                      {fileExpanded && (
                        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words p-2 bg-muted/30 rounded">
                          {fileContent}
                        </pre>
                      )}
                      <button
                        className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        onClick={() => setFileExpanded(!fileExpanded)}
                      >
                        <ChevronDown className={`h-3 w-3 transition-transform ${fileExpanded ? 'rotate-180' : ''}`} />
                        {fileExpanded ? '收起' : `展开全部（${(fileContent.length / 1000).toFixed(1)}k 字符）`}
                      </button>
                    </>
                  ) : (
                    <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words p-2 bg-muted/30 rounded">
                      {fileContent}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground p-4">无法读取文件内容</p>
              )}
            </div>
          </div>
        )}

        {/* 段落索引 */}
        {activeTab === 'sections' && (
          <div className="flex-1 overflow-auto min-h-0">
            {skill.sections.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">无段落索引</p>
            ) : (
              <div className="space-y-1 p-1">
                {skill.sections.map((sec, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/50"
                  >
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      L{sec.startLine}-{sec.endLine}
                    </span>
                    <span
                      className="font-medium"
                      style={{ paddingLeft: `${(sec.level - 1) * 12}px` }}
                    >
                      {'#'.repeat(sec.level)} {sec.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 代码块 */}
        {activeTab === 'code' && (
          <div className="flex-1 overflow-auto min-h-0">
            {skill.codeBlocks.length === 0 ? (
              <p className="text-xs text-muted-foreground p-4">无代码块</p>
            ) : (
              <div className="space-y-3 p-1">
                {skill.codeBlocks.map((block, i) => (
                  <div key={i} className="rounded border border-border">
                    <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b border-border">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        L{block.startLine}-{block.endLine}
                      </span>
                      {block.language && (
                        <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-0.5 font-mono">
                          {block.language}
                        </span>
                      )}
                    </div>
                    <pre className="text-[11px] font-mono text-muted-foreground p-2 whitespace-pre-wrap break-words overflow-auto max-h-60">
                      {block.code}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
