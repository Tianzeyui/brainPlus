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

// plugins-example/gantt/src/client.tsx
var client_exports = {};
__export(client_exports, {
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_lucide_react = require("lucide-react");

// plugins-example/gantt/ui.tsx
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
function Badge({ variant = "default", className, ...props }) {
  const base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none";
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    destructive: "border-transparent bg-destructive text-destructive-foreground",
    outline: "text-foreground"
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn(base, variants[variant] || variants.default, className), ...props });
}

// plugins-example/gantt/src/client.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var ROW_HEIGHT = 42;
var MIN_BAR_WIDTH = 4;
var TOOLTIP_DELAY = 300;
var TABLE_NAME = "gantt_tasks";
var LEFT_WIDTH = 200;
var COLOR_KEYS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "blue",
  "green",
  "purple",
  "orange",
  "pink"
];
var COLOR_HEX = {
  "chart-1": "#4cc9f0",
  "chart-2": "#4895ef",
  "chart-3": "#f72585",
  "chart-4": "#f77f00",
  "chart-5": "#06d6a0",
  "blue": "#3b82f6",
  "green": "#22c55e",
  "purple": "#a855f7",
  "orange": "#f97316",
  "pink": "#ec4899"
};
var STATUS_LABELS = {
  "pending": "\u5F85\u5F00\u59CB",
  "in-progress": "\u8FDB\u884C\u4E2D",
  "completed": "\u5DF2\u5B8C\u6210"
};
var STATUS_VARIANTS = {
  "pending": "secondary",
  "in-progress": "default",
  "completed": "outline"
};
var WEEKDAY_LABELS = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function diffDays(a, b) {
  const va = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const vb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((va - vb) / 864e5);
}
function isToday(d) {
  return formatDate(d) === formatDate(/* @__PURE__ */ new Date());
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
function rowToTask(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    startDate: r.start_date,
    ddl: r.ddl,
    color: r.color,
    status: r.status,
    createdAt: r.created_at
  };
}
var toastQueue = [];
var toastSubscribers = [];
function showToast(msg, type = "info") {
  toastQueue = [...toastQueue, { msg, type }];
  toastSubscribers.forEach((fn) => fn(toastQueue));
  setTimeout(() => {
    toastQueue = toastQueue.filter((t) => t.msg !== msg);
    toastSubscribers.forEach((fn) => fn(toastQueue));
  }, 2500);
}
function ToastHost() {
  const [queue, setQueue] = (0, import_react.useState)([]);
  (0, import_react.useEffect)(() => {
    toastSubscribers.push(setQueue);
    return () => {
      toastSubscribers = toastSubscribers.filter((fn) => fn !== setQueue);
    };
  }, []);
  if (queue.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "fixed top-4 right-4 z-[100] space-y-2", children: queue.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `px-3 py-2 rounded-md shadow-lg text-xs ${t.type === "error" ? "bg-destructive text-destructive-foreground" : "bg-card border border-border text-foreground"}`, children: t.msg }, i)) });
}
function registerClient(ctx) {
  const supabase = { getClient: () => ctx.supabase?.getClient?.() || null, isConfigured: () => !!ctx.supabase?.getClient?.() };
  const ui = { toast: showToast };
  const confirm = async (opts) => window.confirm(opts.message) ? opts.actions?.[0]?.key ?? "ok" : opts.actions?.[1]?.key ?? "cancel";
  function getClient() {
    const client = supabase.getClient();
    if (!client) throw new Error("Supabase \u672A\u914D\u7F6E");
    return client;
  }
  const GanttPage = () => {
    const [tasks, setTasks] = (0, import_react.useState)([]);
    const [loaded, setLoaded] = (0, import_react.useState)(false);
    const [loading, setLoading] = (0, import_react.useState)(true);
    const [loadError, setLoadError] = (0, import_react.useState)("");
    const [saving, setSaving] = (0, import_react.useState)(false);
    const [supabaseOk, setSupabaseOk] = (0, import_react.useState)(true);
    const [viewMode, setViewMode] = (0, import_react.useState)("day");
    const [contextMenu, setContextMenu] = (0, import_react.useState)(null);
    const [tooltip, setTooltip] = (0, import_react.useState)(null);
    const [dialog, setDialog] = (0, import_react.useState)(null);
    const [viewDate, setViewDate] = (0, import_react.useState)(() => {
      const d = /* @__PURE__ */ new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const viewCfg = (0, import_react.useMemo)(() => {
      switch (viewMode) {
        case "year":
          return { dayWidth: 72, totalCols: 12, unit: "month" };
        case "month":
          return { dayWidth: 24, totalCols: daysInMonth(viewDate.getFullYear(), viewDate.getMonth()), unit: "day" };
        case "day":
          return { dayWidth: 56, totalCols: 30, unit: "day" };
      }
    }, [viewMode, viewDate]);
    const dayWidth = viewCfg.dayWidth;
    const scrollRef = (0, import_react.useRef)(null);
    const tooltipTimerRef = (0, import_react.useRef)(null);
    const tooltipDismissRef = (0, import_react.useRef)(null);
    const contextMenuRef = (0, import_react.useRef)(null);
    const tooltipRef = (0, import_react.useRef)(null);
    const sortedTasks = (0, import_react.useMemo)(
      () => [...tasks].sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
        return a.createdAt < b.createdAt ? -1 : 1;
      }),
      [tasks]
    );
    const gridStart = (0, import_react.useMemo)(() => {
      if (viewMode === "year") return new Date(viewDate.getFullYear(), 0, 1);
      if (viewMode === "month") return new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      if (tasks.length === 0) return viewDate;
      let earliest = viewDate;
      tasks.forEach((t) => {
        const s = parseDate(t.startDate);
        if (s < earliest) earliest = s;
      });
      const d = new Date(earliest);
      d.setDate(d.getDate() - 7);
      return d < viewDate ? d : viewDate;
    }, [tasks, viewDate, viewMode]);
    const gridTotalCols = (0, import_react.useMemo)(() => {
      if (viewMode === "year") return 12;
      if (viewMode === "month") return viewCfg.totalCols;
      let latest = gridStart;
      tasks.forEach((t) => {
        const d = parseDate(t.ddl);
        if (d > latest) latest = d;
      });
      return Math.max(viewCfg.totalCols, diffDays(latest, gridStart) + 1 + 14);
    }, [tasks, gridStart, viewMode, viewCfg]);
    const headerLabel = (0, import_react.useMemo)(() => {
      if (viewMode === "year") return `${viewDate.getFullYear()}\u5E74`;
      if (viewMode === "month") return `${viewDate.getFullYear()}\u5E74${viewDate.getMonth() + 1}\u6708`;
      const end = new Date(gridStart);
      end.setDate(end.getDate() + gridTotalCols - 1);
      return `${formatDate(gridStart)} \u2192 ${formatDate(end)}`;
    }, [viewMode, viewDate, gridStart, gridTotalCols]);
    const monthSpans = (0, import_react.useMemo)(() => {
      const spans = [];
      if (viewMode === "year") {
        for (let i = 0; i < 12; i++) {
          spans.push({ label: `${i + 1}\u6708`, cols: 1 });
        }
        return spans;
      }
      let cur = null;
      for (let i = 0; i < gridTotalCols; i++) {
        const d = new Date(gridStart);
        d.setDate(d.getDate() + i);
        const label = `${d.getMonth() + 1}\u6708`;
        if (cur && cur.label === label) {
          cur.cols++;
        } else {
          if (cur) spans.push(cur);
          cur = { label, cols: 1 };
        }
      }
      if (cur) spans.push(cur);
      return spans;
    }, [gridTotalCols, gridStart, viewMode]);
    const barLeft = (0, import_react.useCallback)((task) => {
      if (viewMode === "year") {
        const sm = parseDate(task.startDate).getMonth();
        const bm = gridStart.getMonth();
        return (sm - bm + (parseDate(task.startDate).getFullYear() - gridStart.getFullYear()) * 12) * dayWidth;
      }
      return diffDays(parseDate(task.startDate), gridStart) * dayWidth;
    }, [dayWidth, gridStart, viewMode]);
    const barWidth = (0, import_react.useCallback)((task) => {
      if (viewMode === "year") {
        const sm = parseDate(task.startDate);
        const em = parseDate(task.ddl);
        const months = (em.getFullYear() - sm.getFullYear()) * 12 + em.getMonth() - sm.getMonth() + 1;
        return Math.max(months * dayWidth, MIN_BAR_WIDTH);
      }
      return Math.max((diffDays(parseDate(task.ddl), parseDate(task.startDate)) + 1) * dayWidth, MIN_BAR_WIDTH);
    }, [dayWidth, viewMode]);
    const loadTasks = (0, import_react.useCallback)(async () => {
      setLoading(true);
      setLoadError("");
      try {
        const sb = getClient();
        const { data, error } = await sb.from(TABLE_NAME).select("*").order("start_date", { ascending: true });
        if (error) throw error;
        setTasks(data.map(rowToTask));
      } catch (e) {
        if (e.message === "Supabase \u672A\u914D\u7F6E") {
          setSupabaseOk(false);
          setLoadError("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E Supabase \u8FDE\u63A5");
        } else setLoadError(e.message || "\u52A0\u8F7D\u4EFB\u52A1\u5931\u8D25");
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    }, []);
    (0, import_react.useEffect)(() => {
      if (!supabase?.isConfigured()) {
        setSupabaseOk(false);
        setLoadError("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E Supabase \u8FDE\u63A5");
        setLoading(false);
        setLoaded(true);
        return;
      }
      loadTasks();
    }, [supabase, loadTasks]);
    (0, import_react.useEffect)(() => {
      if (loaded && scrollRef.current) {
        const offset = diffDays(/* @__PURE__ */ new Date(), gridStart);
        if (offset >= 0 && offset < gridTotalCols) {
          scrollRef.current.scrollLeft = Math.max(0, LEFT_WIDTH + offset * dayWidth - 120);
        }
      }
    }, [loaded, gridStart, dayWidth, gridTotalCols]);
    (0, import_react.useEffect)(() => {
      if (loaded && scrollRef.current) {
        scrollRef.current.scrollLeft = 0;
      }
    }, [viewDate, loaded]);
    (0, import_react.useEffect)(() => {
      if (!contextMenu) return;
      const dismiss = () => setContextMenu(null);
      const h = (e) => {
        if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) dismiss();
      };
      const k = (e) => {
        if (e.key === "Escape") dismiss();
      };
      document.addEventListener("mousedown", h);
      document.addEventListener("keydown", k);
      window.addEventListener("scroll", dismiss, true);
      return () => {
        document.removeEventListener("mousedown", h);
        document.removeEventListener("keydown", k);
        window.removeEventListener("scroll", dismiss, true);
      };
    }, [contextMenu]);
    (0, import_react.useEffect)(() => {
      if (!tooltip) return;
      const dismiss = () => setTooltip(null);
      window.addEventListener("scroll", dismiss, true);
      return () => window.removeEventListener("scroll", dismiss, true);
    }, [tooltip]);
    const handleContextMenu = (0, import_react.useCallback)((e) => {
      e.preventDefault();
      const el = scrollRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left + el.scrollLeft - LEFT_WIDTH;
      const idx = Math.max(0, Math.floor(px / dayWidth));
      const d = new Date(gridStart);
      d.setDate(d.getDate() + idx);
      let mx = e.clientX, my = e.clientY;
      if (mx + 170 > window.innerWidth) mx = window.innerWidth - 175;
      if (my + 50 > window.innerHeight) my = window.innerHeight - 55;
      setContextMenu({ x: mx, y: my, date: formatDate(d) });
    }, [gridStart, dayWidth]);
    const handleSave = (0, import_react.useCallback)(async (data, editId) => {
      setSaving(true);
      try {
        const sb = getClient();
        if (editId) {
          const { error } = await sb.from(TABLE_NAME).update({
            name: data.name,
            description: data.description,
            start_date: data.startDate,
            ddl: data.ddl,
            status: data.status
          }).eq("id", editId);
          if (error) throw error;
          setTasks((prev) => prev.map((t) => t.id === editId ? { ...t, ...data } : t));
          ui.toast("\u4EFB\u52A1\u5DF2\u66F4\u65B0", "success");
        } else {
          const cnt = /* @__PURE__ */ new Map();
          COLOR_KEYS.forEach((c) => cnt.set(c, 0));
          tasks.forEach((t) => cnt.set(t.color, (cnt.get(t.color) || 0) + 1));
          let best = COLOR_KEYS[0], bestN = Infinity;
          cnt.forEach((n, c) => {
            if (n < bestN) {
              bestN = n;
              best = c;
            }
          });
          const { data: row, error } = await sb.from(TABLE_NAME).insert({
            name: data.name,
            description: data.description,
            start_date: data.startDate,
            ddl: data.ddl,
            color: best,
            status: data.status
          }).select().single();
          if (error) throw error;
          setTasks((prev) => [...prev, rowToTask(row)]);
          ui.toast("\u4EFB\u52A1\u5DF2\u521B\u5EFA", "success");
        }
        setDialog(null);
      } catch (e) {
        ui.toast("\u4FDD\u5B58\u5931\u8D25: " + (e.message || "unknown"), "error");
      } finally {
        setSaving(false);
      }
    }, [tasks]);
    const handleDelete = (0, import_react.useCallback)(async (taskId) => {
      const result = await confirm({
        title: "\u5220\u9664\u4EFB\u52A1",
        message: "\u786E\u5B9A\u8981\u5220\u9664\u8FD9\u4E2A\u4EFB\u52A1\u5417\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
        actions: [{ key: "ok", label: "\u786E\u8BA4\u5220\u9664", variant: "destructive" }, { key: "cancel", label: "\u53D6\u6D88" }]
      });
      if (result !== "ok") return;
      try {
        const sb = getClient();
        const { error } = await sb.from(TABLE_NAME).delete().eq("id", taskId);
        if (error) throw error;
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        setTooltip(null);
        ui.toast("\u4EFB\u52A1\u5DF2\u5220\u9664", "info");
      } catch (e) {
        ui.toast("\u5220\u9664\u5931\u8D25: " + (e.message || "unknown"), "error");
      }
    }, []);
    const showTooltip = (0, import_react.useCallback)((task, el) => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      if (tooltipDismissRef.current) clearTimeout(tooltipDismissRef.current);
      tooltipTimerRef.current = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const tw = 280, th = 180;
        let tx = rect.left + rect.width / 2 - tw / 2;
        let ty = rect.bottom + 8;
        if (ty + th > window.innerHeight - 8) ty = rect.top - th - 8;
        tx = clamp(tx, 8, window.innerWidth - tw - 8);
        ty = clamp(ty, 8, window.innerHeight - th - 8);
        setTooltip({ task, x: tx, y: ty });
      }, TOOLTIP_DELAY);
    }, []);
    const hideTooltip = (0, import_react.useCallback)(() => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
      tooltipDismissRef.current = setTimeout(() => setTooltip(null), 250);
    }, []);
    const cancelHideTooltip = (0, import_react.useCallback)(() => {
      if (tooltipDismissRef.current) clearTimeout(tooltipDismissRef.current);
    }, []);
    const goToday = (0, import_react.useCallback)(() => {
      const now = /* @__PURE__ */ new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setViewDate(firstOfMonth);
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          const offset = viewMode === "year" ? now.getMonth() : diffDays(now, firstOfMonth);
          scrollRef.current.scrollLeft = Math.max(0, LEFT_WIDTH + offset * dayWidth - 120);
        }
      });
    }, [viewMode, dayWidth]);
    const navPrev = (0, import_react.useCallback)(() => {
      setViewDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "year") d.setFullYear(d.getFullYear() - 1);
        else d.setMonth(d.getMonth() - 1);
        return d;
      });
    }, [viewMode]);
    const navNext = (0, import_react.useCallback)(() => {
      setViewDate((prev) => {
        const d = new Date(prev);
        if (viewMode === "year") d.setFullYear(d.getFullYear() + 1);
        else d.setMonth(d.getMonth() + 1);
        return d;
      });
    }, [viewMode]);
    const switchMode = (0, import_react.useCallback)((m) => {
      const now = /* @__PURE__ */ new Date();
      if (m === "year") setViewDate(new Date(now.getFullYear(), 0, 1));
      else setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
      setViewMode(m);
    }, []);
    if (loading) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "h-full flex items-center justify-center gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Loader2, { className: "h-4 w-4 animate-spin text-muted-foreground" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4EFB\u52A1\u6570\u636E\u2026" })
      ] });
    }
    if (!supabaseOk) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "h-full flex flex-col items-center justify-center gap-3 p-8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.AlertTriangle, { className: "h-8 w-8 text-muted-foreground/40" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: loadError }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-[11px] text-muted-foreground/50 text-center max-w-xs", children: "\u7518\u7279\u56FE\u63D2\u4EF6\u9700\u8981 Supabase \u5B58\u50A8\u4EFB\u52A1\u6570\u636E\u3002\u8BF7\u5728\u8BBE\u7F6E \u2192 \u80FD\u529B\u4E2D\u914D\u7F6E Supabase \u8FDE\u63A5\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "outline", size: "sm", className: "h-8 text-xs mt-2", onClick: loadTasks, children: "\u91CD\u8BD5" })
      ] });
    }
    const HEADER_H = 52;
    const MONTH_H = 18;
    const DAY_H = 34;
    const TimelineHeader = () => {
      const w = gridTotalCols * dayWidth;
      const isYear = viewMode === "year";
      const isMonth = viewMode === "month";
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sticky top-0 z-10 bg-card", style: { width: w }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex border-b border-border/30 items-center", style: { height: MONTH_H }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex-1 text-center text-[10px] text-muted-foreground font-medium", style: { width: w }, children: headerLabel }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex border-b border-border", style: { height: DAY_H }, children: isYear || isMonth ? (
          // Year: 1-12月, Month: 1-31日
          Array.from({ length: gridTotalCols }, (_, i) => {
            const today = isMonth && isToday(new Date(gridStart.getFullYear(), gridStart.getMonth(), i + 1));
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "div",
              {
                className: cn("flex items-center justify-center shrink-0 border-r border-r-border/20 text-[10px]", today && "bg-primary/10 text-primary font-semibold", isMonth && isWeekend(new Date(gridStart.getFullYear(), gridStart.getMonth(), i + 1)) && !today && "bg-muted/30 text-muted-foreground"),
                style: { width: dayWidth, height: DAY_H },
                children: isYear ? `${i + 1}\u6708` : `${i + 1}`
              },
              i
            );
          })
        ) : (
          // Day mode: date + weekday
          Array.from({ length: gridTotalCols }, (_, i) => {
            const d = new Date(gridStart);
            d.setDate(d.getDate() + i);
            const today = isToday(d);
            return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "div",
              {
                className: cn("flex flex-col items-center justify-center shrink-0 border-r border-r-border/20", today && "bg-primary/10", isWeekend(d) && !today && "bg-muted/30"),
                style: { width: dayWidth, height: DAY_H },
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: cn("text-[10px] leading-tight", today ? "text-primary font-semibold" : isWeekend(d) ? "text-muted-foreground" : "text-foreground"), children: [
                    d.getMonth() + 1,
                    "/",
                    d.getDate()
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cn("text-[9px] leading-tight", today ? "text-primary/60" : "text-muted-foreground/50"), children: WEEKDAY_LABELS[d.getDay()] })
                ]
              },
              i
            );
          })
        ) })
      ] });
    };
    const TaskBar = ({ task }) => {
      const left = barLeft(task);
      const bw = barWidth(task);
      const overdue = parseDate(task.ddl) < /* @__PURE__ */ new Date() && task.status !== "completed";
      const hex = COLOR_HEX[task.color] || "#4895ef";
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: cn("absolute rounded flex items-center gap-1 cursor-pointer transition-shadow hover:shadow-lg group", overdue && "ring-2 ring-destructive ring-offset-1 ring-offset-background"),
          style: {
            left,
            top: 5,
            width: bw,
            height: ROW_HEIGHT - 10,
            minWidth: MIN_BAR_WIDTH,
            backgroundColor: hex,
            opacity: task.status === "completed" ? 0.45 : 1
          },
          onMouseEnter: (e) => showTooltip(task, e.currentTarget),
          onMouseLeave: hideTooltip,
          children: bw > 40 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cn("text-[11px] text-white font-medium truncate px-2", task.status === "completed" && "line-through"), children: task.name })
        }
      );
    };
    const TimelineBody = () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { width: gridTotalCols * dayWidth }, onContextMenu: handleContextMenu, children: sortedTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex items-center justify-center text-xs text-muted-foreground/40 select-none border-b border-border/20", style: { height: ROW_HEIGHT }, children: "\u53F3\u952E\u6B64\u5904\u65B0\u589E\u5DE5\u4F5C" }) : sortedTasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "relative border-b border-border/20", style: { height: ROW_HEIGHT }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TaskBar, { task }) }, task.id)) });
    const GridOverlay = () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "absolute inset-0 pointer-events-none", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { width: gridTotalCols * dayWidth, height: "100%" }, children: Array.from({ length: gridTotalCols }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: cn("absolute top-0 bottom-0 border-r border-r-border/10", isToday(d) && "bg-primary/[0.03]", isWeekend(d) && !isToday(d) && "bg-muted/10"),
          style: { left: i * dayWidth, width: dayWidth }
        },
        i
      );
    }) }) });
    const LeftRows = () => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: sortedTasks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex items-center px-3 text-[11px] text-muted-foreground/40 border-b border-border/20", style: { height: ROW_HEIGHT }, children: "\u6682\u65E0\u4EFB\u52A1" }) : sortedTasks.map((task) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 px-3 border-b border-border/20 bg-card", style: { height: ROW_HEIGHT }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-2 h-2 rounded-full shrink-0", style: { backgroundColor: COLOR_HEX[task.color] || "#4895ef" } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: cn("text-[12px] truncate flex-1", task.status === "completed" && "line-through text-muted-foreground"), children: task.name }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { variant: STATUS_VARIANTS[task.status], className: "text-[9px] px-1 py-0 h-4 shrink-0", children: STATUS_LABELS[task.status] })
    ] }, task.id)) });
    const ContextMenuPopup = () => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "div",
      {
        ref: contextMenuRef,
        className: "fixed z-[100] min-w-[160px] rounded-lg border border-border bg-card shadow-xl py-1",
        style: { left: contextMenu.x, top: contextMenu.y },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "px-2 py-1 text-[10px] text-muted-foreground border-b border-border/50 mb-1", children: contextMenu.date }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              className: "w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent transition-colors text-left",
              onClick: () => {
                const d = contextMenu.date;
                setContextMenu(null);
                setDialog({ mode: "create", defaultStartDate: d });
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Plus, { className: "h-3.5 w-3.5" }),
                "\u65B0\u589E\u5DE5\u4F5C"
              ]
            }
          )
        ]
      }
    );
    const TaskFormDialog = ({ dialog: dialog2 }) => {
      const edit = dialog2.mode === "edit" ? dialog2.task : null;
      const [name, setName] = (0, import_react.useState)(edit?.name || "");
      const [desc, setDesc] = (0, import_react.useState)(edit?.description || "");
      const [startDate, setStartDate] = (0, import_react.useState)(edit?.startDate || dialog2.defaultStartDate || formatDate(/* @__PURE__ */ new Date()));
      const [ddl, setDdl] = (0, import_react.useState)(edit?.ddl || formatDate(new Date((/* @__PURE__ */ new Date()).setDate((/* @__PURE__ */ new Date()).getDate() + 7))));
      const [status, setStatus] = (0, import_react.useState)(edit?.status || "pending");
      const [errors, setErrors] = (0, import_react.useState)({});
      const validate = () => {
        const e = {};
        if (!name.trim()) e.name = "\u8BF7\u8F93\u5165\u4EFB\u52A1\u540D\u79F0";
        if (parseDate(ddl) < parseDate(startDate)) e.ddl = "\u622A\u6B62\u65E5\u671F\u4E0D\u80FD\u65E9\u4E8E\u5F00\u59CB\u65E5\u671F";
        setErrors(e);
        return Object.keys(e).length === 0;
      };
      const submit = () => {
        if (!validate()) return;
        handleSave({ name: name.trim(), description: desc.trim(), startDate, ddl, status }, edit?.id);
      };
      const inputCls = (hasErr) => `w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring ${hasErr ? "border-destructive" : "border-input"}`;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          "data-backdrop": "true",
          style: { position: "fixed", inset: 0, zIndex: 50, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 },
          onClick: (ev) => {
            if (ev.target.dataset.backdrop === "true") setDialog(null);
          },
          onKeyDown: (ev) => {
            if (ev.key === "Escape") setDialog(null);
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { backgroundColor: "hsl(var(--card))", borderRadius: 10, border: "1px solid hsl(var(--border))", boxShadow: "0 10px 40px rgba(0,0,0,0.2)", width: 380, maxHeight: "90vh", overflowY: "auto" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: "1px solid hsl(var(--border))" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { style: { fontSize: 13, fontWeight: 600, margin: 0 }, children: dialog2.mode === "create" ? "\u65B0\u589E\u5DE5\u4F5C" : "\u7F16\u8F91\u5DE5\u4F5C" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { style: { width: 20, height: 20, borderRadius: 4, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, onClick: () => setDialog(null), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.X, { size: 14, color: "hsl(var(--muted-foreground))" }) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u4EFB\u52A1\u540D\u79F0" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    placeholder: "\u8F93\u5165\u4EFB\u52A1\u540D\u79F0",
                    value: name,
                    onChange: (e) => {
                      setName(e.target.value);
                      setErrors((prev) => ({ ...prev, name: "" }));
                    },
                    className: inputCls(!!errors.name),
                    autoFocus: true,
                    onKeyDown: (e) => {
                      if (e.key === "Enter") submit();
                    }
                  }
                ),
                errors.name && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--destructive))" }, children: errors.name })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u63CF\u8FF0" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "textarea",
                  {
                    placeholder: "\u4EFB\u52A1\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
                    value: desc,
                    onChange: (e) => setDesc(e.target.value),
                    rows: 2,
                    className: inputCls(false),
                    style: { resize: "vertical" }
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u5F00\u59CB" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "date", value: startDate, onChange: (e) => setStartDate(e.target.value), className: inputCls(false) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u622A\u6B62" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    "input",
                    {
                      type: "date",
                      value: ddl,
                      onChange: (e) => {
                        setDdl(e.target.value);
                        setErrors((prev) => ({ ...prev, ddl: "" }));
                      },
                      className: inputCls(!!errors.ddl)
                    }
                  ),
                  errors.ddl && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--destructive))" }, children: errors.ddl })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u72B6\u6001" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", gap: 6 }, children: ["pending", "in-progress", "completed"].map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => setStatus(s),
                    style: {
                      flex: 1,
                      height: 28,
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      border: "1px solid",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      ...status === s ? {
                        backgroundColor: "hsl(var(--primary))",
                        color: "hsl(var(--primary-foreground))",
                        borderColor: "hsl(var(--primary))"
                      } : {
                        backgroundColor: "hsl(var(--background))",
                        color: "hsl(var(--muted-foreground))",
                        borderColor: "hsl(var(--input))"
                      }
                    },
                    children: STATUS_LABELS[s]
                  },
                  s
                )) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid hsl(var(--border))", borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px] px-3", onClick: () => setDialog(null), disabled: saving, children: "\u53D6\u6D88" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { size: "sm", className: "h-7 text-[11px] px-4", onClick: submit, disabled: saving, children: [
                saving && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Loader2, { className: "h-3 w-3 animate-spin mr-1" }),
                saving ? "\u4FDD\u5B58\u4E2D\u2026" : dialog2.mode === "create" ? "\u521B\u5EFA" : "\u4FDD\u5B58"
              ] })
            ] })
          ] })
        }
      );
    };
    const TaskTooltipPopup = ({ tooltip: tooltip2 }) => {
      const { task } = tooltip2;
      const overdue = parseDate(task.ddl) < /* @__PURE__ */ new Date() && task.status !== "completed";
      const hex = COLOR_HEX[task.color] || "#4895ef";
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          ref: tooltipRef,
          className: "fixed z-[100] w-[280px] rounded-lg border border-border bg-card shadow-xl p-4 space-y-3",
          style: { left: tooltip2.x, top: tooltip2.y },
          onMouseEnter: cancelHideTooltip,
          onMouseLeave: () => setTooltip(null),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 min-w-0", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "w-3 h-3 rounded-full shrink-0", style: { backgroundColor: hex } }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { className: "text-[13px] font-semibold truncate", children: task.name })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center shrink-0 ml-2", onClick: () => setTooltip(null), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.X, { className: "h-3 w-3 text-muted-foreground" }) })
            ] }),
            task.description && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-[11px] text-muted-foreground leading-relaxed", children: task.description }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "space-y-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 text-[11px]", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Calendar, { className: "h-3 w-3 text-muted-foreground shrink-0" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-muted-foreground", children: "\u5F00\u59CB\uFF1A" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: task.startDate })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 text-[11px]", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Flag, { className: "h-3 w-3 text-muted-foreground shrink-0" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-muted-foreground", children: "\u622A\u6B62\uFF1A" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: cn(overdue && "text-destructive font-medium"), children: [
                  task.ddl,
                  overdue && " (\u5DF2\u903E\u671F)"
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Badge, { variant: STATUS_VARIANTS[task.status], className: "text-[9px] px-1 py-0 h-4", children: STATUS_LABELS[task.status] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex gap-2 pt-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { variant: "outline", size: "sm", className: "h-7 text-[11px] flex-1", onClick: () => {
                setTooltip(null);
                setDialog({ mode: "edit", task });
              }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Pencil, { className: "h-3 w-3 mr-1" }),
                "\u7F16\u8F91"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { variant: "destructive", size: "sm", className: "h-7 text-[11px] flex-1", onClick: () => handleDelete(task.id), children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Trash2, { className: "h-3 w-3 mr-1" }),
                "\u5220\u9664"
              ] })
            ] })
          ]
        }
      );
    };
    const TitleBar = () => {
      const modes = [
        { key: "year", label: "\u5E74" },
        { key: "month", label: "\u6708" },
        { key: "day", label: "\u65E5" }
      ];
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card shrink-0", style: { height: 41 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.BarChart3, { className: "h-4 w-4 text-muted-foreground shrink-0" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h1", { className: "text-sm font-semibold", children: "\u7518\u7279\u56FE" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
          tasks.length,
          " \u4EFB\u52A1"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex-1" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex rounded-md border border-border overflow-hidden", children: modes.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: cn(
              "px-2.5 py-1 text-[11px] font-medium transition-colors",
              i > 0 && "border-l border-border",
              viewMode === m.key ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
            ),
            onClick: () => switchMode(m.key),
            children: m.label
          },
          m.key
        )) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "outline", size: "sm", className: "h-7 text-[11px] px-2", onClick: goToday, children: "\u4ECA\u5929" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { size: "sm", className: "h-7 text-[11px] px-3", onClick: () => setDialog({ mode: "create", defaultStartDate: formatDate(/* @__PURE__ */ new Date()) }), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Plus, { className: "h-3.5 w-3.5 mr-1" }),
          "\u65B0\u589E\u5DE5\u4F5C"
        ] })
      ] });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "h-full flex flex-col bg-background select-none", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TitleBar, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex flex-1 overflow-hidden relative", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { ref: scrollRef, className: "flex-1 overflow-auto", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex", style: { minWidth: LEFT_WIDTH + gridTotalCols * dayWidth, minHeight: "100%" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sticky left-0 z-40 bg-card", style: { width: LEFT_WIDTH, boxShadow: "1px 0 0 0 hsl(var(--border)), 2px 0 4px rgba(0,0,0,0.05)" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "sticky top-0 z-40 bg-card border-b border-border px-3 flex items-center", style: { height: HEADER_H }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-[11px] font-semibold text-muted-foreground", children: "\u4EFB\u52A1\u540D\u79F0" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-auto text-[10px] text-muted-foreground/50", children: tasks.length })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LeftRows, {})
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex-1 relative", style: { minWidth: gridTotalCols * dayWidth }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(GridOverlay, {}),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TimelineHeader, {}),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TimelineBody, {})
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "absolute z-50 w-6 h-10 rounded-r border border-border bg-card shadow flex items-center justify-center hover:bg-accent transition-colors",
            style: { left: LEFT_WIDTH, top: "50%", transform: "translateY(-50%)" },
            onClick: navPrev,
            title: "\u4E0A\u4E00\u5468\u671F",
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ChevronLeft, { className: "h-3.5 w-3.5" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            className: "absolute z-50 w-6 h-10 rounded-l border border-border bg-card shadow flex items-center justify-center hover:bg-accent transition-colors",
            style: { right: 0, top: "50%", transform: "translateY(-50%)" },
            onClick: navNext,
            title: "\u4E0B\u4E00\u5468\u671F",
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.ChevronRight, { className: "h-3.5 w-3.5" })
          }
        )
      ] }),
      contextMenu && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ContextMenuPopup, {}),
      dialog && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TaskFormDialog, { dialog }),
      tooltip && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TaskTooltipPopup, { tooltip }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ToastHost, {})
    ] });
  };
  ctx.registerNav({ id: "gantt", label: "\u7518\u7279\u56FE", icon: "BarChart3", order: 80 });
  ctx.registerRoute("gantt", () => Promise.resolve({ default: GanttPage }));
}
