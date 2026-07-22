/**
 * Skill 工具：read_skill（按需读取技能文档，支持 section/lines/file）
 */
import { jsonSchema } from '../api'
import { getInstalledSkills } from '../skillService'
import type { SectionIndex } from '@/types/skill'
import type { ToolMap } from './registry'

export function registerSkillTools(tools: ToolMap) {
  const allSkills = getInstalledSkills()
  console.log('[registerSkillTools] installed skills:', allSkills.length, allSkills.map(s => s.name))
  if (allSkills.length === 0) return

  // 轻量索引
  const skillIndex: Record<string, { id: string; fileList: string[]; sections: SectionIndex[] }> = {}
  for (const s of allSkills) {
    skillIndex[s.name] = { id: s.id, fileList: s.fileList, sections: s.sections }
  }

  // LRU 缓存
  const fileCache = new Map<string, string>()
  const MAX_CACHE_SIZE = 30

  async function loadContent(skillId: string, filePath: string): Promise<string | null> {
    const cacheKey = `${skillId}::${filePath}`
    if (fileCache.has(cacheKey)) return fileCache.get(cacheKey)!
    if (window.electronAPI?.skills) {
      const result = await window.electronAPI.skills.readFile(skillId, filePath)
      if (result.success && result.content != null) {
        if (fileCache.size >= MAX_CACHE_SIZE) {
          const firstKey = fileCache.keys().next().value
          if (firstKey) fileCache.delete(firstKey)
        }
        fileCache.set(cacheKey, result.content)
        return result.content
      }
    }
    return null
  }

  tools['read_skill'] = {
    description: 'Read skill file. section=jump to heading (using index), lines=line range. file defaults to SKILL.md.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        file: { type: 'string', description: 'File path, e.g. "pptxgenjs.md", "scripts/add_slide.py". Default: SKILL.md' },
        section: { type: 'string', description: 'Section heading (use index from system prompt), e.g. "Quick Reference", "Scripts"' },
        lines: { type: 'string', description: 'Line range "1-50", "100-end". Returns full text if neither section nor lines given' },
      },
      required: ['name'],
    }),
    execute: async ({ name, file, section, lines }: {
      name: string; file?: string; section?: string; lines?: string
    }) => {
      const skill = skillIndex[name]
      if (!skill) return `未找到技能 "${name}"。可用: ${Object.keys(skillIndex).join(', ')}`

      const filePath = file || 'SKILL.md'
      if (!skill.fileList.includes(filePath)) {
        return `未找到文件 "${filePath}"。可用文件: ${skill.fileList.join(', ')}`
      }

      const content = await loadContent(skill.id, filePath)
      if (!content) return `无法读取文件 "${filePath}"（磁盘读取失败）`

      const allLines = content.split('\n')

      const buildDocMap = (readStart: number, readEnd: number) => {
        const pct = Math.round((readEnd - readStart + 1) / allLines.length * 100)
        const sectionsHint = skill.sections.length > 0
          ? skill.sections
              .filter(s => s.startLine > readEnd || s.endLine < readStart)
              .map(s => `  ${s.title} (L${s.startLine}-${s.endLine}, ${s.endLine - s.startLine + 1}行)`)
              .join('\n')
          : ''
        const nextHint = skill.sections.length > 0
          ? `用 read_skill("${name}", "${filePath}", {lines: "${Math.max(readEnd + 1, 1)}-${allLines.length}"}) 继续读取剩余内容。`
          : ''
        return `\n\n---\n ${filePath}: ${allLines.length}行，已读 ${readEnd - readStart + 1}行 (${pct}%)\n${sectionsHint ? '其他段落:\n' + sectionsHint + '\n' : ''}${nextHint}`
      }

      if (section) {
        const lowerSection = section.toLowerCase()
        const sec = skill.sections.find(s => s.title.toLowerCase() === lowerSection)
          ?? skill.sections.find(s => s.title.toLowerCase().includes(lowerSection))
        if (sec) {
          const slice = allLines.slice(sec.startLine - 1, sec.endLine)
          const docMap = buildDocMap(sec.startLine, sec.endLine)
          return `## ${sec.title} (L${sec.startLine}-${sec.endLine})\n\`\`\`\n${slice.join('\n')}\n\`\`\`${docMap}`
        }
        return `未找到段落 "${section}"。可用段落: ${skill.sections.map(s => `${s.title}(L${s.startLine}-${s.endLine})`).join(', ')}`
      }

      if (lines) {
        const match = lines.match(/^(\d+)(-(\d+|end))?$/i)
        if (!match) return `行格式错误: "${lines}"。例: "1-50"、"100-end"`
        const start = Math.max(1, parseInt(match[1])) - 1
        const end = !match[2] ? start + 1 : match[3]?.toLowerCase() === 'end' ? allLines.length : parseInt(match[3])
        const docMap = buildDocMap(start + 1, Math.min(end, allLines.length))
        return allLines.slice(start, end).join('\n') + docMap
      }

      return content
    },
  }
}
