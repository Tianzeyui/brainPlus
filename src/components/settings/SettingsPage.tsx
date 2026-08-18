import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Cpu, Server, Trash2, Plus, RefreshCw, Check, Wrench, FolderOpen, MessageSquare, Play, ChevronDown, Loader2, X, ArrowLeft, Info, Bot, Zap, Search, Code, Pencil } from 'lucide-react'
// import { APP_VERSION } from '@/lib/version'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GeneralTab } from './tabs/GeneralTab'
import { CapabilitiesTab } from './tabs/CapabilitiesTab'
import { AgentTab } from './tabs/AgentTab'

import { AboutTab } from './tabs/AboutTab'
import {
  getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig,
} from '@/lib/supabase'
import {
  getCloudinaryConfig, saveCloudinaryConfig, clearCloudinaryConfig,
  getAIModels, saveAIModels, deleteAIModel, generateModelId, PROVIDER_TEMPLATES,
  type AIModelConfig, type MCPServerConfig,
  getDisclosureThreshold, saveDisclosureThreshold,
  getModelTier, setModelTier,
  getAgentMaxSteps, saveAgentMaxSteps,
  getCompressThreshold, saveCompressThreshold, getTokenLimit, saveTokenLimit,
  getJSSandboxEnabled, saveJSSandboxEnabled,
  getPythonSandboxEnabled, savePythonSandboxEnabled,
  getDuckDuckGoEnabled, saveDuckDuckGoEnabled,
  getDDGResultCount, saveDDGResultCount,
  getDDGTimeout, saveDDGTimeout,
  getBingEnabled, saveBingEnabled,
  getBingResultCount, saveBingResultCount,
  getBingTimeout, saveBingTimeout,
} from '@/lib/config'
import { listTools, listResources, listPrompts, callTool, readResource, getPrompt, connect, disconnect, addServer as addMcpServer, updateServer as updateMcpServer, removeServer as removeMcpServer } from '@/lib/mcpClient'
import type { MCPTool, MCPResource, MCPPrompt } from '@/types/electron'
import { useAuth } from '@/contexts/AuthContext'

function NumberField({ label, value, setValue, min, max, unit }: {
  label: string; value: number; setValue: (n: number) => void; min: number; max: number; unit: string
}) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-1 mt-0.5">
        <Button variant="outline" size="icon" className="h-7 w-7"
          onClick={() => setValue(Math.max(min, value - 1))} disabled={value <= min}>−</Button>
        <Input type="number" min={min} max={max} value={value}
          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= min && v <= max) setValue(v) }}
          className="h-8 w-14 text-center text-sm" />
        <Button variant="outline" size="icon" className="h-7 w-7"
          onClick={() => setValue(Math.min(max, value + 1))} disabled={value >= max}>+</Button>
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  )
}

type Tab = 'general' | 'ai' | 'mcp' | 'capabilities' | 'agent' | 'about'

