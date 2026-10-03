struct VertexOutput { @builtin(position) position: vec4f, @location(0) tex_coord: vec2f }
struct EffectUniforms { resolution: vec2f, direction: vec2f, scalars: vec4f }
@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(1) @binding(0) var<uniform> uniforms: EffectUniforms;
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let style = i32(uniforms.direction.x);
    let amount = uniforms.direction.y;
    var uv = input.tex_coord;
    if style == 8 { let grid = max(2.0, amount * 64.0); uv = (floor(uv * uniforms.resolution / grid) + 0.5) * grid / uniforms.resolution; }
    if style == 9 { uv.x = 1.0 - uv.x; }
    if style == 10 { uv.y = 1.0 - uv.y; }
    let source = textureSampleLevel(input_texture, input_sampler, uv, 0.0);
    // Work in straight alpha, then return premultiplied pixels.
    var c = source.rgb / max(source.a, 0.00001);
    c = (c + uniforms.scalars.x - 0.5) * uniforms.scalars.y + 0.5;
    let luminance = dot(c, vec3f(0.2126, 0.7152, 0.0722));
    c = mix(vec3f(luminance), c, uniforms.scalars.z);
    c += vec3f(uniforms.scalars.w, 0.0, -uniforms.scalars.w) * 0.1;
    var styled = c;
    switch style {
        case 1: { styled = vec3f(luminance); }
        case 2: { styled = vec3f(dot(c, vec3f(0.393, 0.769, 0.189)), dot(c, vec3f(0.349, 0.686, 0.168)), dot(c, vec3f(0.272, 0.534, 0.131))); }
        case 3: { styled = vec3f(1.0) - c; }
        case 4: { styled = c * vec3f(1.15, 1.02, 0.85); }
        case 5: { styled = c * vec3f(0.85, 1.02, 1.15); }
        case 6: { let d = distance(input.tex_coord, vec2f(0.5)); styled = c * (1.0 - smoothstep(0.2, 0.72, d)); }
        case 7: { let noise = fract(sin(dot(input.position.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5; styled = c + vec3f(noise * 0.25); }
        case 11: { styled = floor(c * 5.0) / 4.0; }
        case 12: { styled = select(vec3f(0.0), vec3f(1.0), luminance > 0.5); }
        default: {}
    }
    c = c * (1.0 - amount) + styled * amount;
    return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)) * source.a, source.a);
}
