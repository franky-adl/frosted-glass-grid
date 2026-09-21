uniform sampler2D uGrabTexture;
uniform mat4 uViewProjection;
uniform float uIor;
uniform float uThickness;
uniform float uChromaticAberration;
uniform float uPlaneSize;

varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

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

vec2 worldToUv(vec3 worldPos) {
    vec4 clip = uViewProjection * vec4(worldPos, 1.0);
    return clip.xy / max(clip.w, 1e-5) * 0.5 + 0.5;
}

vec2 getGrabUv(float ior, vec3 incident, vec3 normal) {
    float eta = 1.0 / max(ior, 1.0001);
    vec3 refracted = refract(incident, normal, eta);

    if (dot(refracted, refracted) < 1e-6) {
        refracted = incident;
    }

    float magnification = 1.0 + uThickness * max(ior - 1.0, 0.0) * 2.0;
    vec3 radial = vec3(vLocalPosition.x, 0.0, vLocalPosition.z);
    vec3 samplePos = vWorldPosition - radial * (1.0 - 1.0 / max(magnification, 1.0));

    float travel = uThickness / max(-refracted.y, 0.08);
    samplePos += refracted * travel;

    return worldToUv(samplePos);
}

void main() {
    vec3 incident = getIncident();
    vec3 viewDir = -incident;
    vec3 normal = getLensNormal(uThickness);

    vec3 color;
    float ca = uChromaticAberration;

    if (ca < 1e-5) {
        color = texture2D(uGrabTexture, getGrabUv(uIor, incident, normal)).rgb;
    } else {
        color.r = texture2D(uGrabTexture, getGrabUv(uIor - ca, incident, normal)).r;
        color.g = texture2D(uGrabTexture, getGrabUv(uIor, incident, normal)).g;
        color.b = texture2D(uGrabTexture, getGrabUv(uIor + ca, incident, normal)).b;
    }

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    color += vec3(0.16) * fresnel;

    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel(gl_FragColor);
}
