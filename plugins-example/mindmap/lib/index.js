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

// plugins-example/mindmap/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var name = "mindmap";
var inject = ["tools", "supabase"];
var provide = [];
function apply(ctx) {
  const defineTool = ctx.get("defineTool");
  function getSB() {
    const sb = ctx.get("supabase");
    if (!sb) throw new Error("Supabase \u672A\u914D\u7F6E");
    return sb;
  }
  ctx.tools.register(defineTool({
    name: "mindmap_list",
    description: "\u5217\u51FA\u5F53\u524D\u7528\u6237\u7684\u6240\u6709\u601D\u7EF4\u5BFC\u56FE\u53CA\u5176\u8282\u70B9\u7ED3\u6784\u3002",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async () => {
      try {
        const sb = getSB();
        const { data: maps, error } = await sb.from("mindmaps").select("id,name,updated_at").order("updated_at", { ascending: false });
        if (error) throw error;
        if (!maps || maps.length === 0) return "\u6682\u65E0\u601D\u7EF4\u5BFC\u56FE\u3002";
        return maps.map(
          (m) => `- ${m.name} (${m.id.slice(0, 8)}) | ${new Date(m.updated_at).toLocaleString("zh-CN")}`
        ).join("\n");
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.logger?.info("[mindmap] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
