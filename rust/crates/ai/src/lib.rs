mod director;
mod transitions;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct Generation {
    kind: String,
    model: String,
    prompt: String,
    language: Option<String>,
    #[serde(default)]
    ratio: String,
    #[serde(default)]
    size: String,
    duration: Option<u32>,
    #[serde(default, rename = "referenceImages")]
    reference_images: Vec<String>,
    resolution: Option<String>,
    #[serde(default)]
    assets: Value,
    #[serde(default)]
    previews: Vec<Value>,
}

fn request(input: &str) -> Result<Value, String> {
    let mut g: Generation = serde_json::from_str(input).map_err(|e| e.to_string())?;
    let (provider, model) = g
        .model
        .split_once('/')
        .ok_or("Model must be provider/name")?;
    if g.model.contains("..")
        || model.contains('/')
        || !g
            .model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-/._".contains(c))
    {
        return Err("Invalid model name".into());
    }
    if g.prompt.trim().is_empty() {
        return Err("Enter a prompt".into());
    }
    let chinese = match g.language.as_deref().unwrap_or("en") {
        "zh" => true,
        "en" => false,
        _ => return Err("Unsupported language".into()),
    };
    let language_instruction = if chinese {
        "请使用简体中文生成摘要、说明以及素材中需要出现的文字、字幕或对白。保留用户明确指定的其他语言。不要翻译媒体 ID 或 JSON 字段名。"
    } else {
        "Use English for summaries, explanations and any requested on-screen text, captions or dialogue. Preserve any other language explicitly requested by the user. Never translate media IDs or JSON field names."
    };
    g.prompt = format!("{}\n{}", g.prompt, language_instruction);
    if g.reference_images.len() > 8 || g.reference_images.iter().any(|url| !url.starts_with("data:image/") || !url.contains(";base64,")) { return Err("Invalid reference image".into()); }
    if !g.reference_images.is_empty() && (g.kind == "image" && provider != "google" || g.model.starts_with("google/gemini-omni")) { return Err("This model route does not support character reference images".into()); }
    let path = format!("/api/vertex-ai/v1/publishers/{provider}/models/{model}");
    match g.kind.as_str() {
        "edit" => {
            let mut content = vec![
                json!({"type":"text","text":format!("Brief: {}\nAssets: {}",g.prompt,g.assets)}),
            ];
            for preview in g.previews.iter().take(12) {
                if let (Some(id), Some(url)) =
                    (preview["mediaId"].as_str(), preview["url"].as_str())
                {
                    if url.starts_with("data:image/") {
                        content.push(
                            json!({"type":"text","text":format!("Thumbnail for mediaId {id}: ")}),
                        );
                        content.push(json!({"type":"image_url","image_url":{"url":url}}));
                    }
                }
            }
            Ok(json!({"path":"/api/v1/chat/completions", "body": {
            "model":g.model, "messages":[
                {"role":"system","content":"You are a video editor. Return only JSON: {\"summary\":string,\"clips\":[{\"mediaId\":string,\"in\":number,\"duration\":number}]}. Choose and order clips from supplied metadata and optional thumbnails to meet the brief. Thumbnails are single frames; never claim to have viewed full videos or heard audio. Times are seconds. Never invent media IDs. Video/audio source trims must remain within asset duration. Images can have any positive duration. Append clips sequentially; do not remove existing work. Use at most 100 clips."},
                {"role":"user","content":content}
            ]}}))
        }
        "image" if provider == "google" => {
            let mut config = json!({"responseModalities":["TEXT","IMAGE"]});
            if !g.ratio.is_empty() {
                config["imageConfig"] = json!({"aspectRatio":g.ratio});
            }
            let mut parts = vec![json!({"text":g.prompt})];
            for image in &g.reference_images {
                let (mime, data) = image.trim_start_matches("data:").split_once(";base64,").ok_or("Invalid reference image")?;
                parts.push(json!({"inlineData":{"mimeType":mime,"data":data}}));
            }
            Ok(json!({"path":format!("{path}:generateContent"),"body":{"contents":[{"role":"user","parts":parts}],"generationConfig":config}}))
        }
        "image" => {
            let mut body = json!({"model":g.model,"prompt":g.prompt,"n":1});
            if !g.size.is_empty() {
                body["size"] = json!(g.size);
            }
            Ok(json!({"path":"/api/v1/images/generations","body":body}))
        }
        "video" if g.model.starts_with("google/gemini-omni") => {
            let preference = format!(
                "{}\nRequested aspect ratio: {}. Requested duration: {:?} seconds. These are creative preferences, not guaranteed output constraints.",
                g.prompt, g.ratio, g.duration
            );
            Ok(
                json!({"path":"/api/v1/interactions","body":{"model":g.model,"input":preference,"response_modalities":["video"],"stream":false}}),
            )
        }
        "video" => {
            let mut body = json!({"model":g.model,"content":[{"type":"text","text":g.prompt}]});
            if g.reference_images.len() > 1 { return Err("The video route accepts one scene first frame".into()); }
            for image in &g.reference_images { body["content"].as_array_mut().unwrap().push(json!({"type":"image_url","role":"first_frame","image_url":{"url":image}})); }
            if !g.ratio.is_empty() {
                body["ratio"] = json!(g.ratio);
            }
            if let Some(d) = g.duration {
                if d == 0 || d > 120 {
                    return Err("Duration must be 1–120 seconds".into());
                }
                if g.model == "minimax/minimax-h3-max" && d > 15 {
                    return Err("MiniMax H3 Max supports 5–15 seconds; split longer shots first".into());
                }
                body["duration"] = json!(if g.model == "minimax/minimax-h3-max" { d.max(5) } else { d });
            }
            if g.model == "minimax/minimax-h3-max" {
                let resolution = g.resolution.filter(|r| !r.is_empty()).unwrap_or_else(|| "768p".into()).to_lowercase();
                if !["480p", "768p"].contains(&resolution.as_str()) {
                    return Err("MiniMax H3 Max supports 480P or 768P".into());
                }
                body["resolution"] = json!(resolution);
            } else if let Some(r) = g.resolution.filter(|r| !r.is_empty()) {
                body["resolution"] = json!(r);
            }
            Ok(json!({"path":"/api/v1/videos","pollPath":"/api/v1/videos/","body":body}))
        }
        _ => Err("Unknown generation kind".into()),
    }
}

