#version 300 es
precision highp float;

uniform sampler2D txPrev;
uniform sampler2D txVelo;
uniform float simSpeed;
uniform float dt;
out vec4 outColor;

void main() {
    vec4 prev = texelFetch(txPrev, ivec2(gl_FragCoord.xy), 0);
    vec4 velo = texelFetch(txVelo, ivec2(gl_FragCoord.xy), 0);
    outColor.rgb = prev.rgb + velo.rgb * simSpeed * dt * 0.1;
    outColor.a = prev.a + dt;
}
