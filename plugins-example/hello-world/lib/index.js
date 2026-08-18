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
var name = "hello-world";
var inject = ["tools", "sidecar", "fs"];
var provide = ["helloService"];
function apply(ctx) {
  const defineTool = ctx.get("defineTool");
  ctx.tools.register(defineTool({
    name: "hello_world",
    description: "\u57FA\u51C6\u6D4B\u8BD5\u5DE5\u51771\uFF1A\u57FA\u7840\u5B57\u7B26\u4E32\u5904\u7406\u3002\u9A8C\u8BC1\u63D2\u4EF6\u5DE5\u5177\u6CE8\u518C/\u6267\u884C\u94FE\u8DEF\u3002",
    parameters: {
      name: { type: "string", description: "\u4F60\u7684\u540D\u5B57\uFF08\u53EF\u9009\uFF09" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: (args) => {
      return args.name ? `Hello, ${args.name}! \u6765\u81EA\u65B0\u8303\u5F0F\u63D2\u4EF6 hello-world` : "Hello, World! \u6765\u81EA\u65B0\u8303\u5F0F\u63D2\u4EF6 hello-world";
    }
  }));
  ctx.tools.register(defineTool({
    name: "hello_sidecar",
    description: '\u57FA\u51C6\u6D4B\u8BD5\u5DE5\u51772\uFF1A\u8C03\u7528\u5BBF\u4E3B sidecar \u670D\u52A1\uFF08\u4E3B\u8FDB\u7A0B\u80FD\u529B\uFF09\u3002\u9A8C\u8BC1 ctx.get("sidecar")\u3002',
    parameters: {
      method: { type: "string", description: "sidecar \u65B9\u6CD5\u540D\uFF08\u5982 fs.listDir\uFF09" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sidecar = ctx.get("sidecar");
        if (!sidecar) return "sidecar \u670D\u52A1\u4E0D\u53EF\u7528";
        const result = await sidecar.call(args.method || "fs.listDir", {});
        return JSON.stringify(result).slice(0, 500);
      } catch (e) {
        return `sidecar \u8C03\u7528\u5931\u8D25: ${e.message}`;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "hello_fs",
    description: '\u57FA\u51C6\u6D4B\u8BD5\u5DE5\u51773\uFF1A\u5BBF\u4E3B fs \u670D\u52A1\u3002\u9A8C\u8BC1 ctx.get("fs") \u6587\u4EF6\u8BFB\u53D6\u3002',
    parameters: {
      path: { type: "string", required: true, description: "\u6587\u4EF6\u8DEF\u5F84" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const fsSvc = ctx.get("fs");
        if (!fsSvc) return "fs \u670D\u52A1\u4E0D\u53EF\u7528";
        const result = await fsSvc.readFile(args.path);
        return JSON.stringify(result).slice(0, 500);
      } catch (e) {
        return `fs \u8C03\u7528\u5931\u8D25: ${e.message}`;
      }
    }
  }));
  const disposer = ctx.provide("helloService", {
    greet: (who) => `Hello, ${who}! (\u6765\u81EA helloService)`,
    describe: () => ({
      plugin: "hello-world",
      runtime: "cordis",
      tools: ["hello_world", "hello_sidecar", "hello_fs"]
    })
  });
  ctx.effect(() => {
    ctx.logger?.info("[hello-world] \u5DF2\u6FC0\u6D3B");
    return () => {
      disposer();
      ctx.logger?.info("[hello-world] \u5DF2\u6E05\u7406");
    };
  }, "hello-world lifecycle");
  ctx.logger?.info("[hello-world] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B\uFF083 \u4E2A\u5DE5\u5177 + 1 \u4E2A\u670D\u52A1\uFF09");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
