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

// plugins-example/board/src/client.tsx
var client_exports = {};
__export(client_exports, {
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_react6 = require("react");
var import_lucide_react5 = require("lucide-react");

// plugins-example/board/BoardPage.tsx
var import_react5 = require("react");
var import_lucide_react4 = require("lucide-react");

// plugins-example/board/ui.tsx
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

// plugins-example/board/BoardForm.tsx
var import_react = require("react");
var import_lucide_react = require("lucide-react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var BoardForm = ({ mode, board, saving, onSave, onClose }) => {
  const [name, setName] = (0, import_react.useState)("");
  const [description, setDescription] = (0, import_react.useState)("");
  const [errors, setErrors] = (0, import_react.useState)({});
  (0, import_react.useEffect)(() => {
    if (mode === "edit" && board) {
      setName(board.name);
      setDescription(board.description || "");
    } else {
      setName("");
      setDescription("");
      setErrors({});
    }
  }, [mode, board]);
  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = "\u8BF7\u8F93\u5165\u770B\u677F\u540D\u79F0";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
  const handleSubmit = () => {
    if (!validate()) return;
    onSave({ name: name.trim(), description: description.trim() });
  };
  const inputCls = (hasErr) => `w-full rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring ${hasErr ? "border-destructive" : "border-input"}`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "div",
    {
      "data-backdrop": "true",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32
      },
      onClick: (ev) => {
        if (ev.target.dataset.backdrop === "true") onClose();
      },
      onKeyDown: (ev) => {
        if (ev.key === "Escape") onClose();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: {
        backgroundColor: "hsl(var(--card))",
        borderRadius: 10,
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        width: 420,
        maxHeight: "90vh",
        overflowY: "auto"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid hsl(var(--border))"
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { style: { fontSize: 13, fontWeight: 600, margin: 0 }, children: mode === "create" ? "\u65B0\u5EFA\u770B\u677F" : "\u7F16\u8F91\u770B\u677F" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              style: {
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "none",
                background: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              },
              onClick: onClose,
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.X, { size: 14, color: "hsl(var(--muted-foreground))" })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u770B\u677F\u540D\u79F0 *" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                placeholder: "\u8F93\u5165\u770B\u677F\u540D\u79F0",
                value: name,
                onChange: (e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                },
                className: inputCls(!!errors.name),
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleSubmit();
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
                placeholder: "\u770B\u677F\u63CF\u8FF0\uFF08\u53EF\u9009\uFF09",
                value: description,
                onChange: (e) => setDescription(e.target.value),
                rows: 3,
                className: inputCls(false),
                style: { resize: "vertical" }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "14px 24px",
          borderTop: "1px solid hsl(var(--border))",
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px] px-3", onClick: onClose, disabled: saving, children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(Button, { size: "sm", className: "h-7 text-[11px] px-4", onClick: handleSubmit, disabled: saving, children: [
            saving && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Loader2, { className: "h-3 w-3 animate-spin mr-1" }),
            saving ? "\u4FDD\u5B58\u4E2D\u2026" : mode === "create" ? "\u521B\u5EFA" : "\u4FDD\u5B58"
          ] })
        ] })
      ] })
    }
  );
};

// plugins-example/board/KanbanBoard.tsx
var import_react4 = require("react");
var import_lucide_react3 = require("lucide-react");

// plugins-example/board/types.ts
var PRIORITY_OPTIONS = ["P0", "P1", "P2", "P3"];
var PRIORITY_LABELS = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3"
};
var PRIORITY_COLORS = {
  P0: "bg-red-100 text-red-700 border-red-300",
  P1: "bg-orange-100 text-orange-700 border-orange-300",
  P2: "bg-blue-100 text-blue-700 border-blue-300",
  P3: "bg-gray-100 text-gray-600 border-gray-300"
};

