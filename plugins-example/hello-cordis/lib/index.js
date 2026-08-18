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

// plugins-example/hello-cordis/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var name = "hello-cordis";
var inject = ["tools", "sidecar"];
var provide = ["greeter"];
function apply(ctx) {
  const unregisterTool = ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "hello_greet",
    description: "\u5411\u67D0\u4EBA\u6253\u62DB\u547C\uFF08Cordis \u65B0\u8303\u5F0F\u793A\u4F8B\u5DE5\u5177\uFF09",
    parameters: {
      who: { type: "string", required: true, description: "\u6253\u62DB\u547C\u7684\u5BF9\u8C61" }
    },
    output: {
      schema: { type: "string" },
      render: (args, value) => [{ type: "text", text: value }]
    },
    execute: (args) => {
      return `Hello, ${args.who}! \u6765\u81EA Cordis \u63D2\u4EF6 ${name}`;
    }
  }));
  const disposer = ctx.provide("greeter", {
    greet: (who) => `Hello, ${who}!`,
    describe: () => ({ plugin: name, runtime: "cordis" })
  });
  ctx.effect(() => {
    ctx.logger?.info(`[${name}] \u5DF2\u6FC0\u6D3B`);
    return () => {
      unregisterTool();
      disposer();
      ctx.logger?.info(`[${name}] \u5DF2\u6E05\u7406`);
    };
  }, `${name} lifecycle`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
