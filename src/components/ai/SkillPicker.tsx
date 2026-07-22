import { useState, useEffect, useCallback } from 'react'
import { Package } from 'lucide-react'
import { getInstalledSkills } from '@/lib/skillService'
import type { InstalledSkill } from '@/types/skill'

export function SkillPicker() {
  const [show, setShow] = useState(false)
  const [skills, setSkills] = useState<InstalledSkill[]>([])

  const load = useCallback(() => {
    setSkills(getInstalledSkills())
  }, [])

  useEffect(() => { if (show) load() }, [show, load])
  useEffect(() => { load() }, [load])

  return (
    <div className="relative shrink-0">
      <button
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${skills.length > 0 ? 'text-primary/70 hover:text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        onClick={() => setShow(!show)}
        title="技能"
      >
        <Package className="h-3 w-3" />
        <span>技能{skills.length > 0 ? ` ${skills.length}` : ''}</span>
      </button>

      {show && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShow(false)} />
          <div className="absolute left-0 bottom-full z-50 mb-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium">已安装技能</span>
              <span className="text-[10px] text-muted-foreground/50">{skills.length} 个</span>
            </div>
            <div className="max-h-64 overflow-auto p-1">
              {skills.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                  暂无已安装的 Skill
                </p>
              ) : (
                skills.map(s => (
                  <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 line-clamp-2">{s.description}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
