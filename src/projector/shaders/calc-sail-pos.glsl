#version 300 es
precision highp float;

#include "gpu_noise_lib.glsl"

uniform sampler2D txPrev;
uniform vec3 nzOfs1;
uniform vec3 nzOfs2;
uniform float simFieldMul;
uniform float simSpeed;
uniform float dt;
out vec4 outColor;

void main() {
    outColor.a = 1.0;
    vec3 prev = texelFetch(txPrev, ivec2(gl_FragCoord.xy), 0).xyz;

    vec3 pos = prev * simFieldMul;
    vec3 posX = pos;
    vec3 posY = posX + nzOfs1;
    vec3 posZ = posX + nzOfs2;
    vec3 derivX = SimplexPerlin3D_Deriv(posX).yzw;
    vec3 derivY = SimplexPerlin3D_Deriv(posY).yzw;
    vec3 derivZ = SimplexPerlin3D_Deriv(posZ).yzw;
    vec3 curlDir = vec3(derivZ.y - derivY.z, derivX.z - derivZ.x, derivY.x - derivX.y);

    outColor.xyz = prev + normalize(curlDir) * simSpeed * dt;
}

