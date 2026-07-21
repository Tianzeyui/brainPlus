#![allow(dead_code, unused_assignments)]
//! 终端命令执行 & PTY handler
//!
//! 支持：
//! - terminal.exec      — 同步等待（超时/环境变量/可中断/分页输出）
//! - terminal.spawn     — 异步流式输出
//! - terminal.ptySpawn  — 交互式 PTY
//! - terminal.ptyWrite  — PTY 写入
//! - terminal.ptyResize — PTY 尺寸调整
//! - terminal.kill      — SIGKILL 强制终止
//! - terminal.interrupt — SIGINT 优雅中断
//! - terminal.check     — 进程状态+累计输出

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;

// ====== 进程追踪 ======

type PtyWriter = Box<dyn std::io::Write + Send>;

struct TrackedChild {
    pty_writer: Option<PtyWriter>,
    kill_tx: Option<tokio::sync::oneshot::Sender<()>>,
    interrupt_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pid: u32,
    stdout_acc: String,
    stderr_acc: String,
    done: bool,
    exit_code: Option<i32>,
    created_at: std::time::Instant,
}

static PROCESSES: std::sync::LazyLock<StdMutex<HashMap<String, TrackedChild>>> =
    std::sync::LazyLock::new(|| StdMutex::new(HashMap::new()));

/// 清理超过 30 分钟未活动的残留进程
fn cleanup_stale() {
    let mut procs = PROCESSES.lock().unwrap();
    let cutoff = std::time::Duration::from_secs(1800); // 30 min
    procs.retain(|_, tc| tc.created_at.elapsed() < cutoff);
}

// ====== 命令执行（同步等待，支持超时/环境变量/可中断） ======

async fn terminal_exec(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    cleanup_stale();
    let id = req.param_str("id").unwrap_or("").to_string();
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: command".into(), data: None }
    })?;
    let cwd = req.param_str("cwd").filter(|s| !s.is_empty()).unwrap_or(".");
    let timeout_secs = req.params.get("timeout")
        .and_then(|v| v.as_u64())
        .unwrap_or(120)
        .max(1)
        .min(3600); // 扩大到 60 分钟

    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd.exe", "/c")
    } else {
        ("/bin/sh", "-c")
    };

    let mut cmd = Command::new(shell);
    cmd.args([shell_arg, command]).current_dir(cwd);

    // 注入环境变量
    if let Some(env_obj) = req.params.get("env").and_then(|v| v.as_object()) {
        for (key, val) in env_obj {
            if let Some(v) = val.as_str() {
                cmd.env(key, v);
            }
        }
    }

    let mut child = match cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(serde_json::json!({
                "success": false, "stdout": "", "stderr": format!("命令启动失败: {}", e), "exitCode": -1,
            }));
        }
    };

    let pid = child.id().unwrap_or(0);

    // 注册进程（支持 kill / interrupt）
    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();
    let (interrupt_tx, mut interrupt_rx) = tokio::sync::oneshot::channel::<()>();
    if !id.is_empty() {
        PROCESSES.lock().unwrap().insert(id.clone(), TrackedChild {
            pty_writer: None, kill_tx: Some(kill_tx), interrupt_tx: Some(interrupt_tx),
            pid, stdout_acc: String::new(), stderr_acc: String::new(),
            done: false, exit_code: None, created_at: std::time::Instant::now(),
        });
    }

    // 后台读 stdout / stderr（防止 pipe 满阻塞）
    let stdout_handle = {
        let mut reader = child.stdout.take().unwrap();
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = tokio::io::AsyncReadExt::read_to_end(&mut reader, &mut buf).await;
            String::from_utf8_lossy(&buf).to_string()
        })
    };
    let stderr_handle = {
        let mut reader = child.stderr.take().unwrap();
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = tokio::io::AsyncReadExt::read_to_end(&mut reader, &mut buf).await;
            String::from_utf8_lossy(&buf).to_string()
        })
    };

    // 等待进程 / 超时 / 外部信号
    let mut killed = false;
    let mut timed_out = false;
    let mut interrupted = false;

    let exit_code = tokio::select! {
        status = child.wait() => { status.ok().and_then(|s| s.code()).unwrap_or(-1) }
        _ = tokio::time::sleep(std::time::Duration::from_secs(timeout_secs)) => {
            timed_out = true;
            let _ = child.start_kill(); let _ = child.wait().await;
            -1
        }
        _ = &mut kill_rx => {
            killed = true;
            let _ = child.start_kill(); let _ = child.wait().await;
            -1
        }
        _ = &mut interrupt_rx => {
            interrupted = true;
            #[cfg(unix)]
            {
                unsafe { libc::kill(pid as i32, libc::SIGINT); }
                let grace = tokio::time::sleep(std::time::Duration::from_secs(5));
                let exit = tokio::select! {
                    s = child.wait() => s.ok().and_then(|s| s.code()),
                    _ = grace => { let _ = child.start_kill(); let _ = child.wait().await; None }
                };
                exit.unwrap_or(-1)
            }
            #[cfg(not(unix))]
            { let _ = child.start_kill(); let _ = child.wait().await; -1 }
        }
    };

    // 清理注册
    if !id.is_empty() {
        PROCESSES.lock().unwrap().remove(&id);
    }

    let stdout = stdout_handle.await.unwrap_or_default();
    let stderr = stderr_handle.await.unwrap_or_default();

    let timeout_msg;
    let (success, extra_msg) = if killed {
        (false, "\n[命令已被强制终止]")
    } else if timed_out {
        timeout_msg = format!("\n[命令执行超时 ({}s)]", timeout_secs);
        (false, timeout_msg.as_str())
    } else if interrupted {
        (false, "\n[命令已被中断 (SIGINT)]")
    } else {
        (exit_code == 0, "")
    };

    Ok(serde_json::json!({
        "success": success,
        "stdout": format!("{}{}", stdout, extra_msg),
        "stderr": stderr,
        "exitCode": exit_code,
        "pid": pid,
    }))
}

