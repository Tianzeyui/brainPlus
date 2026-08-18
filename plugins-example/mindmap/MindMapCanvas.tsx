// ============================================================
// Mind Map Plugin — SVG 画布（核心：布局 + 渲染 + 交互）
// Local-First 架构：本地 state 即时响应，服务端定期同步
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  ArrowLeft, Plus, ZoomIn, ZoomOut, Loader2, Pencil, X, Undo2, Redo2, Save,
} from 'lucide-react'
import { Button } from './ui'
import type { MindMap, MindMapNode, LayoutNode } from './types'
import { NODE_COLORS, DEFAULT_COLOR } from './types'
import * as api from './api'

// ============================================================
// 布局常量（从左往右发散）
// ============================================================
const LINE_H = 16
const PAD_Y = 10
const PAD_X = 14
const MIN_W = 70
const MAX_W = 200
const SIBLING_GAP = 10
const LEVEL_GAP = 60
const RX = 8
const DRAG_THRESHOLD = 5      // 拖拽最小移动阈值（px）
const AUTO_SAVE_MS = 5000     // 自动保存间隔（ms）
const HISTORY_MAX = 30        // 最大历史快照数

// ============================================================
// 本地轻量 Toast
// ============================================================
interface ToastItem { id: number; title: string; description?: string; variant?: 'default' | 'destructive' }
let _toastId = 0
function showToastImpl(
  setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>,
  t: { title: string; description?: string; variant?: 'default' | 'destructive'; duration?: number },
  mounted: React.MutableRefObject<boolean>,
) {
  const id = ++_toastId
  if (!mounted.current) return
  setToasts(prev => [...prev, { id, title: t.title, description: t.description, variant: t.variant }])
  setTimeout(() => {
    if (mounted.current) setToasts(prev => prev.filter(x => x.id !== id))
  }, t.duration ?? 2000)
}

// ============================================================
// 文字测量 & 分行
// ============================================================
function measureText(text: string): { lines: string[]; nodeW: number; nodeH: number } {
  function charW(ch: string): number {
    const code = ch.charCodeAt(0)
    if (code < 128) return 7
    return 12
  }

  const maxLineW = MAX_W - PAD_X * 2
  const lines: string[] = []
  let cur = ''
  let curW = 0

  for (const ch of text) {
    const w = charW(ch)
    if (curW + w > maxLineW && cur.length > 0) {
      lines.push(cur)
      cur = ch
      curW = w
    } else {
      cur += ch
      curW += w
    }
  }
  if (cur) lines.push(cur)

  let maxW = MIN_W
  for (const line of lines) {
    let lw = 0
    for (const ch of line) lw += charW(ch)
    maxW = Math.max(maxW, lw + PAD_X * 2)
  }

  return {
    lines: lines.length > 0 ? lines : [text],
    nodeW: Math.min(maxW, MAX_W),
    nodeH: lines.length * LINE_H + PAD_Y * 2,
  }
}

// ============================================================
// 布局算法（左→右）
// ============================================================
function buildTree(nodes: MindMapNode[], parentId: string | null): LayoutNode[] {
  const children = nodes
    .filter(n => (n.parent_id || null) === parentId)
    .sort((a, b) => a.sort_order - b.sort_order)

  return children.map(n => {
    const kids = buildTree(nodes, n.id)
    const { lines, nodeW, nodeH } = measureText(n.text)
    const span = kids.length > 0
      ? kids.reduce((sum, k) => sum + k.width, 0) + (kids.length - 1) * SIBLING_GAP
      : nodeH
    return { node: n, x: 0, y: 0, width: Math.max(span, nodeH), nodeW, nodeH, lines, children: kids }
  })
}

function layoutTree(tree: LayoutNode[], parentX: number, parentY: number, parentW: number, parentH: number) {
  let totalH = 0
  for (const child of tree) totalH += child.width
  totalH += (tree.length - 1) * SIBLING_GAP

  const startY = parentY + parentH / 2 - totalH / 2
  let cy = startY
  for (const child of tree) {
    const offsetY = (child.width - child.nodeH) / 2
    child.y = cy + offsetY
    child.x = parentX + parentW + LEVEL_GAP
    layoutTree(child.children, child.x, child.y, child.nodeW, child.nodeH)
    cy += child.width + SIBLING_GAP
  }
}

// ============================================================
// 贝塞尔曲线（水平方向）
// ============================================================
function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

