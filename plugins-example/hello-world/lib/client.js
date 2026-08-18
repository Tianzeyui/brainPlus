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
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "p-8 max-w-md", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "text-lg font-bold mb-4", children: "Hello World \u63D2\u4EF6\uFF08\u65B0\u8303\u5F0F\uFF09" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-muted-foreground mb-4", children: "\u8FD9\u662F\u63D2\u4EF6\u81EA\u5E26\u7684 React \u9875\u9762\uFF0C\u901A\u8FC7 CLIENT \u534A\u7AEF\u52A0\u8F7D\u3002\u5DE5\u5177\u5728 HOST \u534A\u7AEF\uFF08\u4E3B\u8FDB\u7A0B Cordis\uFF09\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-2 mb-4", children: [
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
    greeting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm text-primary bg-primary/10 rounded-md px-3 py-2", children: greeting })
  ] });
}
function registerClient(ctx) {
  ctx.registerNav({ id: "hello-world", label: "Hello World", icon: "Package", order: 90 });
  ctx.registerRoute("hello-world", () => Promise.resolve({ default: HelloPage }));
}