// ====== 异步命令执行（流式输出） ======

async fn terminal_spawn(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    cleanup_stale();
    let id = req.param_str("id").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: id".into(), data: None }
    })?.to_string();
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: command".into(), data: None }
    })?;
    let cwd = req.param_str("cwd").filter(|s| !s.is_empty()).unwrap_or(".");

    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd.exe", "/c")
    } else {
        ("/bin/sh", "-c")
    };

    let mut cmd = Command::new(shell);
    cmd.args([shell_arg, command]).current_dir(cwd);

    if let Some(env_obj) = req.params.get("env").and_then(|v| v.as_object()) {
        for (key, val) in env_obj {
            if let Some(v) = val.as_str() { cmd.env(key, v); }
        }
    }

    let mut child = match cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => { return Ok(serde_json::json!({"success": false, "error": format!("启动失败: {e}")})); }
    };

    let pid = child.id().unwrap_or(0);
    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();
    let (interrupt_tx, mut interrupt_rx) = tokio::sync::oneshot::channel::<()>();

    {
        PROCESSES.lock().unwrap().insert(id.clone(), TrackedChild {
            pty_writer: None, kill_tx: Some(kill_tx), interrupt_tx: Some(interrupt_tx),
            pid, stdout_acc: String::new(), stderr_acc: String::new(),
            done: false, exit_code: None, created_at: std::time::Instant::now(),
        });
    }

    let pid_clone = id.clone();
    let pid_acc = id.clone();

    tokio::spawn(async move {
        let mut stdout_buf = vec![0u8; 4096];
        let mut stderr_buf = vec![0u8; 4096];
        let mut stdout_reader = child.stdout.take();
        let mut stderr_reader = child.stderr.take();
        let mut exit_code: Option<i32> = None;

        loop {
            let mut did_read = false;
            if let Some(ref mut reader) = stdout_reader {
                match reader.read(&mut stdout_buf).await {
                    Ok(0) => { stdout_reader = None; }
                    Ok(n) => {
                        did_read = true;
                        let text = String::from_utf8_lossy(&stdout_buf[..n]).to_string();
                        if let Ok(mut procs) = PROCESSES.lock() {
                            if let Some(tc) = procs.get_mut(&pid_acc) { tc.stdout_acc.push_str(&text); }
                        }
                        emit(&tx, "terminal.output", serde_json::json!({
                            "id": pid_clone, "stdout": text, "stderr": "", "done": false,
                        }));
                    }
                    Err(_) => { stdout_reader = None; }
                }
            }
            if let Some(ref mut reader) = stderr_reader {
                match reader.read(&mut stderr_buf).await {
                    Ok(0) => { stderr_reader = None; }
                    Ok(n) => {
                        did_read = true;
                        let text = String::from_utf8_lossy(&stderr_buf[..n]).to_string();
                        if let Ok(mut procs) = PROCESSES.lock() {
                            if let Some(tc) = procs.get_mut(&pid_acc) { tc.stderr_acc.push_str(&text); }
                        }
                        emit(&tx, "terminal.output", serde_json::json!({
                            "id": pid_clone, "stdout": "", "stderr": text, "done": false,
                        }));
                    }
                    Err(_) => { stderr_reader = None; }
                }
            }
            if let Ok(Some(status)) = child.try_wait() { exit_code = status.code(); break; }
            if kill_rx.try_recv().is_ok() { let _ = child.start_kill(); exit_code = Some(-1); break; }
            if interrupt_rx.try_recv().is_ok() {
                #[cfg(unix)]
                {
                    unsafe { libc::kill(pid as i32, libc::SIGINT); }
                    let grace = std::time::Duration::from_secs(5);
                    let start = std::time::Instant::now();
                    loop {
                        if let Ok(Some(s)) = child.try_wait() { exit_code = s.code(); break; }
                        if start.elapsed() > grace { let _ = child.start_kill(); exit_code = Some(-1); break; }
                        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    }
                }
                #[cfg(not(unix))]
                { let _ = child.start_kill(); exit_code = Some(-1); }
                break;
            }
            if !did_read && stdout_reader.is_none() && stderr_reader.is_none() {
                match child.wait().await {
                    Ok(status) => { exit_code = status.code(); }
                    Err(_) => { exit_code = Some(-1); }
                }
                break;
            }
        }

        emit(&tx, "terminal.output", serde_json::json!({
            "id": pid_clone, "stdout": "", "stderr": "", "done": true, "exitCode": exit_code.unwrap_or(-1),
        }));
        if let Ok(mut procs) = PROCESSES.lock() {
            if let Some(tc) = procs.get_mut(&pid_clone) { tc.done = true; tc.exit_code = exit_code; }
        }
    });

    Ok(serde_json::json!({ "success": true, "pid": pid }))
}

