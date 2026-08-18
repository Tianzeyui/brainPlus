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

// plugins-example/diary/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
var name = "diary";
var inject = ["tools", "supabase"];
var provide = [];
function apply(ctx) {
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "diary_timeline",
    description: "\u67E5\u770B\u65E5\u8BB0\u65F6\u95F4\u7EBF\uFF0C\u5217\u51FA\u6709\u65E5\u8BB0\u8BB0\u5F55\u7684\u65E5\u671F\u53CA\u6807\u9898\u3002\u53EF\u7528\u4E8E\u5FEB\u901F\u4E86\u89E3\u7528\u6237\u7684\u65E5\u8BB0\u4E60\u60EF\u548C\u5173\u6CE8\u8BDD\u9898\u3002\u4E0D\u8FD4\u56DE\u6B63\u6587\u5185\u5BB9\uFF0C\u9700\u8981\u8BE6\u7EC6\u5185\u5BB9\u65F6\u4F7F\u7528 diary_get\u3002",
    parameters: {
      year: { type: "number", description: "\u7B5B\u9009\u5E74\u4EFD\uFF08\u53EF\u9009\uFF09\uFF0C\u5982 2026" },
      month: { type: "number", description: "\u7B5B\u9009\u6708\u4EFD 1-12\uFF08\u53EF\u9009\uFF09\uFF0C\u9700\u4E0E year \u4E00\u8D77\u4F7F\u7528" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = ctx.get("supabase");
        if (!sb) return "Supabase \u672A\u914D\u7F6E\u3002";
        let query = sb.from("diary_entries").select("entry_date, title, mood").order("entry_date", { ascending: false });
        if (args.year) {
          const y = String(args.year);
          if (args.month) {
            const m = String(args.month).padStart(2, "0");
            query = query.gte("entry_date", `${y}-${m}-01`).lt("entry_date", m === "12" ? `${Number(y) + 1}-01-01` : `${y}-${String(Number(m) + 1).padStart(2, "0")}-01`);
          } else {
            query = query.gte("entry_date", `${y}-01-01`).lt("entry_date", `${Number(y) + 1}-01-01`);
          }
        }
        const { data, error } = await query;
        if (error) throw error;
        const entries = data || [];
        if (entries.length === 0) {
          const scope = args.year ? args.month ? `${args.year}\u5E74${args.month}\u6708` : `${args.year}\u5E74` : "";
          return scope ? `${scope}\u6682\u65E0\u65E5\u8BB0\u8BB0\u5F55\u3002` : "\u6682\u65E0\u65E5\u8BB0\u8BB0\u5F55\u3002";
        }
        const lines = entries.map(
          (e) => `- **${e.entry_date}**${e.title ? ` \u2014 ${e.title}` : ""}${e.mood ? ` [${e.mood}]` : ""}`
        );
        return `${entries.length} \u7BC7\u65E5\u8BB0\uFF1A
${lines.join("\n")}`;
      } catch (e) {
        return `\u83B7\u53D6\u65E5\u8BB0\u65F6\u95F4\u7EBF\u5931\u8D25\uFF1A${e.message}`;
      }
    }
  }));
  ctx.tools.register((0, import_dsh_tools.defineTool)({
    name: "diary_get",
    description: "\u83B7\u53D6\u6307\u5B9A\u65E5\u671F\u7684\u65E5\u8BB0\u5168\u6587\u3002\u5148\u7528 diary_timeline \u67E5\u770B\u6709\u54EA\u4E9B\u65E5\u671F\u6709\u65E5\u8BB0\uFF0C\u518D\u6309\u65E5\u671F\u8BFB\u53D6\u8BE6\u7EC6\u5185\u5BB9\u3002\u5982\u679C\u7528\u6237\u63D0\u5230\u67D0\u4E2A\u65E5\u671F\u6216\u4E8B\u4EF6\uFF0C\u53EF\u4EE5\u7528\u6B64\u5DE5\u5177\u67E5\u770B\u5F53\u5929\u7684\u65E5\u8BB0\u3002",
    parameters: {
      date: { type: "string", required: true, description: "\u65E5\u671F\uFF0C\u683C\u5F0F YYYY-MM-DD" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = ctx.get("supabase");
        if (!sb) return "Supabase \u672A\u914D\u7F6E\u3002";
        const { data, error } = await sb.from("diary_entries").select("*").eq("entry_date", args.date).maybeSingle();
        if (error) throw error;
        if (!data) return `${args.date} \u6CA1\u6709\u65E5\u8BB0\u8BB0\u5F55\u3002`;
        const e = data;
        return [
          `## ${e.entry_date}${e.title ? ` \u2014 ${e.title}` : ""}${e.mood ? `  [${e.mood}]` : ""}`,
          "",
          e.content || "(\u7A7A)"
        ].join("\n");
      } catch (e) {
        return `\u83B7\u53D6\u65E5\u8BB0\u5931\u8D25\uFF1A${e.message}`;
      }
    }
  }));
  ctx.logger?.info("[diary] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B\uFF082 \u4E2A\u5DE5\u5177\uFF09");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
