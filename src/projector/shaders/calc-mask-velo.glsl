#version 300 es
precision highp float;

#include "random.glsl"
#include "gpu_noise_lib.glsl"

uniform sampler2D txSurf;
uniform sampler2D txPos;
uniform float simFieldMul;
uniform float maxAge;
uniform float dt;
uniform float rand;
out vec4 outColor;

void main() {
    vec4 data = texelFetch(txPos, ivec2(gl_FragCoord.xy), 0);
    vec3 pos = data.xyz;
    float age = data.w;

    // Particle exceeds age? Go to vanishing
    if (age > maxAge - 2000.0) {
        age = max(age - maxAge, -2000.0);
    }
    // Particle vanishing
    else if (age < 0.0) {
        age += dt;
        // Finished vanishing: calculate velocity at reset position
        if (age >= 0.0) {
            age = -10000.0 - maxAge * gold_noise(gl_FragCoord.xy, rand);
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

