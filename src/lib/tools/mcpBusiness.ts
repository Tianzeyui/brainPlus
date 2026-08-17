/**
 * MCP 业务工具：从已启用 MCP 服务器动态注册
 */
import { jsonSchema } from '../api'
import { getAllTools } from '../mcpClient'
import type { ToolMap } from './registry'

export async function registerMCPBusinessTools(tools: ToolMap): Promise<number> {
  const { tools: mcpTools } = await getAllTools()
  let count = 0

  for (const t of mcpTools) {
    const safeName = (t.serverName + '__' + t.name).replace(/[^a-zA-Z0-9_-]/g, '_')
    const hasValidSchema = t.inputSchema && typeof (t.inputSchema as any) === 'object'
      && Object.keys(t.inputSchema as any).length > 0
    const schema = hasValidSchema
      ? t.inputSchema
      : { type: 'object', properties: {}, additionalProperties: true }
    if (!hasValidSchema) {
      console.warn(`[MCP] tool "${safeName}" has empty/invalid inputSchema, using fallback.`)
    }

    tools[safeName] = {
      description: t.description || `MCP tool: ${t.name} (${t.serverName})`,
      inputSchema: jsonSchema(schema as any),
      _rawSchema: schema,
      execute: async (args: any) => {
        const { callTool } = await import('../mcpClient')
        const result = await callTool(t.serverId, t.name, args)
        if (!result.success) return `Error: ${result.error}`
        const content = result.content || []
        const parts = content.map((c: any) => {
          if (c.type === 'text') return c.text || ''
          if (c.type === 'image') return `[Image: ${c.data?.slice(0, 50) || '...'}]`
          return JSON.stringify(c)
        })
        return parts.filter(Boolean).join('\n') || '(empty)'
      },
    }
    count++
  }

  return count
}
