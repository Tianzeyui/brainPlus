/**
 * web_search 统一工具：多引擎 fallback 搜索
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'

interface SearchResult {
  title: string; url: string; snippet: string
}

async function searchDDG(query: string): Promise<SearchResult[]> {
  const api = (window as any).electronAPI?.search
  if (!api?.duckduckgo) return []
  const r = await api.duckduckgo(query)
  if (r.success && r.data) return r.data.slice(0, 10) as SearchResult[]
  return []
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const api = (window as any).electronAPI?.search
  if (!api?.bing) return []
  const r = await api.bing(query, 10)
  if (r.success && r.data) return r.data.slice(0, 10) as SearchResult[]
  return []
}

async function searchGoogle(query: string): Promise<SearchResult[]> {
  const { getGoogleApiKey, getGoogleCx } = await import('@/lib/config')
  const key = getGoogleApiKey(); const cx = getGoogleCx()
  if (!key || !cx) return []
  const api = (window as any).electronAPI?.search
  if (!api?.google) return []
  const r = await api.google(query, key, cx)
  return r.success && r.data ? r.data as SearchResult[] : []
}

async function searchBrave(query: string): Promise<SearchResult[]> {
  const { getBraveApiKey } = await import('@/lib/config')
  const key = getBraveApiKey()
  if (!key) return []
  const api = (window as any).electronAPI?.search
  if (!api?.brave) return []
  const r = await api.brave(query, key)
  return r.success && r.data ? r.data as SearchResult[] : []
}

async function searchAll(query: string): Promise<SearchResult[]> {
  // 优先级：Google → Brave → Bing → DDG
  for (const fn of [searchGoogle, searchBrave, searchBing, searchDDG]) {
    const r = await fn(query)
    if (r.length > 0) return r
  }
  return []
}

export function registerWebSearchTool(tools: ToolMap) {
  tools['web_search'] = {
    description: 'Search the web (Google→Brave→Bing→DDG fallback). Set fetch=true to auto-fetch and summarize top results. Returns title, URL and snippet.',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: 'Max results, default from settings (usually 5)' },
        fetch: { type: 'boolean', description: 'Auto-fetch and summarize top 3 results (saves manual web_fetch calls)' },
      },
      required: ['query'],
    }),
    execute: async ({ query, count, fetch: doFetch }: { query: string; count?: number; fetch?: boolean }) => {
      const { getSearchCount } = await import('@/lib/config')
      const results = await searchAll(query)
      if (results.length === 0) return 'No results found. Try a different query.'
      const max = Math.min(count || getSearchCount(), results.length)
      const list = results.slice(0, max).map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')

      if (!doFetch) return list

      // Auto-fetch top 3
      const top3 = results.slice(0, 3)
      let summaries = ''
      for (const r of top3) {
        try {
          const api = (window as any).electronAPI?.http
          const res = api ? await api.fetch(r.url, { timeout: 10000 }) : null
          if (res?.success) {
            const text = (res.data || '').replace(/<[^>]+>/g, '').slice(0, 3000)
            const { delegateToModel } = await import('../chatService')
            const { result: sum } = await delegateToModel('fast',
              `Summarize this page in 2-3 sentences focusing on the query "${query}":\n\n${text}`,
              'Be concise. Return only the summary.'
            )
            summaries += `\n\n ${r.title}: ${sum || text.slice(0, 200) + '...'}`
          }
        } catch { summaries += `\n\n ${r.title}: (fetch failed)` }
      }
      return list + `\n\n--- Auto-summaries ---${summaries}`
    },
  }
}
