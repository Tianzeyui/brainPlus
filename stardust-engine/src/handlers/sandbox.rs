//! 沙箱执行 handler (JS/Python)
//!
//! 替换 electron/main/sandboxService.ts：
//! - sandbox:executeJS → sandbox.executeJS
//! - sandbox:executePython → sandbox.executePython
//!
//! 实现方式：tokio::process::Command 异步子进程管理
//! - JS: spawn node -e (统一路径，替代 Worker Thread)
//! - Python: spawn python3/uv
//! - 输出文件自动收集到 workspace output 目录

use crate::handlers::{OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::Path;
use tokio::process::Command;
use tokio::sync::mpsc;

fn home_dir() -> std::path::PathBuf {
    dirs::home_dir().unwrap_or_default()
}

// ====== JS 执行 ======

async fn sandbox_execute_js(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let code = req.param_str("code").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: code".into(),
            data: None,
        }
    })?;

    let packages: Vec<String> = req
        .param_array("packages")
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let output_dir = req.param_str("outputDir").map(String::from);
    let timeout_secs = 120u64;

    // 有 npm 包需求：在项目目录中执行（需要先确保 npm install）
    if !packages.is_empty() {
        return execute_js_with_packages(code, &packages, output_dir.as_deref(), timeout_secs).await;
    }

    // 无包：直接 node -e（最快路径）
    execute_node(code, output_dir.as_deref(), timeout_secs).await
}

async fn execute_node(code: &str, output_dir: Option<&str>, timeout_secs: u64) -> HandlerResult {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        Command::new("node")
            .args(["-e", code])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

            if output.status.success() {
                let mut result_text = if stdout.is_empty() { stderr } else { stdout.clone() };
                if result_text.is_empty() { result_text = "(无输出)".to_string(); }

                // 收集输出文件
                if let Some(dir) = output_dir {
                    if let Ok(files) = collect_output_files(&dir) {
                        if !files.is_empty() {
                            result_text.push_str("\n\n输出文件:\n");
                            for f in &files {
                                result_text.push_str(&format!("- {f}\n"));
                            }
                        }
                    }
                }

                Ok(serde_json::json!({"success": true, "result": result_text}))
            } else {
                Ok(serde_json::json!({
                    "success": false,
                    "error": format!("{stdout}\n{stderr}").trim().to_string(),
                }))
            }
        }
        Ok(Err(e)) => Ok(serde_json::json!({"success": false, "error": format!("JS 执行失败: {e}")})),
        Err(_) => Ok(serde_json::json!({"success": false, "error": format!("JS 执行超时 ({timeout_secs}s)")})),
    }
}

async fn execute_js_with_packages(
    code: &str, packages: &[String], output_dir: Option<&str>, timeout_secs: u64,
) -> HandlerResult {
    // 确保包已安装
    for pkg in packages {
        let result = Command::new("npm")
            .args(["install", "--no-save", "--no-audit", "--no-fund", "--ignore-scripts", pkg])
            .output()
            .await;

        if let Err(e) = result {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("npm install {pkg} 失败: {e}"),
            }));
        }
    }

    execute_node(code, output_dir, timeout_secs).await
}

// ====== Python 执行 ======

async fn sandbox_execute_python(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let code = req.param_str("code").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: code".into(),
            data: None,
        }
    })?;

    let packages: Vec<String> = req
        .param_array("packages")
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let output_dir = req.param_str("outputDir").map(String::from);
    let timeout_secs = 120u64;

    // 检测可用的 Python 命令
    let python_cmd = if command_exists("uv").await {
        "uv".to_string()
    } else if command_exists("python3").await {
        "python3".to_string()
    } else if command_exists("python").await {
        "python".to_string()
    } else {
        return Ok(serde_json::json!({
            "success": false,
            "error": "未检测到 Python 3。安装 uv: curl -LsSf https://astral.sh/uv/install.sh | sh",
        }));
    };

    let result = if python_cmd == "uv" && !packages.is_empty() {
        // uv run --with pkg1 --with pkg2 python -c "code"
        let mut args: Vec<String> = vec!["run".into()];
        for p in &packages {
            args.push("--with".into());
            args.push(p.clone());
        }
        args.push("python".into());
        args.push("-c".into());
        args.push(code.to_string());

        tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            Command::new("uv").args(&args).output(),
        ).await
    } else if python_cmd == "uv" {
        // uv run python -c "code"
        tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            Command::new("uv")
                .args(["run", "python", "-c", code])
                .output(),
        ).await
    } else {
        // python3 -c "code"
        tokio::time::timeout(
            std::time::Duration::from_secs(timeout_secs),
            Command::new(&python_cmd)
                .args(["-c", code])
                .output(),
        ).await
    };

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

            if output.status.success() {
                let mut result_text = if stdout.is_empty() { stderr } else { stdout.clone() };
                if result_text.is_empty() { result_text = "(无输出)".to_string(); }

                if let Some(dir) = output_dir {
                    if let Ok(files) = collect_output_files(&dir) {
                        if !files.is_empty() {
                            result_text.push_str("\n\n输出文件:\n");
                            for f in &files {
                                result_text.push_str(&format!("- {f}\n"));
                            }
                        }
                    }
                }

                Ok(serde_json::json!({"success": true, "result": result_text}))
            } else {
                Ok(serde_json::json!({
                    "success": false,
                    "error": format!("{stdout}\n{stderr}").trim().to_string(),
                }))
            }
        }
        Ok(Err(e)) => Ok(serde_json::json!({"success": false, "error": format!("Python 执行失败: {e}")})),
        Err(_) => Ok(serde_json::json!({"success": false, "error": format!("Python 执行超时 ({timeout_secs}s)")})),
    }
}

// ====== 工具函数 ======

async fn command_exists(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn collect_output_files(output_dir: &str) -> Result<Vec<String>, std::io::Error> {
    let dir = Path::new(output_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let extensions = [".pptx", ".docx", ".xlsx", ".pdf", ".png", ".jpg", ".jpeg", ".svg", ".csv", ".json", ".txt", ".md"];
    let mut files = Vec::new();

    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext = format!(".{}", ext.to_string_lossy().to_lowercase());
                if extensions.contains(&ext.as_str()) {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(files)
}

// ====== 预初始化 ======

async fn sandbox_pre_init(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir = home_dir().join(".stardust").join("sandbox-npm");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
        let pkg = serde_json::json!({"name":"stardust-sandbox","private":true,"dependencies":{}});
        let _ = std::fs::write(dir.join("package.json"), serde_json::to_string_pretty(&pkg).unwrap_or_default());
    }
    Ok(serde_json::json!({"ok": true}))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("sandbox.preInit", |req, tx| Box::pin(sandbox_pre_init(req, tx)));
    registry.register("sandbox.executeJS", |req, tx| Box::pin(sandbox_execute_js(req, tx)));
    registry.register("sandbox.executePython", |req, tx| Box::pin(sandbox_execute_python(req, tx)));
}
