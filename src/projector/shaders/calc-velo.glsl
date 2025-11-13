#version 300 es
precision highp float;

#include "gpu_noise_lib.glsl"

uniform sampler2D txPos;
uniform float simFieldMul;
uniform vec3 nzOfs;
uniform float dt;
out vec4 outColor;

void main() {
    vec3 pos = texelFetch(txPos, ivec2(gl_FragCoord.xy), 0).rgb;
    pos *= simFieldMul;

    vec3 posX = pos;
    vec3 posY = posX + vec3(31.341f, -43.23f, 12.34f);    // random offset
    vec3 posZ = posX + vec3(-231.341f, 124.23f, -54.34f); // random offset
    vec3 derivX = SimplexPerlin3D_Deriv(posX).yzw;
    vec3 derivY = SimplexPerlin3D_Deriv(posY).yzw;
    vec3 derivZ = SimplexPerlin3D_Deriv(posZ).yzw;
    vec3 curlDir = vec3(derivZ.y - derivY.z, derivX.z - derivZ.x, derivY.x - derivX.y);
    outColor.rgb = normalize(curlDir);
}