// plugins-example/board/BoardCardForm.tsx
var import_react2 = require("react");
var import_lucide_react2 = require("lucide-react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var BoardCardForm = ({
  mode,
  card,
  poolId,
  defaultLaneId,
  defaultStageId,
  defaultOrder,
  saving,
  onSave,
  onClose
}) => {
  const [title, setTitle] = (0, import_react2.useState)("");
  const [content, setContent] = (0, import_react2.useState)("");
  const [note, setNote] = (0, import_react2.useState)("");
  const [priority, setPriority] = (0, import_react2.useState)("P2");
  const [errors, setErrors] = (0, import_react2.useState)({});
  (0, import_react2.useEffect)(() => {
    if (mode === "edit" && card) {
      setTitle(card.title);
      setContent(card.content || "");
      setNote(card.note || "");
      setPriority(card.priority || "P2");
    } else {
      setTitle("");
      setContent("");
      setNote("");
      setPriority("P2");
      setErrors({});
    }
  }, [mode, card]);
  const validate = () => {
    const errs = {};
    if (!title.trim()) errs.title = "\u8BF7\u8F93\u5165\u5361\u7247\u6807\u9898";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
  const handleSubmit = () => {
    if (!validate()) return;
    onSave({
      title: title.trim(),
      content,
      note,
      priority,
      lane_id: card?.lane_id ?? defaultLaneId ?? null,
      stage_id: card?.stage_id ?? defaultStageId ?? null,
      order_in_cell: card?.order_in_cell ?? defaultOrder ?? 0
    });
  };
  const inputCls = (hasErr) => `w-full rounded-md border bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring ${hasErr ? "border-destructive" : "border-input"}`;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "div",
    {
      "data-backdrop": "true",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32
      },
      onClick: (ev) => {
        if (ev.target.dataset.backdrop === "true") onClose();
      },
      onKeyDown: (ev) => {
        if (ev.key === "Escape") onClose();
      },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
        backgroundColor: "hsl(var(--card))",
        borderRadius: 10,
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        width: 480,
        maxHeight: "90vh",
        overflowY: "auto"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid hsl(var(--border))"
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { style: { fontSize: 13, fontWeight: 600, margin: 0 }, children: mode === "create" ? "\u65B0\u589E\u5361\u7247" : "\u7F16\u8F91\u5361\u7247" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              style: {
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "none",
                background: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              },
              onClick: onClose,
              children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.X, { size: 14, color: "hsl(var(--muted-foreground))" })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u6807\u9898 *" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                placeholder: "\u8F93\u5165\u5361\u7247\u6807\u9898",
                value: title,
                onChange: (e) => {
                  setTitle(e.target.value);
                  setErrors((prev) => ({ ...prev, title: "" }));
                },
                className: inputCls(!!errors.title),
                autoFocus: true,
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleSubmit();
                }
              }
            ),
            errors.title && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--destructive))" }, children: errors.title })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u5185\u5BB9" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                placeholder: "\u5361\u7247\u8BE6\u7EC6\u5185\u5BB9\uFF08\u53EF\u9009\uFF09",
                value: content,
                onChange: (e) => setContent(e.target.value),
                rows: 3,
                className: inputCls(false),
                style: { resize: "vertical" }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u4F18\u5148\u7EA7" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", gap: 4 }, children: PRIORITY_OPTIONS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                onClick: () => setPriority(p),
                style: {
                  flex: 1,
                  height: 28,
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  ...priority === p ? {
                    backgroundColor: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                    borderColor: "hsl(var(--primary))"
                  } : {
                    backgroundColor: "hsl(var(--background))",
                    color: "hsl(var(--muted-foreground))",
                    borderColor: "hsl(var(--input))"
                  }
                },
                children: p
              },
              p
            )) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))" }, children: "\u5907\u6CE8" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "textarea",
              {
                placeholder: "\u5907\u6CE8\u4FE1\u606F\uFF08\u53EF\u9009\uFF09",
                value: note,
                onChange: (e) => setNote(e.target.value),
                rows: 2,
                className: inputCls(false),
                style: { resize: "vertical" }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "14px 24px",
          borderTop: "1px solid hsl(var(--border))",
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px] px-3", onClick: onClose, disabled: saving, children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(Button, { size: "sm", className: "h-7 text-[11px] px-4", onClick: handleSubmit, disabled: saving, children: [
            saving && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Loader2, { className: "h-3 w-3 animate-spin mr-1" }),
            saving ? "\u4FDD\u5B58\u4E2D\u2026" : mode === "create" ? "\u521B\u5EFA" : "\u4FDD\u5B58"
          ] })
        ] })
      ] })
    }
  );
};

