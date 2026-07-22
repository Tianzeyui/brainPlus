//! Git 操作 handler
//!
//! 替换 electron/main.ts 中的 spawnSync('git', args)，
//! 改用 tokio::process::Command 异步执行。

use crate::handlers::{OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::Path;
use tokio::process::Command;
use tokio::sync::mpsc;

/// 执行 git 命令（通用）
async fn git_exec(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cwd = req.param_str("cwd").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: cwd".into(),
            data: None,
        }
    })?;

    let args: Vec<String> = req
        .param_array("args")
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if args.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "缺少必填参数: args"
        }));
    }

    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("目录不存在: {cwd}")
        }));
    }

    match Command::new("git")
        .args(&args)
        .current_dir(cwd_path)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);

            // stdout 截断保护（200k chars），stderr 截断保护（50k chars）
            let trunc_stdout: String = stdout.trim().chars().take(200_000).collect();
            let trunc_stderr: String = stderr.trim().chars().take(50_000).collect();

            if output.status.success() {
                Ok(serde_json::json!({
                    "success": true,
                    "output": trunc_stdout,
                    // git push/pull 等操作的进度信息在 stderr，成功时也返回
                    "stderr": trunc_stderr,
                    "exitCode": exit_code,
                }))
            } else {
                Ok(serde_json::json!({
                    "success": false,
                    "error": trunc_stderr,
                    "output": trunc_stdout,
                    "stderr": trunc_stderr,
                    "exitCode": exit_code,
                }))
            }
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("git 命令执行失败: {e}"),
            "exitCode": -1,
        })),
    }
}

pub fn register(registry: &mut Registry) {
    registry.register("git.exec", |req, tx| Box::pin(git_exec(req, tx)));
}
