"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins-example/mindmap/src/client.tsx
var client_exports = {};
__export(client_exports, {
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_react3 = require("react");
var import_lucide_react3 = require("lucide-react");

// plugins-example/mindmap/MindMapPage.tsx
var import_react2 = require("react");
var import_lucide_react2 = require("lucide-react");

// plugins-example/mindmap/ui.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}
function Button({ variant = "default", size = "default", className, ...props }) {
  const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    icon: "h-9 w-9"
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: cn(base, variants[variant], sizes[size], className), ...props });
}

// plugins-example/mindmap/MindMapCanvas.tsx
var import_react = require("react");
var import_lucide_react = require("lucide-react");

// plugins-example/mindmap/types.ts
var DEFAULT_COLOR = "#6b7280";
var NODE_COLORS = [
  "#6b7280",
  // gray
  "#ef4444",
  // red
  "#22c55e",
  // green
  "#f59e0b",
  // amber
  "#a855f7",
  // purple
  "#ec4899",
  // pink
  "#14b8a6",
  // teal
  "#f97316"
  // orange
];

// plugins-example/mindmap/api.ts
var supabase = null;
var currentUserId = null;
function initApi(client, userId) {
  supabase = client;
  currentUserId = userId;
}
function db() {
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}
async function listMaps() {
  const { data, error } = await db().from("mindmaps").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function createMap(name) {
  const { data, error } = await db().from("mindmaps").insert({ user_id: currentUserId, name }).select().single();
  if (error) throw error;
  return data;
}
async function updateMap(id, updates) {
  const { data, error } = await db().from("mindmaps").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteMap(id) {
  const { error } = await db().from("mindmaps").delete().eq("id", id);
  if (error) throw error;
}
async function listNodes(mapId) {
  const { data, error } = await db().from("mindmap_nodes").select("*").eq("map_id", mapId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function deleteAllNodes(mapId) {
  const { error } = await db().from("mindmap_nodes").delete().eq("map_id", mapId);
  if (error) throw error;
}
async function batchCreateNodes(nodes) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    const rows = batch.map((n) => ({
      id: n.id,
      map_id: n.map_id,
      parent_id: n.parent_id,
      text: n.text,
      color: n.color,
      sort_order: n.sort_order,
      created_at: n.created_at,
      updated_at: n.updated_at
    }));
    const { error } = await db().from("mindmap_nodes").insert(rows);
    if (error) throw error;
  }
}

// plugins-example/mindmap/MindMapCanvas.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var LINE_H = 16;
var PAD_Y = 10;
var PAD_X = 14;
var MIN_W = 70;
var MAX_W = 200;
var SIBLING_GAP = 10;
var LEVEL_GAP = 60;
var RX = 8;
var DRAG_THRESHOLD = 5;
var AUTO_SAVE_MS = 5e3;
var HISTORY_MAX = 30;
var _toastId = 0;
function showToastImpl(setToasts, t, mounted) {
  const id = ++_toastId;
  if (!mounted.current) return;
  setToasts((prev) => [...prev, { id, title: t.title, description: t.description, variant: t.variant }]);
  setTimeout(() => {
    if (mounted.current) setToasts((prev) => prev.filter((x) => x.id !== id));
  }, t.duration ?? 2e3);
}
function measureText(text) {
  function charW(ch) {
    const code = ch.charCodeAt(0);
    if (code < 128) return 7;
    return 12;
  }
  const maxLineW = MAX_W - PAD_X * 2;
  const lines = [];
  let cur = "";
  let curW = 0;
  for (const ch of text) {
    const w = charW(ch);
    if (curW + w > maxLineW && cur.length > 0) {
      lines.push(cur);
      cur = ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
  }
  if (cur) lines.push(cur);
  let maxW = MIN_W;
  for (const line of lines) {
    let lw = 0;
    for (const ch of line) lw += charW(ch);
    maxW = Math.max(maxW, lw + PAD_X * 2);
  }
  return {
    lines: lines.length > 0 ? lines : [text],
    nodeW: Math.min(maxW, MAX_W),
    nodeH: lines.length * LINE_H + PAD_Y * 2
  };
}
function buildTree(nodes, parentId) {
  const children = nodes.filter((n) => (n.parent_id || null) === parentId).sort((a, b) => a.sort_order - b.sort_order);
  return children.map((n) => {
    const kids = buildTree(nodes, n.id);
    const { lines, nodeW, nodeH } = measureText(n.text);
    const span = kids.length > 0 ? kids.reduce((sum, k) => sum + k.width, 0) + (kids.length - 1) * SIBLING_GAP : nodeH;
    return { node: n, x: 0, y: 0, width: Math.max(span, nodeH), nodeW, nodeH, lines, children: kids };
  });
}
function layoutTree(tree, parentX, parentY, parentW, parentH) {
  let totalH = 0;
  for (const child of tree) totalH += child.width;
  totalH += (tree.length - 1) * SIBLING_GAP;
  const startY = parentY + parentH / 2 - totalH / 2;
  let cy = startY;
  for (const child of tree) {
    const offsetY = (child.width - child.nodeH) / 2;
    child.y = cy + offsetY;
    child.x = parentX + parentW + LEVEL_GAP;
    layoutTree(child.children, child.x, child.y, child.nodeW, child.nodeH);
    cy += child.width + SIBLING_GAP;
  }
}
function curvedPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}
function topoSort(nodeList) {
  const result = [];
  const visited = /* @__PURE__ */ new Set();
  const inStack = /* @__PURE__ */ new Set();
  const dfs = (n) => {
    if (visited.has(n.id)) return;
    if (inStack.has(n.id)) {
      n.parent_id = null;
      return;
    }
    inStack.add(n.id);
    const parent = nodeList.find((x) => x.id === n.parent_id);
    if (parent) dfs(parent);
    inStack.delete(n.id);
    visited.add(n.id);
    result.push(n);
  };
  for (const n of nodeList) dfs(n);
  return result;
}
function normalizeSortOrders(nodeList) {
  const groups = /* @__PURE__ */ new Map();
  for (const n of nodeList) {
    const key = n.parent_id || "__root__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const result = nodeList.map((n) => ({ ...n }));
  for (const [, group] of groups) {
    group.sort((a, b) => a.sort_order - b.sort_order);
    group.forEach((n, i) => {
      const idx = result.findIndex((x) => x.id === n.id);
      if (idx !== -1) result[idx].sort_order = i;
    });
  }
  return result;
}
function collectDescendantIds(nodeId, nodeList) {
  const ids = /* @__PURE__ */ new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    ids.add(id);
    for (const n of nodeList) {
      if (n.parent_id === id) queue.push(n.id);
    }
  }
  return ids;
}
var INIT_DRAG = {
  nodeId: null,
  startX: 0,
  startY: 0,
  svgX: 0,
  svgY: 0,
  isActive: false,
  targetId: null
};
var MindMapCanvas = ({ map, onBack }) => {
  const [nodes, setNodes] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [saveStatus, setSaveStatus] = (0, import_react.useState)("saved");
  const [isDirty, setIsDirty] = (0, import_react.useState)(false);
  const svgRef = (0, import_react.useRef)(null);
  const [selectedId, setSelectedId] = (0, import_react.useState)(null);
  const [editingId, setEditingId] = (0, import_react.useState)(null);
  const [editText, setEditText] = (0, import_react.useState)("");
  const [viewBox, setViewBox] = (0, import_react.useState)({ x: -100, y: -300, w: 900, h: 650 });
  const [isPanning, setIsPanning] = (0, import_react.useState)(false);
  const [panStart, setPanStart] = (0, import_react.useState)({ x: 0, y: 0 });
  const [dragState, setDragState] = (0, import_react.useState)(INIT_DRAG);
  const [collapsedIds, setCollapsedIds] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [history, setHistory] = (0, import_react.useState)([]);
  const [historyIdx, setHistoryIdx] = (0, import_react.useState)(-1);
  const [toasts, setToasts] = (0, import_react.useState)([]);
  const nodesRef = (0, import_react.useRef)(nodes);
  nodesRef.current = nodes;
  const historyRef = (0, import_react.useRef)(history);
  historyRef.current = history;
  const historyIdxRef = (0, import_react.useRef)(historyIdx);
  historyIdxRef.current = historyIdx;
  const isDirtyRef = (0, import_react.useRef)(isDirty);
  isDirtyRef.current = isDirty;
  const saveStatusRef = (0, import_react.useRef)(saveStatus);
  saveStatusRef.current = saveStatus;
  const selectedIdRef = (0, import_react.useRef)(selectedId);
  selectedIdRef.current = selectedId;
  const editingIdRef = (0, import_react.useRef)(editingId);
  editingIdRef.current = editingId;
  const editTextRef = (0, import_react.useRef)(editText);
  editTextRef.current = editText;
  const mapRef = (0, import_react.useRef)(map);
  mapRef.current = map;
  const mouseDownRef = (0, import_react.useRef)(false);
  const mountedRef = (0, import_react.useRef)(true);
  const showToast = (0, import_react.useCallback)((t) => {
    showToastImpl(setToasts, t, mountedRef);
  }, []);
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const serverNodes = await listNodes(map.id);
        if (!cancelled) {
          setNodes(serverNodes);
          setIsDirty(false);
          setSaveStatus("saved");
        }
      } catch (e) {
        if (!cancelled) {
          console.error("\u52A0\u8F7D\u8282\u70B9\u5931\u8D25:", e);
          setSaveStatus("error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [map.id]);
  const saveToServer = (0, import_react.useCallback)(async () => {
    if (!isDirtyRef.current || saveStatusRef.current === "saving") return;
    const currentNodes = nodesRef.current;
    setSaveStatus("saving");
    try {
      const normalized = normalizeSortOrders(currentNodes);
      await deleteAllNodes(mapRef.current.id);
      if (normalized.length > 0) {
        const sorted = topoSort(normalized);
        await batchCreateNodes(sorted);
      }
      await updateMap(mapRef.current.id, { name: mapRef.current.name });
      setIsDirty(false);
      setSaveStatus("saved");
    } catch (e) {
      console.error("\u4FDD\u5B58\u5931\u8D25:", e);
      setSaveStatus("error");
    }
  }, []);
  (0, import_react.useEffect)(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveToServer();
    }, AUTO_SAVE_MS);
    return () => clearTimeout(timer);
  }, [isDirty, saveToServer]);
  (0, import_react.useEffect)(() => {
    const onBeforeUnload = (e) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  (0, import_react.useEffect)(() => {
    return () => {
      if (isDirtyRef.current) saveToServer();
    };
  }, [saveToServer]);
  const visibleNodes = (0, import_react.useMemo)(() => {
    if (collapsedIds.size === 0) return nodes;
    const hidden = /* @__PURE__ */ new Set();
    const visited = /* @__PURE__ */ new Set();
    function markDescendants(pid) {
      if (visited.has(pid)) return;
      visited.add(pid);
      for (const n of nodes) {
        if (n.parent_id === pid) {
          hidden.add(n.id);
          markDescendants(n.id);
        }
      }
    }
    for (const cid of collapsedIds) markDescendants(cid);
    return nodes.filter((n) => !hidden.has(n.id));
  }, [nodes, collapsedIds]);
  const layoutRoots = (0, import_react.useMemo)(() => {
    if (visibleNodes.length === 0) return [];
    const roots = visibleNodes.filter((n) => !n.parent_id || !visibleNodes.some((v) => v.id === n.parent_id));
    if (roots.length === 0) {
      return buildTree(visibleNodes, visibleNodes[0].parent_id);
    }
    const tree = buildTree(visibleNodes, null);
    let totalH = 0;
    for (const r of tree) totalH += r.width;
    totalH += (tree.length - 1) * SIBLING_GAP * 3;
    let startY = -totalH / 2;
    for (const r of tree) {
      r.y = startY + (r.width - r.nodeH) / 2;
      r.x = 0;
      layoutTree(r.children, r.x, r.y, r.nodeW, r.nodeH);
      startY += r.width + SIBLING_GAP * 3;
    }
    return tree;
  }, [visibleNodes]);
  const flatLayout = (0, import_react.useMemo)(() => {
    const result = [];
    function walk(list) {
      for (const ln of list) {
        result.push(ln);
        walk(ln.children);
      }
    }
    walk(layoutRoots);
    return result;
  }, [layoutRoots]);
  const toggleCollapse = (nodeId) => setCollapsedIds((prev) => {
    const next = new Set(prev);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    return next;
  });
  const hasChildren = (nodeId) => nodes.some((n) => n.parent_id === nodeId);
  const pushSnapshot = (0, import_react.useCallback)(() => {
    const cur = nodesRef.current;
    if (cur.length === 0) return;
    const idx = historyIdxRef.current;
    setHistory((prev) => {
      const next = prev.slice(0, idx + 1);
      next.push(JSON.parse(JSON.stringify(cur)));
      if (next.length > HISTORY_MAX) next.shift();
      return next;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, HISTORY_MAX - 1));
  }, []);
  const popSnapshot = (0, import_react.useCallback)(() => {
    setHistory((prev) => prev.slice(0, -1));
    setHistoryIdx((prev) => Math.max(prev - 1, -1));
  }, []);
  const undo = (0, import_react.useCallback)(() => {
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    if (idx < 0 || idx >= hist.length) return;
    const snapshot = hist[idx];
    if (!snapshot || snapshot.length === 0) return;
    setNodes(snapshot);
    setHistoryIdx((prev) => prev - 1);
    setIsDirty(true);
    showToast({ title: "\u5DF2\u64A4\u9500", description: `\u6062\u590D\u4E86 ${snapshot.length} \u4E2A\u8282\u70B9`, duration: 1500 });
  }, [showToast]);
  const redo = (0, import_react.useCallback)(() => {
    const idx = historyIdxRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    const snapshot = hist[idx + 1];
    if (!snapshot) return;
    setNodes(snapshot);
    setHistoryIdx((prev) => prev + 1);
    setIsDirty(true);
    showToast({ title: "\u5DF2\u91CD\u505A", description: `\u6062\u590D\u4E86 ${snapshot.length} \u4E2A\u8282\u70B9`, duration: 1500 });
  }, [showToast]);
  const makeNode = (text, parentId, color, sortOrder) => ({
    id: crypto.randomUUID(),
    map_id: map.id,
    parent_id: parentId,
    text,
    color,
    sort_order: sortOrder,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  const handleAddChild = (0, import_react.useCallback)((parentId) => {
    pushSnapshot();
    const cur = nodesRef.current;
    const parentNode = cur.find((n) => n.id === parentId);
    const siblings = cur.filter((n) => (n.parent_id || null) === parentId);
    const newNode = makeNode("\u65B0\u8282\u70B9", parentId, parentNode?.color || DEFAULT_COLOR, siblings.length);
    setNodes((prev) => [...prev, newNode]);
    setIsDirty(true);
    showToast({ title: "\u5B50\u8282\u70B9\u5DF2\u6DFB\u52A0", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
  }, [map.id, pushSnapshot, showToast]);
  const handleAddSibling = (0, import_react.useCallback)((nodeId) => {
    const cur = nodesRef.current;
    const node = cur.find((n) => n.id === nodeId);
    if (!node) return;
    pushSnapshot();
    const siblings = cur.filter((n) => (n.parent_id || null) === (node.parent_id || null));
    siblings.sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((n) => n.id === nodeId);
    const newNode = makeNode("\u65B0\u8282\u70B9", node.parent_id, node.color, idx + 1);
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if ((n.parent_id || null) === (node.parent_id || null) && n.sort_order > idx) {
          return { ...n, sort_order: n.sort_order + 1 };
        }
        return n;
      });
      return [...updated, newNode];
    });
    setIsDirty(true);
    showToast({ title: "\u5144\u5F1F\u8282\u70B9\u5DF2\u6DFB\u52A0", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
  }, [map.id, pushSnapshot, showToast]);
  const handleDelete = (0, import_react.useCallback)((nodeId) => {
    pushSnapshot();
    const idsToDelete = collectDescendantIds(nodeId, nodesRef.current);
    setNodes((prev) => prev.filter((n) => !idsToDelete.has(n.id)));
    if (selectedIdRef.current && idsToDelete.has(selectedIdRef.current)) {
      setSelectedId(null);
    }
    setIsDirty(true);
    showToast({ title: "\u8282\u70B9\u5DF2\u5220\u9664", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
  }, [pushSnapshot, showToast]);
  const handleEditStart = (node) => {
    setEditingId(node.id);
    setEditText(node.text);
  };
  const handleEditSave = (0, import_react.useCallback)(() => {
    const id = editingIdRef.current;
    const text = editTextRef.current;
    if (!id || !text.trim()) return;
    pushSnapshot();
    const newText = text.trim();
    setNodes((prev) => prev.map(
      (n) => n.id === id ? { ...n, text: newText, updated_at: (/* @__PURE__ */ new Date()).toISOString() } : n
    ));
    setEditingId(null);
    setIsDirty(true);
    showToast({ title: "\u6587\u672C\u5DF2\u66F4\u65B0", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
  }, [pushSnapshot, showToast]);
  const handleColorChange = (0, import_react.useCallback)((nodeId, color) => {
    pushSnapshot();
    setNodes((prev) => prev.map(
      (n) => n.id === nodeId ? { ...n, color, updated_at: (/* @__PURE__ */ new Date()).toISOString() } : n
    ));
    setIsDirty(true);
    showToast({ title: "\u989C\u8272\u5DF2\u66F4\u65B0", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
  }, [pushSnapshot, showToast]);
  const handleNodeMouseDown = (0, import_react.useCallback)((ln, e) => {
    if (editingIdRef.current) return;
    e.stopPropagation();
    mouseDownRef.current = true;
    setSelectedId(ln.node.id);
    setDragState({
      nodeId: ln.node.id,
      startX: e.clientX,
      startY: e.clientY,
      svgX: ln.x + ln.nodeW / 2,
      svgY: ln.y + ln.nodeH / 2,
      isActive: false,
      targetId: null
    });
  }, []);
  const handleMouseMove = (0, import_react.useCallback)((e) => {
    if (dragState.nodeId && mouseDownRef.current) {
      if (!dragState.isActive) {
        const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
        if (dist < DRAG_THRESHOLD) return;
        setDragState((prev) => ({ ...prev, isActive: true }));
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      let target = null;
      for (const ln of flatLayout) {
        if (ln.node.id === dragState.nodeId) continue;
        if (svgPt.x >= ln.x && svgPt.x <= ln.x + ln.nodeW && svgPt.y >= ln.y && svgPt.y <= ln.y + ln.nodeH) {
          target = ln.node.id;
          break;
        }
      }
      setDragState((prev) => ({ ...prev, svgX: svgPt.x, svgY: svgPt.y, targetId: target }));
      return;
    }
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanStart({ x: e.clientX, y: e.clientY });
      setViewBox((vb) => ({ ...vb, x: vb.x - dx * (vb.w / 900), y: vb.y - dy * (vb.h / 550) }));
    }
  }, [dragState, isPanning, panStart, flatLayout]);
  const handleMouseUp = (0, import_react.useCallback)(() => {
    mouseDownRef.current = false;
    if (dragState.nodeId && dragState.isActive) {
      const dragged = flatLayout.find((ln) => ln.node.id === dragState.nodeId);
      if (dragged) {
        pushSnapshot();
        if (dragState.targetId) {
          const descendantIds = collectDescendantIds(dragState.nodeId, nodesRef.current);
          if (descendantIds.has(dragState.targetId)) {
            showToast({ title: "\u4E0D\u80FD\u5C06\u8282\u70B9\u79FB\u52A8\u5230\u5176\u540E\u4EE3\u8282\u70B9\u4E0B", variant: "destructive", duration: 1500 });
            setDragState({ nodeId: null, startX: 0, startY: 0, svgX: 0, svgY: 0, isActive: false, targetId: null });
            setIsPanning(false);
            return;
          }
          const targetSibs = nodesRef.current.filter((n) => (n.parent_id || null) === dragState.targetId);
          setNodes((prev) => prev.map(
            (n) => n.id === dragState.nodeId ? { ...n, parent_id: dragState.targetId, sort_order: targetSibs.length, updated_at: (/* @__PURE__ */ new Date()).toISOString() } : n
          ));
          showToast({ title: "\u8282\u70B9\u5DF2\u79FB\u52A8", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
        } else {
          const parentKey = dragged.node.parent_id || null;
          const siblings = flatLayout.filter((ln) => ln.node.id !== dragState.nodeId && (ln.node.parent_id || null) === parentKey).sort((a, b) => a.y - b.y);
          let newOrder = siblings.length;
          for (let i = 0; i < siblings.length; i++) {
            if (dragState.svgY < siblings[i].y + siblings[i].nodeH / 2) {
              newOrder = i;
              break;
            }
          }
          const oldOrder = dragged.node.sort_order;
          setNodes((prev) => prev.map((n) => {
            if (n.id === dragState.nodeId) {
              return { ...n, sort_order: newOrder, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
            }
            if ((n.parent_id || null) === parentKey && n.id !== dragState.nodeId) {
              if (oldOrder < newOrder && n.sort_order > oldOrder && n.sort_order <= newOrder) {
                return { ...n, sort_order: n.sort_order - 1 };
              }
              if (oldOrder > newOrder && n.sort_order >= newOrder && n.sort_order < oldOrder) {
                return { ...n, sort_order: n.sort_order + 1 };
              }
            }
            return n;
          }));
          showToast({ title: "\u8282\u70B9\u5DF2\u91CD\u6392", description: "Ctrl+Z \u64A4\u9500", duration: 1500 });
        }
        setIsDirty(true);
      }
    }
    setDragState(INIT_DRAG);
    setIsPanning(false);
  }, [dragState, flatLayout, pushSnapshot, showToast]);
  (0, import_react.useEffect)(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveToServer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "Z" || e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
      const selId = selectedIdRef.current;
      if (!selId || editingIdRef.current) return;
      const target = e.target;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "Tab") {
        e.preventDefault();
        handleAddChild(selId);
      } else if (e.key === "Enter") {
        const node = nodesRef.current.find((n) => n.id === selId);
        if (node) handleEditStart(node);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        handleDelete(selId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveToServer, undo, redo, handleAddChild, handleDelete]);
  (0, import_react.useEffect)(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const scale = e.deltaY > 0 ? 1.1 : 0.9;
      setViewBox((vb) => {
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        const nw = vb.w * scale;
        const nh = vb.h * scale;
        return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
      });
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [loading, nodes.length]);
  const handleCanvasMouseDown = (0, import_react.useCallback)((e) => {
    mouseDownRef.current = true;
    if (e.target === svgRef.current) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  }, []);
  const handleZoomIn = () => setViewBox((vb) => {
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    const nw = vb.w * 0.8;
    const nh = vb.h * 0.8;
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
  });
  const handleZoomOut = () => setViewBox((vb) => {
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;
    const nw = vb.w * 1.25;
    const nh = vb.h * 1.25;
    return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
  });
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "h-full flex items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  if (nodes.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "h-full flex flex-col bg-background", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: onBack, className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ArrowLeft, { className: "h-3.5 w-3.5 text-muted-foreground" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: "text-sm font-semibold", children: map.name })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center gap-4", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs text-muted-foreground", children: "\u601D\u7EF4\u5BFC\u56FE\u8FD8\u662F\u7A7A\u7684" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          Button,
          {
            size: "sm",
            className: "h-7 text-[11px]",
            onClick: () => {
              pushSnapshot();
              setNodes([makeNode("\u4E2D\u5FC3\u4E3B\u9898", null, DEFAULT_COLOR, 0)]);
              setIsDirty(true);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Plus, { className: "h-3.5 w-3.5 mr-1" }),
              "\u521B\u5EFA\u4E2D\u5FC3\u4E3B\u9898"
            ]
          }
        )
      ] })
    ] });
  }
  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const statusColor = saveStatus === "saved" ? "#16a34a" : saveStatus === "unsaved" ? "#d97706" : saveStatus === "saving" ? void 0 : "#dc2626";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "h-full flex flex-col bg-background select-none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: onBack, className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ArrowLeft, { className: "h-3.5 w-3.5 text-muted-foreground" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: "text-sm font-semibold", children: map.name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
        nodes.length,
        " \u8282\u70B9"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex-1" }),
      selectedNode && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-1", children: [
        NODE_COLORS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
            style: {
              backgroundColor: c,
              borderColor: selectedNode.color === c ? "hsl(var(--foreground))" : "transparent"
            },
            onClick: () => handleColorChange(selectedNode.id, c)
          },
          c
        )),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-px h-5 bg-border mx-1" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Button,
        {
          variant: "ghost",
          size: "sm",
          className: "h-7 text-[11px] px-1",
          onClick: undo,
          disabled: historyIdx < 0,
          title: historyIdx < 0 ? "\u65E0\u53EF\u64A4\u9500\u7684\u64CD\u4F5C" : `\u64A4\u9500\uFF08${history[historyIdx]?.length || 0} \u4E2A\u8282\u70B9\uFF09\u2014 Ctrl+Z`,
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Undo2, { className: "h-3.5 w-3.5" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Button,
        {
          variant: "ghost",
          size: "sm",
          className: "h-7 text-[11px] px-1",
          onClick: redo,
          disabled: historyIdx >= history.length - 1,
          title: historyIdx >= history.length - 1 ? "\u65E0\u53EF\u91CD\u505A\u7684\u64CD\u4F5C" : `\u91CD\u505A\uFF08${history[historyIdx + 1]?.length || 0} \u4E2A\u8282\u70B9\uFF09\u2014 Ctrl+Shift+Z`,
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Redo2, { className: "h-3.5 w-3.5" })
        }
      ),
      history.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
        historyIdx + 1,
        "/",
        history.length
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-px h-5 bg-border" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-1.5", children: [
        saveStatus === "saving" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Loader2, { className: "h-3 w-3 animate-spin text-muted-foreground" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px]", style: { color: statusColor }, children: [
          saveStatus === "saved" && "\u5DF2\u4FDD\u5B58",
          saveStatus === "unsaved" && "\u672A\u4FDD\u5B58",
          saveStatus === "saving" && "\u4FDD\u5B58\u4E2D...",
          saveStatus === "error" && "\u4FDD\u5B58\u5931\u8D25"
        ] }),
        saveStatus === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: saveToServer, className: "text-[10px] text-primary hover:underline", children: "\u91CD\u8BD5" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        Button,
        {
          variant: "outline",
          size: "sm",
          className: "h-7 text-[11px] px-2",
          onClick: saveToServer,
          disabled: !isDirty || saveStatus === "saving",
          title: "\u624B\u52A8\u4FDD\u5B58 \u2014 Ctrl+S",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Save, { className: "h-3 w-3 mr-1" }),
            "\u4FDD\u5B58"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-px h-5 bg-border" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px] px-2", onClick: () => setViewBox({ x: -100, y: -300, w: 900, h: 650 }), children: "\u9002\u5E94" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "outline", size: "sm", className: "h-7 text-[11px] px-2", onClick: handleZoomOut, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ZoomOut, { className: "h-3.5 w-3.5" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px] text-muted-foreground w-8 text-center", children: [
        Math.round(900 / viewBox.w * 100),
        "%"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "outline", size: "sm", className: "h-7 text-[11px] px-2", onClick: handleZoomIn, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ZoomIn, { className: "h-3.5 w-3.5" }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "svg",
      {
        ref: svgRef,
        className: "flex-1 w-full",
        viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
        onMouseDown: handleCanvasMouseDown,
        onMouseMove: handleMouseMove,
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseUp,
        style: { cursor: isPanning ? "grabbing" : "grab", background: "hsl(var(--background))" },
        onClick: () => {
          setSelectedId(null);
          setEditingId(null);
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: `
          @keyframes fadeInNode {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .mindmap-node { animation: fadeInNode 0.3s ease-out; }
          .mindmap-edge { animation: fadeInNode 0.3s ease-out; }
        ` }),
          flatLayout.map((ln) => {
            const parent = flatLayout.find((p) => p.node.id === ln.node.parent_id);
            if (!parent) return null;
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "path",
              {
                className: "mindmap-edge",
                d: curvedPath(parent.x + parent.nodeW, parent.y + parent.nodeH / 2, ln.x, ln.y + ln.nodeH / 2),
                fill: "none",
                stroke: "hsl(var(--border))",
                strokeWidth: 1.5
              },
              `edge-${ln.node.id}`
            );
          }),
          flatLayout.map((ln) => {
            const isSelected = selectedId === ln.node.id;
            const isEditing = editingId === ln.node.id;
            const isDragging = dragState.nodeId === ln.node.id && dragState.isActive;
            const nodeX = ln.x;
            const nodeY = ln.y;
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "g",
              {
                className: "mindmap-node",
                style: {
                  cursor: dragState.nodeId === ln.node.id ? dragState.isActive ? "grabbing" : "grab" : "pointer",
                  transition: isDragging ? "none" : "transform 0.25s ease",
                  opacity: isDragging ? 0.8 : 1
                },
                transform: isDragging ? `translate(${dragState.svgX - (ln.x + ln.nodeW / 2)}, ${dragState.svgY - (ln.y + ln.nodeH / 2)})` : void 0,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    "rect",
                    {
                      x: nodeX,
                      y: nodeY,
                      width: ln.nodeW,
                      height: ln.nodeH,
                      rx: RX,
                      fill: dragState.targetId === ln.node.id ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
                      stroke: dragState.targetId === ln.node.id ? "hsl(var(--primary))" : isSelected ? "hsl(var(--foreground))" : ln.node.color,
                      strokeWidth: dragState.targetId === ln.node.id ? 2.5 : isSelected ? 2.5 : 2,
                      strokeDasharray: dragState.targetId === ln.node.id ? "6 3" : void 0,
                      style: { filter: "brightness(1)", transition: "all 0.15s" },
                      onClick: (e) => {
                        e.stopPropagation();
                        setSelectedId(ln.node.id);
                      },
                      onDoubleClick: () => handleEditStart(ln.node),
                      onMouseDown: (e) => handleNodeMouseDown(ln, e)
                    }
                  ),
                  isEditing ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("foreignObject", { x: nodeX + 4, y: nodeY + 4, width: ln.nodeW - 8, height: ln.nodeH - 8, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    "input",
                    {
                      value: editText,
                      onChange: (e) => setEditText(e.target.value),
                      className: "w-full h-full bg-accent text-[11px] px-1 rounded outline-none text-foreground",
                      style: { border: "none" },
                      autoFocus: true,
                      onBlur: handleEditSave,
                      onKeyDown: (e) => {
                        if (e.key === "Enter") handleEditSave();
                        if (e.key === "Escape") setEditingId(null);
                      }
                    }
                  ) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    "text",
                    {
                      x: nodeX + PAD_X,
                      y: nodeY + (ln.nodeH - ln.lines.length * LINE_H) / 2 + LINE_H * 0.8,
                      textAnchor: "start",
                      fill: "currentColor",
                      fontSize: 11,
                      fontWeight: 500,
                      style: { pointerEvents: "none", userSelect: "none" },
                      children: ln.lines.map((line, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("tspan", { x: nodeX + PAD_X, dy: i === 0 ? 0 : LINE_H, children: line }, i))
                    }
                  ),
                  isSelected && !isEditing && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("g", { children: [
                    hasChildren(ln.node.id) && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "foreignObject",
                      {
                        x: nodeX + ln.nodeW - 14,
                        y: nodeY + ln.nodeH / 2 - 7,
                        width: 14,
                        height: 14,
                        onClick: (e) => {
                          e.stopPropagation();
                          toggleCollapse(ln.node.id);
                        },
                        style: { cursor: "pointer" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-full h-full rounded-full bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-[8px] leading-none text-muted-foreground", children: collapsedIds.has(ln.node.id) ? "+" : "\u2212" }) })
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "foreignObject",
                      {
                        x: nodeX + ln.nodeW + 5,
                        y: nodeY + ln.nodeH / 2 - 11,
                        width: 22,
                        height: 22,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleAddChild(ln.node.id);
                        },
                        style: { cursor: "pointer" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Plus, { className: "h-3 w-3" }) })
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "foreignObject",
                      {
                        x: nodeX + ln.nodeW / 2 - 11,
                        y: nodeY + ln.nodeH + 5,
                        width: 22,
                        height: 22,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleAddSibling(ln.node.id);
                        },
                        style: { cursor: "pointer" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Plus, { className: "h-3 w-3" }) })
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "foreignObject",
                      {
                        x: nodeX + ln.nodeW - 26,
                        y: nodeY - 11,
                        width: 22,
                        height: 22,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleEditStart(ln.node);
                        },
                        style: { cursor: "pointer" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Pencil, { className: "h-3 w-3" }) })
                      }
                    ),
                    nodes.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "foreignObject",
                      {
                        x: nodeX + ln.nodeW - 52,
                        y: nodeY - 11,
                        width: 22,
                        height: 22,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(ln.node.id);
                        },
                        style: { cursor: "pointer" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-full h-full rounded-md bg-background border border-border flex items-center justify-center hover:bg-destructive/10 transition-colors text-destructive", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.X, { className: "h-3 w-3" }) })
                      }
                    )
                  ] })
                ]
              },
              ln.node.id
            );
          })
        ]
      }
    ),
    toasts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { position: "fixed", bottom: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }, children: toasts.map((t) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "div",
      {
        style: {
          pointerEvents: "auto",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          borderRadius: 8,
          border: "1px solid",
          padding: "10px 14px",
          minWidth: 280,
          maxWidth: 400,
          backgroundColor: t.variant === "destructive" ? "hsl(0 80% 97%)" : "hsl(var(--card))",
          borderColor: t.variant === "destructive" ? "hsl(0 80% 85%)" : "hsl(var(--border))",
          color: t.variant === "destructive" ? "hsl(0 80% 40%)" : "hsl(var(--foreground))",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          animation: "fadeInNode 0.25s ease-out"
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, fontWeight: 600 }, children: t.title }),
            t.description && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { marginTop: 2, fontSize: 11, opacity: 0.7 }, children: t.description })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              style: { flexShrink: 0, padding: 2, borderRadius: 4, opacity: 0.5, cursor: "pointer", background: "none", border: "none", color: "inherit" },
              onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id)),
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.X, { className: "h-3 w-3" })
            }
          )
        ]
      },
      t.id
    )) })
  ] });
};

