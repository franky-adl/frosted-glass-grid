uniform sampler2D uGrabTexture;
uniform mat4 uViewProjection;
uniform float uIor;
uniform float uThickness;
uniform float uJitterRange;
uniform float uChromaticAberration;
uniform float uPlaneSize;
uniform float uCornerRadius;
uniform float uRimWidth;
uniform float uNormalStrength;
uniform float uSdfSmooth;
uniform float uHighlightWidth;
uniform float uShowNormals;
uniform float uTonemapStrength;

varying vec3 vWorldPosition;
varying vec3 vLocalPosition;
varying vec2 vJitter;

float sminPolynomial(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);

    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float smaxPolynomial(float a, float b, float k) {
    if (k <= 0.0) return max(a, b);

    float h = clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdRoundedBoxSmooth(vec2 p, vec2 b, float r, float k) {
    if (k <= 0.0) {
        return sdRoundedBox(p, b, r);
    }

    vec2 q = abs(p) - b + r;
    float termA = smaxPolynomial(q.x, q.y, k);
    float termB = sminPolynomial(termA, 0.0, k * 0.5);
    vec2 qLen = vec2(
        smaxPolynomial(q.x, 0.0, k),
        smaxPolynomial(q.y, 0.0, k)
    );

    return termB + length(qLen) - r;
}

float heightFromDist(float dist) {
    float rim = max(uRimWidth, 1e-5);
    float t = clamp(-dist / rim, 0.0, 1.0);
    // Circular roundover of ~70°, C1 with the flat interior, finite slope at the lip.
    float theta = (1.0 - t) * 1.2217;
    return rim * cos(theta);
}

float glassHeight(vec2 p, vec2 halfSize, float radius, float smoothK) {
    return heightFromDist(sdRoundedBoxSmooth(p, halfSize, radius, smoothK));
}

vec3 getIncident() {
    if (isOrthographic) {
        return -normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    }

    return normalize(vWorldPosition - cameraPosition);
}

vec3 getLensNormal(float thickness) {
    float curvature = thickness / max(uPlaneSize, 1e-4);

    return normalize(vec3(
        vLocalPosition.x * curvature * 2.0,
        1.0,
        vLocalPosition.z * curvature * 2.0
    ));
}

vec3 getRimNormal(vec2 p, vec2 halfSize, float radius, float smoothK) {
    float eps = max(uRimWidth * 0.04, uPlaneSize * 0.002);
    float eps2 = eps * 2.0;

    float hx1 = glassHeight(p + vec2(eps, 0.0), halfSize, radius, smoothK)
        - glassHeight(p - vec2(eps, 0.0), halfSize, radius, smoothK);
    float hx2 = glassHeight(p + vec2(eps2, 0.0), halfSize, radius, smoothK)
        - glassHeight(p - vec2(eps2, 0.0), halfSize, radius, smoothK);
    float hz1 = glassHeight(p + vec2(0.0, eps), halfSize, radius, smoothK)
        - glassHeight(p - vec2(0.0, eps), halfSize, radius, smoothK);
    float hz2 = glassHeight(p + vec2(0.0, eps2), halfSize, radius, smoothK)
        - glassHeight(p - vec2(0.0, eps2), halfSize, radius, smoothK);

    float dx = mix(hx1 / (2.0 * eps), hx2 / (2.0 * eps2), 0.5);
    float dz = mix(hz1 / (2.0 * eps), hz2 / (2.0 * eps2), 0.5);

    return normalize(vec3(-dx * uNormalStrength, 1.0, -dz * uNormalStrength));
}

vec2 worldToUv(vec3 worldPos) {
    vec4 clip = uViewProjection * vec4(worldPos, 1.0);
    return clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
}

vec2 getGrabUv(float ior, float thickness, vec3 incident, vec3 normal) {
    float eta = 1.0 / max(ior, 1.0001);
    vec3 refracted = refract(incident, normal, eta);

    if (dot(refracted, refracted) < 1e-6) {
        refracted = incident;
    }

    float magnification = 1.0 + thickness * max(ior - 1.0, 0.0) * 2.0;
    vec3 radial = vec3(vLocalPosition.x, 0.0, vLocalPosition.z);
    vec3 samplePos = vWorldPosition - radial * (1.0 - 1.0 / max(magnification, 1.0));

    float travel = thickness / max(-refracted.y, 0.08);
    samplePos += refracted * travel;

    return worldToUv(samplePos);
}

vec3 sampleGrab(vec2 uv) {
    return texture2D(uGrabTexture, uv).rgb;
}

void main() {
    float ior = uIor * max(1.0 + vJitter.x * uJitterRange, 0.01);
    float thickness = uThickness * max(1.0 + vJitter.y * uJitterRange, 0.0);

    vec2 p = vLocalPosition.xz;
    vec2 halfSize = vec2(uPlaneSize * 0.5);
    float radius = min(uCornerRadius, min(halfSize.x, halfSize.y));
    float dist = sdRoundedBoxSmooth(p, halfSize, radius, uSdfSmooth);

    vec3 incident = getIncident();
    vec3 viewDir = -incident;
    vec3 lensNormal = getLensNormal(thickness);
    vec3 rimNormal = getRimNormal(p, halfSize, radius, uSdfSmooth);
    float interior = clamp(-dist / max(uRimWidth, 1e-5), 0.0, 1.0);
    vec3 normal = normalize(mix(rimNormal, lensNormal, interior));

    if (uShowNormals > 0.5) {
        gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
        return;
    }

    vec3 color;
    float ca = uChromaticAberration;

    if (ca < 1e-5) {
        color = sampleGrab(getGrabUv(ior, thickness, incident, normal));
    } else {
        color.r = sampleGrab(getGrabUv(ior - ca, thickness, incident, normal)).r;
        color.g = sampleGrab(getGrabUv(ior, thickness, incident, normal)).g;
        color.b = sampleGrab(getGrabUv(ior + ca, thickness, incident, normal)).b;
    }

    float NdotV = max(dot(normal, viewDir), 0.0);
    float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);
    color += vec3(0.22) * fresnel;

    if (uHighlightWidth > 1e-5) {
        float edge = 1.0 - smoothstep(0.0, uHighlightWidth, -dist);
        float directional = clamp(normal.x * normal.z * 0.5 + 0.5, 0.0, 1.0);
        color += vec3(edge * directional * fresnel);
    }

    color /= 1.0 + color * uTonemapStrength;

    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
