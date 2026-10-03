// Linear amplitude fades use clip-local time, including after trims or a seek.
#[cfg_attr(feature = "wasm", wasm_bindgen::prelude::wasm_bindgen(js_name = audioFadeGain))]
pub fn audio_fade_gain(local_seconds: f64, duration_seconds: f64, fade_in_seconds: f64, fade_out_seconds: f64) -> f64 {
    if !local_seconds.is_finite() || !duration_seconds.is_finite() || duration_seconds <= 0.0 { return 0.0; }
    let fade_in = if fade_in_seconds.is_finite() { fade_in_seconds.clamp(0.0, duration_seconds) } else { 0.0 };
    let fade_out = if fade_out_seconds.is_finite() { fade_out_seconds.clamp(0.0, duration_seconds) } else { 0.0 };
    let time = local_seconds.clamp(0.0, duration_seconds);
    let start = if fade_in > 0.0 { (time / fade_in).min(1.0) } else { 1.0 };
    let end = if fade_out > 0.0 { ((duration_seconds - time) / fade_out).min(1.0) } else { 1.0 };
    start.min(end)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fades_reach_silence_and_handle_seek() {
        assert_eq!(audio_fade_gain(0.0,10.0,2.0,2.0),0.0);
        assert_eq!(audio_fade_gain(1.0,10.0,2.0,2.0),0.5);
        assert_eq!(audio_fade_gain(5.0,10.0,2.0,2.0),1.0);
        assert_eq!(audio_fade_gain(9.0,10.0,2.0,2.0),0.5);
        assert_eq!(audio_fade_gain(10.0,10.0,2.0,2.0),0.0);
    }
    #[test] fn overlapping_fades_and_no_fade_are_bounded() {
        assert_eq!(audio_fade_gain(0.5,1.0,10.0,10.0),0.5);
        assert_eq!(audio_fade_gain(0.0,1.0,0.0,0.0),1.0);
    }
}