// ====== 进程终止 ======

async fn terminal_kill(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let mut procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get_mut(&id) {
        if let Some(tx) = tracked.kill_tx.take() { let _ = tx.send(()); }
        tracked.done = true;
        tracked.exit_code = Some(-1);
        return Ok(serde_json::json!({ "success": true, "method": "SIGKILL" }));
    }
    Ok(serde_json::json!({ "success": false, "error": "进程未找到" }))
}

async fn terminal_interrupt(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let mut procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get_mut(&id) {
        if let Some(tx) = tracked.interrupt_tx.take() { let _ = tx.send(()); }
        return Ok(serde_json::json!({ "success": true, "method": "SIGINT" }));
    }
    Ok(serde_json::json!({ "success": false, "error": "进程未找到" }))
}

async fn terminal_check(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get(&id) {
        return Ok(serde_json::json!({
            "found": true, "done": tracked.done, "pid": tracked.pid,
            "stdout": tracked.stdout_acc, "stderr": tracked.stderr_acc,
            "exitCode": tracked.exit_code,
        }));
    }
    Ok(serde_json::json!({ "found": false }))
}

// ====== PTY 交互式终端 ======

async fn terminal_pty_spawn(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: id".into(), data: None }
    })?.to_string();
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: command".into(), data: None }
    })?;
    let cwd = req.param_str("cwd").filter(|s| !s.is_empty()).unwrap_or(".");

    use portable_pty::{CommandBuilder, PtySize};
    let pty_system = portable_pty::native_pty_system();
    let pair = match pty_system.openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 }) {
        Ok(p) => p,
        Err(e) => return Ok(serde_json::json!({"success": false, "error": format!("创建 PTY 失败: {e}")})),
    };
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => return Ok(serde_json::json!({"success": false, "error": format!("PTY reader 创建失败: {e}")})),
    };
    let writer: PtyWriter = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => return Ok(serde_json::json!({"success": false, "error": format!("PTY writer 创建失败: {e}")})),
    };

    // 通过 shell 执行（与 terminal_exec 一致），避免把整串当可执行文件名
    let mut cmd_builder = if cfg!(target_os = "windows") {
        let mut c = CommandBuilder::new("cmd.exe");
        c.arg("/c"); c.arg(command);
        c
    } else {
        let mut c = CommandBuilder::new("/bin/sh");
        c.arg("-c"); c.arg(command);
        c
    };
    cmd_builder.cwd(cwd);
    let mut child = match pair.slave.spawn_command(cmd_builder) {
        Ok(c) => c,
        Err(e) => return Ok(serde_json::json!({"success": false, "error": format!("PTY 启动命令失败: {e}")})),
    };
    let pid = child.process_id().unwrap_or(0);

    {
        PROCESSES.lock().unwrap().insert(id.clone(), TrackedChild {
            pty_writer: Some(writer), kill_tx: None, interrupt_tx: None,
            pid, stdout_acc: String::new(), stderr_acc: String::new(),
            done: false, exit_code: None, created_at: std::time::Instant::now(),
        });
    }

    let pid_clone = id.clone();
    let pid_acc = id.clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    // 存入 PROCESSES，让 check_terminal 能读到
                    if let Ok(mut procs) = PROCESSES.lock() {
                        if let Some(tc) = procs.get_mut(&pid_acc) {
                            tc.stdout_acc.push_str(&data);
                        }
                    }
                    emit(&tx, "pty.output", serde_json::json!({"id": pid_clone, "data": data, "done": false}));
                }
                Err(_) => break,
            }
        }
        // 标记完成
        if let Ok(mut procs) = PROCESSES.lock() {
            if let Some(tc) = procs.get_mut(&pid_acc) {
                tc.done = true;
                tc.exit_code = Some(0);
            }
        }
        emit(&tx, "pty.output", serde_json::json!({"id": pid_clone, "data": "\n\x1b[33m[PTY 已关闭]\x1b[0m\n", "done": true, "exitCode": 0}));
        PROCESSES.lock().unwrap().remove(&pid_clone);
    });

    tokio::spawn(async move { let _ = child.wait(); });
    Ok(serde_json::json!({ "success": true, "pid": pid }))
}

