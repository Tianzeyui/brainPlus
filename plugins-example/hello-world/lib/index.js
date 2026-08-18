"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
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

// plugins-example/hello-world/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var name = "hello-world";
var inject = ["tools"];
var provide = [];
function apply(ctx) {
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "hello_world",
    description: "\u793A\u4F8B\u5DE5\u5177\uFF1A\u8FD4\u56DE Hello World \u6D88\u606F",
    parameters: {
      name: { type: "string", required: false, description: "\u4F60\u7684\u540D\u5B57\uFF08\u53EF\u9009\uFF09" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: (args) => {
      return args.name ? `Hello, ${args.name}! \u6765\u81EA\u65B0\u8303\u5F0F\u63D2\u4EF6 hello-world` : "Hello, World! \u6765\u81EA\u65B0\u8303\u5F0F\u63D2\u4EF6 hello-world";
    }
  }));
  ctx.logger?.info("[hello-world] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
