#version 300 es
precision highp float;

uniform sampler2D txSurf;
uniform sampler2D txPrev;
uniform sampler2D txVelo;
uniform float simSpeed;
uniform float dt;
out vec4 outColor;

void main() {
    vec4 velo = texelFetch(txVelo, ivec2(gl_FragCoord.xy), 0);

    // Particle is being reset
    float age = velo.w;
    if (velo.w <= -10000.0) {
        outColor.a = -10000.0 - age;
        outColor.xyz = texelFetch(txSurf, ivec2(gl_FragCoord.xy), 0).xyz;
    }
    else {
        outColor.a = age;
        vec4 prev = texelFetch(txPrev, ivec2(gl_FragCoord.xy), 0);
        outColor.xyz = prev.xyz + velo.xyz * simSpeed * dt * 0.1;
    }
}
