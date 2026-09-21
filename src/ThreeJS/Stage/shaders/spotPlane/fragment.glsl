uniform vec3 uColor;
uniform vec2 uSpotPosition;
uniform float uRadius;

varying vec3 vWorldPosition;

void main() {
    float dist = distance(vWorldPosition.xz, uSpotPosition);
    float falloff = 1.0 - clamp(dist / max(uRadius, 1e-5), 0.0, 1.0);

    gl_FragColor = vec4(uColor, falloff);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
