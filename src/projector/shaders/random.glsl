const float PHI = 1.61803398874989484820459; // Φ = Golden Ratio

float gold_noise(vec2 xy, float seed) {
    return fract(tan(distance(xy * PHI, xy) * seed) * xy.x);
}

float hash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}
