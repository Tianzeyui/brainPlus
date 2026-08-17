//! 搜索 & HTTP 代理 handler
//!
//! 替换 electron/main.ts 中的搜索/HTTP IPC handler：
//! - search:google → search.google
//! - search:brave  → search.brave
//! - search:ddg    → search.ddg
//! - search:bing   → search.bing
//! - search:fetch  → search.fetch
//! - http:fetch    → http.fetch
//!
//! 全部用 reqwest 异步 HTTP 客户端实现。

use crate::handlers::{OutputLine, Registry};
use crate::protocol::HandlerResult;
use reqwest::header::{HeaderName, HeaderValue};
use std::time::Duration;
use tokio::sync::mpsc;

const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const STARDUST_UA: &str = "Mozilla/5.0 (compatible; Stardust/1.0)";

fn build_client(timeout_ms: u64) -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        // 禁用系统代理：macOS 系统代理（如 Clash）会对 api.github.com 等返回 403，
        // 而 GitHub API / jsDelivr CDN 国内可直连，直连更可靠
        .no_proxy()
        .build()
        .unwrap_or_default()
}

// ====== Google Custom Search ======

async fn search_google(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let query = req.param_str("query").unwrap_or("");
    let api_key = req.param_str("apiKey").unwrap_or("");
    let cx = req.param_str("cx").unwrap_or("");

    let url = format!(
        "https://www.googleapis.com/customsearch/v1?key={}&cx={}&q={}",
        urlencoding(&api_key),
        urlencoding(&cx),
        urlencoding(query),
    );

    let client = build_client(10000);
    match client.get(&url).send().await {
        Ok(res) => {
            match res.json::<serde_json::Value>().await {
                Ok(json) => {
                    if let Some(items) = json.get("items").and_then(|v| v.as_array()) {
                        let data: Vec<serde_json::Value> = items.iter().take(10).map(|i| {
                            serde_json::json!({
                                "title": i["title"].as_str().unwrap_or(""),
                                "url": i["link"].as_str().unwrap_or(""),
                                "snippet": i["snippet"].as_str().unwrap_or(""),
                            })
                        }).collect();
                        Ok(serde_json::json!({"success": true, "data": data}))
                    } else {
                        Ok(serde_json::json!({
                            "success": false,
                            "error": json.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).unwrap_or("No results"),
                        }))
                    }
                }
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== Brave Search ======

async fn search_brave(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let query = req.param_str("query").unwrap_or("");
    let api_key = req.param_str("apiKey").unwrap_or("");

    let url = format!(
        "https://api.search.brave.com/res/v1/web/search?q={}&count=10",
        urlencoding(query),
    );

    let client = build_client(10000);
    match client.get(&url)
        .header("Accept", "application/json")
        .header("Accept-Encoding", "gzip")
        .header("X-Subscription-Token", api_key)
        .send()
        .await
    {
        Ok(res) => {
            match res.json::<serde_json::Value>().await {
                Ok(json) => {
                    if let Some(results) = json.get("web").and_then(|w| w.get("results")).and_then(|r| r.as_array()) {
                        let data: Vec<serde_json::Value> = results.iter().map(|i| {
                            serde_json::json!({
                                "title": i["title"].as_str().unwrap_or(""),
                                "url": i["url"].as_str().unwrap_or(""),
                                "snippet": i["description"].as_str().unwrap_or(""),
                            })
                        }).collect();
                        Ok(serde_json::json!({"success": true, "data": data}))
                    } else {
                        Ok(serde_json::json!({"success": false, "error": "No results"}))
                    }
                }
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== DuckDuckGo Instant Answer ======

async fn search_ddg(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let query = req.param_str("query").unwrap_or("");

    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1",
        urlencoding(query),
    );

    let client = build_client(10000);
    match client.get(&url).send().await {
        Ok(res) => {
            match res.json::<serde_json::Value>().await {
                Ok(json) => {
                    let mut data = Vec::new();

                    if let Some(results) = json.get("Results").and_then(|v| v.as_array()) {
                        for i in results.iter().take(10) {
                            data.push(serde_json::json!({
                                "title": i["Text"].as_str().unwrap_or_else(|| i["FirstURL"].as_str().unwrap_or("")),
                                "url": i["FirstURL"].as_str().unwrap_or(""),
                                "snippet": i["Text"].as_str().unwrap_or(""),
                            }));
                        }
                    } else if let Some(topics) = json.get("RelatedTopics").and_then(|v| v.as_array()) {
                        for t in topics.iter().filter(|t| t.get("FirstURL").is_some()).take(10) {
                            data.push(serde_json::json!({
                                "title": t["Text"].as_str().map(|s| &s[..s.len().min(80)]).unwrap_or(""),
                                "url": t["FirstURL"].as_str().unwrap_or(""),
                                "snippet": t["Text"].as_str().map(|s| &s[..s.len().min(200)]).unwrap_or(""),
                            }));
                        }
                    }

                    Ok(serde_json::json!({"success": true, "data": data}))
                }
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== Bing HTML 抓取 ======

async fn search_bing(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let query = req.param_str("query").unwrap_or("");
    let count = req.params.get("count").and_then(|v| v.as_u64()).unwrap_or(10);

    let url = format!(
        "https://www.bing.com/search?q={}&count={}",
        urlencoding(query), count,
    );

    let client = build_client(15000);
    match client.get(&url)
        .header("User-Agent", STARDUST_UA)
        .send()
        .await
    {
        Ok(res) => {
            match res.text().await {
                Ok(html) => {
                    let results = parse_bing_html(&html);
                    Ok(serde_json::json!({"success": true, "data": results}))
                }
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

fn parse_bing_html(html: &str) -> Vec<serde_json::Value> {
    let mut results = Vec::new();

    // 简化的正则匹配（对齐 TS 版本的 b_algo 解析）
    let re_item = regex::Regex::new(r#"<li class="b_algo"[^>]*>[\s\S]*?</li>"#).unwrap();
    let re_title = regex::Regex::new(r"<h2[^>]*>[\s\S]*?</h2>").unwrap();
    let re_url = regex::Regex::new(r#"href="(https?://[^"]+)""#).unwrap();
    let re_snippet = regex::Regex::new(r"<p[^>]*>[\s\S]*?</p>").unwrap();
    let re_tag = regex::Regex::new(r"<[^>]+>").unwrap();

    for cap in re_item.find_iter(html).take(10) {
        let item = cap.as_str();

        let title = re_title.find(item)
            .map(|m| re_tag.replace_all(m.as_str(), "").trim().to_string())
            .unwrap_or_default();

        let url = re_url.captures(item)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().replace("&amp;", "&"))
            .unwrap_or_default();

        let snippet = re_snippet.find(item)
            .map(|m| re_tag.replace_all(m.as_str(), "").trim().to_string())
            .unwrap_or_default();

        if !title.is_empty() && !url.is_empty() {
            results.push(serde_json::json!({
                "title": title,
                "url": url,
                "snippet": snippet,
            }));
        }
    }

    results
}

// ====== 通用网页抓取 ======

async fn search_fetch(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let url = req.param_str("url").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: url".into(),
            data: None,
        }
    })?;
    let timeout = req.params.get("timeout").and_then(|v| v.as_u64()).unwrap_or(15000);

    let client = build_client(timeout);
    match client.get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
    {
        Ok(res) => {
            match res.text().await {
                Ok(text) => Ok(serde_json::json!({"success": true, "data": text})),
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => {
            let msg = if e.is_timeout() {
                "timeout".to_string()
            } else {
                e.to_string()
            };
            Ok(serde_json::json!({"success": false, "error": msg}))
        }
    }
}

// ====== 通用 HTTP 代理 ======

async fn http_fetch(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let url = req.param_str("url").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: url".into(),
            data: None,
        }
    })?;

    let method = req.params.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
    let timeout = req.params.get("timeout").and_then(|v| v.as_u64()).unwrap_or(15000);
    let body = req.params.get("body").and_then(|v| v.as_str());

    let client = build_client(timeout);
    let mut request = match method.to_uppercase().as_str() {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        _ => client.get(url),
    };

    request = request
        .header("User-Agent", USER_AGENT)
        .header("Accept", "text/html,application/json,*/*");

    // 自定义 headers
    if let Some(headers) = req.params.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers {
            if let Some(val) = v.as_str() {
                if let (Ok(name), Ok(value)) = (
                    HeaderName::from_bytes(k.as_bytes()),
                    HeaderValue::from_str(val),
                ) {
                    request = request.header(name, value);
                }
            }
        }
    }

    if let Some(b) = body {
        request = request.body(b.to_string());
    }

    match request.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            match res.text().await {
                Ok(text) => Ok(serde_json::json!({
                    "success": true, "data": text, "status": status,
                })),
                Err(e) => Ok(serde_json::json!({
                    "success": false, "error": e.to_string(),
                })),
            }
        }
        Err(e) => {
            let msg = if e.is_timeout() { "timeout".to_string() } else { e.to_string() };
            Ok(serde_json::json!({"success": false, "error": msg}))
        }
    }
}

// ====== URL 编码简单实现 ======

fn urlencoding(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for &byte in s.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push('+'),
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("search.google", |req, tx| Box::pin(search_google(req, tx)));
    registry.register("search.brave", |req, tx| Box::pin(search_brave(req, tx)));
    registry.register("search.ddg", |req, tx| Box::pin(search_ddg(req, tx)));
    registry.register("search.bing", |req, tx| Box::pin(search_bing(req, tx)));
    registry.register("search.fetch", |req, tx| Box::pin(search_fetch(req, tx)));
    registry.register("http.fetch", |req, tx| Box::pin(http_fetch(req, tx)));
}
