varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

void main() {
    vLocalPosition = position;

    vec3 transformed = position;

    #ifdef USE_INSTANCING
        transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