export function SettingsPage({ onClose, initialTab }: { onClose?: () => void; initialTab?: Tab }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(initialTab || 'general')
  const [saved, setSaved] = useState(false)

  // 通用
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [cloudName, setCloudName] = useState('')
  const [uploadPreset, setUploadPreset] = useState('')

  // AI 模型
  const [models, setModels] = useState<AIModelConfig[]>([])
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [showAddModel, setShowAddModel] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [newModel, setNewModel] = useState({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' })

  // MCP
  const [servers, setServers] = useState<MCPServerConfig[]>([])
  const [expandedSrv, setExpandedSrv] = useState<string | null>(null)
  const [srvDetailTab, setSrvDetailTab] = useState<'tools' | 'resources' | 'prompts'>('tools')
  const [srvTools, setSrvTools] = useState<MCPTool[]>([])
  const [srvResources, setSrvResources] = useState<MCPResource[]>([])
  const [srvPrompts, setSrvPrompts] = useState<MCPPrompt[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [callModal, setCallModal] = useState<{ type: 'tool' | 'resource' | 'prompt'; target: any } | null>(null)
  const [callArgs, setCallArgs] = useState('{}')
  const [callResult, setCallResult] = useState<string | null>(null)
  const [callLoading, setCallLoading] = useState(false)
  const [disclosureThreshold, setDisclosureThreshold] = useState(getDisclosureThreshold)
  const [maxSteps, setMaxSteps] = useState(getAgentMaxSteps)
  const [compressThreshold, setCompressThreshold] = useState(getCompressThreshold)
  const [tokenLimit, setTokenLimit] = useState(getTokenLimit)
  const [sandboxJS, setSandboxJS] = useState(getJSSandboxEnabled)
  const [sandboxPython, setSandboxPython] = useState(getPythonSandboxEnabled)
  const [ddgEnabled, setDdgEnabled] = useState(getDuckDuckGoEnabled)
  const [ddgResultCount, setDdgResultCount] = useState(getDDGResultCount)
  const [ddgTimeout, setDdgTimeout] = useState(getDDGTimeout)
  const [bingEnabled, setBingEnabledState] = useState(getBingEnabled)
  const [bingResultCount, setBingResultCount] = useState(getBingResultCount)
  const [bingTimeout, setBingTimeout] = useState(getBingTimeout)

  // 图数据库
  const [graphUri, setGraphUri] = useState('')
  const [graphUser, setGraphUser] = useState('')
  const [graphPass, setGraphPass] = useState('')
  const [graphSaved, setGraphSaved] = useState(false)
  const [graphTesting, setGraphTesting] = useState(false)
  const [graphTestMsg, setGraphTestMsg] = useState('')
  const [capExpanded, setCapExpanded] = useState<Record<string, boolean>>({ sandbox: true, search: true })

  // 更新日志已迁移至 AboutTab（数据源 docs/releases/），此处旧逻辑已移除

  useEffect(() => {
    // 通用
    const sc = getSupabaseConfig()
    if (sc) { setSupabaseUrl(sc.url); setSupabaseKey(sc.anonKey) }
    const cc = getCloudinaryConfig()
    setCloudName(cc.cloudName)
    setUploadPreset(cc.uploadPreset)
    // AI
    setModels(getAIModels())
    // MCP 服务器：从 Electron 主进程加载
    if (window.electronAPI?.mcp) {
      window.electronAPI.mcp.getServers().then(s => setServers(s as MCPServerConfig[])).catch(() => {})
    }
    // 图数据库配置
    if ((window as any).electronAPI?.graph) {
      ;(window as any).electronAPI.graph.getConfig().then((cfg: any) => {
        if (cfg) { setGraphUri(cfg.uri || ''); setGraphUser(cfg.username || '') }
      }).catch(() => {})
    }
  }, [])

  const flashSaved = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  // ===== 通用保存 =====
  const saveGeneral = async () => {
    if (supabaseUrl.trim() && supabaseKey.trim()) {
      await saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim())
    }
    await saveCloudinaryConfig({ cloudName: cloudName.trim(), uploadPreset: uploadPreset.trim() })
    flashSaved()
  }

  const clearAll = async () => {
    await clearSupabaseConfig(); await clearCloudinaryConfig()
    setSupabaseUrl(''); setSupabaseKey(''); setCloudName(''); setUploadPreset('')
    flashSaved()
  }

  // ===== AI 模型 =====
  const updateModel = (id: string, patch: Partial<AIModelConfig>) => {
    setModels((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      saveAIModels(next).catch(() => {})
      return next
    })
  }

  const toggleModel = (id: string) => {
    setModels((prev) => {
      const model = prev.find((m) => m.id === id)
      if (!model || !model.apiKey) return prev
      const next = prev.map((m) => ({
        ...m,
        enabled: m.id === id ? !model.enabled : false,
      }))
      saveAIModels(next).catch(() => {})
      return next
    })
  }

  const handleDeleteModel = async (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id))
    await deleteAIModel(id)
  }

  const handleAddModel = async () => {
    if (!newModel.apiKey.trim()) return
    const tpl = PROVIDER_TEMPLATES.find(t => t.id === newModel.providerId)
    const providerName = tpl?.name || newModel.providerId || 'Custom'
    const name = newModel.customName.trim() || tpl?.displayName || newModel.providerId || '自定义连接'
    const id = generateModelId()
    const model: AIModelConfig = {
      id,
      name: providerName,
      displayName: name,
      defaultBaseUrl: tpl?.defaultBaseUrl || newModel.baseUrl,
      apiKey: newModel.apiKey.trim(),
      baseUrl: newModel.baseUrl || tpl?.defaultBaseUrl || '',
      enabled: false,
      availableModels: [],
      selectedModel: '',
      modelsFetched: false,
    }
    setModels(prev => [...prev, model])
    await saveAIModels([...models, model])
    setShowAddModel(false)
    setEditingModelId(null)
    setNewModel({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' })
  }

  const openEditDialog = (model: AIModelConfig) => {
    const tpl = PROVIDER_TEMPLATES.find(t => t.name === model.name || model.id.includes(t.id))
    setNewModel({
      providerId: tpl?.id || 'openai',
      customName: model.displayName !== (tpl?.displayName || '') ? model.displayName : '',
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
    })
    setEditingModelId(model.id)
    setShowAddModel(true)
  }

  const fetchModels = async (modelId: string) => {
    const model = models.find((m) => m.id === modelId)
    if (!model || !model.apiKey) return
    updateModel(modelId, { modelsFetched: false })
    try {
      let url = ''
      const providerName = (model.name || model.id).toLowerCase()
      const isAnthropic = providerName === 'anthropic' || providerName === 'claude'
      const isOpenAI = providerName === 'openai'

      // 用 model.name 判断 provider 类型，兼容新旧 ID 格式
      if (isAnthropic) {
        url = `${model.baseUrl || 'https://api.anthropic.com/v1'}/models`
      } else if (isOpenAI) {
        url = `${model.baseUrl || 'https://api.openai.com/v1'}/models`
      } else {
        url = `${model.baseUrl}/models`
      }

      const headers: Record<string, string> = {}
      if (isAnthropic) {
        headers['x-api-key'] = model.apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${model.apiKey}`
      }

      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = (data.data || data.models || []).map((m: any) => ({
        id: m.id || m.name || '',
        contextWindow: m.context_window || m.inputTokenLimit,
      })).filter((m: any) => m.id).slice(0, 30)
      updateModel(modelId, { availableModels: list, selectedModel: list[0]?.id || '', modelsFetched: true })
    } catch (e: any) {
      updateModel(modelId, { modelsFetched: true })
      alert(`获取模型列表失败: ${e.message}`)
    }
  }

  // ===== MCP =====
  const addServer = async () => {
    const s: MCPServerConfig = { id: `srv_${Date.now()}`, name: '新服务器', description: '', url: '', type: 'sse', command: '', args: [], enabled: false }
    await addMcpServer(s)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const updateServer = async (id: string, patch: Partial<MCPServerConfig>) => {
    await updateMcpServer(id, patch)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const deleteServer = async (id: string) => {
    if (!confirm('确定删除？')) return
    await removeMcpServer(id)
    setServers(await window.electronAPI!.mcp.getServers() as MCPServerConfig[])
  }

  const toggleServer = async (id: string) => {
    const srv = servers.find((s) => s.id === id)
    if (!srv) return
    const newEnabled = !srv.enabled
    setServers(prev => prev.map(s => s.id === id ? { ...s, enabled: newEnabled } : s))
    try {
      if (!newEnabled) {
        // 关闭时：断开连接并收起展开面板
        await disconnect(id).catch(() => {})
        if (expandedSrv === id) setExpandedSrv(null)
      }
      await updateMcpServer(id, { enabled: newEnabled })
    } catch (e: any) {
      setServers(prev => prev.map(s => s.id === id ? { ...s, enabled: !newEnabled } : s))
      alert(`操作失败：${e.message || '未知错误'}`)
    }
  }

  const loadServerDetail = async (serverId: string) => {
    const srv = servers.find(s => s.id === serverId)
    // 服务器未启用时不允许展开
    if (!srv?.enabled) return
    if (expandedSrv === serverId) { setExpandedSrv(null); return }
    setExpandedSrv(serverId)
    setLoadingDetail(true)
    setSrvTools([])
    setSrvResources([])
    setSrvPrompts([])
    try {
      const connResult = await connect(serverId)
      if (connResult.error) {
        console.error('MCP connect error:', connResult.error)
      }
      const [tools, resources, prompts] = await Promise.all([
        listTools(serverId).catch((e) => { console.error('listTools error:', e); return [] as MCPTool[] }),
        listResources(serverId).catch((e) => { console.error('listResources error:', e); return [] as MCPResource[] }),
        listPrompts(serverId).catch((e) => { console.error('listPrompts error:', e); return [] as MCPPrompt[] }),
      ])
      setSrvTools(tools)
      setSrvResources(resources)
      setSrvPrompts(prompts)
      setSrvDetailTab('tools')
    } catch (e: any) { console.error('loadServerDetail error:', e.message) }
    finally { setLoadingDetail(false) }
  }

  /** 根据 inputSchema 生成参数模板 JSON */
  const generateArgsTemplate = (target: any): string => {
    if (!target?.inputSchema?.properties) return '{}'
    const props = target.inputSchema.properties as Record<string, any>
    const entries = Object.entries(props).map(([name, schema]: [string, any]) => {
      let defaultVal: any = ''
      switch (schema.type) {
        case 'number': case 'integer': defaultVal = 0; break
        case 'boolean': defaultVal = false; break
        case 'array': defaultVal = []; break
        case 'object': defaultVal = {}; break
        default: defaultVal = ''
      }
      return [name, defaultVal]
    })
    return JSON.stringify(Object.fromEntries(entries), null, 2)
  }

  const openCallModal = (type: 'tool' | 'resource' | 'prompt', target: any) => {
    setCallModal({ type, target })
    if (type === 'resource') {
      setCallArgs('')
    } else if (type === 'prompt') {
      const tmpl = target.arguments?.length
        ? JSON.stringify(Object.fromEntries(target.arguments.map((a: any) => [a.name, a.default ?? ''])), null, 2)
        : '{}'
      setCallArgs(tmpl)
    } else {
      setCallArgs(generateArgsTemplate(target))
    }
    setCallResult(null)
  }

  const executeCall = async () => {
    if (!callModal || !expandedSrv) return
    setCallLoading(true)
    setCallResult(null)
    try {
      let result: any
      if (callModal.type === 'tool') {
        const args = JSON.parse(callArgs || '{}')
        result = await callTool(expandedSrv, callModal.target.name, args)
        setCallResult(JSON.stringify(result, null, 2))
      } else if (callModal.type === 'resource') {
        result = await readResource(expandedSrv, callModal.target.uri)
        setCallResult(JSON.stringify(result, null, 2))
      } else if (callModal.type === 'prompt') {
        const args = JSON.parse(callArgs || '{}')
        result = await getPrompt(expandedSrv, callModal.target.name, args)
        setCallResult(JSON.stringify(result, null, 2))
      }
    } catch (e: any) {
      setCallResult(`错误: ${e.message}`)
    } finally { setCallLoading(false) }
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：标签切换 */}
      <div className="flex h-11 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="返回">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {([
            { id: 'general' as const, label: '通用', icon: Settings },
            { id: 'ai' as const, label: 'AI模型', icon: Cpu },
            { id: 'mcp' as const, label: 'MCP 服务器', icon: Server },
            { id: 'capabilities' as const, label: '能力', icon: Zap },
            { id: 'agent' as const, label: 'Agent', icon: Bot },
            { id: 'about' as const, label: '关于', icon: Info },
          ]).map((t) => (
            <button
              key={t.id}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={() => setTab(t.id)}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* ===== 通用设置 ===== */}
        {tab === 'general' && <GeneralTab />}

        {/* ===== 能力设置 ===== */}
        {tab === 'capabilities' && <CapabilitiesTab />}

        {/* ===== Agent 设置 ===== */}
        {tab === 'agent' && <AgentTab />}

        {/* ===== AI 模型设置 ===== */}
        {tab === 'ai' && (
          <div className="w-full space-y-3">
            <p className="text-xs text-muted-foreground rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-900">
              添加模型连接，支持同一供应商多个连接。数据仅存储在本机。
            </p>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditingModelId(null); setNewModel({ providerId: 'openai', customName: '', apiKey: '', baseUrl: '' }); setShowAddModel(true) }}>
                <Plus className="mr-1 h-3 w-3" />添加连接
              </Button>
            </div>

            {/* 添加/编辑弹窗 */}
            {showAddModel && (
              <div className="rounded-lg border border-primary/30 p-4 space-y-3">
                <p className="text-xs font-medium">{editingModelId ? '编辑连接' : '新建连接'}</p>
                <Input
                  className="h-8 text-xs"
                  placeholder="连接名称（如：我的 OpenAI、公司 Claude）"
                  value={newModel.customName}
                  onChange={e => setNewModel(p => ({ ...p, customName: e.target.value }))}
                />
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">供应商</label>
                  <div className="flex gap-1">
                    <select
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={PROVIDER_TEMPLATES.some(t => t.id === newModel.providerId) ? newModel.providerId : '__custom__'}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setNewModel(p => ({ ...p, providerId: '', baseUrl: '' }))
                        } else {
                          setNewModel(p => ({ ...p, providerId: e.target.value, baseUrl: PROVIDER_TEMPLATES.find(t => t.id === e.target.value)?.defaultBaseUrl || '' }))
                        }
                      }}
                    >
                      {PROVIDER_TEMPLATES.map(t => (
                        <option key={t.id} value={t.id}>{t.displayName}</option>
                      ))}
                      <option value="__custom__">自定义…</option>
                    </select>
                    {!PROVIDER_TEMPLATES.some(t => t.id === newModel.providerId) && (
                      <Input
                        className="flex-1 h-8 text-xs"
                        placeholder="供应商名称（如：硅基流动）"
                        value={newModel.providerId}
                        onChange={e => setNewModel(p => ({ ...p, providerId: e.target.value }))}
                      />
                    )}
                  </div>
                </div>
                <Input
                  type="password"
                  className="h-8 text-xs"
                  placeholder="API Key"
                  value={newModel.apiKey}
                  onChange={e => setNewModel(p => ({ ...p, apiKey: e.target.value }))}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Base URL（可选，留空用默认）"
                  value={newModel.baseUrl}
                  onChange={e => setNewModel(p => ({ ...p, baseUrl: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddModel} disabled={!newModel.apiKey.trim()}>
                    <Check className="mr-1 h-3 w-3" />{editingModelId ? '保存' : '添加'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAddModel(false); setEditingModelId(null) }}>
                    <X className="mr-1 h-3 w-3" />取消
                  </Button>
                </div>
              </div>
            )}

            {/* 已添加的连接 — 只显示已配置的 */}
            {models.filter(m => m.apiKey).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">暂无模型连接，点击上方添加</p>
            ) : (
              models.filter(m => m.apiKey).map((model) => (
                <div key={model.id} className={`rounded-lg border transition-colors ${model.enabled ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{model.displayName}</span>
                          {model.enabled && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary shrink-0">启用</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                          {model.name}{model.baseUrl ? ` · ${model.baseUrl}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors" onClick={() => openEditDialog(model)} title="编辑">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
                        onClick={() => { if (confirm(`确定删除「${model.displayName}」连接？`)) handleDeleteModel(model.id) }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${model.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                        onClick={() => toggleModel(model.id)}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${model.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <svg className={`h-3.5 w-3.5 text-muted-foreground/30 shrink-0 transition-transform cursor-pointer ${expandedModel === model.id ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        onClick={(e) => { e.stopPropagation(); setExpandedModel(expandedModel === model.id ? null : model.id) }}><path d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>

                  {/* 展开：获取模型列表 */}
                  {expandedModel === model.id && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <Input
                        className="h-7 text-xs"
                        placeholder="连接名称"
                        value={model.displayName}
                        onChange={e => updateModel(model.id, { displayName: e.target.value })}
                      />
                      <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fetchModels(model.id)} disabled={!model.apiKey}>
                          <RefreshCw className={`mr-1 h-3 w-3 ${!model.modelsFetched && model.apiKey ? 'animate-spin' : ''}`} />
                          {model.modelsFetched ? '刷新模型列表' : '获取模型列表'}
                        </Button>
                        {model.modelsFetched && model.availableModels.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{model.availableModels.length} 个模型可用</span>
                        )}
                      </div>
                      {model.modelsFetched && model.availableModels.length > 0 && (
                        <details className="group">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground/50 hover:text-muted-foreground select-none flex items-center justify-between">
                            <span>模型列表</span>
                            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                          </summary>
                          <div className="max-h-48 overflow-auto space-y-1 rounded border border-border p-2 mt-2">
                            {model.availableModels.map((sm) => {
                              const tier = getModelTier(sm.id)
                              const tierColors: Record<string, string> = { fast: 'bg-emerald-100 text-emerald-700', balanced: 'bg-blue-100 text-blue-700', powerful: 'bg-purple-100 text-purple-700' }
                              return (
                              <div
                                key={sm.id}
                                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs transition-colors ${model.selectedModel === sm.id ? 'bg-accent font-medium' : 'hover:bg-muted'}`}
                                onClick={() => updateModel(model.id, { selectedModel: sm.id })}
                              >
                                <span className="font-mono truncate">{sm.id}</span>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  <select
                                    className="h-5 rounded border border-border bg-background text-[10px] px-1 cursor-pointer"
                                    value={tier}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => {
                                      e.stopPropagation()
                                      setModelTier(sm.id, e.target.value as any)
                                      // 强制刷新
                                      setModels(prev => [...prev])
                                    }}
                                  >
                                    <option value="fast">Fast</option>
                                    <option value="balanced">Balanced</option>
                                    <option value="powerful">Powerful</option>
                                  </select>
                                  <span className={`text-[9px] px-1 py-px rounded font-medium ${tierColors[tier]}`}>
                                    {tier === 'fast' ? 'Fast' : tier === 'balanced' ? 'Bal' : 'Power'}
                                  </span>
                                  <span className="w-3.5 shrink-0">{model.selectedModel === sm.id && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                                </div>
                              </div>
                            )})}
                          </div>
                        </details>
                      )}
                      {model.modelsFetched && model.availableModels.length === 0 && (
                        <p className="text-[10px] text-muted-foreground/50">未能获取模型列表，请检查 API Key 和 Base URL</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {/* 智能路由说明 */}
            {models.length > 0 && models.some(m => m.modelsFetched && m.availableModels.length > 0) && (
              <fieldset className="rounded-lg border border-border p-4">
                <legend className="px-2 text-sm font-semibold">智能路由</legend>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Auto 模式下，系统根据任务复杂度自动选择模型层级。每个模型已根据名称自动标记默认层级，可直接在上方模型列表中调整。
                </p>
                <div className="flex gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Fast</span> 简单任务</span>
                  <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Balanced</span> 默认</span>
                  <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Powerful</span> 复杂任务</span>
                </div>
              </fieldset>
            )}
          </div>
        )}

        {tab === 'mcp' && (
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">MCP (Model Context Protocol) 服务器配置，用于扩展 AI 工具能力。</p>
              <Button size="sm" variant="outline" onClick={addServer}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button>
            </div>

            {/* 渐进式披露阈值 */}
            <fieldset className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <legend className="text-sm font-semibold mb-1">渐进式披露阈值</legend>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    当可用 MCP 工具数量超过此值时，系统会自动根据当前对话内容智能筛选最相关的工具发送给 AI 模型。
                    筛选可节省 token 消耗并提升响应质量。建议值 5-12，工具数量越多可适当调高。
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => { const n = Math.max(1, disclosureThreshold - 1); setDisclosureThreshold(n); saveDisclosureThreshold(n) }}
                    disabled={disclosureThreshold <= 1}>
                    <span className="text-xs">−</span>
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={disclosureThreshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 50) { setDisclosureThreshold(v); saveDisclosureThreshold(v) }
                    }}
                    className="h-8 w-16 text-center text-sm"
                  />
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => { const n = Math.min(50, disclosureThreshold + 1); setDisclosureThreshold(n); saveDisclosureThreshold(n) }}
                    disabled={disclosureThreshold >= 50}>
                    <span className="text-xs">+</span>
                  </Button>
                </div>
              </div>
            </fieldset>

            {servers.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">暂无 MCP 服务器</p>
            ) : (
              servers.map((srv) => (
                <div key={srv.id} className="rounded-lg border border-border transition-colors">
                  <div className={`flex items-center justify-between px-4 py-3 ${srv.enabled ? 'cursor-pointer' : ''}`} onClick={() => loadServerDetail(srv.id)}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{srv.name}</p>
                      {srv.description && <p className="text-[10px] text-muted-foreground/60 truncate">{srv.description}</p>}
                      <p className="text-xs text-muted-foreground truncate">{srv.url || srv.command || '未配置'}</p>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${srv.enabled ? 'bg-primary' : 'bg-muted'}`}
                        onClick={() => toggleServer(srv.id)}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${srv.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                      <button className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => deleteServer(srv.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors" onClick={() => loadServerDetail(srv.id)} title={srv.enabled ? (expandedSrv === srv.id ? '收起' : '展开') : '请先启用服务器'}>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedSrv === srv.id ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {/* 详情编辑 */}
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px]">名称</Label>
                        <Input className="h-8 text-xs" value={srv.name} onChange={(e) => updateServer(srv.id, { name: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-[11px]">连接模式</Label>
                        <select
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                          value={srv.type} onChange={(e) => updateServer(srv.id, { type: e.target.value as MCPServerConfig['type'] })}
                        >
                          <option value="sse">SSE</option>
                          <option value="stdio">Stdio</option>
                          <option value="streamableHttp">HTTP</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px]">描述</Label>
                      <Input className="h-8 text-xs" placeholder="服务器用途说明（可选）" value={srv.description || ''} onChange={(e) => updateServer(srv.id, { description: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-[11px]">URL</Label>
                      <Input className="h-8 text-xs" placeholder="http://localhost:3000" value={srv.url} onChange={(e) => updateServer(srv.id, { url: e.target.value })} />
                    </div>
                    {(srv.type === 'sse' || srv.type === 'streamableHttp') && (
                      <div>
                        <Label className="text-[11px]">请求头 (Headers)</Label>
                        <textarea
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          rows={3}
                          placeholder='{"Authorization": "Bearer xxx", "X-API-Key": "yyy"}'
                          value={srv.headers ? JSON.stringify(srv.headers, null, 2) : ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            if (!raw) { updateServer(srv.id, { headers: undefined }); return }
                            try {
                              const parsed = JSON.parse(raw)
                              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                                updateServer(srv.id, { headers: parsed as Record<string, string> })
                              }
                            } catch { /* 输入中的 JSON 不合法，不更新 */ }
                          }}
                          spellCheck={false}
                        />
                        <p className="text-[9px] text-muted-foreground/50 mt-1">JSON 格式，如鉴权 Token。仅对 SSE / HTTP 模式生效。</p>
                      </div>
                    )}
                    {srv.type === 'stdio' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px]">命令</Label>
                          <Input className="h-8 text-xs" placeholder="npx / uvx" value={srv.command} onChange={(e) => updateServer(srv.id, { command: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-[11px]">参数（逗号分隔）</Label>
                          <Input className="h-8 text-xs" placeholder="arg1, arg2" value={srv.args.join(', ')} onChange={(e) => updateServer(srv.id, { args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 工具/资源/提示 查看和测试 */}
                  {expandedSrv === srv.id && (
                    <div className="border-t border-border px-4 py-3">
                      <div className="flex items-center gap-1 mb-3 border-b border-border pb-2">
                        {(['tools', 'resources', 'prompts'] as const).map((t) => (
                          <button
                            key={t}
                            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${srvDetailTab === t ? 'bg-accent' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setSrvDetailTab(t)}
                          >
                            {t === 'tools' && <Wrench className="h-3 w-3" />}
                            {t === 'resources' && <FolderOpen className="h-3 w-3" />}
                            {t === 'prompts' && <MessageSquare className="h-3 w-3" />}
                            {t === 'tools' ? `工具 (${srvTools.length})` : t === 'resources' ? `资源 (${srvResources.length})` : `提示 (${srvPrompts.length})`}
                          </button>
                        ))}
                      </div>

                      {loadingDetail ? (
                        <p className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />加载中...</p>
                      ) : (
                        <>
                          {srvDetailTab === 'tools' && (
                            srvTools.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现工具</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvTools.map((tool) => {
                                  const props = (tool.inputSchema?.properties || {}) as Record<string, any>
                                  const required = (tool.inputSchema?.required || []) as string[]
                                  const propEntries = Object.entries(props)
                                  return (
                                  <div key={tool.name} className="rounded border border-border p-2 space-y-1">
                                    <div className="flex items-start justify-between">
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium">{tool.name}</p>
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">{tool.description || '无描述'}</p>
                                      </div>
                                      <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('tool', tool)}>
                                        <Play className="mr-1 h-2.5 w-2.5" />调用
                                      </Button>
                                    </div>
                                    {propEntries.length > 0 && (
                                      <div className="border-t border-border/50 pt-1">
                                        <p className="text-[10px] text-muted-foreground/70 mb-0.5">参数:</p>
                                        {propEntries.map(([name, schema]: [string, any]) => (
                                          <div key={name} className="flex items-baseline gap-1 text-[10px] ml-1">
                                            <span className="font-mono text-primary/80">{name}{required.includes(name) ? '*' : ''}</span>
                                            <span className="text-muted-foreground/50">{schema.type || 'any'}</span>
                                            {schema.description && <span className="text-muted-foreground/60">{schema.description}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )
                          )}
                          {srvDetailTab === 'resources' && (
                            srvResources.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现资源</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvResources.map((res) => (
                                  <div key={res.uri} className="flex items-start justify-between rounded border border-border p-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate">{res.name || res.uri}</p>
                                      <p className="text-[10px] text-muted-foreground font-mono truncate">{res.uri}</p>
                                    </div>
                                    <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('resource', res)}>
                                      <Play className="mr-1 h-2.5 w-2.5" />读取
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                          {srvDetailTab === 'prompts' && (
                            srvPrompts.length === 0 ? (
                              <p className="py-8 text-center text-xs text-muted-foreground">未发现提示</p>
                            ) : (
                              <div className="space-y-2 max-h-64 overflow-auto">
                                {srvPrompts.map((prompt) => (
                                  <div key={prompt.name} className="flex items-start justify-between rounded border border-border p-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium">{prompt.name}</p>
                                      <p className="text-[10px] text-muted-foreground line-clamp-2">{prompt.description || '无描述'}</p>
                                    </div>
                                    <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] shrink-0" onClick={() => openCallModal('prompt', prompt)}>
                                      <Play className="mr-1 h-2.5 w-2.5" />执行
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ===== 关于 ===== */}
        {tab === 'about' && <AboutTab />}

        {/* 调用弹窗 */}
        {callModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCallModal(null)}>
            <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-sm">
                  {callModal.type === 'tool' ? `调用工具: ${callModal.target.name}` :
                   callModal.type === 'resource' ? `读取资源: ${callModal.target.name || callModal.target.uri}` :
                   `执行提示: ${callModal.target.name}`}
                </h3>
                <button className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setCallModal(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* 工具参数提示 */}
              {callModal.type === 'tool' && callModal.target?.inputSchema?.properties && (
                <div className="mb-3 rounded-md bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1">参数说明：</p>
                  {Object.entries(callModal.target.inputSchema.properties as Record<string, any>).map(([name, schema]: [string, any]) => {
                    const req = (callModal.target.inputSchema.required as string[] || []).includes(name)
                    return (
                      <div key={name} className="flex items-baseline gap-1.5 text-[10px]">
                        <span className="font-mono text-primary font-medium">{name}{req ? '*' : ''}</span>
                        <span className="text-muted-foreground/50">{schema.type || 'any'}</span>
                        {schema.description && <span className="text-muted-foreground/70">— {schema.description}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Prompt 参数提示 */}
              {callModal.type === 'prompt' && callModal.target?.arguments?.length > 0 && (
                <div className="mb-3 rounded-md bg-muted/50 p-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground mb-1">参数说明：</p>
                  {callModal.target.arguments.map((a: any) => (
                    <div key={a.name} className="flex items-baseline gap-1.5 text-[10px]">
                      <span className="font-mono text-primary font-medium">{a.name}{a.required ? '*' : ''}</span>
                      {a.description && <span className="text-muted-foreground/70">— {a.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {callModal.type !== 'resource' && (
                <div className="mb-4">
                  <Label className="text-xs">参数 (JSON)</Label>
                  <textarea
                    className="mt-1 h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    value={callArgs}
                    onChange={(e) => setCallArgs(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <Button size="sm" onClick={executeCall} disabled={callLoading}>
                  {callLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  执行
                </Button>
              </div>

              {callResult !== null && (
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">{callResult}</pre>
              )}
            </div>
          </div>
        )}
        {/* end of call modal */}
      </div>
    </div>
  )
}
