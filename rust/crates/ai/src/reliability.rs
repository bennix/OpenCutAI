use serde::Deserialize;
use serde_json::{Value,json};
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Guard {balance:Option<f64>,monthly_cost:Option<f64>,stop_balance:Option<f64>,monthly_limit:Option<f64>,estimated_cost:Option<f64>,operation_limit:Option<f64>,require_known:bool}
fn guard(input:&str)->Result<Value,String>{
 let g:Guard=serde_json::from_str(input).map_err(|e|e.to_string())?;
 for v in [g.balance,g.monthly_cost,g.stop_balance,g.monthly_limit,g.estimated_cost,g.operation_limit].into_iter().flatten(){if !v.is_finite()||v<0.0{return Err("Invalid budget value".into());}}
 let reason=if g.stop_balance.is_some()&&g.balance.is_none(){Some("余额未知，无法核验停止阈值")}
 else if g.stop_balance.zip(g.balance).is_some_and(|(limit,value)|value<=limit){Some("余额已达到停止新生成的阈值")}
 else if g.monthly_limit.is_some()&&g.monthly_cost.is_none(){Some("本月 PAYG 费用未知，无法核验预算")}
 else if g.monthly_limit.zip(g.monthly_cost).is_some_and(|(limit,value)|value+g.estimated_cost.unwrap_or(0.0)>=limit){Some("本月 PAYG 预算已达到上限")}
 else if g.require_known&&g.estimated_cost.is_none(){Some("生成费用未知，请配置价格估算或关闭未知价格拦截")}
 else if g.operation_limit.zip(g.estimated_cost).is_some_and(|(limit,value)|value>limit){Some("本次估算超过单次生成预算")}
 else {None};
 Ok(json!({"allowed":reason.is_none(),"reason":reason,"estimatedCost":g.estimated_cost}))
}
#[wasm_bindgen(js_name=checkGenerationBudget)]
pub fn check_generation_budget(input:&str)->Result<String,JsValue>{guard(input).map(|v|v.to_string()).map_err(|e|JsValue::from_str(&e))}
#[wasm_bindgen(js_name=queryRetryDelay)]
pub fn query_retry_delay(status:u32,attempt:u32,retry_after:f64)->f64{if ![0,422,429,500,502,503,504].contains(&status)||attempt>=4{return -1.0;}if retry_after.is_finite()&&retry_after>0.0{return retry_after.clamp(1.0,120.0);} (2.0_f64.powi(attempt.min(6) as i32)).min(30.0)}
#[wasm_bindgen(js_name=recordingHealth)]
pub fn recording_health(black_seconds:f64,silent_seconds:f64,muted:bool)->String{if muted{return "录制来源没有数据，请检查权限和设备".into();}if black_seconds>=5.0{return "画面持续接近黑色，请确认录屏来源；黑色画面也可能是正常内容".into();}if silent_seconds>=10.0{return "音轨持续静音，请检查系统声音或麦克风；静音也可能是正常内容".into();}String::new()}
#[cfg(test)]mod tests{use super::*;#[test]fn budget_unknown_is_not_zero(){let v=guard(r#"{"balance":null,"stopBalance":2,"requireKnown":false}"#).unwrap();assert_eq!(v["allowed"],false);assert!(guard(r#"{"balance":10,"stopBalance":2,"estimatedCost":3,"operationLimit":2,"requireKnown":false}"#).unwrap()["allowed"]==false);assert!(guard(r#"{"balance":10,"stopBalance":2,"requireKnown":false}"#).unwrap()["allowed"]==true);}#[test]fn only_queries_retry(){assert_eq!(query_retry_delay(400,0,0.0),-1.0);assert_eq!(query_retry_delay(429,1,60.0),60.0);assert_eq!(query_retry_delay(503,4,0.0),-1.0);}#[test]fn warn_not_fail_on_black_or_silence(){assert!(!recording_health(6.0,0.0,false).is_empty());assert!(recording_health(1.0,1.0,false).is_empty());}}
