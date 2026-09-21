attribute vec2 aJitter;

varying vec3 vWorldPosition;
varying vec3 vLocalPosition;
varying vec2 vJitter;

void main() {
    vLocalPosition = position;
    vJitter = aJitter;

    vec3 transformed = position;

    #ifdef USE_INSTANCING
        transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
