#![allow(dead_code)]
//! MCP 客户端 handler
//! 替换 electron/main/mcp/MCPService.ts
//! JSON-RPC over stdio 协议实现

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::sync::Mutex;
use tokio::sync::mpsc;

// ====== JSON-RPC 请求/响应辅助 ======

/// 向 MCP 服务器发送 JSON-RPC 请求并读取匹配 id 的响应。
/// 使用持久 BufReader 避免预读数据丢失；跳过服务器推送的通知行（无 id 字段）。
fn mcp_send_json_rpc(conn: &mut McpConnection, method: &str, params: Value) -> Result<Value, String> {
    let id = conn.next_id;
    conn.next_id += 1;

    let request = serde_json::json!({
        "jsonrpc": "2.0", "id": id,
        "method": method,
        "params": params,
    });

    // 写 stdin
    {
        let stdin = conn.child.stdin.as_mut().ok_or("stdin not available")?;
        writeln!(stdin, "{}", serde_json::to_string(&request).unwrap_or_default())
            .map_err(|e| format!("write error: {e}"))?;
        stdin.flush().map_err(|e| format!("flush error: {e}"))?;
    }

    // 读 stdout——复用持久 reader，跳过通知行
    let reader = conn.reader.as_mut().ok_or("stdout reader not available")?;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|e| format!("read error: {e}"))?;
        let response: Value = serde_json::from_str(&line).map_err(|e| format!("parse error: {e}"))?;
        // 跳过服务器通知（无 id 字段，非响应）
        if response.get("id").is_none() {
            continue;
        }
        // 只处理匹配 id 的响应（忽略过时的旧 id 的响应）
        if response.get("id").and_then(|v| v.as_u64()) != Some(id) {
            continue;
        }
        // 检查 JSON-RPC error
        if let Some(err) = response.get("error") {
            let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
            let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown error");
            return Err(format!("MCP error (code {code}): {msg}"));
        }
        return Ok(response);
    }
}

// ====== MCP 服务器连接池 ======

struct McpConnection {
    child: std::process::Child,
    reader: Option<BufReader<std::process::ChildStdout>>, // 持久 reader，复用避免预读数据丢失
    next_id: u64,
    tools: Vec<Value>,
    resources: Vec<Value>,
    prompts: Vec<Value>,
    server_name: String,
    connected: bool,
}

static CONNECTIONS: std::sync::LazyLock<Mutex<HashMap<String, McpConnection>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

// ====== 配置 CRUD ======

static SERVER_CONFIGS: std::sync::LazyLock<Mutex<Vec<Value>>> =
    std::sync::LazyLock::new(|| Mutex::new(Vec::new()));

fn server_json(id: &str, name: &str, command: &str, args: &[String]) -> Value {
    serde_json::json!({"id": id, "name": name, "command": command, "args": args, "connected": false})
}

/// 内置 MCP 服务器：始终后台自动连接，不出现在用户设置列表中
fn builtin_servers() -> Vec<Value> {
    vec![
        server_json("filesystem", "Filesystem", "npx", &["-y".into(), "@modelcontextprotocol/server-filesystem".into(), "/".into()]),
        server_json("github", "GitHub", "npx", &["-y".into(), "@modelcontextprotocol/server-github".into()]),
        server_json("postgres", "PostgreSQL", "npx", &["-y".into(), "@modelcontextprotocol/server-postgres".into()]),
    ]
}

/// 返回用户添加的服务器列表（不包含内置服务器）
async fn mcp_get_servers(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let configs = SERVER_CONFIGS.lock().unwrap();
    let mut list = configs.clone();
    for s in &mut list {
        let id = s["id"].as_str().unwrap_or("");
        let conns = CONNECTIONS.lock().unwrap();
        s["connected"] = serde_json::Value::Bool(conns.contains_key(id));
    }
    Ok(serde_json::json!(list))
}

async fn mcp_add_server(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let config = req.params.clone();
    let mut configs = SERVER_CONFIGS.lock().unwrap();
    configs.push(config);
    Ok(serde_json::json!({"success": true}))
}