// plugins-example/board/BoardCard.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var priorityBorderColor = (p) => {
  switch (p) {
    case "P0":
      return "#ef4444";
    case "P1":
      return "#f97316";
    case "P2":
      return "#3b82f6";
    case "P3":
      return "#9ca3af";
    default:
      return "#9ca3af";
  }
};
var BoardCard = ({ card, onClick, onDragStart }) => {
  const ref = (0, import_react3.useRef)(null);
  const [rotateX, setRotateX] = (0, import_react3.useState)(0);
  const [rotateY, setRotateY] = (0, import_react3.useState)(0);
  const [scale, setScale] = (0, import_react3.useState)(1);
  const [glareX, setGlareX] = (0, import_react3.useState)(50);
  const [glareY, setGlareY] = (0, import_react3.useState)(50);
  const [isHovered, setIsHovered] = (0, import_react3.useState)(false);
  const [isDragging, setIsDragging] = (0, import_react3.useState)(false);
  const handleMouseMove = (0, import_react3.useCallback)((e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateYVal = (x - centerX) / centerX * 9;
    const rotateXVal = (centerY - y) / centerY * 9;
    setRotateX(rotateXVal);
    setRotateY(rotateYVal);
    setGlareX(x / rect.width * 100);
    setGlareY(y / rect.height * 100);
  }, []);
  const handleMouseEnter = (0, import_react3.useCallback)(() => {
    setScale(1.04);
    setIsHovered(true);
  }, []);
  const handleMouseLeave = (0, import_react3.useCallback)(() => {
    setRotateX(0);
    setRotateY(0);
    setScale(1);
    setIsHovered(false);
  }, []);
  const borderColor = priorityBorderColor(card.priority);
  const priorityLabel = PRIORITY_LABELS[card.priority] || card.priority;
  const priorityColorClass = PRIORITY_COLORS[card.priority] || PRIORITY_COLORS.P2;
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      ref,
      draggable: true,
      onDragStart: (e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const clone = el.cloneNode(true);
        clone.style.position = "absolute";
        clone.style.top = "-9999px";
        clone.style.left = "0";
        clone.style.width = `${rect.width}px`;
        clone.style.opacity = "0.85";
        clone.style.transform = "none";
        document.body.appendChild(clone);
        e.dataTransfer.setDragImage(clone, 0, 0);
        requestAnimationFrame(() => document.body.removeChild(clone));
        setIsDragging(true);
        onDragStart(e, card);
      },
      onDragEnd: () => setIsDragging(false),
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onClick: () => onClick(card),
      style: {
        transform: `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
        transformStyle: "preserve-3d",
        transition: isHovered ? "transform 0.1s ease-out" : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        borderColor: "hsl(var(--border) / 0.45)",
        borderLeftColor: borderColor,
        borderLeftWidth: 3,
        boxShadow: isHovered ? `0 2px 10px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)` : "0 1px 2px rgba(0,0,0,0.04)",
        position: "relative",
        overflow: "hidden",
        opacity: isDragging ? 0 : 1
      },
      className: cn(
        "rounded-md border bg-card px-2.5 py-2 cursor-grab",
        "active:cursor-grabbing"
      ),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "div",
          {
            style: {
              position: "absolute",
              inset: 0,
              background: isHovered ? `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.15) 0%, transparent 60%)` : "none",
              pointerEvents: "none",
              zIndex: 0,
              borderRadius: "inherit",
              transition: "opacity 0.2s"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { position: "relative", zIndex: 1 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: {
            transform: "translateZ(45px)",
            paddingBottom: card.content || card.note ? 6 : 0,
            marginBottom: card.content || card.note ? 4 : 0,
            borderBottom: card.content || card.note ? "1px solid hsl(var(--border) / 0.2)" : "none"
          }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-1.5 min-w-0", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: cn("text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0", priorityColorClass), children: priorityLabel }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-[12px] font-semibold leading-tight line-clamp-2", children: card.title })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { transform: "translateZ(8px)" }, children: [
            card.content && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2", children: card.content }),
            card.note && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-[10px] text-muted-foreground/60 leading-relaxed line-clamp-3 mt-1", children: card.note })
          ] })
        ] })
      ]
    }
  );
};

// plugins-example/board/api.ts
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
async function listBoards() {
  const { data, error } = await db().from("board_pools").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
async function createBoard(name, description) {
  const { data, error } = await db().from("board_pools").insert({
    user_id: currentUserId,
    name,
    description
  }).select().single();
  if (error) throw error;
  return data;
}
async function updateBoard(id, updates) {
  const { data, error } = await db().from("board_pools").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteBoard(id) {
  const { error } = await db().from("board_pools").delete().eq("id", id);
  if (error) throw error;
}
async function listLanes(poolId) {
  const { data, error } = await db().from("board_lanes").select("*").eq("pool_id", poolId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function createLane(poolId, name, sortOrder) {
  const { data, error } = await db().from("board_lanes").insert({ pool_id: poolId, name, sort_order: sortOrder }).select().single();
  if (error) throw error;
  return data;
}
async function updateLane(id, updates) {
  const { data, error } = await db().from("board_lanes").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteLane(id) {
  const { error } = await db().from("board_lanes").delete().eq("id", id);
  if (error) throw error;
}
async function listStages(poolId) {
  const { data, error } = await db().from("board_stages").select("*").eq("pool_id", poolId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function createStage(poolId, name, sortOrder) {
  const { data, error } = await db().from("board_stages").insert({ pool_id: poolId, name, sort_order: sortOrder }).select().single();
  if (error) throw error;
  return data;
}
async function updateStage(id, updates) {
  const { data, error } = await db().from("board_stages").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteStage(id) {
  const { error } = await db().from("board_stages").delete().eq("id", id);
  if (error) throw error;
}
async function listCards(poolId) {
  const { data, error } = await db().from("board_cards").select("*").eq("pool_id", poolId).order("order_in_cell", { ascending: true });
  if (error) throw error;
  return data || [];
}
async function createCard(card) {
  const { data, error } = await db().from("board_cards").insert({
    pool_id: card.pool_id,
    lane_id: card.lane_id || null,
    stage_id: card.stage_id || null,
    title: card.title,
    content: card.content || "",
    note: card.note || "",
    priority: card.priority || "P2",
    order_in_cell: card.order_in_cell || 0,
    created_by: card.created_by || ""
  }).select().single();
  if (error) throw error;
  return data;
}
async function updateCard(id, updates) {
  const { data, error } = await db().from("board_cards").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
async function deleteCard(id) {
  const { error } = await db().from("board_cards").delete().eq("id", id);
  if (error) throw error;
}
async function moveCard(id, laneId, stageId, orderInCell) {
  const { error } = await db().from("board_cards").update({
    lane_id: laneId,
    stage_id: stageId,
    order_in_cell: orderInCell
  }).eq("id", id);
  if (error) throw error;
}
async function loadBoardData(poolId) {
  const [poolRes, lanes, stages, cards] = await Promise.all([
    db().from("board_pools").select("*").eq("id", poolId).single(),
    listLanes(poolId),
    listStages(poolId),
    listCards(poolId)
  ]);
  if (poolRes.error) throw poolRes.error;
  return {
    pool: poolRes.data,
    lanes,
    stages,
    cards
  };
}

// plugins-example/board/KanbanBoard.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var NO_LANE = "__no_lane__";
var NO_STAGE = "__no_stage__";
var KanbanBoard = ({ boardData, loading, onBack, onBoardUpdated }) => {
  const { pool } = boardData;
  const [lanes, setLanes] = (0, import_react4.useState)([]);
  const [stages, setStages] = (0, import_react4.useState)([]);
  const [cards, setCards] = (0, import_react4.useState)([]);
  (0, import_react4.useEffect)(() => {
    setLanes(boardData.lanes || []);
    setStages(boardData.stages || []);
    setCards(boardData.cards || []);
  }, [boardData]);
  const [cardForm, setCardForm] = (0, import_react4.useState)(null);
  const [savingCard, setSavingCard] = (0, import_react4.useState)(false);
  const [editingLane, setEditingLane] = (0, import_react4.useState)(null);
  const [editingStage, setEditingStage] = (0, import_react4.useState)(null);
  const [editValue, setEditValue] = (0, import_react4.useState)("");
  const [addingLane, setAddingLane] = (0, import_react4.useState)(false);
  const [addingStage, setAddingStage] = (0, import_react4.useState)(false);
  const [newItemName, setNewItemName] = (0, import_react4.useState)("");
  const [deleteConfirm, setDeleteConfirm] = (0, import_react4.useState)(null);
  const [dragOverCell, setDragOverCell] = (0, import_react4.useState)(null);
  const [expandedCard, setExpandedCard] = (0, import_react4.useState)(null);
  const inputRef = (0, import_react4.useRef)(null);
  const refresh = (0, import_react4.useCallback)(async () => {
    try {
      const [freshLanes, freshStages, freshCards] = await Promise.all([
        listLanes(pool.id),
        listStages(pool.id),
        listCards(pool.id)
      ]);
      setLanes(freshLanes);
      setStages(freshStages);
      setCards(freshCards);
    } catch (e) {
      console.error("[Board] Refresh failed:", e);
    }
  }, [pool.id]);
  const handleSaveCard = async (data) => {
    setSavingCard(true);
    try {
      if (cardForm?.mode === "create") {
        await createCard({
          pool_id: pool.id,
          title: data.title,
          content: data.content,
          note: data.note,
          priority: data.priority,
          lane_id: data.lane_id,
          stage_id: data.stage_id,
          order_in_cell: data.order_in_cell
        });
      } else if (cardForm?.card) {
        await updateCard(cardForm.card.id, {
          title: data.title,
          content: data.content,
          note: data.note,
          priority: data.priority
        });
      }
      setCardForm(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Save card failed:", e);
    } finally {
      setSavingCard(false);
    }
  };
  const handleDeleteCard = async (id) => {
    try {
      await deleteCard(id);
      if (expandedCard?.id === id) setExpandedCard(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Delete card failed:", e);
    }
  };
  const handleDragStart = (e, card) => {
    e.dataTransfer.setData("cardId", card.id);
    e.dataTransfer.setData("fromLane", card.lane_id || NO_LANE);
    e.dataTransfer.setData("fromStage", card.stage_id || NO_STAGE);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOverCell = (e, laneId, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCell(`${laneId}|${stageId}`);
  };
  const handleDragLeaveCell = () => {
    setDragOverCell(null);
  };
  const handleDropCell = async (e, toLaneId, toStageId) => {
    e.preventDefault();
    setDragOverCell(null);
    const cardId = e.dataTransfer.getData("cardId");
    if (!cardId) return;
    const realLaneId = toLaneId === NO_LANE ? null : toLaneId;
    const realStageId = toStageId === NO_STAGE ? null : toStageId;
    setCards((prev) => prev.map(
      (c) => c.id === cardId ? { ...c, lane_id: realLaneId, stage_id: realStageId } : c
    ));
    try {
      await moveCard(cardId, realLaneId, realStageId, 0);
      await refresh();
    } catch (e2) {
      console.error("[Board] Move card failed:", e2);
      await refresh();
    }
  };
  const handleAddLane = async () => {
    if (!newItemName.trim()) return;
    try {
      await createLane(pool.id, newItemName.trim(), lanes.length);
      setNewItemName("");
      setAddingLane(false);
      await refresh();
    } catch (e) {
      console.error("[Board] Add lane failed:", e);
    }
  };
  const handleRenameLane = async (id) => {
    if (!editValue.trim()) return;
    try {
      await updateLane(id, { name: editValue.trim() });
      setEditingLane(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Rename lane failed:", e);
    }
  };
  const handleDeleteLane = async (id) => {
    try {
      await deleteLane(id);
      setDeleteConfirm(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Delete lane failed:", e);
    }
  };
  const handleAddStage = async () => {
    if (!newItemName.trim()) return;
    try {
      await createStage(pool.id, newItemName.trim(), stages.length);
      setNewItemName("");
      setAddingStage(false);
      await refresh();
    } catch (e) {
      console.error("[Board] Add stage failed:", e);
    }
  };
  const handleRenameStage = async (id) => {
    if (!editValue.trim()) return;
    try {
      await updateStage(id, { name: editValue.trim() });
      setEditingStage(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Rename stage failed:", e);
    }
  };
  const handleDeleteStage = async (id) => {
    try {
      await deleteStage(id);
      setDeleteConfirm(null);
      await refresh();
    } catch (e) {
      console.error("[Board] Delete stage failed:", e);
    }
  };
  const getCardsInCell = (laneId, stageId) => {
    return cards.filter((c) => (c.lane_id || null) === laneId && (c.stage_id || null) === stageId);
  };
  (0, import_react4.useEffect)(() => {
    if (addingLane || addingStage) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [addingLane, addingStage]);
  const inputCls = (hasErr = false) => cn(
    "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring",
    hasErr ? "border-destructive" : "border-input"
  );
  const stageColumns = stages.length > 0 ? stages : [{ id: NO_STAGE, pool_id: pool.id, name: "\u5F85\u5206\u7C7B", sort_order: 0, created_at: "", updated_at: "" }];
  const laneRows = lanes.length > 0 ? lanes : [{ id: NO_LANE, pool_id: pool.id, name: "\u9ED8\u8BA4", sort_order: 0, created_at: "", updated_at: "" }];
  const LANE_LABEL_WIDTH = 140;
  const COLUMN_WIDTH = 220;
  const priorityBadge = (p) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", PRIORITY_COLORS[p] || PRIORITY_COLORS.P2), children: PRIORITY_LABELS[p] || p });
  const DeleteConfirmDialog = () => {
    if (!deleteConfirm) return null;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 60,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32
        },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setDeleteConfirm(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: {
          backgroundColor: "hsl(var(--card))",
          borderRadius: 10,
          border: "1px solid hsl(var(--border) / 0.5)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          width: 360,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Ban, { className: "h-4 w-4 text-destructive" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 13, fontWeight: 600 }, children: "\u786E\u8BA4\u5220\u9664" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("p", { style: { fontSize: 12, color: "hsl(var(--muted-foreground))" }, children: [
            "\u786E\u5B9A\u8981\u5220\u9664",
            deleteConfirm.type === "lane" ? "\u6CF3\u9053" : "\u9636\u6BB5",
            "\u300C",
            deleteConfirm.name,
            "\u300D\u5417\uFF1F\u8BE5\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF0C\u5173\u8054\u7684\u5361\u7247\u4E5F\u4F1A\u88AB\u5220\u9664\u3002"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px]", onClick: () => setDeleteConfirm(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              Button,
              {
                variant: "destructive",
                size: "sm",
                className: "h-7 text-[11px]",
                onClick: () => {
                  if (deleteConfirm.type === "lane") handleDeleteLane(deleteConfirm.id);
                  else handleDeleteStage(deleteConfirm.id);
                },
                children: "\u786E\u8BA4\u5220\u9664"
              }
            )
          ] })
        ] })
      }
    );
  };
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "h-full flex items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  const [initLoading, setInitLoading] = (0, import_react4.useState)(false);
  const createFromTemplate = async (template) => {
    setInitLoading(true);
    try {
      for (let i = 0; i < template.stages.length; i++) {
        await createStage(pool.id, template.stages[i], i);
      }
      for (let i = 0; i < template.lanes.length; i++) {
        await createLane(pool.id, template.lanes[i], i);
      }
      await refresh();
    } catch (e) {
      console.error("[Board] Template init failed:", e);
    } finally {
      setInitLoading(false);
    }
  };
  const TEMPLATES = [
    {
      Icon: import_lucide_react3.CheckSquare,
      name: "\u4EFB\u52A1\u770B\u677F",
      desc: "\u7ECF\u5178\u5F85\u529E/\u8FDB\u884C\u4E2D/\u5DF2\u5B8C\u6210",
      stages: ["\u5F85\u529E", "\u8FDB\u884C\u4E2D", "\u5DF2\u5B8C\u6210"],
      lanes: []
    },
    {
      Icon: import_lucide_react3.Search,
      name: "\u9700\u6C42\u5206\u6790",
      desc: "\u6536\u96C6/\u8BC4\u5BA1/\u901A\u8FC7/\u9A73\u56DE",
      stages: ["\u6536\u96C6", "\u8BC4\u5BA1\u4E2D", "\u5DF2\u901A\u8FC7", "\u5DF2\u9A73\u56DE"],
      lanes: []
    },
    {
      Icon: import_lucide_react3.Rocket,
      name: "\u5F00\u53D1\u8FED\u4EE3",
      desc: "Backlog\u2192\u5F00\u53D1\u2192\u6D4B\u8BD5\u2192\u53D1\u5E03\uFF0C\u914D\u5408\u524D\u540E\u7AEF\u6CF3\u9053",
      stages: ["Backlog", "\u5F00\u53D1\u4E2D", "\u6D4B\u8BD5", "\u5DF2\u53D1\u5E03"],
      lanes: ["\u524D\u7AEF", "\u540E\u7AEF"]
    },
    {
      Icon: import_lucide_react3.Square,
      name: "\u7A7A\u767D\u770B\u677F",
      desc: "\u9ED8\u8BA4\u4E00\u4E2A\u6CF3\u9053+\u9636\u6BB5\uFF0C\u81EA\u7531\u642D\u5EFA",
      stages: ["\u9636\u6BB5 1"],
      lanes: ["\u6CF3\u9053 1"]
    }
  ];
  const isEmpty = stages.length === 0 && lanes.length === 0 && cards.length === 0;
  if (isEmpty) {
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "h-full flex flex-col bg-background", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: onBack, className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.ArrowLeft, { className: "h-3.5 w-3.5 text-muted-foreground" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { className: "text-sm font-semibold", children: pool.name })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex-1 flex flex-col items-center justify-center gap-5 text-muted-foreground px-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.ClipboardList, { className: "h-10 w-10 text-muted-foreground/25" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "text-center mb-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-xs font-medium", children: "\u9009\u62E9\u6A21\u677F\u5FEB\u901F\u5F00\u59CB" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-[10px] text-muted-foreground/50 mt-1.5", children: "\u540E\u7EED\u53EF\u81EA\u7531\u589E\u5220\u6CF3\u9053\u548C\u9636\u6BB5" })
        ] }),
        initLoading ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Loader2, { className: "h-5 w-5 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "grid grid-cols-2 gap-3 max-w-md", children: TEMPLATES.map((t, i) => {
          const Icon = t.Icon;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "button",
            {
              onClick: () => createFromTemplate(t),
              className: "flex flex-col items-center gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Icon, { className: "h-6 w-6 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-[12px] font-medium", children: t.name }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-[10px] text-muted-foreground/60 leading-relaxed text-center", children: t.desc })
              ]
            },
            i
          );
        }) })
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "h-full flex flex-col bg-background select-none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { onClick: onBack, className: "h-6 w-6 rounded flex items-center justify-center hover:bg-accent transition-colors", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.ArrowLeft, { className: "h-3.5 w-3.5 text-muted-foreground" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h1", { className: "text-sm font-semibold", children: pool.name }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
        cards.length,
        " \u5361\u7247"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex-1" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        Button,
        {
          size: "sm",
          className: "h-7 text-[11px] px-3",
          onClick: () => {
            const firstLane = lanes.length > 0 ? lanes[0].id : null;
            const firstStage = stages.length > 0 ? stages[0].id : null;
            setCardForm({ mode: "create", defaultLaneId: firstLane, defaultStageId: firstStage });
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Plus, { className: "h-3.5 w-3.5 mr-1" }),
            "\u6DFB\u52A0\u5361\u7247"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", flexDirection: "column", minWidth: "fit-content", minHeight: "100%" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: {
        display: "flex",
        position: "sticky",
        top: 0,
        zIndex: 20,
        backgroundColor: "hsl(var(--background))",
        borderBottom: "1px solid hsl(var(--border) / 0.45)"
      }, children: [
        stages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: {
          width: LANE_LABEL_WIDTH,
          flexShrink: 0,
          position: "sticky",
          left: 0,
          zIndex: 30,
          backgroundColor: "hsl(var(--background))",
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          borderRight: "1px solid hsl(var(--border) / 0.45)",
          height: 32
        }, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-[10px] font-medium text-muted-foreground", children: "\u6CF3\u9053 \\ \u9636\u6BB5" }) }),
        stageColumns.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            className: "group",
            style: {
              width: COLUMN_WIDTH,
              flexShrink: 0,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              borderRight: "1px solid hsl(var(--border) / 0.45)"
            },
            children: editingStage === stage.id ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                value: editValue,
                onChange: (e) => setEditValue(e.target.value),
                className: inputCls(),
                style: { height: 22, fontSize: 10 },
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleRenameStage(stage.id);
                  if (e.key === "Escape") setEditingStage(null);
                },
                autoFocus: true
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-[11px] font-medium truncate", children: stage.name }),
              stages.length > 0 && stage.id !== NO_STAGE && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center",
                    onClick: () => {
                      setEditingStage(stage.id);
                      setEditValue(stage.name);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Pencil, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center",
                    onClick: () => setDeleteConfirm({ type: "stage", id: stage.id, name: stage.name }),
                    children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Trash2, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                )
              ] })
            ] })
          },
          stage.id
        )),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: {
          width: 60,
          flexShrink: 0,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }, children: addingStage ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex items-center gap-1 px-1", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            ref: inputRef,
            value: newItemName,
            onChange: (e) => setNewItemName(e.target.value),
            placeholder: "\u9636\u6BB5\u540D",
            className: inputCls(),
            style: { width: 80, height: 20, fontSize: 10 },
            onKeyDown: (e) => {
              if (e.key === "Enter") handleAddStage();
              if (e.key === "Escape") {
                setAddingStage(false);
                setNewItemName("");
              }
            }
          }
        ) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center",
            onClick: () => {
              setAddingStage(true);
              setNewItemName("");
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Plus, { className: "h-3 w-3 text-muted-foreground" })
          }
        ) })
      ] }),
      laneRows.map((lane) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", borderBottom: "1px solid hsl(var(--border) / 0.45)", minHeight: 100 }, children: [
        stages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            className: "group",
            style: {
              width: LANE_LABEL_WIDTH,
              flexShrink: 0,
              position: "sticky",
              left: 0,
              zIndex: 10,
              backgroundColor: "hsl(var(--background))",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "12px 12px",
              borderRight: "1px solid hsl(var(--border) / 0.45)"
            },
            children: editingLane === lane.id ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                value: editValue,
                onChange: (e) => setEditValue(e.target.value),
                className: inputCls(),
                style: { height: 22, fontSize: 10 },
                onKeyDown: (e) => {
                  if (e.key === "Enter") handleRenameLane(lane.id);
                  if (e.key === "Escape") setEditingLane(null);
                },
                autoFocus: true
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-[11px] font-medium truncate", children: lane.name }),
              lanes.length > 0 && lane.id !== NO_LANE && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-0.5 ml-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center",
                    onClick: () => {
                      setEditingLane(lane.id);
                      setEditValue(lane.name);
                    },
                    children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Pencil, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    className: "h-5 w-5 rounded hover:bg-destructive/10 flex items-center justify-center",
                    onClick: () => setDeleteConfirm({ type: "lane", id: lane.id, name: lane.name }),
                    children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Trash2, { className: "h-2.5 w-2.5 text-muted-foreground" })
                  }
                )
              ] })
            ] })
          }
        ),
        stageColumns.map((stage) => {
          const cellCards = getCardsInCell(
            lane.id === NO_LANE ? null : lane.id,
            stage.id === NO_STAGE ? null : stage.id
          );
          const cellKey = `${lane.id}|${stage.id}`;
          const isDragOver = dragOverCell === cellKey;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "div",
            {
              style: { width: COLUMN_WIDTH, flexShrink: 0, padding: 8, borderRight: "1px solid hsl(var(--border) / 0.45)" },
              className: cn(
                "flex flex-col gap-1.5 transition-colors min-h-[60px]",
                isDragOver && "bg-primary/5 ring-1 ring-primary/30"
              ),
              onDragOver: (e) => handleDragOverCell(e, lane.id, stage.id),
              onDragLeave: handleDragLeaveCell,
              onDrop: (e) => handleDropCell(e, lane.id, stage.id),
              children: cellCards.map((card) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                BoardCard,
                {
                  card,
                  onClick: (c) => setExpandedCard(c),
                  onDragStart: handleDragStart
                },
                card.id
              ))
            },
            cellKey
          );
        }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { width: 60, flexShrink: 0, borderRight: "1px solid hsl(var(--border) / 0.25)" } })
      ] }, lane.id)),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", borderBottom: "1px solid hsl(var(--border) / 0.45)", minHeight: 40 }, children: [
        stages.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: {
          width: LANE_LABEL_WIDTH,
          flexShrink: 0,
          position: "sticky",
          left: 0,
          zIndex: 10,
          backgroundColor: "hsl(var(--background))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: "1px solid hsl(var(--border) / 0.45)"
        }, children: addingLane ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            ref: inputRef,
            value: newItemName,
            onChange: (e) => setNewItemName(e.target.value),
            placeholder: "\u6CF3\u9053\u540D",
            className: inputCls(),
            style: { width: 80, height: 22, fontSize: 10 },
            onKeyDown: (e) => {
              if (e.key === "Enter") handleAddLane();
              if (e.key === "Escape") {
                setAddingLane(false);
                setNewItemName("");
              }
            }
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            className: "h-5 w-5 rounded hover:bg-accent flex items-center justify-center",
            onClick: () => {
              setAddingLane(true);
              setNewItemName("");
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Plus, { className: "h-3 w-3 text-muted-foreground" })
          }
        ) }),
        stageColumns.map((stage, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { width: COLUMN_WIDTH, flexShrink: 0 } }, stage.id)),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { width: 60, flexShrink: 0 } })
      ] })
    ] }) }),
    cardForm && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      BoardCardForm,
      {
        mode: cardForm.mode,
        card: cardForm.card || null,
        poolId: pool.id,
        defaultLaneId: cardForm.defaultLaneId,
        defaultStageId: cardForm.defaultStageId,
        saving: savingCard,
        onSave: handleSaveCard,
        onClose: () => setCardForm(null)
      }
    ),
    expandedCard && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32
        },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setExpandedCard(null);
        },
        onKeyDown: (ev) => {
          if (ev.key === "Escape") setExpandedCard(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: {
          backgroundColor: "hsl(var(--card))",
          borderRadius: 10,
          border: "1px solid hsl(var(--border) / 0.5)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          width: 520,
          maxHeight: "90vh",
          overflowY: "auto"
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 24px",
            borderBottom: "1px solid hsl(var(--border) / 0.5)"
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2", children: [
              priorityBadge(expandedCard.priority),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h3", { style: { fontSize: 13, fontWeight: 600, margin: 0 }, children: expandedCard.title })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-accent flex items-center justify-center",
                  onClick: () => {
                    setExpandedCard(null);
                    setCardForm({ mode: "edit", card: expandedCard });
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Pencil, { className: "h-3.5 w-3.5 text-muted-foreground" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center",
                  onClick: () => handleDeleteCard(expandedCard.id),
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.Trash2, { className: "h-3.5 w-3.5 text-muted-foreground" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  style: {
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginLeft: 4
                  },
                  onClick: () => setExpandedCard(null),
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.X, { size: 14, color: "hsl(var(--muted-foreground))" })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))", display: "block", marginBottom: 4 }, children: "\u5185\u5BB9" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }, children: expandedCard.content || "(\u65E0\u5185\u5BB9)" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "flex items-center gap-1", style: { fontSize: 11, fontWeight: 500, color: "hsl(var(--muted-foreground))", marginBottom: 4 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_lucide_react3.StickyNote, { className: "h-3 w-3" }),
                "\u5907\u6CE8"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "div",
                {
                  className: "rounded-md border border-border bg-muted/20 p-3",
                  style: { fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", minHeight: 40 },
                  children: expandedCard.note || "(\u6682\u65E0\u5907\u6CE8)"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--muted-foreground))" }, children: "\u521B\u5EFA\u4EBA" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { fontSize: 11, margin: "2px 0 0" }, children: expandedCard.created_by || "\u672A\u77E5" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--muted-foreground))" }, children: "\u521B\u5EFA\u65F6\u95F4" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { fontSize: 11, margin: "2px 0 0" }, children: new Date(expandedCard.created_at).toLocaleString("zh-CN") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: 10, color: "hsl(var(--muted-foreground))" }, children: "\u66F4\u65B0\u65F6\u95F4" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { style: { fontSize: 11, margin: "2px 0 0" }, children: new Date(expandedCard.updated_at).toLocaleString("zh-CN") })
              ] })
            ] })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(DeleteConfirmDialog, {})
  ] });
};

// plugins-example/board/BoardPage.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var BoardPage = () => {
  const [view, setView] = (0, import_react5.useState)("list");
  const [boards, setBoards] = (0, import_react5.useState)([]);
  const [loading, setLoading] = (0, import_react5.useState)(true);
  const [error, setError] = (0, import_react5.useState)(null);
  const [boardForm, setBoardForm] = (0, import_react5.useState)(null);
  const [savingBoard, setSavingBoard] = (0, import_react5.useState)(false);
  const [selectedBoardId, setSelectedBoardId] = (0, import_react5.useState)(null);
  const [boardData, setBoardData] = (0, import_react5.useState)(null);
  const [boardLoading, setBoardLoading] = (0, import_react5.useState)(false);
  const [deleteTarget, setDeleteTarget] = (0, import_react5.useState)(null);
  const loadBoards = (0, import_react5.useCallback)(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBoards();
      setBoards(data);
    } catch (e) {
      setError(e.message || "\u52A0\u8F7D\u5931\u8D25");
      console.error("[Board] Load boards failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);
  (0, import_react5.useEffect)(() => {
    loadBoards();
  }, [loadBoards]);
  const loadBoardDetail = (0, import_react5.useCallback)(async (poolId) => {
    setBoardLoading(true);
    try {
      const data = await loadBoardData(poolId);
      setBoardData(data);
    } catch (e) {
      console.error("[Board] Load board detail failed:", e);
    } finally {
      setBoardLoading(false);
    }
  }, []);
  const openBoard = (id) => {
    setSelectedBoardId(id);
    setView("board");
    loadBoardDetail(id);
  };
  const closeBoard = () => {
    setView("list");
    setSelectedBoardId(null);
    setBoardData(null);
    loadBoards();
  };
  const handleSaveBoard = async (data) => {
    setSavingBoard(true);
    try {
      if (boardForm?.mode === "create") {
        await createBoard(data.name, data.description);
      } else if (boardForm?.board) {
        await updateBoard(boardForm.board.id, data);
      }
      setBoardForm(null);
      await loadBoards();
    } catch (e) {
      console.error("[Board] Save board failed:", e);
    } finally {
      setSavingBoard(false);
    }
  };
  const handleDeleteBoard = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBoard(deleteTarget.id);
      setDeleteTarget(null);
      await loadBoards();
    } catch (e) {
      console.error("[Board] Delete board failed:", e);
    }
  };
  const relativeTime = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "\u521A\u521A";
    if (mins < 60) return `${mins} \u5206\u949F\u524D`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} \u5929\u524D`;
    return new Date(dateStr).toLocaleDateString("zh-CN");
  };
  const ListView = () => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "h-full flex flex-col bg-background", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3 px-4 py-1.5 border-b border-border shrink-0", style: { height: 41 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.FolderKanban, { className: "h-4 w-4 text-muted-foreground shrink-0" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h1", { className: "text-sm font-semibold", children: "\u5361\u7247\u770B\u677F" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "text-[10px] text-muted-foreground", children: [
        boards.length,
        " \u4E2A\u770B\u677F"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "flex-1" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        Button,
        {
          size: "sm",
          className: "h-7 text-[11px] px-3",
          onClick: () => setBoardForm({ mode: "create" }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.Plus, { className: "h-3.5 w-3.5 mr-1" }),
            "\u65B0\u5EFA\u770B\u677F"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "flex items-center justify-center h-48", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : error ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.AlertTriangle, { className: "h-8 w-8 text-muted-foreground/40" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-xs", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { size: "sm", variant: "outline", className: "h-7 text-[11px]", onClick: loadBoards, children: "\u91CD\u8BD5" })
    ] }) : boards.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.ClipboardList, { className: "h-10 w-10 text-muted-foreground/30" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-xs", children: "\u8FD8\u6CA1\u6709\u770B\u677F\uFF0C\u521B\u5EFA\u4E00\u4E2A\u5F00\u59CB\u4F7F\u7528\u5427" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        Button,
        {
          size: "sm",
          className: "h-7 text-[11px]",
          onClick: () => setBoardForm({ mode: "create" }),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.Plus, { className: "h-3.5 w-3.5 mr-1" }),
            "\u65B0\u5EFA\u770B\u677F"
          ]
        }
      )
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3", children: boards.map((board) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "div",
      {
        className: "group flex flex-col gap-2 p-4 rounded-lg border border-border/40 bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer aspect-[4/3]",
        onClick: () => openBoard(board.id),
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-start justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.FolderKanban, { className: "h-4 w-4 text-muted-foreground" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-accent flex items-center justify-center",
                  onClick: (e) => {
                    e.stopPropagation();
                    setBoardForm({ mode: "edit", board });
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.Pencil, { className: "h-3 w-3 text-muted-foreground" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "button",
                {
                  className: "h-6 w-6 rounded hover:bg-destructive/10 flex items-center justify-center",
                  onClick: (e) => {
                    e.stopPropagation();
                    setDeleteTarget(board);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_lucide_react4.Trash2, { className: "h-3 w-3 text-muted-foreground" })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: "text-[13px] font-semibold leading-tight line-clamp-2", children: board.name }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-[11px] text-muted-foreground/60 line-clamp-2 mt-1", children: board.description || "\u6682\u65E0\u63CF\u8FF0" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "text-[10px] text-muted-foreground/40", children: relativeTime(board.updated_at) })
        ]
      },
      board.id
    )) }) })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "h-full", children: [
    view === "list" && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ListView, {}),
    view === "board" && boardData && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      KanbanBoard,
      {
        boardData,
        loading: boardLoading,
        onBack: closeBoard,
        onBoardUpdated: () => loadBoardDetail(selectedBoardId)
      }
    ),
    boardForm && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      BoardForm,
      {
        mode: boardForm.mode,
        board: boardForm.board || null,
        saving: savingBoard,
        onSave: handleSaveBoard,
        onClose: () => setBoardForm(null)
      }
    ),
    deleteTarget && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "div",
      {
        "data-backdrop": "true",
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 60,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32
        },
        onClick: (ev) => {
          if (ev.target.dataset.backdrop === "true") setDeleteTarget(null);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: {
          backgroundColor: "hsl(var(--card))",
          borderRadius: 10,
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          width: 360,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { style: { fontSize: 13, fontWeight: 600 }, children: "\u786E\u8BA4\u5220\u9664\u770B\u677F" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("p", { style: { fontSize: 12, color: "hsl(var(--muted-foreground))" }, children: [
            "\u786E\u5B9A\u8981\u5220\u9664\u770B\u677F\u300C",
            deleteTarget.name,
            "\u300D\u5417\uFF1F\u8BE5\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\uFF0C\u6240\u6709\u5173\u8054\u7684\u6CF3\u9053\u3001\u9636\u6BB5\u548C\u5361\u7247\u90FD\u4F1A\u88AB\u5220\u9664\u3002"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { variant: "ghost", size: "sm", className: "h-7 text-[11px]", onClick: () => setDeleteTarget(null), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Button, { variant: "destructive", size: "sm", className: "h-7 text-[11px]", onClick: handleDeleteBoard, children: "\u786E\u8BA4\u5220\u9664" })
          ] })
        ] })
      }
    )
  ] });
};

