#version 300 es

in vec2 position;

void main() {
    // This yields real pixel position in fragment shader
    gl_Position.xy = position;
    gl_Position.zw = vec2(1.);
}
