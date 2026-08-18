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

// plugins-example/drawio/src/client.tsx
var client_exports = {};
__export(client_exports, {
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_react2 = require("react");
var import_lucide_react2 = require("lucide-react");

// plugins-example/drawio/DrawioCanvas.tsx
var import_react = require("react");
var import_lucide_react = require("lucide-react");

// plugins-example/drawio/api.ts
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
async function listDiagrams() {
  const { data, error } = await db().from("drawios").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function getDiagram(id) {
  const { data, error } = await db().from("drawios").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}
async function createDiagram(name, xml = "") {
  const { data, error } = await db().from("drawios").insert({ user_id: currentUserId, name, xml }).select().single();
  if (error) throw error;
  return data;
}
async function updateDiagram(id, updates) {
  const { data, error } = await db().from("drawios").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteDiagram(id) {
  const { error } = await db().from("drawios").delete().eq("id", id);
  if (error) throw error;
}

// plugins-example/drawio/DrawioCanvas.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var EMBED_URL = "https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=1";
var AUTOSAVE_DEBOUNCE_MS = 2e3;
var EMPTY_XML = `<mxfile host="stardust">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
var DrawioCanvas = ({ onBack }) => {
  const iframeRef = (0, import_react.useRef)(null);
  const [diagrams, setDiagrams] = (0, import_react.useState)([]);
  const [currentId, setCurrentId] = (0, import_react.useState)(null);
  const [loading, setLoading] = (0, import_react.useState)(true);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [saveStatus, setSaveStatus] = (0, import_react.useState)("saved");
  const [showDropdown, setShowDropdown] = (0, import_react.useState)(false);
  const dropdownRef = (0, import_react.useRef)(null);
  const [renamingId, setRenamingId] = (0, import_react.useState)(null);
  const [renameText, setRenameText] = (0, import_react.useState)("");
  const [iframeReady, setIframeReady] = (0, import_react.useState)(false);
  const currentIdRef = (0, import_react.useRef)(currentId);
  currentIdRef.current = currentId;
  const currentNameRef = (0, import_react.useRef)("");
  const iframeReadyRef = (0, import_react.useRef)(iframeReady);
  iframeReadyRef.current = iframeReady;
  const autosaveTimerRef = (0, import_react.useRef)(null);
  const mountedRef = (0, import_react.useRef)(false);
  const loadedXmlRef = (0, import_react.useRef)("");
  (0, import_react.useEffect)(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const loadDiagrams = (0, import_react.useCallback)(async () => {
    try {
      const list = await listDiagrams();
      if (!mountedRef.current) return;
      setDiagrams(list);
      let targetId = null;
      try {
        targetId = localStorage.getItem("stardust_drawio_activeId");
        if (targetId) localStorage.removeItem("stardust_drawio_activeId");
      } catch {
      }
      if (list.length === 0) {
        const d = await createDiagram("\u672A\u547D\u540D\u56FE\u8868", EMPTY_XML);
        if (mountedRef.current) {
          setDiagrams([d]);
          setCurrentId(d.id);
        }
      } else {
        const target = targetId ? list.find((d) => d.id === targetId) : null;
        setCurrentId(target ? target.id : list[0].id);
      }
    } catch (e) {
      console.error("\u52A0\u8F7D\u56FE\u8868\u5217\u8868\u5931\u8D25:", e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);
  (0, import_react.useEffect)(() => {
    loadDiagrams();
  }, [loadDiagrams]);
  const currentDiagram = diagrams.find((d) => d.id === currentId) || null;
  currentNameRef.current = currentDiagram?.name || "";
  (0, import_react.useEffect)(() => {
    const handler = (e) => {
      const detail = e.detail;
      if (detail.id === currentIdRef.current && iframeReadyRef.current) {
        getDiagram(detail.id).then((d) => {
          if (!mountedRef.current) return;
          loadedXmlRef.current = d.xml;
          sendToIframe("load", { xml: d.xml, autosave: 1 });
        }).catch(console.error);
      }
    };
    document.addEventListener("drawio:updated", handler);
    return () => document.removeEventListener("drawio:updated", handler);
  }, []);
  const switchDiagram = (0, import_react.useCallback)((id) => {
    setCurrentId(id);
    setIframeReady(false);
    setSaveStatus("saved");
    setShowDropdown(false);
    loadedXmlRef.current = "";
  }, []);
  const sendToIframe = (0, import_react.useCallback)((action, payload = {}) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify({ action, ...payload }), "*");
  }, []);
  (0, import_react.useEffect)(() => {
    if (!iframeReady || !currentDiagram) return;
    const timer = setTimeout(() => {
      const xml = currentDiagram.xml;
      if (!xml || xml === EMPTY_XML) {
        loadedXmlRef.current = EMPTY_XML;
        sendToIframe("load", { xml: EMPTY_XML, autosave: 1 });
      } else {
        loadedXmlRef.current = xml;
        sendToIframe("load", { xml, autosave: 1 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [iframeReady, currentDiagram?.id]);
  (0, import_react.useEffect)(() => {
    const handler = (evt) => {
      if (evt.origin !== "https://embed.diagrams.net") return;
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      switch (msg.event) {
        case "init":
          setIframeReady(true);
          break;
        case "autosave":
        case "save":
          if (msg.xml && msg.xml !== loadedXmlRef.current) {
            loadedXmlRef.current = msg.xml;
            setSaveStatus("unsaved");
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = setTimeout(async () => {
              const id = currentIdRef.current;
              if (!id || !mountedRef.current) return;
              setSaving(true);
              setSaveStatus("saving");
              try {
                await updateDiagram(id, { xml: msg.xml });
                if (mountedRef.current) {
                  setSaveStatus("saved");
                  setDiagrams((prev) => prev.map(
                    (d) => d.id === id ? { ...d, xml: msg.xml, updated_at: (/* @__PURE__ */ new Date()).toISOString() } : d
                  ));
                }
              } catch (e) {
                console.error("\u4FDD\u5B58\u5931\u8D25:", e);
                if (mountedRef.current) setSaveStatus("unsaved");
              } finally {
                if (mountedRef.current) setSaving(false);
              }
            }, AUTOSAVE_DEBOUNCE_MS);
          }
          if (msg.event === "save" && msg.exit) {
            setSaveStatus("saved");
          }
          break;
        case "export":
          if (msg.data && msg.format === "xmlpng") {
            const link = document.createElement("a");
            link.download = `${currentNameRef.current || "diagram"}.png`;
            link.href = msg.data;
            link.click();
          }
          break;
        case "exit":
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
  const handleCreate = async () => {
    try {
      const d = await createDiagram("\u672A\u547D\u540D\u56FE\u8868", EMPTY_XML);
      if (!mountedRef.current) return;
      setDiagrams((prev) => [d, ...prev]);
      setCurrentId(d.id);
      setIframeReady(false);
    } catch (e) {
      console.error("\u521B\u5EFA\u56FE\u8868\u5931\u8D25:", e);
    }
  };
  const handleRenameStart = (d) => {
    setRenamingId(d.id);
    setRenameText(d.name);
  };
  const handleRenameSave = async () => {
    if (!renamingId || !renameText.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await updateDiagram(renamingId, { name: renameText.trim() });
      if (mountedRef.current) {
        setDiagrams((prev) => prev.map(
          (d) => d.id === renamingId ? { ...d, name: renameText.trim() } : d
        ));
      }
    } catch (e) {
      console.error("\u91CD\u547D\u540D\u5931\u8D25:", e);
    }
    setRenamingId(null);
  };
  const handleDelete = async (id) => {
    try {
      await deleteDiagram(id);
      if (!mountedRef.current) return;
      setDiagrams((prev) => prev.filter((d) => d.id !== id));
      if (currentId === id) {
        const remaining = diagrams.filter((d) => d.id !== id);
        setCurrentId(remaining[0]?.id || null);
        setIframeReady(false);
      }
    } catch (e) {
      console.error("\u5220\u9664\u5931\u8D25:", e);
    }
  };
  const handleExport = () => {
    sendToIframe("export", { format: "xmlpng", scale: 2, border: 10 });
  };
  (0, import_react.useEffect)(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);
  const statusColor = saveStatus === "saved" ? "#16a34a" : saveStatus === "unsaved" ? "#d97706" : saveStatus === "saving" ? void 0 : "#16a34a";
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-full flex items-center justify-center bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "h-full flex flex-col bg-background select-none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: onBack, className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent shrink-0", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ArrowLeft, { className: "h-3.5 w-3.5 text-muted-foreground" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "relative", ref: dropdownRef, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            onClick: () => setShowDropdown(!showDropdown),
            className: "flex items-center gap-1.5 h-7 px-2 rounded hover:bg-accent text-sm font-semibold max-w-[200px]",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "truncate", children: currentDiagram?.name || "\u9009\u62E9\u56FE\u8868" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.ChevronDown, { className: "h-3 w-3 text-muted-foreground shrink-0" })
            ]
          }
        ),
        showDropdown && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "absolute top-full left-0 mt-1 w-64 rounded-md border border-border bg-card shadow-lg z-50 py-1 max-h-64 overflow-auto", children: [
          diagrams.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "div",
            {
              className: `flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-xs ${d.id === currentId ? "bg-accent/50 font-medium" : ""}`,
              onClick: () => switchDiagram(d.id),
              children: renamingId === d.id ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  value: renameText,
                  onChange: (e) => setRenameText(e.target.value),
                  className: "flex-1 bg-background border border-input rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring",
                  autoFocus: true,
                  onBlur: handleRenameSave,
                  onKeyDown: (e) => {
                    if (e.key === "Enter") handleRenameSave();
                    if (e.key === "Escape") setRenamingId(null);
                  },
                  onClick: (e) => e.stopPropagation()
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "flex-1 truncate", children: d.name }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-[10px] text-muted-foreground/50 shrink-0", children: new Date(d.updated_at).toLocaleDateString("zh-CN") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 hover:!opacity-100",
                    onClick: (e) => {
                      e.stopPropagation();
                      handleRenameStart(d);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Pencil, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center shrink-0",
                    onClick: (e) => {
                      e.stopPropagation();
                      handleDelete(d.id);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.X, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                )
              ] })
            },
            d.id
          )),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              className: "flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-accent text-xs text-muted-foreground border-t border-border mt-1 pt-1",
              onClick: handleCreate,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Plus, { className: "h-3 w-3" }),
                " \u65B0\u5EFA\u56FE\u8868"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          onClick: handleCreate,
          className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent shrink-0",
          title: "\u65B0\u5EFA\u56FE\u8868",
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Plus, { className: "h-3.5 w-3.5 text-muted-foreground" })
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex-1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-1.5", children: [
        saving && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "h-3 w-3 animate-spin text-muted-foreground" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-[10px]", style: { color: statusColor }, children: [
          saveStatus === "saved" && "\u5DF2\u4FDD\u5B58",
          saveStatus === "unsaved" && "\u672A\u4FDD\u5B58",
          saveStatus === "saving" && "\u4FDD\u5B58\u4E2D..."
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          onClick: handleExport,
          className: "h-7 text-[11px] px-2 rounded-md border border-input bg-background hover:bg-accent flex items-center gap-1 shrink-0",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Save, { className: "h-3 w-3" }),
            "\u5BFC\u51FA PNG"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 relative", children: [
      !iframeReady && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 flex items-center justify-center bg-background z-10", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_lucide_react.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "iframe",
        {
          ref: iframeRef,
          src: EMBED_URL,
          className: "w-full h-full border-0",
          title: "Draw.io Editor"
        },
        currentId || "empty"
      )
    ] })
  ] });
};

// plugins-example/drawio/src/client.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var getSupabaseClient = null;
function DrawioApp() {
  const [ready, setReady] = (0, import_react2.useState)(false);
  const [error, setError] = (0, import_react2.useState)(null);
  const [view, setView] = (0, import_react2.useState)("loading");
  (0, import_react2.useEffect)(() => {
    let cancelled = false;
    async function setup() {
      try {
        const client = getSupabaseClient?.();
        if (!client) {
          if (!cancelled) setError("Supabase \u672A\u914D\u7F6E\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E Supabase \u540E\u4F7F\u7528 drawio \u529F\u80FD\u3002");
          return;
        }
        const { data } = await client.auth.getUser();
        if (cancelled) return;
        if (!data.user) {
          setError("\u672A\u767B\u5F55\u3002\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u767B\u5F55 Supabase \u8D26\u53F7\u540E\u518D\u4F7F\u7528 drawio \u529F\u80FD\u3002");
          return;
        }
        initApi(client, data.user.id);
        setView("canvas");
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs", children: error }) });
  }
  if (!ready) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "h-full flex items-center justify-center bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react2.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  if (view === "canvas") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DrawioCanvas, { onBack: () => {
    } });
  }
  return null;
}
function registerClient(ctx) {
  getSupabaseClient = ctx.supabase?.getClient?.bind(ctx.supabase) || null;
  ctx.registerNav({ id: "drawio", label: "drawio", icon: "Workflow", order: 80 });
  ctx.registerRoute("drawio", () => Promise.resolve({ default: DrawioApp }));
}
