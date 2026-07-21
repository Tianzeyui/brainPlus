//! Stardust Sidecar Engine
//!
//! 独立 Rust 进程，通过 stdin/stdout JSON-RPC 与 Electron 主进程通信。
//! 承担所有重计算：文件 I/O、搜索、Git、终端、沙箱、AI 引擎等。
//!
//! 协议：
//! - stdin：每行一个 JSON-RPC Request（newline-delimited JSON）
//! - stdout：每行一个 JSON-RPC Response 或 Event Notification
//! - stderr：tracing 日志
//!
//! 输出顺序保证：所有输出（响应+事件）都通过同一个 mpsc channel → 单 writer，
//! 确保事件一定在响应之前发出。

mod handlers;
mod inference;
mod protocol;

use protocol::Response;
use std::io::{self, BufRead, Write};
use tokio::sync::mpsc;

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    // ---- 日志（stderr） ----
    tracing_subscriber::fmt()
        .with_writer(io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .json()
        .init();

    tracing::info!("Stardust Sidecar Engine 启动中...");

    let registry = handlers::register_all();
    tracing::info!("已注册 handler");

    // ---- 输出通道（单 writer 保证顺序） ----
    use handlers::OutputLine;
    let (out_tx, mut out_rx) = mpsc::channel::<OutputLine>(512);

    // 后台任务：串行写入 stdout
    let writer_task = tokio::spawn(async move {
        while let Some(line) = out_rx.recv().await {
            let mut stdout = io::stdout().lock();
            if writeln!(stdout, "{}", line.json).is_err() {
                break;
            }
            let _ = stdout.flush();
        }
    });

    // 发送就绪信号
    let _ = out_tx
        .send(OutputLine {
            json: serde_json::json!({
                "jsonrpc": "2.0",
                "method": "event.ready",
                "params": { "version": env!("CARGO_PKG_VERSION"), "pid": std::process::id() }
            })
            .to_string(),
        })
        .await;

    // ---- 主循环：逐行读 stdin ----
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();

    loop {
        let line = match lines.next() {
            Some(Ok(line)) if line.trim().is_empty() => continue,
            Some(Ok(line)) => line,
            Some(Err(e)) => {
                tracing::error!("stdin 读取错误: {e}");
                break;
            }
            None => {
                tracing::info!("stdin 关闭，退出");
                break;
            }
        };

        // 解析 JSON-RPC 请求
        let request: protocol::Request = match serde_json::from_str(&line) {
            Ok(req) => req,
            Err(e) => {
                tracing::warn!("JSON 解析失败: {e} | 原始行: {line}", line = line);
                let err = serde_json::json!({
                    "jsonrpc": "2.0", "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {e}") }
                });
                let _ = out_tx.send(OutputLine { json: err.to_string() }).await;
                continue;
            }
        };

        // 通知 → 不需响应
        if request.is_notification() {
            if let Some(handler) = registry.get(&request.method) {
                let tx = out_tx.clone();
                let _ = handler(request.clone(), tx).await;
            }
            continue;
        }

        let req_id = request.id.unwrap();

        // 查找 handler
        let handler = match registry.get(&request.method) {
            Some(h) => h.clone(),
            None => {
                let resp = Response::method_not_found(req_id, &request.method);
                let _ = out_tx
                    .send(OutputLine {
                        json: serde_json::to_string(&resp).unwrap_or_default(),
                    })
                    .await;
                continue;
            }
        };

        // 执行 handler — 通过 out_tx 推送事件，最后 handler 返回 response
        // 所有输出（事件 + 响应）都经过同一个 mpsc → 单 writer → 顺序保证
        let tx = out_tx.clone();
        tokio::spawn(async move {
            match handler(request, tx.clone()).await {
                Ok(result) => {
                    let resp = Response::success(req_id, result);
                    let _ = tx
                        .send(OutputLine {
                            json: serde_json::to_string(&resp).unwrap_or_default(),
                        })
                        .await;
                }
                Err(rpc_err) => {
                    let resp = Response {
                        jsonrpc: "2.0",
                        id: req_id,
                        result: None,
                        error: Some(rpc_err),
                    };
                    let _ = tx
                        .send(OutputLine {
                            json: serde_json::to_string(&resp).unwrap_or_default(),
                        })
                        .await;
                }
            }
        });
    }

    // 清理
    drop(out_tx);
    let _ = writer_task.await;
    tracing::info!("Stardust Sidecar Engine 已退出");
}