// plugins-example/mindmap/MindMapPage.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var MindMapPage = () => {
  const [view, setView] = (0, import_react2.useState)("list");
  const [maps, setMaps] = (0, import_react2.useState)([]);
  const [loading, setLoading] = (0, import_react2.useState)(true);
  const [error, setError] = (0, import_react2.useState)(null);
  const [showForm, setShowForm] = (0, import_react2.useState)(false);
  const [formName, setFormName] = (0, import_react2.useState)("");
  const [saving, setSaving] = (0, import_react2.useState)(false);
  const [selectedMap, setSelectedMap] = (0, import_react2.useState)(null);
  const [renameTarget, setRenameTarget] = (0, import_react2.useState)(null);
  const [renameName, setRenameName] = (0, import_react2.useState)("");
  const [deleteTarget, setDeleteTarget] = (0, import_react2.useState)(null);
  const loadMaps = (0, import_react2.useCallback)(async () => {
    setLoading(true);
    setError(null);
    try {
      setMaps(await listMaps());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  (0, import_react2.useEffect)(() => {
    loadMaps();
  }, [loadMaps]);
  const openCanvas = (m) => {
    setSelectedMap(m);
    setView("canvas");
  };
  const closeCanvas = () => {
    setView("list");
    setSelectedMap(null);
    loadMaps();
  };
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const m = await createMap(formName.trim());
      setShowForm(false);
      setFormName("");
      setMaps((prev) => [m, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  const handleRename = async () => {
    if (!renameTarget || !renameName.trim()) return;
    try {
      await updateMap(renameTarget.id, { name: renameName.trim() });
      setMaps((prev) => prev.map((m) => m.id === renameTarget.id ? { ...m, name: renameName.trim() } : m));
      setRenameTarget(null);
    } catch (e) {
      console.error(e);
    }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMap(deleteTarget.id);
      setDeleteTarget(null);
      setMaps((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    } catch (e) {
      console.error(e);
    }
  };
  const relTime = (d) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "\u521A\u521A";
    if (mins < 60) return `${mins} \u5206\u949F\u524D`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} \u5929\u524D`;
    return new Date(d).toLocaleDateString("zh-CN");
  };
  const ListView = () => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "h-full flex flex-col bg-background", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Lightbulb, { className: "h-4 w-4 text-muted-foreground shrink-0" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h1", { className: "text-sm font-semibold", children: "\u601D\u7EF4\u5BFC\u56FE" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
        maps.length,
        " \u4E2A\u5BFC\u56FE"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex-1" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Button, { size: "sm", className: "h-7 text-[11px] px-3", onClick: () => {
        setShowForm(true);
        setFormName("");
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Plus, { className: "h-3.5 w-3.5 mr-1" }),
        "\u65B0\u5EFA\u5BFC\u56FE"
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex items-center justify-center h-48", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : error ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.AlertTriangle, { className: "h-8 w-8 text-muted-foreground/40" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { size: "sm", variant: "outline", className: "h-7 text-[11px]", onClick: loadMaps, children: "\u91CD\u8BD5" })
    ] }) : maps.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Lightbulb, { className: "h-10 w-10 text-muted-foreground/25" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs", children: "\u8FD8\u6CA1\u6709\u601D\u7EF4\u5BFC\u56FE\uFF0C\u521B\u5EFA\u4E00\u4E2A\u5F00\u59CB\u5427" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Button, { size: "sm", className: "h-7 text-[11px]", onClick: () => {
        setShowForm(true);
        setFormName("");
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Plus, { className: "h-3.5 w-3.5 mr-1" }),
        "\u65B0\u5EFA\u5BFC\u56FE"
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3", children: maps.map((m) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: "group flex flex-col gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer aspect-[4/3]",
        onClick: () => openCanvas(m),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-start justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Lightbulb, { className: "h-4 w-4 text-muted-foreground" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-accent flex items-center justify-center",
                  onClick: (e) => {
                    e.stopPropagation();
                    setRenameTarget(m);
                    setRenameName(m.name);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Pencil, { className: "h-3 w-3 text-muted-foreground" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center",
                  onClick: (e) => {
                    e.stopPropagation();
                    setDeleteTarget(m);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Trash2, { className: "h-3 w-3 text-muted-foreground" })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: "text-[13px] font-semibold leading-tight line-clamp-2", children: m.name }) }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-[10px] text-muted-foreground/40", children: relTime(m.updated_at) })
        ]
      },
      m.id
    )) }) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "h-full", children: [
    view === "list" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ListView, {}),
    view === "canvas" && selectedMap && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      MindMapCanvas,
      {
        map: selectedMap,
        onBack: closeCanvas
      }
    ),
    showForm && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: { position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setShowForm(false);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { backgroundColor: "hsl(var(--card))", borderRadius: 10, border: "1px solid hsl(var(--border))", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", width: 380 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { fontSize: 13, fontWeight: 600 }, children: "\u65B0\u5EFA\u601D\u7EF4\u5BFC\u56FE" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                placeholder: "\u8F93\u5165\u5BFC\u56FE\u540D\u79F0",
                value: formName,
                onChange: (e) => setFormName(e.target.value),
                className: "w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring",
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleCreate();
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid hsl(var(--border))" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px]", onClick: () => setShowForm(false), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { size: "sm", className: "h-7 text-[11px]", onClick: handleCreate, disabled: saving, children: saving ? "\u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA" })
          ] })
        ] })
      }
    ),
    renameTarget && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: { position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setRenameTarget(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { backgroundColor: "hsl(var(--card))", borderRadius: 10, border: "1px solid hsl(var(--border))", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", width: 380 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { fontSize: 13, fontWeight: 600 }, children: "\u91CD\u547D\u540D" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                value: renameName,
                onChange: (e) => setRenameName(e.target.value),
                className: "w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring",
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleRename();
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid hsl(var(--border))" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px]", onClick: () => setRenameTarget(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { size: "sm", className: "h-7 text-[11px]", onClick: handleRename, children: "\u786E\u5B9A" })
          ] })
        ] })
      }
    ),
    deleteTarget && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: { position: "fixed", inset: 0, zIndex: 60, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setDeleteTarget(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { backgroundColor: "hsl(var(--card))", borderRadius: 10, border: "1px solid hsl(var(--border))", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", width: 360, padding: 24, display: "flex", flexDirection: "column", gap: 16 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { fontSize: 13, fontWeight: 600 }, children: "\u786E\u8BA4\u5220\u9664" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { style: { fontSize: 12, color: "hsl(var(--muted-foreground))" }, children: [
            "\u786E\u5B9A\u8981\u5220\u9664\u300C",
            deleteTarget.name,
            "\u300D\u5417\uFF1F\u6240\u6709\u8282\u70B9\u5C06\u88AB\u4E00\u5E76\u5220\u9664\u3002"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px]", onClick: () => setDeleteTarget(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "destructive", size: "sm", className: "h-7 text-[11px]", onClick: handleDelete, children: "\u786E\u8BA4\u5220\u9664" })
          ] })
        ] })
      }
    )
  ] });
};

// plugins-example/mindmap/src/client.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var getSupabaseClient = null;
function MindMapApp() {
  const [ready, setReady] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    let cancelled = false;
    async function setup() {
      try {
        const client = getSupabaseClient?.();
        if (!client) {
          if (!cancelled) setError("Supabase \u672A\u914D\u7F6E\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E Supabase \u540E\u4F7F\u7528\u601D\u7EF4\u5BFC\u56FE\u529F\u80FD\u3002");
          return;
        }
        const { data } = await client.auth.getUser();
        if (cancelled) return;
        if (!data.user) {
          setError("\u672A\u767B\u5F55\u3002\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u767B\u5F55 Supabase \u8D26\u53F7\u540E\u518D\u4F7F\u7528\u601D\u7EF4\u5BFC\u56FE\u529F\u80FD\u3002");
          return;
        }
        initApi(client, data.user.id);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError("\u521D\u59CB\u5316\u5931\u8D25: " + (e.message || "\u672A\u77E5\u9519\u8BEF"));
      }
    }
    setup();
    return () => {
      cancelled = true;
    };
  }, []);
  if (error) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-xs", children: error }) });
  }
  if (!ready) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "h-full flex items-center justify-center bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_lucide_react3.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MindMapPage, {});
}
function registerClient(ctx) {
  getSupabaseClient = ctx.supabase?.getClient?.bind(ctx.supabase) || null;
  ctx.registerNav({ id: "mindmap", label: "\u601D\u7EF4\u5BFC\u56FE", icon: "Workflow", order: 75 });
  ctx.registerRoute("mindmap", () => Promise.resolve({ default: MindMapApp }));
}