#[derive(Deserialize, Serialize)]
struct Clip {
    #[serde(rename = "mediaId")]
    media_id: String,
    #[serde(rename = "in")]
    source_in: f64,
    duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    transition: Option<String>,
}
#[derive(Deserialize, Serialize)]
struct Plan {
    summary: String,
    clips: Vec<Clip>,
}
#[derive(Deserialize)]
struct Asset {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    duration: Option<f64>,
}
fn validate(plan: &str, assets: &str) -> Result<String, String> {
    let p: Plan = serde_json::from_str(plan).map_err(|e| e.to_string())?;
    let a: Vec<Asset> = serde_json::from_str(assets).map_err(|e| e.to_string())?;
    if p.clips.is_empty() || p.clips.len() > 100 {
        return Err("Plan must contain 1–100 clips".into());
    }
    for c in &p.clips {
        if c.transition.as_deref().is_some_and(|t| !["cut","fade","slide-left","slide-right","slide-up","slide-down","zoom-in","zoom-out","spin-left","spin-right","flip-horizontal","flip-vertical","fade-slide"].contains(&t)) { return Err("Unsupported transition".into()); }
        let asset = a
            .iter()
            .find(|a| a.id == c.media_id)
            .ok_or("Unknown media ID")?;
        if !c.source_in.is_finite()
            || !c.duration.is_finite()
            || c.source_in < 0.0
            || c.duration <= 0.0
            || c.duration > 3600.0
        {
            return Err("Invalid clip times".into());
        }
        if asset.kind == "image" {
            if c.source_in != 0.0 {
                return Err("Images must start at zero".into());
            }
        } else if !asset
            .duration
            .is_some_and(|d| c.source_in + c.duration <= d + 0.000001)
        {
            return Err("Clip exceeds source duration".into());
        }
    }
    serde_json::to_string(&p).map_err(|e| e.to_string())
}
#[wasm_bindgen(js_name = buildGenerationRequest)]
pub fn build_generation_request(input: &str) -> Result<String, JsError> {
    request(input)
        .map(|v| v.to_string())
        .map_err(|e| JsError::new(&e))
}
#[wasm_bindgen(js_name = validateEditPlan)]
pub fn validate_edit_plan(plan: &str, assets: &str) -> Result<String, JsError> {
    validate(plan, assets).map_err(|e| JsError::new(&e))
}
fn decode_response(input: &str, kind: &str) -> Result<Value, String> {
    let data: Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
    if let Some(error) = data.get("error") {
        return Err(error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Generation failed")
            .into());
    }
    if kind == "edit" {
        let content = data
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .ok_or("Model returned no edit plan")?
            .trim();
        let plan = content
            .strip_prefix("```json")
            .or_else(|| content.strip_prefix("```"))
            .unwrap_or(content)
            .trim();
        return Ok(json!({"status":"edit","plan":plan.strip_suffix("```").unwrap_or(plan).trim()}));
    }
    let expected = match kind {
        "image" => "image/",
        "video" => "video/",
        _ => return Err("Unknown media kind".into()),
    };
    if let Some(status) = data.get("status").and_then(Value::as_str) {
        if ["failed", "cancelled", "incomplete", "requires_action"].contains(&status) {
            return Err(format!("Generation {status}"));
        }
        if ["queued", "running", "in_progress"].contains(&status) {
            return Ok(json!({"status":"pending","jobId":data["id"]}));
        }
    }
    if let Some(url) = data.pointer("/content/video_url").and_then(Value::as_str) {
        return Ok(json!({"status":"succeeded","media":{"url":url,"mime":"video/mp4"}}));
    }
    if kind == "image"
        && let Some(first) = data.pointer("/data/0")
    {
        if let Some(base64) = first.get("b64_json").and_then(Value::as_str) {
            return Ok(json!({"status":"succeeded","media":{"base64":base64,"mime":"image/png"}}));
        }
        if let Some(url) = first.get("url").and_then(Value::as_str) {
            return Ok(json!({"status":"succeeded","media":{"url":url,"mime":"image/png"}}));
        }
    }
    let mut parts: Vec<&Value> = Vec::new();
    if let Some(candidates) = data.get("candidates").and_then(Value::as_array) {
        for c in candidates {
            if let Some(p) = c.pointer("/content/parts").and_then(Value::as_array) {
                parts.extend(p);
            }
        }
    }
    if let Some(steps) = data.get("steps").and_then(Value::as_array) {
        for step in steps {
            if step["type"] == "model_output" {
                if let Some(p) = step["content"].as_array() {
                    parts.extend(p);
                }
            }
        }
    }
    if let Some(outputs) = data.get("outputs").and_then(Value::as_array) {
        parts.extend(outputs);
    }
    for part in parts {
        let inline = part.get("inlineData").or_else(|| part.get("inline_data"));
        if let Some(inline) = inline {
            let mime = inline
                .get("mimeType")
                .or_else(|| inline.get("mime_type"))
                .and_then(Value::as_str)
                .unwrap_or("");
            if let Some(base64) = inline
                .get("data")
                .and_then(Value::as_str)
                .filter(|_| mime.starts_with(expected))
            {
                return Ok(json!({"status":"succeeded","media":{"base64":base64,"mime":mime}}));
            }
        }
        if part["type"] == kind {
            let mime =
                part.get("mime_type")
                    .and_then(Value::as_str)
                    .unwrap_or(if kind == "video" {
                        "video/mp4"
                    } else {
                        "image/png"
                    });
            if !mime.starts_with(expected) {
                continue;
            }
            if let Some(base64) = part.get("data").and_then(Value::as_str) {
                return Ok(json!({"status":"succeeded","media":{"base64":base64,"mime":mime}}));
            }
            if let Some(url) = part
                .get("uri")
                .or_else(|| part.get("url"))
                .and_then(Value::as_str)
            {
                return Ok(json!({"status":"succeeded","media":{"url":url,"mime":mime}}));
            }
        }
    }
    Err("Model returned no importable media. Check model output permissions and protocol.".into())
}
#[wasm_bindgen(js_name = decodeGenerationResponse)]
pub fn decode_generation_response(input: &str, kind: &str) -> Result<String, JsError> {
    decode_response(input, kind)
        .map(|v| v.to_string())
        .map_err(|e| JsError::new(&e))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn minimax_resolution_is_explicit_and_supported() {
        for (resolution, expected) in [(None,"768p"),(Some(""),"768p"),(Some("480p"),"480p"),(Some("768P"),"768p")] {
            let output=request(&json!({"kind":"video","model":"minimax/minimax-h3-max","prompt":"scene","resolution":resolution}).to_string()).unwrap();
            assert_eq!(output["body"]["resolution"],expected);
        }
        assert!(request(&json!({"kind":"video","model":"minimax/minimax-h3-max","prompt":"scene","resolution":"2K"}).to_string()).is_err());
    }
    #[test]
    fn minimax_duration_matches_observed_provider_limits() {
        for (requested, expected) in [(3,5),(5,5),(7,7),(15,15)] {
            let output=request(&json!({"kind":"video","model":"minimax/minimax-h3-max","prompt":"scene","duration":requested}).to_string()).unwrap();
            assert_eq!(output["body"]["duration"],expected);
        }
        assert!(request(&json!({"kind":"video","model":"minimax/minimax-h3-max","prompt":"scene","duration":16}).to_string()).is_err());
    }
    #[test]
    fn reference_images_use_real_image_fields() {
        let image="data:image/png;base64,aGVsbG8=";
        let output=request(&json!({"kind":"image","model":"google/gemini-3.1-flash-image","prompt":"scene","referenceImages":[image]}).to_string()).unwrap();
        assert_eq!(output["body"]["contents"][0]["parts"][1]["inlineData"]["mimeType"],"image/png");
        let output=request(&json!({"kind":"video","model":"minimax/minimax-h3-max","prompt":"scene","duration":5,"referenceImages":[image]}).to_string()).unwrap();
        assert_eq!(output["body"]["content"][1]["role"],"first_frame");
        assert_eq!(output["body"]["content"][1]["image_url"]["url"],image);
        assert!(request(&json!({"kind":"video","model":"google/gemini-omni-1.1-flash-preview","prompt":"scene","referenceImages":[image]}).to_string()).is_err());
    }
    #[test]
    fn language_applies_to_edit_image_and_video_prompts() {
        for (kind, model) in [
            ("edit", "openai/gpt-6.1-sol"),
            ("image", "openai/gpt-image-2.5-flare"),
            ("image", "google/gemini-3.1-flash-image"),
            ("video", "minimax/minimax-h3-max"),
            ("video", "google/gemini-omni-1.1-flash-preview"),
        ] {
            let zh = request(&json!({"kind":kind,"model":model,"prompt":"Original brief","language":"zh"}).to_string()).unwrap();
            let en = request(&json!({"kind":kind,"model":model,"prompt":"Original brief","language":"en"}).to_string()).unwrap();
            assert!(zh.to_string().contains("简体中文"));
            assert!(en.to_string().contains("Use English"));
            assert!(zh.to_string().contains("Original brief"));
            assert!(en.to_string().contains("Original brief"));
        }
        assert!(request(r#"{"kind":"edit","model":"openai/gpt-6.1-sol","prompt":"film","language":"xx"}"#).is_err());
    }

    #[test]
    fn video_uses_native_and_omits_unverified_defaults() {
        let r =
            request(r#"{"kind":"video","model":"minimax/minimax-h3-max","prompt":"sea"}"#).unwrap();
        assert_eq!(r["path"], "/api/v1/videos");
        assert!(r["body"].get("duration").is_none());
    }
    #[test]
    fn protocols_and_validation() {
        let edit = request(r#"{"kind":"edit","model":"openai/gpt-6.1-sol","prompt":"short film","previews":[{"mediaId":"a","url":"data:image/png;base64,aGVsbG8="}]}"#).unwrap();
        assert_eq!(
            edit["body"]["messages"][1]["content"][2]["type"],
            "image_url"
        );
        let omni = request(
            r#"{"kind":"video","model":"google/gemini-omni-1.1-flash-preview","prompt":"sea"}"#,
        )
        .unwrap();
        assert_eq!(omni["path"], "/api/v1/interactions");
        assert!(request(r#"{"kind":"video","model":"minimax/minimax-h3-max","prompt":"sea","resolution":"1080p"}"#).is_err());
        assert_eq!(
            request(r#"{"kind":"image","model":"openai/gpt-image-2.5-flare","prompt":"sea"}"#)
                .unwrap()["path"],
            "/api/v1/images/generations"
        );
        assert!(request(r#"{"kind":"image","model":"google/x","prompt":""}"#).is_err());
        assert!(request(r#"{"kind":"image","model":"google/../../x","prompt":"sea"}"#).is_err());
    }
    #[test]
    fn decodes_each_generation_protocol() {
        assert_eq!(
            decode_response(r#"{"data":[{"b64_json":"aGVsbG8="}]}"#, "image").unwrap()["media"]["mime"],
            "image/png"
        );
        assert_eq!(decode_response(r#"{"candidates":[{"content":{"parts":[{"inlineData":{"data":"aGVsbG8=","mimeType":"image/webp"}}]}}]}"#, "image").unwrap()["media"]["mime"],"image/webp");
        assert_eq!(
            decode_response(r#"{"status":"queued","id":"job"}"#, "video").unwrap()["jobId"],
            "job"
        );
        assert_eq!(
            decode_response(
                r#"{"status":"succeeded","content":{"video_url":"https://cdn.test/video.mp4"}}"#,
                "video"
            )
            .unwrap()["media"]["url"],
            "https://cdn.test/video.mp4"
        );
        assert_eq!(decode_response(r#"{"status":"completed","steps":[{"type":"model_output","content":[{"type":"video","uri":"https://cdn.test/omni.mp4","mime_type":"video/mp4"}]}]}"#, "video").unwrap()["media"]["url"],"https://cdn.test/omni.mp4");
        assert!(decode_response(r#"{"status":"failed"}"#, "video").is_err());
        assert!(decode_response(r#"{"candidates":[{"content":{"parts":[{"inlineData":{"data":"aGVsbG8=","mimeType":"text/plain"}}]}}]}"#, "image").is_err());
    }
    #[test]
    fn rejects_invalid_edits() {
        let a = r#"[{"id":"a","type":"video","duration":5}]"#;
        assert!(
            validate(
                r#"{"summary":"x","clips":[{"mediaId":"b","in":0,"duration":2}]}"#,
                a
            )
            .is_err()
        );
        assert!(
            validate(
                r#"{"summary":"x","clips":[{"mediaId":"a","in":4,"duration":2}]}"#,
                a
            )
            .is_err()
        );
        assert!(
            validate(
                r#"{"summary":"x","clips":[{"mediaId":"a","in":1,"duration":2}]}"#,
                a
            )
            .is_ok()
        );
    }
}

// Normalized capture crop; the UI owns capture streams and drawing.
fn focus_crop(x:f64,y:f64,zoom:f64,previous_x:f64,previous_y:f64,dt:f64)->Result<Value,String> {
    if [x,y,zoom,previous_x,previous_y,dt].iter().any(|v|!v.is_finite()) || !(1.0..=3.0).contains(&zoom) {return Err("Invalid focus parameters".into());}
    let size=1.0/zoom;
    let follow=1.0-(-dt.clamp(0.0,1.0)*8.0).exp();
    let left=(x-size/2.0).clamp(0.0,1.0-size);
    let top=(y-size/2.0).clamp(0.0,1.0-size);
    Ok(json!({"x":(previous_x+(left-previous_x)*follow).clamp(0.0,1.0-size),"y":(previous_y+(top-previous_y)*follow).clamp(0.0,1.0-size),"size":size}))
}
#[wasm_bindgen(js_name = screenFocusCrop)]
pub fn screen_focus_crop(x:f64,y:f64,zoom:f64,previous_x:f64,previous_y:f64,dt:f64)->Result<String,JsError>{focus_crop(x,y,zoom,previous_x,previous_y,dt).map(|v|v.to_string()).map_err(|e|JsError::new(&e))}
#[cfg(test)]
mod focus_tests {
    use super::*;
    #[test] fn stays_inside_capture_and_follows_smoothly() {
        let value=focus_crop(2.0,-1.0,2.0,0.0,0.0,0.1).unwrap();
        assert!(value["x"].as_f64().unwrap()>0.0 && value["x"].as_f64().unwrap()<0.5);
        assert_eq!(value["y"],0.0);
        assert_eq!(focus_crop(0.5,0.5,1.0,0.2,0.2,0.1).unwrap()["size"],1.0);
        assert!(focus_crop(f64::NAN,0.0,2.0,0.0,0.0,0.1).is_err());
    }
}
