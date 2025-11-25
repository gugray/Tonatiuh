#version 300 es
precision highp float;

#include "random.glsl"
#include "gpu_noise_lib.glsl"

uniform sampler2D txSurf;
uniform sampler2D txPos;
uniform float simFieldMul;
uniform float stableAge;
uniform float fadeInTime;
uniform float fadeOutTime;
uniform float reset;
uniform float dt;
uniform float rand;
out vec4 outColor;

float getBirthAge(vec2 coord) {
    float birthAge = stableAge * gold_noise(coord, rand * 100.0) * 0.9;
    return -20000.0 - birthAge;
}

void main() {
    vec4 data = texelFetch(txPos, ivec2(gl_FragCoord.xy), 0);
    vec3 pos = data.xyz;
    float age = data.w;

    // Resetting
    if (reset != 0.0) {
        age = getBirthAge(pos.xy);
        pos = texelFetch(txSurf, ivec2(gl_FragCoord.xy), 0).xyz;
    }
    // Particle exceeds age? Go to fade-out
    else if (age > stableAge) {
        age = -10000.0 - fadeOutTime;
    }
    // Particle fading in
    else if (age < 0.0 && age > -9100.0) {
        age += dt;
        // Finished fading in: determine random age
        if (age > 0.0) {
            age = getBirthAge(gl_FragCoord.xy);
        }
    }
    // Particle fading out (-19100 < age < -10000
    else if (age < 0.0) {
        age += dt;
        // Faded out: start fading in at mask surface
        if (age > -10000.0) {
            age = -fadeInTime;
            pos = texelFetch(txSurf, ivec2(gl_FragCoord.xy), 0).xyz;
        }
    }
    // Just age
    else age += dt;
    outColor.w = age;

    // Get velocity
    pos *= simFieldMul;
    vec3 posX = pos;
    vec3 posY = posX + vec3(31.341f, -43.23f, 12.34f);    // random offset
    vec3 posZ = posX + vec3(-231.341f, 124.23f, -54.34f); // random offset
    vec3 derivX = SimplexPerlin3D_Deriv(posX).yzw;
    vec3 derivY = SimplexPerlin3D_Deriv(posY).yzw;
    vec3 derivZ = SimplexPerlin3D_Deriv(posZ).yzw;
    vec3 curlDir = vec3(derivZ.y - derivY.z, derivX.z - derivZ.x, derivY.x - derivX.y);
    outColor.xyz = normalize(curlDir);
}

