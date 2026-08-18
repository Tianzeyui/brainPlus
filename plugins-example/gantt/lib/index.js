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

// plugins-example/gantt/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var name = "gantt";
var inject = ["tools", "supabase"];
var provide = [];
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function apply(ctx) {
  const defineTool = ctx.get("defineTool");
  function getSB() {
    const sb = ctx.get("supabase");
    if (!sb) throw new Error("Supabase \u672A\u914D\u7F6E");
    return sb;
  }
  ctx.tools.register(defineTool({
    name: "gantt_list",
    description: "\u67E5\u8BE2\u7518\u7279\u56FE\u4EFB\u52A1\u5217\u8868\u3002\u53EF\u6309\u65E5\u671F\u8303\u56F4\u3001\u72B6\u6001\u7B5B\u9009\u3002\u4E0D\u4F20\u53C2\u6570\u65F6\u8FD4\u56DE\u5168\u90E8\u3002\u8FD4\u56DE id\u3001\u540D\u79F0\u3001\u65E5\u671F\u3001\u72B6\u6001\u7B49\u6458\u8981\u3002\u9700\u8981\u67E5\u770B\u67D0\u4E2A\u4EFB\u52A1\u63CF\u8FF0\u65F6\u7528 gantt_get\u3002",
    parameters: {
      date_from: { type: "string", description: "\u5F00\u59CB\u65E5\u671F YYYY-MM-DD\uFF08\u53EF\u9009\uFF09" },
      date_to: { type: "string", description: "\u622A\u6B62\u65E5\u671F YYYY-MM-DD\uFF08\u53EF\u9009\uFF09" },
      status: { type: "string", description: "pending / in-progress / completed" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = getSB();
        let q = sb.from("gantt_tasks").select("id,name,start_date,ddl,color,status").order("start_date", { ascending: true });
        if (args.date_from) q = q.gte("start_date", args.date_from);
        if (args.date_to) q = q.lte("ddl", args.date_to);
        if (args.status) q = q.eq("status", args.status);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data || [];
        if (!rows.length) return "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1\u3002";
        return rows.map(
          (t) => `- ${t.name} (${t.id.slice(0, 8)}) | ${t.start_date} \u2192 ${t.ddl} | ${t.status}${t.ddl < formatDate(/* @__PURE__ */ new Date()) && t.status !== "completed" ? " \u26A0\uFE0F\u903E\u671F" : ""}`
        ).join("\n");
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "gantt_get",
    description: "\u6309 id \u83B7\u53D6\u4EFB\u52A1\u5B8C\u6574\u8BE6\u60C5\uFF08\u542B\u63CF\u8FF0\uFF09\u3002\u5148\u7528 gantt_list \u62FF\u5230 id\uFF0C\u518D\u7528\u6B64\u5DE5\u5177\u3002",
    parameters: {
      id: { type: "string", required: true, description: "\u4EFB\u52A1 id\uFF0C\u652F\u6301\u524D 8 \u4F4D\u77ED id" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = getSB();
        let q = sb.from("gantt_tasks").select("*");
        q = args.id.length < 36 ? q.filter("id::text", "like", `${args.id}%`) : q.eq("id", args.id);
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) return `\u672A\u627E\u5230 id=${args.id} \u7684\u4EFB\u52A1\u3002`;
        const t = data;
        const overdue = t.ddl < formatDate(/* @__PURE__ */ new Date()) && t.status !== "completed";
        return `## ${t.name}

${t.description || "(\u65E0\u63CF\u8FF0)"}

- \u5F00\u59CB: ${t.start_date}
- \u622A\u6B62: ${t.ddl}${overdue ? " (\u5DF2\u903E\u671F)" : ""}
- \u72B6\u6001: ${t.status}`;
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.logger?.info("[gantt] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B\uFF082 \u4E2A\u5DE5\u5177\uFF09");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
