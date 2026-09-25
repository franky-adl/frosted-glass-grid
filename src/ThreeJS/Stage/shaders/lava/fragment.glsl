// xy = world xz position, z = radius
uniform vec3 uBlobs[BLOB_COUNT];
uniform vec3 uBlobColors[BLOB_COUNT];
uniform vec3 uBaseColor;
uniform vec3 uColorA;
uniform vec2 uPointer;
uniform float uPointerRadius;
uniform float uSmoothness;
uniform float uEdgeSoftness;

varying vec3 vWorldPosition;

float smin(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);

    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float colorWeight(float centerDist) {
    return 1.0 / (0.05 + centerDist * centerDist);
}

void main() {
    vec2 p = vWorldPosition.xz;
    float d = 1e5;
    vec3 colorSum = vec3(0.0);
    float weightSum = 0.0;

    for (int i = 0; i < BLOB_COUNT; i++) {
        float centerDist = length(p - uBlobs[i].xy);
        d = smin(d, centerDist - uBlobs[i].z, uSmoothness);

        float w = colorWeight(centerDist);
        colorSum += uBlobColors[i] * w;
        weightSum += w;
    }

    if (uPointerRadius > 0.0) {
        float centerDist = length(p - uPointer);
        d = smin(d, centerDist - uPointerRadius, uSmoothness);

        float w = colorWeight(centerDist);
        colorSum += uColorA * w;
        weightSum += w;
    }

    float mask = 1.0 - smoothstep(-uEdgeSoftness, uEdgeSoftness, d);
    vec3 blobColor = colorSum / weightSum;
    blobColor *= 0.85 + 0.15 * smoothstep(-1.5, 0.0, d);

    vec3 color = mix(uBaseColor, blobColor, mask);
    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