async fn terminal_pty_write(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let data = req.param_str("data").unwrap_or("");
    // 先拿出 writer（不在锁内 IO）
    let mut writer_opt: Option<PtyWriter> = {
        let mut procs = PROCESSES.lock().unwrap();
        procs.get_mut(&id).and_then(|tc| tc.pty_writer.take())
    };
    let result = if let Some(ref mut writer) = writer_opt {
        use std::io::Write;
        match writer.write_all(data.as_bytes()) {
            Ok(()) => { let _ = writer.flush(); Ok(serde_json::json!({ "success": true })) }
            Err(e) => Ok(serde_json::json!({"success": false, "error": format!("PTY 写入失败: {e}")})),
        }
    } else {
        Ok(serde_json::json!({ "success": false, "error": "PTY 进程不存在" }))
    };
    // 归还 writer
    if let Some(w) = writer_opt {
        if let Ok(mut procs) = PROCESSES.lock() {
            if let Some(tc) = procs.get_mut(&id) {
                tc.pty_writer = Some(w);
            }
        }
    }
    result
}

async fn terminal_pty_resize(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let cols = req.params.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
    let rows = req.params.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
    let mut procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get_mut(&id) {
        if let Some(ref mut writer) = tracked.pty_writer {
            use std::io::Write;
            let resize_cmd = format!("\x1b[8;{};{}t", rows, cols);
            let _ = writer.write_all(resize_cmd.as_bytes());
            let _ = writer.flush();
        }
    }
    Ok(serde_json::json!({ "ok": true }))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("terminal.exec", |req, tx| Box::pin(terminal_exec(req, tx)));
    registry.register("terminal.spawn", |req, tx| Box::pin(terminal_spawn(req, tx)));
    registry.register("terminal.kill", |req, tx| Box::pin(terminal_kill(req, tx)));
    registry.register("terminal.interrupt", |req, tx| Box::pin(terminal_interrupt(req, tx)));
    registry.register("terminal.check", |req, tx| Box::pin(terminal_check(req, tx)));
    registry.register("terminal.ptySpawn", |req, tx| Box::pin(terminal_pty_spawn(req, tx)));
    registry.register("terminal.ptyWrite", |req, tx| Box::pin(terminal_pty_write(req, tx)));
    registry.register("terminal.ptyResize", |req, tx| Box::pin(terminal_pty_resize(req, tx)));
}