async fn mcp_remove_server(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    let mut configs = SERVER_CONFIGS.lock().unwrap();
    configs.retain(|c| c["id"].as_str() != Some(id));
    Ok(serde_json::json!({"success": true}))
}

// ====== 连接/断开 ======

async fn mcp_connect(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");

    // 先查用户配置（尽快释放锁）
    let config = {
        let configs = SERVER_CONFIGS.lock().unwrap();
        configs.iter().find(|c| c["id"].as_str() == Some(server_id)).cloned()
    };

    let config = match config {
        Some(c) => c,
        None => {
            let conns = CONNECTIONS.lock().unwrap();
            if conns.contains_key(server_id) {
                return Ok(serde_json::json!({"success": true, "alreadyConnected": true}));
            }
            return Ok(serde_json::json!({"success": false, "error": format!("服务器未找到: {server_id}")}));
        }
    };

    match connect_server(server_id, &config).await {
        Ok(tool_count) => {
            emit(&tx, "mcp.connected", serde_json::json!({"serverId": server_id, "toolCount": tool_count}));
            Ok(serde_json::json!({"success": true, "toolCount": tool_count}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

async fn mcp_disconnect(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let mut conns = CONNECTIONS.lock().unwrap();
    if let Some(mut c) = conns.remove(server_id) {
        let _ = c.child.kill();
        let _ = c.child.wait(); // 回收僵尸进程
    }
    Ok(serde_json::json!({"success": true}))
}

async fn mcp_disconnect_all(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let mut conns = CONNECTIONS.lock().unwrap();
    for (_, mut c) in conns.drain() {
        let _ = c.child.kill();
        let _ = c.child.wait(); // 回收僵尸进程
    }
    Ok(serde_json::json!({"success": true}))
}

// ====== 工具操作 ======

async fn mcp_list_tools(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let conns = CONNECTIONS.lock().unwrap();
    let tools = conns.get(server_id).map(|c| c.tools.clone()).unwrap_or_default();
    Ok(serde_json::json!(tools))
}

async fn mcp_call_tool(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let tool_name = req.param_str("toolName").unwrap_or("");
    let args = req.params.get("args").cloned().unwrap_or(serde_json::json!({}));

    let mut conns = CONNECTIONS.lock().unwrap();
    let conn = match conns.get_mut(server_id) {
        Some(c) if c.connected => c,
        _ => return Ok(serde_json::json!({"success": false, "error": "服务器未连接"})),
    };

    match mcp_send_json_rpc(conn, "tools/call", serde_json::json!({"name": tool_name, "arguments": args})) {
        Ok(response) => {
            let content = response["result"]["content"].clone();
            Ok(serde_json::json!({"success": true, "content": content}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

// ====== 获取所有工具 ======

async fn mcp_get_all_tools(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let conns = CONNECTIONS.lock().unwrap();
    let mut all_tools = Vec::new();
    let mut errors = Vec::new();
    for (sid, conn) in conns.iter() {
        if conn.connected {
            let server_name = &conn.server_name;
            for t in &conn.tools {
                let mut enriched = t.clone();
                if let Some(obj) = enriched.as_object_mut() {
                    obj.insert("serverName".to_string(), serde_json::json!(server_name));
                    obj.insert("serverId".to_string(), serde_json::json!(sid));
                }
                all_tools.push(enriched);
            }
        } else {
            errors.push(serde_json::json!({"serverName": sid, "error": "未连接"}));
        }
    }
    Ok(serde_json::json!({"tools": all_tools, "errors": errors}))
}

// ====== 自动连接内置服务器 ======

async fn mcp_auto_connect_builtins(_req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let builtins = builtin_servers();
    let mut connected = 0;
    let mut failed = 0;

    for server in &builtins {
        let id = server["id"].as_str().unwrap_or("").to_string();
        // 如果已连接则跳过
        {
            let conns = CONNECTIONS.lock().unwrap();
            if conns.contains_key(&id) { continue; }
        }
        match connect_server(&id, server).await {
            Ok(tool_count) => {
                connected += 1;
                emit(&tx, "mcp.connected", serde_json::json!({"serverId": id, "toolCount": tool_count}));
            }
            Err(e) => {
                failed += 1;
                tracing::warn!("[mcp] 内置服务器 {} 连接失败: {}", id, e);
            }
        }
    }

    Ok(serde_json::json!({"success": true, "connected": connected, "failed": failed}))
}

/// 内部：连接指定服务器，返回工具数量
async fn connect_server(server_id: &str, config: &Value) -> Result<usize, String> {
    let command = config["command"].as_str().unwrap_or("");
    let args: Vec<String> = config["args"].as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let name = config["name"].as_str().unwrap_or("").to_string();

    let mut child = std::process::Command::new(command)
        .args(&args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动失败: {e}"))?;

    // 握手和工具发现——失败时自动清理子进程，防止孤儿进程泄漏
    let handshake_result = (|| -> Result<(Vec<Value>, BufReader<std::process::ChildStdout>, std::process::ChildStdin), String> {
        let mut stdin = child.stdin.take().ok_or("stdin 不可用")?;
        let stdout = child.stdout.take().ok_or("stdout 不可用")?;
        let mut reader = BufReader::new(stdout);

        let init_req = serde_json::json!({
            "jsonrpc": "2.0", "id": 1u64, "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "stardust-engine", "version": "0.1.0"}
            }
        });
        writeln!(stdin, "{}", serde_json::to_string(&init_req).unwrap_or_default()).map_err(|e| format!("写入失败: {e}"))?;
        stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;

        // 校验握手响应
        let mut response_line = String::new();
        reader.read_line(&mut response_line).map_err(|_| "MCP handshake 超时".to_string())?;
        if let Ok(init_resp) = serde_json::from_str::<Value>(&response_line) {
            if let Some(err) = init_resp.get("error") {
                let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("unknown");
                return Err(format!("MCP 初始化被拒绝: {msg}"));
            }
            if let Some(ver) = init_resp["result"]["protocolVersion"].as_str() {
                if ver != "2024-11-05" && ver != "2025-06-18" {
                    tracing::warn!("[mcp] {} 协议版本 {} 不完全匹配，尝试继续", server_id, ver);
                }
            }
        }

        let init_notif = serde_json::json!({"jsonrpc":"2.0","method":"notifications/initialized"});
        writeln!(stdin, "{}", serde_json::to_string(&init_notif).unwrap_or_default()).map_err(|e| format!("写入失败: {e}"))?;
        stdin.flush().map_err(|e| format!("flush 失败: {e}"))?;

        let _ = writeln!(stdin, "{}", serde_json::json!({"jsonrpc":"2.0","id":2u64,"method":"tools/list"}));
        let _ = stdin.flush();

        let mut tools_line = String::new();
        let tools: Vec<Value> = if reader.read_line(&mut tools_line).is_ok() {
            serde_json::from_str::<Value>(&tools_line).ok()
                .and_then(|v| v["result"]["tools"].as_array().cloned())
                .unwrap_or_default()
        } else { vec![] };

        Ok((tools, reader, stdin))
    })();

    match handshake_result {
        Ok((tools, reader, stdin)) => {
            child.stdin = Some(stdin); // 归还 stdin，供后续 mcp_send_json_rpc 写入
            // spawn 线程持续 drain stderr，防止管道满导致死锁
            if let Some(stderr) = child.stderr.take() {
                let sid = server_id.to_string();
                std::thread::spawn(move || {
                    let buf = BufReader::new(stderr);
                    for line in buf.lines() {
                        if let Ok(l) = line { tracing::debug!("[mcp:{}:stderr] {}", sid, l); }
                    }
                });
            }

            let tool_count = tools.len();
            let mut conns = CONNECTIONS.lock().unwrap();
            conns.insert(server_id.to_string(), McpConnection {
                child, reader: Some(reader), next_id: 3, tools, resources: vec![], prompts: vec![],
                server_name: name, connected: true,
            });
            Ok(tool_count)
        }
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(e)
        }
    }
}

// ====== 更新服务器配置 ======

async fn mcp_update_server(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    let mut configs = SERVER_CONFIGS.lock().unwrap();
    if let Some(cfg) = configs.iter_mut().find(|c| c["id"].as_str() == Some(id)) {
        let new_config = req.params.clone();
        // 合并字段
        if let Some(name) = new_config.get("name") { cfg["name"] = name.clone(); }
        if let Some(command) = new_config.get("command") { cfg["command"] = command.clone(); }
        if let Some(args) = new_config.get("args") { cfg["args"] = args.clone(); }
        if let Some(url) = new_config.get("url") { cfg["url"] = url.clone(); }
        if let Some(enabled) = new_config.get("enabled") { cfg["enabled"] = enabled.clone(); }
        Ok(serde_json::json!({"success": true}))
    } else {
        Ok(serde_json::json!({"success": false, "error": format!("服务器未找到: {id}")}))
    }
}

// ====== 资源操作 ======

async fn mcp_list_resources(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let mut conns = CONNECTIONS.lock().unwrap();
    let conn = match conns.get_mut(server_id) {
        Some(c) if c.connected => c,
        _ => return Ok(serde_json::json!({"success": false, "error": "服务器未连接"})),
    };

    match mcp_send_json_rpc(conn, "resources/list", serde_json::json!({})) {
        Ok(response) => {
            let resources: Vec<Value> = response["result"]["resources"]
                .as_array().cloned().unwrap_or_default();
            // 缓存
            conn.resources = resources.clone();
            Ok(serde_json::json!(resources))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

async fn mcp_read_resource(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let uri = req.param_str("uri").unwrap_or("");

    let mut conns = CONNECTIONS.lock().unwrap();
    let conn = match conns.get_mut(server_id) {
        Some(c) if c.connected => c,
        _ => return Ok(serde_json::json!({"success": false, "error": "服务器未连接"})),
    };

    match mcp_send_json_rpc(conn, "resources/read", serde_json::json!({"uri": uri})) {
        Ok(response) => {
            let content = response["result"]["contents"].clone();
            Ok(serde_json::json!({"success": true, "content": content}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

async fn mcp_get_all_resources(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let mut conns = CONNECTIONS.lock().unwrap();
    let mut all_resources: Vec<Value> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();

    let server_ids: Vec<String> = conns.keys().cloned().collect();
    for sid in &server_ids {
        let needs_fetch = match conns.get(sid) {
            Some(c) if c.connected => c.resources.is_empty(),
            _ => continue,
        };
        if needs_fetch {
            // fetch resources
            let conn = conns.get_mut(sid).unwrap();
            match mcp_send_json_rpc(conn, "resources/list", serde_json::json!({})) {
                Ok(response) => {
                    let resources: Vec<Value> = response["result"]["resources"]
                        .as_array().cloned().unwrap_or_default();
                    conn.resources = resources;
                }
                Err(e) => {
                    errors.push(serde_json::json!({"serverName": sid, "error": e}));
                    continue;
                }
            }
        }
        if let Some(conn) = conns.get(sid) {
            let server_name = &conn.server_name;
            for r in &conn.resources {
                let mut with_server = r.clone();
                if let Some(obj) = with_server.as_object_mut() {
                    obj.insert("serverName".to_string(), serde_json::json!(server_name));
                    obj.insert("serverId".to_string(), serde_json::json!(sid));
                }
                all_resources.push(with_server);
            }
        }
    }

    Ok(serde_json::json!({"resources": all_resources, "errors": errors}))
}

// ====== 提示操作 ======

async fn mcp_list_prompts(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let mut conns = CONNECTIONS.lock().unwrap();
    let conn = match conns.get_mut(server_id) {
        Some(c) if c.connected => c,
        _ => return Ok(serde_json::json!({"success": false, "error": "服务器未连接"})),
    };

    match mcp_send_json_rpc(conn, "prompts/list", serde_json::json!({})) {
        Ok(response) => {
            let prompts: Vec<Value> = response["result"]["prompts"]
                .as_array().cloned().unwrap_or_default();
            // 缓存
            conn.prompts = prompts.clone();
            Ok(serde_json::json!(prompts))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

async fn mcp_get_prompt(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let server_id = req.param_str("serverId").unwrap_or("");
    let prompt_name = req.param_str("promptName").unwrap_or("");
    let args = req.params.get("args").cloned().unwrap_or(serde_json::json!({}));

    let mut conns = CONNECTIONS.lock().unwrap();
    let conn = match conns.get_mut(server_id) {
        Some(c) if c.connected => c,
        _ => return Ok(serde_json::json!({"success": false, "error": "服务器未连接"})),
    };

    match mcp_send_json_rpc(conn, "prompts/get", serde_json::json!({"name": prompt_name, "arguments": args})) {
        Ok(response) => Ok(response["result"].clone()),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e})),
    }
}

async fn mcp_get_all_prompts(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let mut conns = CONNECTIONS.lock().unwrap();
    let mut all_prompts: Vec<Value> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();

    let server_ids: Vec<String> = conns.keys().cloned().collect();
    for sid in &server_ids {
        let needs_fetch = match conns.get(sid) {
            Some(c) if c.connected => c.prompts.is_empty(),
            _ => continue,
        };
        if needs_fetch {
            let conn = conns.get_mut(sid).unwrap();
            match mcp_send_json_rpc(conn, "prompts/list", serde_json::json!({})) {
                Ok(response) => {
                    let prompts: Vec<Value> = response["result"]["prompts"]
                        .as_array().cloned().unwrap_or_default();
                    conn.prompts = prompts;
                }
                Err(e) => {
                    errors.push(serde_json::json!({"serverName": sid, "error": e}));
                    continue;
                }
            }
        }
        if let Some(conn) = conns.get(sid) {
            let server_name = &conn.server_name;
            for p in &conn.prompts {
                let mut with_server = p.clone();
                if let Some(obj) = with_server.as_object_mut() {
                    obj.insert("serverName".to_string(), serde_json::json!(server_name));
                    obj.insert("serverId".to_string(), serde_json::json!(sid));
                }
                all_prompts.push(with_server);
            }
        }
    }

    Ok(serde_json::json!({"prompts": all_prompts, "errors": errors}))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("mcp.autoConnectBuiltins", |req, tx| Box::pin(mcp_auto_connect_builtins(req, tx)));
    registry.register("mcp.getServers", |req, tx| Box::pin(mcp_get_servers(req, tx)));
    registry.register("mcp.addServer", |req, tx| Box::pin(mcp_add_server(req, tx)));
    registry.register("mcp.removeServer", |req, tx| Box::pin(mcp_remove_server(req, tx)));
    registry.register("mcp.updateServer", |req, tx| Box::pin(mcp_update_server(req, tx)));
    registry.register("mcp.connect", |req, tx| Box::pin(mcp_connect(req, tx)));
    registry.register("mcp.disconnect", |req, tx| Box::pin(mcp_disconnect(req, tx)));
    registry.register("mcp.disconnectAll", |req, tx| Box::pin(mcp_disconnect_all(req, tx)));
    registry.register("mcp.listTools", |req, tx| Box::pin(mcp_list_tools(req, tx)));
    registry.register("mcp.callTool", |req, tx| Box::pin(mcp_call_tool(req, tx)));
    registry.register("mcp.getAllTools", |req, tx| Box::pin(mcp_get_all_tools(req, tx)));
    registry.register("mcp.listResources", |req, tx| Box::pin(mcp_list_resources(req, tx)));
    registry.register("mcp.readResource", |req, tx| Box::pin(mcp_read_resource(req, tx)));
    registry.register("mcp.listPrompts", |req, tx| Box::pin(mcp_list_prompts(req, tx)));
    registry.register("mcp.getPrompt", |req, tx| Box::pin(mcp_get_prompt(req, tx)));
    registry.register("mcp.getAllResources", |req, tx| Box::pin(mcp_get_all_resources(req, tx)));
    registry.register("mcp.getAllPrompts", |req, tx| Box::pin(mcp_get_all_prompts(req, tx)));
}
