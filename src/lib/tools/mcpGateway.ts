/**
 * MCP 网关工具：资源/提示发现与读取
 */
import { jsonSchema } from '../api'
import type { ToolMap } from './registry'

export function registerMCPGatewayTools(tools: ToolMap) {
  // 列出所有已启用服务器的资源
  tools['mcp_list_resources'] = {
    description: '列出所有已启用 MCP 服务器提供的资源。返回每个资源的 URI、名称、MIME 类型和所属服务器。',
    inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => {
      const { getAllResources } = await import('../mcpClient')
      const result = await getAllResources()
      if (result.resources.length === 0) return '当前没有可用的 MCP 资源'
      return result.resources.map((r: any) =>
        `[${r.serverName}] ${r.name || r.uri} (${r.mimeType || 'unknown'})\n  URI: ${r.uri}${r.description ? '\n  描述: ' + r.description : ''}`
      ).join('\n\n')
    },
  }

  // 读取指定资源
  tools['mcp_read_resource'] = {
    description: '读取 MCP 服务器上的一个资源。serverId 和 uri 可从 mcp_list_resources 获取。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '资源所属的服务器 ID' },
        uri: { type: 'string', description: '资源的 URI' },
      },
      required: ['serverId', 'uri'],
    }),
    execute: async ({ serverId, uri }: { serverId: string; uri: string }) => {
      const { readResource } = await import('../mcpClient')
      const result = await readResource(serverId, uri)
      return result.success ? JSON.stringify(result.content) : `Error: ${result.error}`
    },
  }

  // 列出所有已启用服务器的提示
  tools['mcp_list_prompts'] = {
    description: '列出所有已启用 MCP 服务器提供的提示模板。',
    inputSchema: jsonSchema({ type: 'object', properties: {}, additionalProperties: false }),
    execute: async () => {
      const { getAllPrompts } = await import('../mcpClient')
      const result = await getAllPrompts()
      if (result.prompts.length === 0) return '当前没有可用的 MCP 提示模板'
      return result.prompts.map((p: any) =>
        `[${p.serverName}] ${p.name}${p.description ? '\n  描述: ' + p.description : ''}${p.arguments?.length ? '\n  参数: ' + p.arguments.map((a: any) => `${a.name}${a.required ? '*' : ''}`).join(', ') : ''}`
      ).join('\n\n')
    },
  }

  // 执行指定提示
  tools['mcp_get_prompt'] = {
    description: '执行 MCP 服务器上的一个提示模板。serverId 和 promptName 可从 mcp_list_prompts 获取。',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        serverId: { type: 'string', description: '提示所属的服务器 ID' },
        promptName: { type: 'string', description: '提示的名称' },
        args: { type: 'object', description: '提示所需的参数（可选）' },
      },
      required: ['serverId', 'promptName'],
    }),
    execute: async ({ serverId, promptName, args }: { serverId: string; promptName: string; args?: any }) => {
      const { getPrompt } = await import('../mcpClient')
      const result = await getPrompt(serverId, promptName, args || {})
      if (!result?.success) return `获取 prompt 失败: ${result?.error || '未知错误'}`
      return JSON.stringify(result)
    },
  }
}