// plugins-example/board/src/client.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var getSupabaseClient = null;
function BoardApp() {
  const [ready, setReady] = (0, import_react6.useState)(false);
  const [error, setError] = (0, import_react6.useState)(null);
  (0, import_react6.useEffect)(() => {
    let cancelled = false;
    async function setup() {
      try {
        const client = getSupabaseClient?.();
        if (!client) {
          if (!cancelled) setError("Supabase \u672A\u914D\u7F6E\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E Supabase \u540E\u4F7F\u7528\u770B\u677F\u529F\u80FD\u3002");
          return;
        }
        const { data } = await client.auth.getUser();
        if (cancelled) return;
        if (!data.user) {
          setError("\u672A\u767B\u5F55\u3002\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u767B\u5F55 Supabase \u8D26\u53F7\u540E\u518D\u4F7F\u7528\u770B\u677F\u529F\u80FD\u3002");
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
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "h-full flex flex-col items-center justify-center gap-3 text-muted-foreground bg-background", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "text-4xl", children: "\u26A0\uFE0F" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "text-xs", children: error })
    ] });
  }
  if (!ready) {
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "h-full flex items-center justify-center bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_lucide_react5.Loader2, { className: "h-6 w-6 animate-spin text-muted-foreground" }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(BoardPage, {});
}
function registerClient(ctx) {
  getSupabaseClient = ctx.supabase?.getClient?.bind(ctx.supabase) || null;
  ctx.registerNav({ id: "board", label: "\u5361\u7247\u770B\u677F", icon: "FolderKanban", order: 70 });
  ctx.registerRoute("board", () => Promise.resolve({ default: BoardApp }));
}
