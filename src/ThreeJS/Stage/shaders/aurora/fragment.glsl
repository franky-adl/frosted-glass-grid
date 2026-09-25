#define WAVE_COUNT 3
#define BAND_COUNT 3

uniform float uAngle[BAND_COUNT];
uniform vec2 uOffset[BAND_COUNT];
uniform float uThickness[BAND_COUNT];
uniform float uEdgeSoftness[BAND_COUNT];
uniform float uBandWaveOffset[BAND_COUNT];
uniform float uPointerSensitivity[BAND_COUNT];
uniform vec2 uScreenOffset;
uniform float uTime;
uniform float uWaveFrequency[WAVE_COUNT];
uniform float uWaveAmplitude[WAVE_COUNT];
uniform float uWaveSpeed[WAVE_COUNT];
uniform float uWaveOffset[WAVE_COUNT];
uniform vec3 uBaseColor;
uniform vec3 uBandColor[BAND_COUNT];

varying vec3 vWorldPosition;

void main() {
    vec2 world = vWorldPosition.xz;
    vec3 color = uBaseColor;

    for (int band = 0; band < BAND_COUNT; band++) {
        vec2 offset = uOffset[band] + uScreenOffset * uPointerSensitivity[band];
        vec2 p = world - offset;
        float radians = uAngle[band] * 0.01745329251;
        vec2 along = vec2(cos(radians), sin(radians));
        vec2 across = vec2(-along.y, along.x);

        float alongPos = dot(p, along) + uBandWaveOffset[band];
        float curve = 0.0;

        for (int i = 0; i < WAVE_COUNT; i++) {
            curve += uWaveAmplitude[i] * sin(
                uWaveFrequency[i] * (alongPos - uTime * uWaveSpeed[i]) + uWaveOffset[i]
            );
        }

        float dist = abs(dot(p, across) - curve);
        float halfWidth = max(uThickness[band], 0.0) * 0.5;
        float edge = max(uEdgeSoftness[band], 0.0);
        float mask = dist <= halfWidth ? 1.0 : 0.0;

        if (edge > 1e-5) {
            mask = 1.0 - smoothstep(halfWidth - edge, halfWidth + edge, dist);
        }

        color = mix(color, uBandColor[band], mask);
    }

    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
