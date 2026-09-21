uniform sampler2D uTexture;
uniform vec2 uDirection;
uniform float uSigma;
uniform float uRadius;

varying vec2 vUv;

void main() {
    int radius = int(min(uRadius, 32.0));
    float sigma = max(uSigma, 1e-5);
    float twoSigma2 = 2.0 * sigma * sigma;

    vec4 color = texture2D(uTexture, vUv);
    float weightSum = 1.0;

    for (int i = 1; i <= 32; i++) {
        if (i > radius) {
            break;
        }

        float x = float(i);
        float w = exp(-(x * x) / twoSigma2);
        vec2 offset = uDirection * x;

        color += texture2D(uTexture, vUv + offset) * w;
        color += texture2D(uTexture, vUv - offset) * w;
        weightSum += 2.0 * w;
    }

    gl_FragColor = color / weightSum;
}