// ============================================================
// 拓扑排序：父节点在前，子节点在后
// ============================================================
function topoSort(nodeList: MindMapNode[]): MindMapNode[] {
  const result: MindMapNode[] = []
  const visited = new Set<string>()
  const inStack = new Set<string>() // 检测循环引用
  const dfs = (n: MindMapNode) => {
    if (visited.has(n.id)) return
    // 检测循环引用：如果节点已在当前递归栈中，先标记为 visited 避免无限递归
    if (inStack.has(n.id)) {
      // 断开循环：将该节点的 parent_id 置空，相当于变成根节点
      n.parent_id = null as any
      return
    }
    inStack.add(n.id)
    const parent = nodeList.find(x => x.id === n.parent_id)
    if (parent) dfs(parent)
    inStack.delete(n.id)
    visited.add(n.id)
    result.push(n)
  }
  for (const n of nodeList) dfs(n)
  return result
}

// ============================================================
// 辅助：确保每个兄弟组的 sort_order 连续且从 0 开始
// ============================================================
function normalizeSortOrders(nodeList: MindMapNode[]): MindMapNode[] {
  const groups = new Map<string, MindMapNode[]>()
  for (const n of nodeList) {
    const key = n.parent_id || '__root__'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  }
  const result = nodeList.map(n => ({ ...n }))
  for (const [, group] of groups) {
    group.sort((a, b) => a.sort_order - b.sort_order)
    group.forEach((n, i) => {
      const idx = result.findIndex(x => x.id === n.id)
      if (idx !== -1) result[idx].sort_order = i
    })
  }
  return result
}

// ============================================================
// 辅助：BFS 收集节点及其所有后代 ID
// ============================================================
function collectDescendantIds(nodeId: string, nodeList: MindMapNode[]): Set<string> {
  const ids = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const id = queue.shift()!
    ids.add(id)
    for (const n of nodeList) {
      if (n.parent_id === id) queue.push(n.id)
    }
  }
  return ids
}

// ============================================================
// 组件
// ============================================================
interface Props {
  map: MindMap
  onBack: () => void
}

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

interface DragState {
  nodeId: string | null
  startX: number
  startY: number
  svgX: number
  svgY: number
  isActive: boolean    // 只有超过 DRAG_THRESHOLD 才为 true
  targetId: string | null
}

const INIT_DRAG: DragState = {
  nodeId: null, startX: 0, startY: 0, svgX: 0, svgY: 0,
  isActive: false, targetId: null,
}

