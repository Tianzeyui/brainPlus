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

// plugins-example/hello-world/src/client.tsx
var client_exports = {};
__export(client_exports, {
  HelloPage: () => HelloPage,
  registerClient: () => registerClient
});
module.exports = __toCommonJS(client_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function HelloPage() {
  const [name, setName] = (0, import_react.useState)("");
  const [greeting, setGreeting] = (0, import_react.useState)("");
  const [testResult, setTestResult] = (0, import_react.useState)("");
  const tests = [
    { name: "hello_world", desc: "\u57FA\u7840\u5DE5\u5177\uFF08\u4E3B\u8FDB\u7A0B\u6267\u884C\uFF09" },
    { name: "hello_sidecar", desc: "\u5BBF\u4E3B sidecar \u670D\u52A1\u8C03\u7528" },
    { name: "hello_fs", desc: "\u5BBF\u4E3B fs \u670D\u52A1\u8C03\u7528" }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-8 max-w-lg", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "text-lg font-bold mb-1", children: "Hello World \u63D2\u4EF6\uFF08\u65B0\u8303\u5F0F\u57FA\u51C6\u6D4B\u8BD5\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-muted-foreground mb-5", children: "\u9A8C\u8BC1\uFF1ACordis \u8FD0\u884C\u65F6 / \u5BBF\u4E3B\u670D\u52A1\u6CE8\u5165 / \u5DE5\u5177\u4E3B\u8FDB\u7A0B\u6267\u884C / Client \u534A\u7AEF React \u9875\u9762" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-sm font-semibold mb-2", children: "\u5DE5\u5177 1\uFF1Ahello_world" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm",
            placeholder: "\u8F93\u5165\u4F60\u7684\u540D\u5B57",
            value: name,
            onChange: (e) => setName(e.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "px-3 h-8 rounded-md bg-primary text-primary-foreground text-sm",
            onClick: () => setGreeting(`Hello, ${name || "World"}!`),
            children: "\u6253\u62DB\u547C"
          }
        )
      ] }),
      greeting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm text-primary bg-primary/10 rounded-md px-3 py-2 mt-2", children: greeting })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mb-5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "text-sm font-semibold mb-2", children: "\u80FD\u529B\u57FA\u51C6\u6D4B\u8BD5\uFF083 \u4E2A\u5DE5\u5177\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-1.5", children: tests.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "px-1.5 py-0.5 rounded bg-muted font-mono", children: t.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-muted-foreground", children: t.desc }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ml-auto text-emerald-500", children: "\u2713 \u5DF2\u6CE8\u518C" })
      ] }, t.name)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-[11px] text-muted-foreground/60 bg-muted/50 rounded-md p-3", children: [
      "\u670D\u52A1\uFF1AhelloService\uFF08ctx.provide\uFF09\xB7 \u751F\u547D\u5468\u671F\uFF1Actx.effect\uFF08\u5378\u8F7D\u81EA\u52A8\u6E05\u7406\uFF09",
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          className: "mt-2 px-2 py-1 rounded bg-border text-foreground text-[11px] hover:bg-accent",
          onClick: () => setTestResult("\u63D2\u4EF6\u52A0\u8F7D\u6B63\u5E38\uFF1A\u5DE5\u5177/\u670D\u52A1/\u9875\u9762\u5168\u90E8\u5C31\u7EEA"),
          children: "\u8FD0\u884C\u81EA\u68C0"
        }
      ),
      testResult && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "mt-2 text-emerald-500", children: testResult })
    ] })
  ] });
}
function registerClient(ctx) {
  ctx.registerNav({ id: "hello-world", label: "Hello World", icon: "Package", order: 90 });
  ctx.registerRoute("hello-world", () => Promise.resolve({ default: HelloPage }));
}
