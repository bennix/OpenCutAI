use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Brief { model: String, brief: String, preset: String, ratio: String, shot_count: usize, language: String, #[serde(default)] max_shot_seconds: Option<u32>, #[serde(default)] assets: Value }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Storyboard { title: String, visual_memory: VisualMemory, shots: Vec<Shot>, #[serde(default)] characters: Vec<Character> }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualMemory { ground: String, render_mode: String, palette: Vec<String>, characters: String, atmosphere: String }
#[derive(Deserialize, Serialize)]
struct Character { id: String, name: String, description: String }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Shot { id: String, title: String, duration: f64, prompt: String, camera: String, motion: String, continuity: String, transition: String, #[serde(default, skip_serializing_if="Option::is_none")] media_id: Option<String>, #[serde(default)] character_ids: Vec<String> }

fn request(input: &str) -> Result<Value,String> {
    let b: Brief = serde_json::from_str(input).map_err(|e|e.to_string())?;
    if b.brief.trim().is_empty() || b.brief.len() > 20000 || !(1..=12).contains(&b.shot_count) { return Err("Enter a brief and choose 1–12 shots".into()); }
    if !["zh","en"].contains(&b.language.as_str()) || !["16:9","9:16","1:1","4:3","3:4"].contains(&b.ratio.as_str()) { return Err("Invalid language or aspect ratio".into()); }
    let style = match b.preset.as_str() {
        "auto" => "Choose one coherent art direction suited to the brief. Explicitly establish ground, render_mode, palette, characters and atmosphere. Do not silently default to ivory paper.",
        "ivory-postcard" => include_str!("../vendor/editorial-vision/presets/ivory-postcard.md"),
        "vintage-travel-poster" => include_str!("../vendor/editorial-vision/presets/vintage-travel-poster.md"),
        "papercraft-diorama-postcard" if b.ratio == "1:1" => include_str!("../vendor/editorial-vision/presets/papercraft-diorama-postcard.md"),
        _ => return Err("Unknown preset or conflicting aspect ratio".into()),
    };
    let system = format!("You are a storyboard director. Adapt the Editorial Vision Studio series planning and visual memory workflow to video shots. Establish one style lock across the entire storyboard. Do not ask follow-up questions. Do not claim to have watched supplied video or analyzed images: only metadata is supplied.\n{}\n{}\nSelected style:\n{}\nReturn ONLY JSON with schema {{title:string,visualMemory:{{ground:string,renderMode:string,palette:string[],characters:string,atmosphere:string}},shots:[{{id:string,title:string,duration:number,prompt:string,camera:string,motion:string,continuity:string,transition:string,mediaId?:string}}]}}. Exactly {} shots, each 1–30 seconds. Prompts must be standalone executable image/video descriptions with shared character identity, lighting, palette, composition and motion. Include a concrete continuity link to the previous shot (action, eyeline, object, color or camera direction). Allowed transitions: cut, fade, slide-left, slide-right, slide-up, slide-down, zoom-in, zoom-out, spin-left, spin-right, flip-horizontal, flip-vertical, fade-slide. Use mediaId only for suitable existing supplied image/video assets, never invent IDs. Preserve user intent. Output prose in {}. Aspect ratio: {}. Do not fabricate objective quality scores.", include_str!("../vendor/editorial-vision/prompts/series.md"), include_str!("../vendor/editorial-vision/prompts/visual-memory.md"), style, b.shot_count, if b.language == "zh" { "Simplified Chinese" } else { "English" }, b.ratio);
    let system = format!("{system}\nAlso return characters:[{{id:string,name:string,description:string}}] with at most 3 recurring characters extracted from the script, with stable facial features, hair, body proportions and wardrobe; use an empty list for no recurring characters. Each shot must include characterIds:string[] listing only characters visible in that shot. Maximum shot duration is {} seconds; break actions into shorter shots rather than exceeding it.", b.max_shot_seconds.unwrap_or(30).clamp(1,30));
    Ok(json!({"path":"/api/v1/chat/completions","body":{"model":b.model,"messages":[{"role":"system","content":system},{"role":"user","content":format!("Brief: {}\nAvailable asset metadata: {}",b.brief,b.assets)}]}}))
}
fn validate(input: &str, assets: &str) -> Result<String,String> {
    let text = input.trim();
    let text = text.strip_prefix("```json").or_else(||text.strip_prefix("```")).unwrap_or(text).trim().trim_end_matches("```").trim();
    let p: Storyboard = serde_json::from_str(text).map_err(|e|e.to_string())?;
    let assets: Vec<Value> = serde_json::from_str(assets).map_err(|e|e.to_string())?;
    if p.title.trim().is_empty() || p.shots.is_empty() || p.shots.len()>100 || p.visual_memory.ground.trim().is_empty() || p.visual_memory.render_mode.trim().is_empty() || p.visual_memory.palette.is_empty() || p.visual_memory.palette.len()>12 { return Err("Incomplete storyboard visual memory".into()); }
    if p.characters.len()>3 {return Err("At most 3 characters are supported".into());}
    let mut character_ids=std::collections::HashSet::new();
    if p.characters.iter().any(|c|c.id.trim().is_empty() || c.name.trim().is_empty() || c.description.trim().is_empty() || !character_ids.insert(&c.id)) {return Err("Invalid character card".into());}
    let mut ids=std::collections::HashSet::new();
    for shot in &p.shots {
        if shot.id.is_empty() || !ids.insert(&shot.id) || !shot.duration.is_finite() || !(1.0..=30.0).contains(&shot.duration) || shot.prompt.trim().is_empty() || shot.prompt.len()>10000 || shot.continuity.trim().is_empty() { return Err("Invalid shot or continuity".into()); }
        if !["cut","fade","slide-left","slide-right","slide-up","slide-down","zoom-in","zoom-out","spin-left","spin-right","flip-horizontal","flip-vertical","fade-slide"].contains(&shot.transition.as_str()) { return Err("Unsupported storyboard transition".into()); }
        if shot.character_ids.iter().any(|id| !p.characters.iter().any(|c| &c.id == id)) { return Err("Unknown character ID".into()); }
        if let Some(id)=&shot.media_id { if !assets.iter().any(|a|a["id"]==*id && ["image","video"].contains(&a["type"].as_str().unwrap_or(""))) { return Err("Unknown storyboard media ID".into()); } }
    }
    serde_json::to_string(&p).map_err(|e|e.to_string())
}
// Preserve platform draft metadata while splitting long shots into model-sized parts.
fn fit_duration(input: &str, max_seconds: u32) -> Result<String,String> {
    if !(1..=30).contains(&max_seconds) { return Err("Configure a model shot duration between 1 and 30 seconds".into()); }
    let mut plan: Value = serde_json::from_str(input).map_err(|e|e.to_string())?;
    let shots = plan["shots"].as_array().ok_or("Missing shots")?;
    let mut result = Vec::new();
    for shot in shots {
        let duration = shot["duration"].as_f64().filter(|d|d.is_finite() && *d > 0.0 && *d <= 30.0).ok_or("Invalid shot duration")?;
        let count = (duration / max_seconds as f64).ceil() as usize;
        for part in 0..count {
            let mut next = shot.clone();
            next["duration"] = json!((duration - part as f64 * max_seconds as f64).min(max_seconds as f64));
            if count > 1 {
                next["id"] = json!(format!("{}-part-{}",shot["id"].as_str().ok_or("Missing shot ID")?,part+1));
                next["title"] = json!(format!("{} ({}/{})",shot["title"].as_str().unwrap_or(""),part+1,count));
                next["prompt"] = json!(format!("{}\nContinuous action segment {}/{}; preserve character identity and scene continuity.",shot["prompt"].as_str().unwrap_or(""),part+1,count));
                for key in ["mediaId","assetId","firstFrameAssetId","error"] { next.as_object_mut().unwrap().remove(key); }
            }
            result.push(next);
        }
    }
    if result.len()>100 {return Err("Too many storyboard shots".into());}
    plan["shots"] = json!(result);
    Ok(plan.to_string())
}
#[wasm_bindgen(js_name = fitStoryboardToDuration)]
pub fn fit_storyboard_to_duration(input:&str,max_seconds:u32)->Result<String,JsError>{fit_duration(input,max_seconds).map_err(|e|JsError::new(&e))}
#[wasm_bindgen(js_name = buildStoryboardRequest)]
pub fn build_storyboard_request(input:&str)->Result<String,JsError>{ request(input).map(|v|v.to_string()).map_err(|e|JsError::new(&e)) }
#[wasm_bindgen(js_name = validateStoryboard)]
pub fn validate_storyboard(input:&str,assets:&str)->Result<String,JsError>{validate(input,assets).map_err(|e|JsError::new(&e))}
#[cfg(test)]
mod tests {
    use super::*;
    fn valid()->Value {json!({"title":"Test","visualMemory":{"ground":"dark","renderMode":"photographic","palette":["teal"],"characters":"same actor","atmosphere":"calm"},"shots":[{"id":"1","title":"Start","duration":3,"prompt":"A calm harbor","camera":"wide","motion":"pan","continuity":"same horizon","transition":"fade"}]})}
    #[test] fn splits_duration_preserving_character_bindings() {
        let mut plan=valid(); plan["shots"][0]["duration"]=json!(13); plan["shots"][0]["characterIds"]=json!(["actor"]);
        let output:Value=serde_json::from_str(&fit_duration(&plan.to_string(),5).unwrap()).unwrap();
        assert_eq!(output["shots"].as_array().unwrap().len(),3);
        assert_eq!(output["shots"][2]["duration"],json!(3.0));
        assert_eq!(output["shots"][2]["characterIds"],json!(["actor"]));
        assert!(fit_duration(&plan.to_string(),0).is_err());
    }
    #[test] fn enforces_three_characters_and_valid_bindings() {
        let mut plan=valid();plan["characters"]=json!((0..4).map(|i|json!({"id":i.to_string(),"name":"Actor","description":"Blue jacket"})).collect::<Vec<_>>());
        assert!(validate(&plan.to_string(),"[]").is_err());
        plan["characters"].as_array_mut().unwrap().pop();plan["shots"][0]["characterIds"]=json!(["0","2"]);
        assert!(validate(&plan.to_string(),"[]").is_ok());
        plan["shots"][0]["characterIds"]=json!(["unknown"]);assert!(validate(&plan.to_string(),"[]").is_err());
    }
    #[test] fn rejects_unknown_assets_and_duplicate_ids(){let mut v=valid();v["shots"][0]["mediaId"]=json!("fake");assert!(validate(&v.to_string(),"[]").is_err());v["shots"][0].as_object_mut().unwrap().remove("mediaId");let shot=v["shots"][0].clone();v["shots"].as_array_mut().unwrap().push(shot);assert!(validate(&v.to_string(),"[]").is_err());}
    #[test] fn accepts_fenced_plan(){assert!(validate(&format!("```json\n{}\n```",valid()),"[]").is_ok());}
    #[test] fn style_lock_and_language_reach_model(){let request=request(r#"{"model":"test/model","brief":"Travel","preset":"ivory-postcard","ratio":"16:9","shotCount":4,"language":"zh"}"#).unwrap();let system=request["body"]["messages"][0]["content"].as_str().unwrap();assert!(system.contains("Simplified Chinese"));assert!(system.contains("Exactly 4 shots"));assert!(system.contains("Locked DNA"));}
}