export const MindMapCanvas: React.FC<Props> = ({ map, onBack }) => {
  // ============================================================
  // 本地数据状态（local-first 核心）
  // ============================================================
  const [nodes, setNodes] = useState<MindMapNode[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [isDirty, setIsDirty] = useState(false)

  // ============================================================
  // UI 状态
  // ============================================================
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [viewBox, setViewBox] = useState({ x: -100, y: -300, w: 900, h: 650 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [dragState, setDragState] = useState<DragState>(INIT_DRAG)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<MindMapNode[][]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // ============================================================
  // Refs — 让回调稳定（不依赖频繁变化的状态）
  // ============================================================
  const nodesRef = useRef(nodes); nodesRef.current = nodes
  const historyRef = useRef(history); historyRef.current = history
  const historyIdxRef = useRef(historyIdx); historyIdxRef.current = historyIdx
  const isDirtyRef = useRef(isDirty); isDirtyRef.current = isDirty
  const saveStatusRef = useRef(saveStatus); saveStatusRef.current = saveStatus
  const selectedIdRef = useRef(selectedId); selectedIdRef.current = selectedId
  const editingIdRef = useRef(editingId); editingIdRef.current = editingId
  const editTextRef = useRef(editText); editTextRef.current = editText
  const mapRef = useRef(map); mapRef.current = map
  const mouseDownRef = useRef(false)  // 追踪鼠标按键是否按下
  const mountedRef = useRef(true)      // 防卸载后 setState

  const showToast = useCallback((t: { title: string; description?: string; variant?: 'default' | 'destructive'; duration?: number }) => {
    showToastImpl(setToasts, t, mountedRef)
  }, [])

  // ============================================================
  // 卸载标记
  // ============================================================
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ============================================================
  // 初始加载
  // ============================================================
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const serverNodes = await api.listNodes(map.id)
        if (!cancelled) {
          setNodes(serverNodes)
          setIsDirty(false)
          setSaveStatus('saved')
        }
      } catch (e) {
        if (!cancelled) {
          console.error('加载节点失败:', e)
          setSaveStatus('error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [map.id])

  // ============================================================
  // 保存到服务端
  // ============================================================
  const saveToServer = useCallback(async () => {
    if (!isDirtyRef.current || saveStatusRef.current === 'saving') return
    const currentNodes = nodesRef.current
    setSaveStatus('saving')
    try {
      // 1. 规范化 sort_order
      const normalized = normalizeSortOrders(currentNodes)
      // 2. 清除服务端旧数据
      await api.deleteAllNodes(mapRef.current.id)
      // 3. 拓扑排序 + 批量写入
      if (normalized.length > 0) {
        const sorted = topoSort(normalized)
        await api.batchCreateNodes(sorted)
      }
      // 4. 更新 map.updated_at
      await api.updateMap(mapRef.current.id, { name: mapRef.current.name })

      setIsDirty(false)
      setSaveStatus('saved')
    } catch (e) {
      console.error('保存失败:', e)
      setSaveStatus('error')
    }
  }, [])

  // ============================================================
  // 自动保存：isDirty 变化后 5 秒触发
  // ============================================================
  useEffect(() => {
    if (!isDirty) return
    const timer = setTimeout(() => { saveToServer() }, AUTO_SAVE_MS)
    return () => clearTimeout(timer)
  }, [isDirty, saveToServer])

  // ============================================================
  // 离开时保存（切换页面 / 关闭标签页）
  // ============================================================
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 卸载时 fire-and-forget 保存
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) saveToServer()
    }
  }, [saveToServer])

  // ============================================================
  // 可见节点（排除折叠后代）
  // ============================================================
  const visibleNodes = useMemo(() => {
    if (collapsedIds.size === 0) return nodes
    const hidden = new Set<string>()
    const visited = new Set<string>() // 防循环引用
    function markDescendants(pid: string) {
      if (visited.has(pid)) return
      visited.add(pid)
      for (const n of nodes) {
        if (n.parent_id === pid) { hidden.add(n.id); markDescendants(n.id) }
      }
    }
    for (const cid of collapsedIds) markDescendants(cid)
    return nodes.filter(n => !hidden.has(n.id))
  }, [nodes, collapsedIds])

  // ============================================================
  // 布局
  // ============================================================
  const layoutRoots = useMemo(() => {
    if (visibleNodes.length === 0) return [] as LayoutNode[]
    const roots = visibleNodes.filter(n => !n.parent_id || !visibleNodes.some(v => v.id === n.parent_id))
    if (roots.length === 0) {
      return buildTree(visibleNodes, visibleNodes[0].parent_id)
    }
    const tree = buildTree(visibleNodes, null)
    let totalH = 0
    for (const r of tree) totalH += r.width
    totalH += (tree.length - 1) * SIBLING_GAP * 3
    let startY = -totalH / 2
    for (const r of tree) {
      r.y = startY + (r.width - r.nodeH) / 2
      r.x = 0
      layoutTree(r.children, r.x, r.y, r.nodeW, r.nodeH)
      startY += r.width + SIBLING_GAP * 3
    }
    return tree
  }, [visibleNodes])

  const flatLayout = useMemo(() => {
    const result: LayoutNode[] = []
    function walk(list: LayoutNode[]) {
      for (const ln of list) { result.push(ln); walk(ln.children) }
    }
    walk(layoutRoots)
    return result
  }, [layoutRoots])

  // ============================================================
  // 折叠切换
  // ============================================================
  const toggleCollapse = (nodeId: string) =>
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })

  const hasChildren = (nodeId: string) => nodes.some(n => n.parent_id === nodeId)

  // ============================================================
  // 撤销/重做（纯本地，瞬间完成）
  // ============================================================
  const pushSnapshot = useCallback(() => {
    const cur = nodesRef.current
    if (cur.length === 0) return
    const idx = historyIdxRef.current
    setHistory(prev => {
      const next = prev.slice(0, idx + 1)
      next.push(JSON.parse(JSON.stringify(cur)))
      if (next.length > HISTORY_MAX) next.shift()
      return next
    })
    setHistoryIdx(prev => Math.min(prev + 1, HISTORY_MAX - 1))
  }, [])

  const popSnapshot = useCallback(() => {
    setHistory(prev => prev.slice(0, -1))
    setHistoryIdx(prev => Math.max(prev - 1, -1))
  }, [])

  const undo = useCallback(() => {
    const idx = historyIdxRef.current
    const hist = historyRef.current
    if (idx < 0 || idx >= hist.length) return
    const snapshot = hist[idx]
    if (!snapshot || snapshot.length === 0) return
    setNodes(snapshot)
    setHistoryIdx(prev => prev - 1)
    setIsDirty(true)
    showToast({ title: '已撤销', description: `恢复了 ${snapshot.length} 个节点`, duration: 1500 })
  }, [showToast])

  const redo = useCallback(() => {
    const idx = historyIdxRef.current
    const hist = historyRef.current
    if (idx >= hist.length - 1) return
    const snapshot = hist[idx + 1]
    if (!snapshot) return
    setNodes(snapshot)
    setHistoryIdx(prev => prev + 1)
    setIsDirty(true)
    showToast({ title: '已重做', description: `恢复了 ${snapshot.length} 个节点`, duration: 1500 })
  }, [showToast])

  // ============================================================
  // 操作（全部即时修改本地 state，无 API 调用）
  // ============================================================
  const makeNode = (text: string, parentId: string | null, color: string, sortOrder: number): MindMapNode => ({
    id: crypto.randomUUID(),
    map_id: map.id,
    parent_id: parentId,
    text,
    color,
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  const handleAddChild = useCallback((parentId: string) => {
    pushSnapshot()
    const cur = nodesRef.current
    const parentNode = cur.find(n => n.id === parentId)
    const siblings = cur.filter(n => (n.parent_id || null) === parentId)
    const newNode = makeNode('新节点', parentId, parentNode?.color || DEFAULT_COLOR, siblings.length)
    setNodes(prev => [...prev, newNode])
    setIsDirty(true)
    showToast({ title: '子节点已添加', description: 'Ctrl+Z 撤销', duration: 1500 })
  }, [map.id, pushSnapshot, showToast])

  const handleAddSibling = useCallback((nodeId: string) => {
    const cur = nodesRef.current
    const node = cur.find(n => n.id === nodeId)
    if (!node) return
    pushSnapshot()
    const siblings = cur.filter(n => (n.parent_id || null) === (node.parent_id || null))
    siblings.sort((a, b) => a.sort_order - b.sort_order)
    const idx = siblings.findIndex(n => n.id === nodeId)
    const newNode = makeNode('新节点', node.parent_id, node.color, idx + 1)
    setNodes(prev => {
      const updated = prev.map(n => {
        if ((n.parent_id || null) === (node.parent_id || null) && n.sort_order > idx) {
          return { ...n, sort_order: n.sort_order + 1 }
        }
        return n
      })
      return [...updated, newNode]
    })
    setIsDirty(true)
    showToast({ title: '兄弟节点已添加', description: 'Ctrl+Z 撤销', duration: 1500 })
  }, [map.id, pushSnapshot, showToast])

  const handleDelete = useCallback((nodeId: string) => {
    pushSnapshot()
    const idsToDelete = collectDescendantIds(nodeId, nodesRef.current)
    setNodes(prev => prev.filter(n => !idsToDelete.has(n.id)))
    if (selectedIdRef.current && idsToDelete.has(selectedIdRef.current)) {
      setSelectedId(null)
    }
    setIsDirty(true)
    showToast({ title: '节点已删除', description: 'Ctrl+Z 撤销', duration: 1500 })
  }, [pushSnapshot, showToast])

  const handleEditStart = (node: MindMapNode) => {
    setEditingId(node.id)
    setEditText(node.text)
  }

  const handleEditSave = useCallback(() => {
    const id = editingIdRef.current
    const text = editTextRef.current
    if (!id || !text.trim()) return
    pushSnapshot()
    const newText = text.trim()
    setNodes(prev => prev.map(n =>
      n.id === id ? { ...n, text: newText, updated_at: new Date().toISOString() } : n
    ))
    setEditingId(null)
    setIsDirty(true)
    showToast({ title: '文本已更新', description: 'Ctrl+Z 撤销', duration: 1500 })
  }, [pushSnapshot, showToast])

  const handleColorChange = useCallback((nodeId: string, color: string) => {
    pushSnapshot()
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, color, updated_at: new Date().toISOString() } : n
    ))
    setIsDirty(true)
    showToast({ title: '颜色已更新', description: 'Ctrl+Z 撤销', duration: 1500 })
  }, [pushSnapshot, showToast])

  // ============================================================
  // 拖拽处理（5px 阈值）
  // ============================================================
  const handleNodeMouseDown = useCallback((ln: LayoutNode, e: React.MouseEvent) => {
    if (editingIdRef.current) return
    e.stopPropagation()
    mouseDownRef.current = true
    setSelectedId(ln.node.id)
    setDragState({
      nodeId: ln.node.id,
      startX: e.clientX,
      startY: e.clientY,
      svgX: ln.x + ln.nodeW / 2,
      svgY: ln.y + ln.nodeH / 2,
      isActive: false,
      targetId: null,
    })
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // --- 拖拽节点（仅当鼠标按键按下时） ---
    if (dragState.nodeId && mouseDownRef.current) {
      if (!dragState.isActive) {
        const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY)
        if (dist < DRAG_THRESHOLD) return
        // 激活拖拽
        setDragState(prev => ({ ...prev, isActive: true }))
        return
      }

      const svg = svgRef.current
      if (!svg) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const svgPt = pt.matrixTransform(ctm.inverse())

      let target: string | null = null
      for (const ln of flatLayout) {
        if (ln.node.id === dragState.nodeId) continue
        if (svgPt.x >= ln.x && svgPt.x <= ln.x + ln.nodeW &&
            svgPt.y >= ln.y && svgPt.y <= ln.y + ln.nodeH) {
          target = ln.node.id
          break
        }
      }

      setDragState(prev => ({ ...prev, svgX: svgPt.x, svgY: svgPt.y, targetId: target }))
      return
    }

    // --- 平移画布 ---
    if (isPanning) {
      const dx = e.clientX - panStart.x; const dy = e.clientY - panStart.y
      setPanStart({ x: e.clientX, y: e.clientY })
      setViewBox(vb => ({ ...vb, x: vb.x - dx * (vb.w / 900), y: vb.y - dy * (vb.h / 550) }))
    }
  }, [dragState, isPanning, panStart, flatLayout])

  const handleMouseUp = useCallback(() => {
    mouseDownRef.current = false
    if (dragState.nodeId && dragState.isActive) {
      const dragged = flatLayout.find(ln => ln.node.id === dragState.nodeId)
      if (dragged) {
        pushSnapshot()
        if (dragState.targetId) {
          // 防止循环引用：不能将节点拖到自己的后代节点下
          const descendantIds = collectDescendantIds(dragState.nodeId, nodesRef.current)
          if (descendantIds.has(dragState.targetId)) {
            showToast({ title: '不能将节点移动到其后代节点下', variant: 'destructive', duration: 1500 })
            setDragState({ nodeId: null, startX: 0, startY: 0, svgX: 0, svgY: 0, isActive: false, targetId: null })
            setIsPanning(false)
            return
          }
          // 移到目标节点下成为子节点
          const targetSibs = nodesRef.current.filter(n => (n.parent_id || null) === dragState.targetId)
          setNodes(prev => prev.map(n =>
            n.id === dragState.nodeId
              ? { ...n, parent_id: dragState.targetId, sort_order: targetSibs.length, updated_at: new Date().toISOString() }
              : n
          ))
          showToast({ title: '节点已移动', description: 'Ctrl+Z 撤销', duration: 1500 })
        } else {
          // 同级重排
          const parentKey = dragged.node.parent_id || null
          const siblings = flatLayout
            .filter(ln => ln.node.id !== dragState.nodeId && (ln.node.parent_id || null) === parentKey)
            .sort((a, b) => a.y - b.y)

          let newOrder = siblings.length
          for (let i = 0; i < siblings.length; i++) {
            if (dragState.svgY < siblings[i].y + siblings[i].nodeH / 2) { newOrder = i; break }
          }
          const oldOrder = dragged.node.sort_order

          setNodes(prev => prev.map(n => {
            if (n.id === dragState.nodeId) {
              return { ...n, sort_order: newOrder, updated_at: new Date().toISOString() }
            }
            if ((n.parent_id || null) === parentKey && n.id !== dragState.nodeId) {
              if (oldOrder < newOrder && n.sort_order > oldOrder && n.sort_order <= newOrder) {
                return { ...n, sort_order: n.sort_order - 1 }
              }
              if (oldOrder > newOrder && n.sort_order >= newOrder && n.sort_order < oldOrder) {
                return { ...n, sort_order: n.sort_order + 1 }
              }
            }
            return n
          }))
          showToast({ title: '节点已重排', description: 'Ctrl+Z 撤销', duration: 1500 })
        }
        setIsDirty(true)
      }
    }
    // 无论是否拖拽，都重置状态
    setDragState(INIT_DRAG)
    setIsPanning(false)
  }, [dragState, flatLayout, pushSnapshot, showToast])

  // ============================================================
  // 键盘快捷键（ref 读取状态，依赖稳定，Ctrl+Z/S 无需选中节点）
  // ============================================================
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+S — 随时可用
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveToServer()
        return
      }

      // Ctrl+Z / Ctrl+Shift+Z — 随时可用（无需选中节点）
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }

      // 以下需要选中节点且不在编辑中
      const selId = selectedIdRef.current
      if (!selId || editingIdRef.current) return

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'Tab') { e.preventDefault(); handleAddChild(selId) }
      else if (e.key === 'Enter') {
        const node = nodesRef.current.find(n => n.id === selId)
        if (node) handleEditStart(node)
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') { handleDelete(selId) }
      else if (e.key === 'Escape') { setSelectedId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveToServer, undo, redo, handleAddChild, handleDelete])

  // ============================================================
  // 平移 & 缩放
  // ============================================================
  // 使用原生事件监听以支持 { passive: false }，避免浏览器报错：
  // "Unable to preventDefault inside passive event listener invocation"
  // 注意：依赖 loading 和 nodes.length，确保 SVG 渲染到 DOM 后才绑定事件
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = e.deltaY > 0 ? 1.1 : 0.9
      setViewBox(vb => {
        const cx = vb.x + vb.w / 2; const cy = vb.y + vb.h / 2
        const nw = vb.w * scale; const nh = vb.h * scale
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
      })
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [loading, nodes.length])

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownRef.current = true
    if (e.target === svgRef.current) {
      setIsPanning(true)
      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }, [])

  const handleZoomIn = () => setViewBox(vb => {
    const cx = vb.x + vb.w / 2; const cy = vb.y + vb.h / 2
    const nw = vb.w * 0.8; const nh = vb.h * 0.8
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
  })

  const handleZoomOut = () => setViewBox(vb => {
    const cx = vb.x + vb.w / 2; const cy = vb.y + vb.h / 2
    const nw = vb.w * 1.25; const nh = vb.h * 1.25
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
  })

  // ============================================================
  // Loading 状态
  // ============================================================
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ============================================================
  // 空状态 — 创建根节点
  // ============================================================
  if (nodes.length === 0) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
          <button onClick={onBack} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent">
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <h1 className="text-sm font-semibold">{map.name}</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-xs text-muted-foreground">思维导图还是空的</p>
          <Button size="sm" className="h-7 text-[11px]"
            onClick={() => {
              pushSnapshot()
              setNodes([makeNode('中心主题', null, DEFAULT_COLOR, 0)])
              setIsDirty(true)
            }}>
            <Plus className="h-3.5 w-3.5 mr-1" />创建中心主题
          </Button>
        </div>
      </div>
    )
  }

  // ============================================================
  // 选中节点 & 颜色选择器
  // ============================================================
  const selectedNode = selectedId ? nodes.find(n => n.id === selectedId) : null

  // ============================================================
  // 保存状态颜色
  // ============================================================
  const statusColor =
    saveStatus === 'saved' ? '#16a34a'
    : saveStatus === 'unsaved' ? '#d97706'
    : saveStatus === 'saving' ? undefined
    : '#dc2626' // error

  // ============================================================
  // 主渲染
  // ============================================================
  return (
    <div className="h-full flex flex-col bg-background select-none">
      {/* ===== 工具栏 ===== */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0" style={{ height: 41 }}>
        <button onClick={onBack} className="h-6 w-6 rounded flex items-center justify-center hover:bg-accent">
          <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <h1 className="text-sm font-semibold">{map.name}</h1>
        <span className="text-[10px] text-muted-foreground">{nodes.length} 节点</span>
        <div className="flex-1" />

        {/* 颜色选择器 */}
        {selectedNode && (
          <div className="flex items-center gap-1">
            {NODE_COLORS.map(c => (
              <button key={c}
                className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: selectedNode.color === c ? 'hsl(var(--foreground))' : 'transparent',
                }}
                onClick={() => handleColorChange(selectedNode.id, c)}
              />
            ))}
            <div className="w-px h-5 bg-border mx-1" />
          </div>
        )}

        {/* 撤销 / 重做 */}
        <Button
          variant="ghost" size="sm" className="h-7 text-[11px] px-1"
          onClick={undo} disabled={historyIdx < 0}
          title={historyIdx < 0 ? '无可撤销的操作' : `撤销（${history[historyIdx]?.length || 0} 个节点）— Ctrl+Z`}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost" size="sm" className="h-7 text-[11px] px-1"
          onClick={redo} disabled={historyIdx >= history.length - 1}
          title={historyIdx >= history.length - 1 ? '无可重做的操作' : `重做（${history[historyIdx + 1]?.length || 0} 个节点）— Ctrl+Shift+Z`}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        {history.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{historyIdx + 1}/{history.length}</span>
        )}

        <div className="w-px h-5 bg-border" />

        {/* 保存状态 & 按钮 */}
        <div className="flex items-center gap-1.5">
          {saveStatus === 'saving' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          <span className="text-[10px]" style={{ color: statusColor }}>
            {saveStatus === 'saved' && '已保存'}
            {saveStatus === 'unsaved' && '未保存'}
            {saveStatus === 'saving' && '保存中...'}
            {saveStatus === 'error' && '保存失败'}
          </span>
          {saveStatus === 'error' && (
            <button onClick={saveToServer} className="text-[10px] text-primary hover:underline">重试</button>
          )}
        </div>
        <Button
          variant="outline" size="sm" className="h-7 text-[11px] px-2"
          onClick={saveToServer}
          disabled={!isDirty || saveStatus === 'saving'}
          title="手动保存 — Ctrl+S"
        >
          <Save className="h-3 w-3 mr-1" />保存
        </Button>

        <div className="w-px h-5 bg-border" />

        {/* 视图控制 */}
        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setViewBox({ x: -100, y: -300, w: 900, h: 650 })}>
          适应
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={handleZoomOut}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] text-muted-foreground w-8 text-center">
          {Math.round((900 / viewBox.w) * 100)}%
        </span>
        <Button variant="outline" size="sm" className="h-7 text-[11px] px-2" onClick={handleZoomIn}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ===== SVG 画布 ===== */}
      <svg
        ref={svgRef}
        className="flex-1 w-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning ? 'grabbing' : 'grab', background: 'hsl(var(--background))' }}
        onClick={() => { setSelectedId(null); setEditingId(null) }}
      >
        {/* 淡入动画 */}
        <style>{`
          @keyframes fadeInNode {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .mindmap-node { animation: fadeInNode 0.3s ease-out; }
          .mindmap-edge { animation: fadeInNode 0.3s ease-out; }
        `}</style>

        {/* 连接线 */}
        {flatLayout.map(ln => {
          const parent = flatLayout.find(p => p.node.id === ln.node.parent_id)
          if (!parent) return null
          return (
            <path key={`edge-${ln.node.id}`}
              className="mindmap-edge"
              d={curvedPath(parent.x + parent.nodeW, parent.y + parent.nodeH / 2, ln.x, ln.y + ln.nodeH / 2)}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
            />
          )
        })}

        {/* 节点 */}
        {flatLayout.map(ln => {
          const isSelected = selectedId === ln.node.id
          const isEditing = editingId === ln.node.id
          const isDragging = dragState.nodeId === ln.node.id && dragState.isActive
          const nodeX = ln.x; const nodeY = ln.y

          return (
            <g key={ln.node.id}
              className="mindmap-node"
              style={{
                cursor: dragState.nodeId === ln.node.id ? (dragState.isActive ? 'grabbing' : 'grab') : 'pointer',
                transition: isDragging ? 'none' : 'transform 0.25s ease',
                opacity: isDragging ? 0.8 : 1,
              }}
              transform={isDragging
                ? `translate(${dragState.svgX - (ln.x + ln.nodeW / 2)}, ${dragState.svgY - (ln.y + ln.nodeH / 2)})`
                : undefined}
            >
              {/* 节点主体 */}
              <rect
                x={nodeX} y={nodeY} width={ln.nodeW} height={ln.nodeH} rx={RX}
                fill={dragState.targetId === ln.node.id ? 'hsl(var(--primary) / 0.08)' : 'hsl(var(--card))'}
                stroke={dragState.targetId === ln.node.id
                  ? 'hsl(var(--primary))'
                  : isSelected ? 'hsl(var(--foreground))' : ln.node.color}
                strokeWidth={dragState.targetId === ln.node.id ? 2.5 : isSelected ? 2.5 : 2}
                strokeDasharray={dragState.targetId === ln.node.id ? '6 3' : undefined}
                style={{ filter: 'brightness(1)', transition: 'all 0.15s' }}
                onClick={(e) => { e.stopPropagation(); setSelectedId(ln.node.id) }}
                onDoubleClick={() => handleEditStart(ln.node)}
                onMouseDown={(e) => handleNodeMouseDown(ln, e)}
              />

              {/* 节点文字 */}
              {isEditing ? (
                <foreignObject x={nodeX + 4} y={nodeY + 4} width={ln.nodeW - 8} height={ln.nodeH - 8}>
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full h-full bg-accent text-[11px] px-1 rounded outline-none text-foreground"
                    style={{ border: 'none' }}
                    autoFocus
                    onBlur={handleEditSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditSave()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={nodeX + PAD_X}
                  y={nodeY + (ln.nodeH - ln.lines.length * LINE_H) / 2 + LINE_H * 0.8}
                  textAnchor="start"
                  fill="currentColor" fontSize={11} fontWeight={500}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {ln.lines.map((line, i) => (
                    <tspan key={i} x={nodeX + PAD_X} dy={i === 0 ? 0 : LINE_H}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}

              {/* 操作按钮（选中 + 非编辑时显示） */}
              {isSelected && !isEditing && (
                <g>
                  {/* 折叠/展开 */}
                  {hasChildren(ln.node.id) && (
                    <foreignObject
                      x={nodeX + ln.nodeW - 14} y={nodeY + ln.nodeH / 2 - 7}
                      width={14} height={14}
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(ln.node.id) }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="w-full h-full rounded-full bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors">
                        <span className="text-[8px] leading-none text-muted-foreground">
                          {collapsedIds.has(ln.node.id) ? '+' : '−'}
                        </span>
                      </div>
                    </foreignObject>
                  )}

                  {/* 添加子节点 */}
                  <foreignObject
                    x={nodeX + ln.nodeW + 5} y={nodeY + ln.nodeH / 2 - 11}
                    width={22} height={22}
                    onClick={(e) => { e.stopPropagation(); handleAddChild(ln.node.id) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors">
                      <Plus className="h-3 w-3" />
                    </div>
                  </foreignObject>

                  {/* 添加兄弟节点 */}
                  <foreignObject
                    x={nodeX + ln.nodeW / 2 - 11} y={nodeY + ln.nodeH + 5}
                    width={22} height={22}
                    onClick={(e) => { e.stopPropagation(); handleAddSibling(ln.node.id) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors">
                      <Plus className="h-3 w-3" />
                    </div>
                  </foreignObject>

                  {/* 编辑 */}
                  <foreignObject
                    x={nodeX + ln.nodeW - 26} y={nodeY - 11}
                    width={22} height={22}
                    onClick={(e) => { e.stopPropagation(); handleEditStart(ln.node) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors">
                      <Pencil className="h-3 w-3" />
                    </div>
                  </foreignObject>

                  {/* 删除（多节点时才显示） */}
                  {nodes.length > 1 && (
                    <foreignObject
                      x={nodeX + ln.nodeW - 52} y={nodeY - 11}
                      width={22} height={22}
                      onClick={(e) => { e.stopPropagation(); handleDelete(ln.node.id) }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-destructive/10 transition-colors text-destructive">
                        <X className="h-3 w-3" />
                      </div>
                    </foreignObject>
                  )}
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* Toast 容器 */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id}
              style={{
                pointerEvents: 'auto', display: 'flex', alignItems: 'flex-start', gap: 12,
                borderRadius: 8, border: '1px solid', padding: '10px 14px',
                minWidth: 280, maxWidth: 400,
                backgroundColor: t.variant === 'destructive' ? 'hsl(0 80% 97%)' : 'hsl(var(--card))',
                borderColor: t.variant === 'destructive' ? 'hsl(0 80% 85%)' : 'hsl(var(--border))',
                color: t.variant === 'destructive' ? 'hsl(0 80% 40%)' : 'hsl(var(--foreground))',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                animation: 'fadeInNode 0.25s ease-out',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{t.title}</div>
                {t.description && <div style={{ marginTop: 2, fontSize: 11, opacity: 0.7 }}>{t.description}</div>}
              </div>
              <button
                style={{ flexShrink: 0, padding: 2, borderRadius: 4, opacity: 0.5, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MindMapCanvas
