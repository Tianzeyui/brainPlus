/**
 * web_fetch 工具：网页抓取 + 智能摘要 + 分页
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim()
}

async function summarize(text: string): Promise<string> {
  try {
    const { delegateToModel } = await import('../chatService')
    const { result } = await delegateToModel('fast',
      `Summarize the following content concisely. Extract key facts, data, and conclusions. Under 500 chars. Content:\n\n${text.slice(0, 8000)}`,
      'You are a content summarizer. Be concise and factual.'
    )
    return result || text.slice(0, 3000)
  } catch { return text.slice(0, 3000) }
}

export function registerWebFetchTool(tools: ToolMap) {
  tools['web_fetch'] = {
    description: 'Fetch a web page. Returns plain text with pagination (offset+length). Set summarize=true to compress long pages into key points via fast model. Default length=3000, max 10000.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Web page URL' },
        offset: { type: 'number', description: 'Start char position (0-based), default 0' },
        length: { type: 'number', description: 'Chars to read, default 3000, max 10000' },
        summarize: { type: 'boolean', description: 'Summarize via fast model (saves tokens on long pages)' },
      },
      required: ['url'],
    }),
    execute: async ({ url, offset, length, summarize: doSummarize }: { url: string; offset?: number; length?: number; summarize?: boolean }) => {
      const api = (window as any).electronAPI?.http
      if (!api) return 'HTTP API unavailable (desktop only)'
      try {
        const result = await api.fetch(url, { timeout: 15000 })
        if (!result.success) return `Fetch failed: ${result.error}`
        const text = stripHtml(result.data || '')
        // 检测 JS 墙
        if (text.length < 200 && /JavaScript|javascript|enable.*js|cookie|Cloudflare/i.test(text)) {
          return ` This page requires JavaScript (${text.length} chars captured). Try searching for the same info on a different site, or use textise.iitty.com as a proxy.`
        }

        if (doSummarize) {
          const s = await summarize(text)
          return `[Summary of ${url} (${text.length} chars compressed)]\n${s}`
        }

        const total = text.length
        const off = Math.max(0, offset || 0)
        const len = Math.min(length || 3000, 10000)
        const slice = text.slice(off, off + len)
        if (off + len >= total) {
          return slice + `\n\n--- ${total} chars total (end) ---`
        }
        return slice + `\n\n--- Chars ${off + 1}-${off + len} of ${total} --- offset=${off + len} for next`
      } catch (e: any) { return `Fetch error: ${e.message}` }
    },
  }
}
