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

// plugins-example/board/src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  provide: () => provide
});
module.exports = __toCommonJS(index_exports);
var name = "board";
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
    name: "board_list_pools",
    description: "\u5217\u51FA\u5F53\u524D\u7528\u6237\u7684\u6240\u6709\u770B\u677F\u3002\u8FD4\u56DE\u770B\u677F id\u3001\u540D\u79F0\u3001\u63CF\u8FF0\u3002\u9700\u8981\u67E5\u770B\u67D0\u4E2A\u770B\u677F\u7684\u5361\u7247\u65F6\u7528 board_list_cards\u3002",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async () => {
      try {
        const sb = getSB();
        const { data, error } = await sb.from("board_pools").select("id,name,description,updated_at").order("updated_at", { ascending: false });
        if (error) throw error;
        const pools = data || [];
        if (!pools.length) return "\u6682\u65E0\u770B\u677F\u3002";
        return pools.map((p) => `- ${p.name} (${p.id.slice(0, 8)}) | ${p.description || "\u65E0\u63CF\u8FF0"} | ${new Date(p.updated_at).toLocaleString("zh-CN")}`).join("\n");
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "board_list_cards",
    description: "\u5217\u51FA\u6307\u5B9A\u770B\u677F\u7684\u6240\u6709\u5361\u7247\u3002\u9700\u8981 pool_id\uFF08\u770B\u677F id\uFF09\u3002\u8FD4\u56DE\u5361\u7247\u6807\u9898\u3001\u4F18\u5148\u7EA7\u3001\u8D1F\u8D23\u4EBA\u3001\u6240\u5C5E\u9636\u6BB5/\u6CF3\u9053\u7B49\u6458\u8981\u4FE1\u606F\u3002\u652F\u6301\u524D 8 \u4F4D\u77ED id \u5339\u914D pool_id\u3002",
    parameters: {
      pool_id: { type: "string", required: true, description: "\u770B\u677F id\uFF0C\u652F\u6301\u524D 8 \u4F4D\u77ED id" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = getSB();
        let poolQuery = sb.from("board_pools").select("id,name");
        poolQuery = args.pool_id.length < 36 ? poolQuery.filter("id::text", "like", `${args.pool_id}%`) : poolQuery.eq("id", args.pool_id);
        const { data: pools, error: poolErr } = await poolQuery;
        if (poolErr) throw poolErr;
        if (!pools || pools.length === 0) return `\u672A\u627E\u5230 id=${args.pool_id} \u7684\u770B\u677F\u3002`;
        const pool = pools[0];
        const [{ data: stages }, { data: lanes }, { data: cards }] = await Promise.all([
          sb.from("board_stages").select("id,name").eq("pool_id", pool.id).order("sort_order"),
          sb.from("board_lanes").select("id,name").eq("pool_id", pool.id).order("sort_order"),
          sb.from("board_cards").select("id,title,priority,assignee,note,lane_id,stage_id").eq("pool_id", pool.id).order("order_in_cell")
        ]);
        const stageMap = new Map((stages || []).map((s) => [s.id, s.name]));
        const laneMap = new Map((lanes || []).map((l) => [l.id, l.name]));
        if (!cards || cards.length === 0) return `\u770B\u677F\u300C${pool.name}\u300D\u6682\u65E0\u5361\u7247\u3002`;
        return `## ${pool.name}

` + cards.map((c) => {
          const stage = stageMap.get(c.stage_id) || "\u672A\u5206\u7C7B";
          const lane = laneMap.get(c.lane_id) || "\u9ED8\u8BA4";
          const noteIcon = c.note ? " \u{1F4DD}" : "";
          return `- [${c.priority}] ${c.title} | ${lane} \u2192 ${stage}${noteIcon} (${c.id.slice(0, 8)})`;
        }).join("\n");
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.tools.register(defineTool({
    name: "board_get_card",
    description: "\u83B7\u53D6\u6307\u5B9A\u5361\u7247\u7684\u5B8C\u6574\u8BE6\u60C5\uFF08\u542B\u5185\u5BB9\u3001\u5907\u6CE8\uFF09\u3002\u5148\u7528 board_list_cards \u62FF\u5230\u5361\u7247 id\uFF0C\u518D\u7528\u6B64\u5DE5\u5177\u3002\u652F\u6301\u524D 8 \u4F4D\u77ED id\u3002",
    parameters: {
      id: { type: "string", required: true, description: "\u5361\u7247 id\uFF0C\u652F\u6301\u524D 8 \u4F4D\u77ED id" }
    },
    output: {
      schema: { type: "string" },
      render: (_a, v) => [{ type: "text", text: v }]
    },
    execute: async (args) => {
      try {
        const sb = getSB();
        let q = sb.from("board_cards").select("*");
        q = args.id.length < 36 ? q.filter("id::text", "like", `${args.id}%`) : q.eq("id", args.id);
        const { data, error } = await q.maybeSingle();
        if (error) throw error;
        if (!data) return `\u672A\u627E\u5230 id=${args.id} \u7684\u5361\u7247\u3002`;
        const c = data;
        return `## ${c.title}

**\u5185\u5BB9:**
${c.content || "(\u65E0\u5185\u5BB9)"}

**\u5907\u6CE8:**
${c.note || "(\u65E0\u5907\u6CE8)"}

- \u4F18\u5148\u7EA7: ${c.priority}
- \u521B\u5EFA\u4EBA: ${c.created_by || "\u672A\u77E5"}
- \u521B\u5EFA\u65F6\u95F4: ${new Date(c.created_at).toLocaleString("zh-CN")}`;
      } catch (e) {
        return "\u67E5\u8BE2\u5931\u8D25: " + e.message;
      }
    }
  }));
  ctx.logger?.info("[board] HOST \u534A\u7AEF\u5DF2\u6FC0\u6D3B\uFF083 \u4E2A\u5DE5\u5177\uFF09");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name,
  provide
});
