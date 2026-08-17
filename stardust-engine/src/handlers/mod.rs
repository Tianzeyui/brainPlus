//! Handler 注册表 & 方法路由

pub mod chat;
pub mod fs;
pub mod mcp;
pub mod gh;
pub mod terminal;
pub mod search;
pub mod sandbox;
pub mod file_convert;
pub mod graph;
pub mod local_model;

use crate::protocol::{HandlerResult, Request};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

/// 输出行（发送到 stdout writer 的序列化 JSON）
#[derive(Clone)]
pub struct OutputLine {
    pub json: String,
}

/// 便捷方法：创建事件通知并序列化
pub fn event_json(event_name: &str, params: serde_json::Value) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "method": format!("event.{event_name}"),
        "params": params,
    })
    .to_string()
}

/// 创建 OutputLine 事件
pub fn emit(tx: &mpsc::Sender<OutputLine>, event_name: &str, params: serde_json::Value) {
    let _ = tx.try_send(OutputLine {
        json: event_json(event_name, params),
    });
}

/// Handler 函数签名
pub type HandlerFn = Arc<
    dyn Fn(Request, mpsc::Sender<OutputLine>) -> std::pin::Pin<Box<dyn std::future::Future<Output = HandlerResult> + Send>>
        + Send
        + Sync,
>;

pub struct Registry {
    handlers: HashMap<String, HandlerFn>,
}

impl Registry {
    pub fn new() -> Self {
        Self {
            handlers: HashMap::new(),
        }
    }

    pub fn register<F, Fut>(&mut self, method: &str, handler: F)
    where
        F: Fn(Request, mpsc::Sender<OutputLine>) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = HandlerResult> + Send + 'static,
    {
        let wrapped = Arc::new(move |req: Request, tx: mpsc::Sender<OutputLine>| {
            Box::pin(handler(req, tx))
                as std::pin::Pin<Box<dyn std::future::Future<Output = HandlerResult> + Send>>
        });
        self.handlers.insert(method.to_string(), wrapped);
    }

    pub fn get(&self, method: &str) -> Option<&HandlerFn> {
        self.handlers.get(method)
    }
}

pub fn register_all() -> Registry {
    let mut registry = Registry::new();

    // ====== AI Chat ======
    chat::register(&mut registry);

    // ====== MCP 客户端 ======
    mcp::register(&mut registry);

    // ====== fs 操作 ======
    fs::register(&mut registry);

    // ====== GitHub CLI 操作 ======
    gh::register(&mut registry);

    // ====== git 操作 ======

    // ====== 终端操作 ======
    terminal::register(&mut registry);

    // ====== 搜索 & HTTP ======
    search::register(&mut registry);

    // ====== 沙箱执行 ======
    sandbox::register(&mut registry);

    // ====== 文件转换 ======
    file_convert::register(&mut registry);

    // ====== 图数据库 ======
    graph::register(&mut registry);

    // ====== 本地模型 ======
    local_model::register(&mut registry);

    // 内建方法
    registry.register("ping", |_req, _tx| async move {
        Ok(serde_json::json!({ "pong": true }))
    });

    registry.register("shutdown", |_req, _tx| async move {
        tracing::info!("收到 shutdown 请求");
        tokio::spawn(async {
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            std::process::exit(0);
        });
        Ok(serde_json::json!({ "ok": true }))
    });

    registry
}
