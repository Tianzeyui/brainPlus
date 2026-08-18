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
  PlaceholderPage: () => PlaceholderPage,
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_jsx_runtime = require("react/jsx-runtime");
function PlaceholderPage() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-10 max-w-lg", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "text-lg font-bold mb-3", children: "drawio \u63D2\u4EF6" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm text-muted-foreground mb-4", children: "AI \u5DE5\u5177\u5DF2\u901A\u8FC7\u4E3B\u8FDB\u7A0B Cordis \u6CE8\u518C\uFF08\u53EF\u7528\uFF09\u3002\u6B64\u63D2\u4EF6\u7684\u56FE\u5F62\u754C\u9762\u6B63\u5728\u8FC1\u79FB\u4E2D\uFF0C\u656C\u8BF7\u671F\u5F85\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-xs text-muted-foreground/60 bg-muted rounded-md p-3", children: "\u53EF\u7528\u5DE5\u5177\uFF1A\u89C1\u5DE5\u5177\u5217\u8868\uFF08AI \u5BF9\u8BDD\u4E2D\u53EF\u76F4\u63A5\u8C03\u7528\uFF09" })
  ] });
}
function registerClient(ctx) {
  ctx.registerNav({ id: "drawio", label: "drawio", icon: "Workflow", order: 80 });
  ctx.registerRoute("drawio", () => Promise.resolve({ default: PlaceholderPage }));
}
