#define BAND_COUNT 6

uniform float uAngle;
uniform float uOffset;
uniform float uBandThickness[BAND_COUNT];
uniform float uWaveAmplitude;
uniform float uWave1Frequency;
uniform float uWave1Time;
uniform float uWave2Frequency;
uniform float uWave2Time;
uniform float uWave3Frequency;
uniform float uWave3Time;
uniform float uEdgeSoftness;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;

varying vec3 vWorldPosition;

// Cycles the fixed 4-colour palette by band index, avoiding any dynamic
// (non loop-counter) array indexing so this stays portable to GLSL ES 1.00.
vec3 paletteColor(int index) {
    int m = index - (index / 4) * 4;

    if (m == 0) return uColorA;
    if (m == 1) return uColorB;
    if (m == 2) return uColorC;
    return uColorD;
}

void main() {
    vec2 p = vWorldPosition.xz;
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    vec2 perp = vec2(-dir.y, dir.x);

    // Three sine waves at different speeds/frequencies bend the band edges.
    float across = dot(p, perp);
    float curve = uWaveAmplitude * (
        sin(across * uWave1Frequency + uWave1Time) +
        0.5 * sin(across * uWave2Frequency + uWave2Time) +
        0.25 * sin(across * uWave3Frequency + uWave3Time)
    );

    float total = 0.0;
    for (int i = 0; i < BAND_COUNT; i++) {
        total += max(uBandThickness[i], 1e-3);
    }
    total = max(total, 1e-3);

    float s = dot(p, dir) - uOffset + curve;
    float wrapped = mod(s, total);

    float boundary = 0.0;
    vec3 color = uColorA;

    for (int i = 0; i < BAND_COUNT; i++) {
        float thickness = max(uBandThickness[i], 1e-3);
        float nextBoundary = boundary + thickness;

        if (wrapped >= boundary && wrapped < nextBoundary) {
            float t = (wrapped - boundary) / thickness;
            int prevIndex = i == 0 ? BAND_COUNT - 1 : i - 1;
            int nextIndex = i == BAND_COUNT - 1 ? 0 : i + 1;
            float edgeT = clamp(uEdgeSoftness / thickness, 0.0, 0.5);

            color = paletteColor(i);
            color = mix(paletteColor(prevIndex), color, smoothstep(0.0, edgeT, t));
            color = mix(color, paletteColor(nextIndex), smoothstep(1.0 - edgeT, 1.0, t));
        }

        boundary = nextBoundary;
    }

    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
