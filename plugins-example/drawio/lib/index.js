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

// plugins-example/drawio/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var name = "drawio";
var inject = ["tools", "supabase"];
var provide = [];
function apply(ctx) {
  const defineTool = ctx.get("defineTool");
  function getSB() {
    const sb = ctx.get("supabase");
    if (!sb) throw new Error("Supabase \u672A\u914D\u7F6E");
    return sb;
  }
  async function _listDiagrams() {
    const sb = getSB();
    const { data, error } = await sb.from("drawios").select("id,name,updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function _getDiagram(id) {
    const sb = getSB();
    const { data, error } = await sb.from("drawios").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`\u672A\u627E\u5230\u56FE\u8868 id=${id}`);
    return data;
  }
  ctx.tools.register(defineTool({
    name: "drawio_list",
    description: "\u5217\u51FA\u5F53\u524D\u7528\u6237\u7684\u6240\u6709 draw.io \u56FE\u8868\u3002\u8FD4\u56DE\u56FE\u8868 id\u3001\u540D\u79F0\u548C\u66F4\u65B0\u65F6\u95F4\u3002\u9700\u8981\u67E5\u770B\u6216\u7F16\u8F91\u67D0\u4E2A\u56FE\u8868\u65F6\u5148\u8C03\u7528\u6B64\u5DE5\u5177\u3002",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async () => {
      try {
        const diagrams = await _listDiagrams();
        if (diagrams.length === 0) return "\u6682\u65E0\u56FE\u8868\u3002";
        return diagrams.map(
          (d) => `- ${d.name} (${d.id.slice(0, 8)}) | ${new Date(d.updated_at).toLocaleString("zh-CN")}`
        ).join("\n");
      } catch (e) {
        return "\u83B7\u53D6\u56FE\u8868\u5217\u8868\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "drawio_get",
    description: "\u83B7\u53D6\u6307\u5B9A\u56FE\u8868\u7684\u5B8C\u6574 XML \u5185\u5BB9\u3002\u652F\u6301\u524D 8 \u4F4D\u77ED id \u5339\u914D\u3002",
    parameters: {
      id: { type: "string", required: true, description: "\u56FE\u8868 id\uFF0C\u652F\u6301\u524D 8 \u4F4D\u77ED id" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        let d;
        if (args.id.length < 36) {
          const list = await _listDiagrams();
          d = list.find((item) => item.id.startsWith(args.id));
          if (!d) return `\u672A\u627E\u5230 id=${args.id.slice(0, 8)} \u7684\u56FE\u8868\u3002`;
        } else {
          d = await _getDiagram(args.id);
        }
        return [
          `## ${d.name}`,
          `\u66F4\u65B0\u65F6\u95F4: ${new Date(d.updated_at).toLocaleString("zh-CN")}`,
          "",
          "```xml",
          d.xml,
          "```"
        ].join("\n");
      } catch (e) {
        return "\u83B7\u53D6\u56FE\u8868\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.logger?.info("[drawio] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B\uFF082 \u4E2A\u5DE5\u5177\uFF09");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
