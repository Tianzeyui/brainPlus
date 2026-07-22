//! 文件系统 handler（首批迁移，解决卡顿痛点）
//!
//! 性能对比（在 src/lib 目录，53 个文件）：
//! - 旧 Electron: execSync('find ...') → 完全阻塞主进程
//! - 新 Sidecar:  ignore crate + 流式 → 不阻塞任何线程

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::Path;
use tokio::sync::mpsc;

// ====== 文件读取 ======

async fn fs_read_file(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(file_path);
    if !path.exists() {
        return Ok(serde_json::json!({"success": false, "error": format!("文件不存在: {file_path}")}));
    }

    match tokio::fs::read_to_string(path).await {
        Ok(content) => Ok(serde_json::json!({"success": true, "content": content})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 文件写入 ======

async fn fs_write_file(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;
    let content = req.param_str("content").unwrap_or("");

    let path = Path::new(file_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            crate::protocol::RpcError {
                code: -32603,
                message: format!("创建父目录失败: {e}"),
                data: None,
            }
        })?;
    }

    match tokio::fs::write(path, content).await {
        Ok(()) => Ok(serde_json::json!({"success": true})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 文件元数据 ======

async fn fs_stat(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    match tokio::fs::metadata(file_path).await {
        Ok(meta) => Ok(serde_json::json!({
            "success": true,
            "stat": {
                "isFile": meta.is_file(),
                "isDirectory": meta.is_dir(),
                "size": meta.len(),
                "mtime": meta.modified().ok().map(|t| {
                    humantime::format_rfc3339(t).to_string()
                }),
            }
        })),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(serde_json::json!({"success": true, "stat": null}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 文件是否存在 ======

async fn fs_exists(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    Ok(serde_json::json!(Path::new(file_path).exists()))
}

// ====== 列出目录 ======

async fn fs_list_dir(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(dir_path);
    if !path.is_dir() {
        return Ok(serde_json::json!({"success": false, "error": "不是目录"}));
    }

    match tokio::fs::read_dir(path).await {
        Ok(mut entries) => {
            let mut files = Vec::new();
            while let Ok(Some(entry)) = entries.next_entry().await {
                files.push(entry.file_name().to_string_lossy().to_string());
            }
            Ok(serde_json::json!({"success": true, "files": files}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 创建目录 ======

async fn fs_mkdir(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    match tokio::fs::create_dir_all(dir_path).await {
        Ok(()) => Ok(serde_json::json!({"success": true})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 删除文件/目录 ======

async fn fs_unlink(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(file_path);
    if !path.exists() {
        return Ok(serde_json::json!({"success": true}));
    }

    let result = if path.is_dir() {
        tokio::fs::remove_dir_all(path).await
    } else {
        tokio::fs::remove_file(path).await
    };

    match result {
        Ok(()) => Ok(serde_json::json!({"success": true})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 重命名/移动文件 ======

async fn fs_rename(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let source = req.param_str("source").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: source".into(), data: None }
    })?;
    let dest = req.param_str("dest").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: dest".into(), data: None }
    })?;

    match tokio::fs::rename(source, dest).await {
        Ok(()) => Ok(serde_json::json!({"success": true})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 文件搜索（流式 + .gitignore 感知） ======

const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", ".stardust", "dist", "build",
    ".next", "__pycache__", ".DS_Store", "target", ".vscode",
    ".idea", "coverage", ".nyc_output", "release", "out",
    ".turbo", ".cache", ".codex", ".wrangler",
];

async fn fs_find(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(dir_path);
    if !path.is_dir() {
        return Ok(serde_json::json!({"success": false, "error": "不是目录"}));
    }

    let request_id = req.id.unwrap_or(0);

    let walker = ignore::WalkBuilder::new(path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(move |entry| {
            let name = entry.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|skip| name.as_ref() == *skip)
        })
        .build();

    let mut count = 0u64;
    let batch_size = 50u64;

    for result in walker {
        match result {
            Ok(entry) => {
                if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    count += 1;
                    let file_path = entry.path().to_string_lossy().to_string();

                    emit(
                        &tx,
                        "fs.findResult",
                        serde_json::json!({
                            "requestId": request_id,
                            "path": file_path,
                        }),
                    );

                    if count % batch_size == 0 {
                        emit(
                            &tx,
                            "fs.findBatch",
                            serde_json::json!({
                                "requestId": request_id,
                                "count": count,
                                "intermediate": true,
                            }),
                        );
                    }
                }
            }
            Err(e) => {
                tracing::warn!("遍历错误: {e}");
            }
        }
    }

    // 完成事件
    emit(
        &tx,
        "fs.findComplete",
        serde_json::json!({
            "requestId": request_id,
            "count": count,
            "intermediate": false,
        }),
    );

    Ok(serde_json::json!({
        "success": true,
        "count": count,
        "streamed": true,
    }))
}

// ====== 内容搜索（正则 + 流式） ======

async fn fs_grep(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;
    let pattern = req.param_str("pattern").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: pattern".into(),
            data: None,
        }
    })?;
    let file_glob = req.param_str("fileGlob");

    let request_id = req.id.unwrap_or(0);

    let re = regex::RegexBuilder::new(pattern)
        .case_insensitive(true)
        .multi_line(true)
        .build()
        .map_err(|e| crate::protocol::RpcError {
            code: -32602,
            message: format!("正则表达式无效: {e}"),
            data: None,
        })?;

    let path = Path::new(dir_path);
    if !path.is_dir() {
        return Ok(serde_json::json!({"success": false, "error": "不是目录"}));
    }

    // 构建文件 glob 过滤器（对齐前端 globToRegex 逻辑）
    let glob_pattern: Option<regex::Regex> = file_glob.map(|g| {
        // 去掉 ./ 前缀
        let g = g.strip_prefix("./").unwrap_or(g);
        // 1. 转义正则特殊字符
        let escaped = regex::escape(g);
        // 2. 按序替换 glob 通配符（**/ 必须在 * 之前处理，防止冲突）
        let re_str = escaped
            .replace("\\*\\*/", "\x00")       // **/ → 占位符
            .replace("\\*", "[^/]*")           // * → 路径段内通配
            .replace("\\?", "[^/]")            // ? → 单字符
            .replace('\x00', "(?:.+/)*");      // 占位符 → 任意目录深度
        regex::RegexBuilder::new(&format!("^{re_str}$"))
            .case_insensitive(true)
            .build()
            .unwrap()
    });

    let walker = ignore::WalkBuilder::new(path)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(move |entry| {
            let name = entry.file_name().to_string_lossy();
            !SKIP_DIRS.iter().any(|skip| name.as_ref() == *skip)
        })
        .build();

    let mut count = 0u64;
    let max_results = 200u64;
    let batch_size = 20u64;

    for result in walker {
        if count >= max_results {
            break;
        }

        match result {
            Ok(entry) => {
                if !entry.file_type().map_or(false, |ft| ft.is_file()) {
                    continue;
                }

                let file_path = entry.path();

                if let Some(ref glob) = glob_pattern {
                    // 用相对路径匹配 glob（如 *.ts、src/**/*.vue）
                    let rel_path = file_path.strip_prefix(&path).unwrap_or(file_path);
                    if !glob.is_match(&rel_path.to_string_lossy()) {
                        continue;
                    }
                }

                match std::fs::read_to_string(file_path) {
                    Ok(content) => {
                        let file_path_str = file_path.to_string_lossy().to_string();
                        let lines: Vec<&str> = content.lines().collect();

                        for (i, line) in lines.iter().enumerate() {
                            if count >= max_results {
                                break;
                            }
                            if re.is_match(line) {
                                count += 1;
                                let line_num = i + 1;
                                let snippet = if line.len() > 200 {
                                    &line[..200]
                                } else {
                                    line
                                };

                                emit(
                                    &tx,
                                    "fs.grepResult",
                                    serde_json::json!({
                                        "requestId": request_id,
                                        "file": file_path_str,
                                        "line": line_num,
                                        "text": snippet,
                                    }),
                                );

                                if count % batch_size == 0 {
                                    emit(
                                        &tx,
                                        "fs.grepBatch",
                                        serde_json::json!({
                                            "requestId": request_id,
                                            "count": count,
                                        }),
                                    );
                                }
                            }
                        }
                    }
                    Err(_) => continue,
                }
            }
            Err(e) => {
                tracing::warn!("遍历错误: {e}");
            }
        }
    }

    let truncated = count >= max_results;
    emit(
        &tx,
        "fs.grepComplete",
        serde_json::json!({
            "requestId": request_id,
            "count": count,
            "truncated": truncated,
        }),
    );

    Ok(serde_json::json!({
        "success": true,
        "count": count,
        "truncated": truncated,
        "streamed": true,
    }))
}

// ====== Base64 读取 ======

async fn fs_read_file_base64(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(file_path);
    if !path.exists() {
        return Ok(serde_json::json!({"success": false, "error": format!("文件不存在: {file_path}")}));
    }

    match std::fs::read(path) {
        Ok(buf) => {
            use base64::engine::general_purpose::STANDARD;
            use std::io::Write;

            let mut encoder = base64::write::EncoderStringWriter::new(&STANDARD);
            encoder.write_all(&buf).map_err(|e| {
                crate::protocol::RpcError {
                    code: -32603,
                    message: format!("Base64 编码失败: {e}"),
                    data: None,
                }
            })?;
            Ok(serde_json::json!({"success": true, "content": encoder.into_inner()}))
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== 复制目录 ======

async fn fs_copy_dir(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let src = req.param_str("src").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: src".into(),
            data: None,
        }
    })?;
    let dest = req.param_str("dest").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: dest".into(),
            data: None,
        }
    })?;

    let src_path = Path::new(src);
    if !src_path.exists() {
        return Ok(serde_json::json!({"success": false, "error": "源目录不存在"}));
    }

    let walker = ignore::WalkBuilder::new(src_path)
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !["node_modules", ".git"].iter().any(|s| name.as_ref() == *s)
        })
        .build();

    let dest_path = Path::new(dest);
    let src_str = src_path.to_string_lossy().to_string();

    tokio::fs::create_dir_all(dest_path).await.map_err(|e| {
        crate::protocol::RpcError {
            code: -32603,
            message: format!("创建目标目录失败: {e}"),
            data: None,
        }
    })?;

    let mut copied = 0u64;
    for result in walker {
        match result {
            Ok(entry) => {
                let entry_path = entry.path();
                let entry_str = entry_path.to_string_lossy();
                let rel = entry_str
                    .strip_prefix(&src_str)
                    .unwrap_or("")
                    .trim_start_matches('/');

                let target = dest_path.join(rel);

                if entry.file_type().map_or(false, |ft| ft.is_dir()) {
                    let _ = tokio::fs::create_dir_all(&target).await;
                } else if entry.file_type().map_or(false, |ft| ft.is_file()) {
                    if let Some(parent) = target.parent() {
                        let _ = tokio::fs::create_dir_all(parent).await;
                    }
                    if tokio::fs::copy(entry_path, &target).await.is_ok() {
                        copied += 1;
                    }
                }
            }
            Err(e) => {
                tracing::warn!("复制遍历错误: {e}");
            }
        }
    }

    Ok(serde_json::json!({"success": true, "copiedFiles": copied}))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("fs.readFile", |req, tx| Box::pin(fs_read_file(req, tx)));
    registry.register("fs.writeFile", |req, tx| Box::pin(fs_write_file(req, tx)));
    registry.register("fs.stat", |req, tx| Box::pin(fs_stat(req, tx)));
    registry.register("fs.exists", |req, tx| Box::pin(fs_exists(req, tx)));
    registry.register("fs.listDir", |req, tx| Box::pin(fs_list_dir(req, tx)));
    registry.register("fs.mkdir", |req, tx| Box::pin(fs_mkdir(req, tx)));
    registry.register("fs.unlink", |req, tx| Box::pin(fs_unlink(req, tx)));
    registry.register("fs.rename", |req, tx| Box::pin(fs_rename(req, tx)));
    registry.register("fs.find", |req, tx| Box::pin(fs_find(req, tx)));
    registry.register("fs.grep", |req, tx| Box::pin(fs_grep(req, tx)));
    registry.register("fs.readFileBase64", |req, tx| Box::pin(fs_read_file_base64(req, tx)));
    registry.register("fs.copyDir", |req, tx| Box::pin(fs_copy_dir(req, tx)));
}
