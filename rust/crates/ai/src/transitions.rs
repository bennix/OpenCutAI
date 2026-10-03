use serde::Deserialize;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct Input { mode: String, edge: String, duration: f64, length: f64, width: f64, height: f64, #[serde(default)] effect_id: Option<String>, #[serde(default)] params: Value }
fn plan(input: Input) -> Result<Value, String> {
    if !input.duration.is_finite() || input.duration <= 0.0 || !input.length.is_finite() || input.length <= 0.0 { return Err("Invalid transition duration".into()); }
    if !["in", "out", "both"].contains(&input.edge.as_str()) { return Err("Invalid transition edge".into()); }
    let d = input.length.min(input.duration / 2.0);
    let base = |key: &str, default: f64| input.params[key].as_f64().unwrap_or(default);
    let mut paths = vec![];
    match input.mode.as_str() {
        "dip-black" | "dip-white" => {
            if input.effect_id.is_none() { return Err("Missing transition effect".into()); }
            paths.push(("brightness", if input.mode == "dip-black" { -1.0 } else { 1.0 }, 0.0));
        }
        "fade" => paths.push(("opacity", 0.0, base("opacity", 1.0))),
        "slide-left" => paths.push(("transform.positionX", base("transform.positionX", 0.0) - input.width, base("transform.positionX", 0.0))),
        "slide-right" => paths.push(("transform.positionX", base("transform.positionX", 0.0) + input.width, base("transform.positionX", 0.0))),
        "slide-up" => paths.push(("transform.positionY", base("transform.positionY", 0.0) + input.height, base("transform.positionY", 0.0))),
        "slide-down" => paths.push(("transform.positionY", base("transform.positionY", 0.0) - input.height, base("transform.positionY", 0.0))),
        "zoom-in" | "zoom-out" | "flip-horizontal" | "flip-vertical" => {
            let multiplier = if input.mode == "zoom-out" { 1.6 } else { 0.01 };
            for key in ["transform.scaleX", "transform.scaleY"] {
                if input.mode == "flip-horizontal" && key.ends_with('Y') || input.mode == "flip-vertical" && key.ends_with('X') { continue; }
                paths.push((key, base(key, 1.0) * multiplier, base(key, 1.0)));
            }
            paths.push(("opacity", 0.0, base("opacity", 1.0)));
        }
        "spin-left" | "spin-right" => {
            paths.push(("transform.rotate", base("transform.rotate", 0.0) + if input.mode == "spin-left" { -180.0 } else { 180.0 }, base("transform.rotate", 0.0)));
            paths.push(("opacity", 0.0, base("opacity", 1.0)));
        }
        "fade-slide" => {
            paths.push(("transform.positionY", base("transform.positionY", 0.0) + input.height * 0.2, base("transform.positionY", 0.0)));
            paths.push(("opacity", 0.0, base("opacity", 1.0)));
        }
        _ => return Err("Unknown transition".into()),
    }
    let channels: Vec<Value> = paths.into_iter().map(|(path, boundary, normal)| {
        let start = if input.edge == "out" { normal } else { boundary };
        let end = if input.edge == "in" { normal } else { boundary };
        let mut keys = vec![json!({"time": 0.0, "value": start}), json!({"time": d, "value": normal})];
        if input.duration - d > d { keys.push(json!({"time": input.duration - d, "value": normal})); }
        keys.push(json!({"time": input.duration, "value": end}));
        let path = if path == "brightness" { format!("effects.{}.params.brightness", input.effect_id.as_deref().unwrap_or("")) } else { path.to_string() };
        json!({"path":path,"keys":keys})
    }).collect();
    Ok(json!(channels))
}
#[wasm_bindgen]
pub fn build_transition(input: &str) -> Result<String, JsValue> {
    serde_json::from_str::<Input>(input).map_err(|e| JsValue::from_str(&e.to_string())).and_then(|input| plan(input).map(|v| v.to_string()).map_err(|e| JsValue::from_str(&e)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn short_clip_has_unique_times() {
        let channels = plan(Input { mode:"fade".into(), edge:"both".into(), duration:0.2, length:1.0, width:1920.0, height:1080.0, effect_id:None, params:json!({"opacity":0.7}) }).unwrap();
        assert_eq!(channels[0]["keys"].as_array().unwrap().len(),3);
        assert_eq!(channels[0]["keys"][1]["value"],0.7);
    }
    #[test] fn preserves_base_position() {
        let channels = plan(Input { mode:"slide-left".into(), edge:"in".into(), duration:3.0, length:0.5, width:1920.0, height:1080.0, effect_id:None, params:json!({"transform.positionX":40.0}) }).unwrap();
        assert_eq!(channels[0]["keys"][1]["value"],40.0);
        assert_eq!(channels[0]["keys"][3]["value"],40.0);
    }
}

#[derive(Deserialize)]
struct Clip { id: String, track: String, start: f64, duration: f64, selected: bool }
#[derive(Deserialize)]
struct Targets { clips: Vec<Clip>, edge: String, #[serde(default = "default_frame_duration")] frame_duration: f64 }
fn default_frame_duration() -> f64 { 1.0 / 30.0 }
fn targets(input: Targets) -> Vec<Value> {
    let mut result = vec![];
    // Imported media durations can end between frame boundaries while placement
    // snaps the following clip to a frame. Treat that subframe remainder as a junction.
    let tolerance = if input.frame_duration.is_finite() { input.frame_duration.clamp(0.001, 0.1) + 1e-6 } else { default_frame_duration() };
    let mut junctions = std::collections::BTreeSet::new();
    for clip in input.clips.iter().filter(|c| c.selected) {
        if input.edge == "between" {
            let next = input.clips.iter().filter(|n| n.track == clip.track && n.id != clip.id && n.start > clip.start)
                .min_by(|a,b| a.start.total_cmp(&b.start))
                .filter(|n| (n.start - clip.start - clip.duration).abs() <= tolerance);
            let pair = next.map(|n| (clip,n)).or_else(|| input.clips.iter()
                .filter(|n| n.track == clip.track && n.id != clip.id && n.start < clip.start)
                .max_by(|a,b| a.start.total_cmp(&b.start))
                .filter(|n| (clip.start - n.start - n.duration).abs() <= tolerance)
                .map(|n| (n,clip)));
            if let Some((previous,next)) = pair {
                if junctions.insert((previous.id.clone(), next.id.clone())) {
                    result.push(json!({"id":previous.id,"edge":"out","neighbor":next.id}));
                    result.push(json!({"id":next.id,"edge":"in","neighbor":previous.id}));
                }
            }
        } else {
            result.push(json!({"id":clip.id,"edge":input.edge}));
        }
    }
    result
}
#[wasm_bindgen]
pub fn transition_targets(input: &str) -> Result<String, JsValue> {
    let input: Targets = serde_json::from_str(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    Ok(serde_json::to_string(&targets(input)).unwrap())
}

#[derive(Deserialize)]
struct Edge { mode: String, length: f64, #[serde(default)] effect_id: Option<String> }
#[derive(Deserialize)]
struct Composition { duration: f64, width: f64, height: f64, params: Value, #[serde(default)] entrance: Option<Edge>, #[serde(default)] exit: Option<Edge> }
fn compose(input: Composition) -> Result<Value, String> {
    let mut channels = std::collections::BTreeMap::<String, Vec<Value>>::new();
    for (edge, config) in [("in", input.entrance), ("out", input.exit)] {
        if let Some(config) = config {
            let planned = plan(Input {mode:config.mode, edge:edge.into(), duration:input.duration, length:config.length, width:input.width,height:input.height,params:input.params.clone(),effect_id:config.effect_id})?;
            for channel in planned.as_array().unwrap() {
                let path = channel["path"].as_str().unwrap().to_string();
                let keys = channel["keys"].as_array().unwrap();
                let region = if edge == "in" { keys[..2].to_vec() } else { keys[keys.len()-2..].to_vec() };
                channels.entry(path).or_default().extend(region);
            }
        }
    }
    Ok(json!(channels.into_iter().map(|(path, mut keys)| { keys.sort_by(|a,b| a["time"].as_f64().unwrap().total_cmp(&b["time"].as_f64().unwrap())); keys.dedup_by(|a,b| a["time"] == b["time"]); json!({"path":path,"keys":keys}) }).collect::<Vec<_>>()))
}
#[wasm_bindgen]
pub fn compose_transitions(input: &str) -> Result<String, JsValue> {
    let input = serde_json::from_str(input).map_err(|e| JsValue::from_str(&e.to_string()))?;
    compose(input).map(|v| v.to_string()).map_err(|e| JsValue::from_str(&e))
}

#[cfg(test)]
mod composition_tests {
    use super::*;
    #[test]
    fn between_requires_same_track_and_touching_clips() {
        let make = |id:&str, track:&str,start:f64, selected:bool| Clip{id:id.into(),track:track.into(),start,duration:2.0,selected};
        let input = Targets{edge:"between".into(),frame_duration:1.0/30.0,clips:vec![make("a","v",0.0,true),make("b","v",2.0,false),make("c","other",2.0,false)]};
        let result = targets(input);
        assert_eq!(result.len(),2);
        assert_eq!(result[1]["id"],"b");
        assert!(targets(Targets{edge:"between".into(),frame_duration:1.0/30.0,clips:vec![make("a","v",0.0,true),make("b","v",2.1,false)]}).is_empty());
    }
    #[test]
    fn subframe_gap_and_either_selection_resolve_same_junction() {
        for selected in [0,1,2] {
            let result = targets(Targets { edge:"between".into(), frame_duration:1.0/30.0, clips:vec![
                Clip{id:"a".into(),track:"v".into(),start:0.0,duration:11.551,selected:selected != 1},
                Clip{id:"b".into(),track:"v".into(),start:11.566667,duration:11.551,selected:selected != 0},
            ]});
            assert_eq!(result.len(),2);
            assert_eq!(result[0]["id"],"a");
            assert_eq!(result[1]["id"],"b");
        }
    }
    #[test]
    fn both_edges_keep_distinct_lengths_and_modes() {
        let value = compose(Composition{duration:4.0,width:640.0,height:360.0,params:json!({}),entrance:Some(Edge{mode:"fade".into(),length:0.4,effect_id:None}),exit:Some(Edge{mode:"fade".into(),length:0.8,effect_id:None})}).unwrap();
        assert_eq!(value[0]["keys"],json!([{"time":0.0,"value":0.0},{"time":0.4,"value":1.0},{"time":3.2,"value":1.0},{"time":4.0,"value":0.0}]));
    }
}
