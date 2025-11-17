#version 300 es
precision highp float;

uniform sampler2D txSurf;
uniform sampler2D txPrev;
uniform sampler2D txVelo;
uniform float simSpeed;
uniform float fadeInTime;
uniform float reset;
uniform float dt;
out vec4 outColor;

void main() {
    vec4 velo = texelFetch(txVelo, ivec2(gl_FragCoord.xy), 0);
    float age = velo.w;

    // Resetting
    if (reset != 0.0) {
        outColor.xyz = texelFetch(txSurf, ivec2(gl_FragCoord.xy), 0).xyz;
        outColor.a = -20000.0 - age;
        return;
    }

    // Particle starts fading in on mask's surface
    if (abs(age + fadeInTime) < 1.) {
        outColor.a = age;
        outColor.xyz = texelFetch(txSurf, ivec2(gl_FragCoord.xy), 0).xyz;
    }
    else {
        // Particle enters adulthood: jump ahead to random birth age
        if (velo.w <= -20000.0) outColor.a = -20000.0 - age;
        else  outColor.a = age;
        vec4 prev = texelFetch(txPrev, ivec2(gl_FragCoord.xy), 0);
        outColor.xyz = prev.xyz + velo.xyz * simSpeed * dt * 0.1;
    }
}
