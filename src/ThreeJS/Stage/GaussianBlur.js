import * as THREE from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import vertexShader from "./shaders/gaussianBlur/vertex.glsl";
import fragmentShader from "./shaders/gaussianBlur/fragment.glsl";

const MAX_RADIUS = 32;

export default class GaussianBlur {
    constructor(renderer) {
        this.renderer = renderer;
        this.direction = new THREE.Vector2();
        this.size = new THREE.Vector2(1, 1);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: null },
                uDirection: { value: this.direction },
                uSigma: { value: 0 },
                uRadius: { value: 0 },
            },
            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });

        this.fsQuad = new FullScreenQuad(this.material);
        this.fsQuad._mesh.frustumCulled = false;

        const targetOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: false,
            stencilBuffer: false,
        };

        this.rtA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
        this.rtB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
        this.rtA.texture.generateMipmaps = false;
        this.rtB.texture.generateMipmaps = false;
        this.rtA.texture.colorSpace = THREE.NoColorSpace;
        this.rtB.texture.colorSpace = THREE.NoColorSpace;
    }

    setSize(width, height) {
        if (this.rtA.width !== width || this.rtA.height !== height) {
            this.rtA.setSize(width, height);
            this.rtB.setSize(width, height);
        }

        this.size.set(width, height);
    }

    apply(sourceTexture, sigma, radius) {
        const kernelRadius = Math.min(
            MAX_RADIUS,
            Math.max(0, Math.round(radius)),
        );

        if (sigma < 1e-5 || kernelRadius < 1) {
            return sourceTexture;
        }

        const currentTarget = this.renderer.getRenderTarget();
        const currentAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = true;

        this.material.uniforms.uSigma.value = sigma;
        this.material.uniforms.uRadius.value = kernelRadius;

        this.material.uniforms.uTexture.value = sourceTexture;
        this.direction.set(1 / this.size.x, 0);
        this.renderer.setRenderTarget(this.rtA);
        this.fsQuad.render(this.renderer);

        this.material.uniforms.uTexture.value = this.rtA.texture;
        this.direction.set(0, 1 / this.size.y);
        this.renderer.setRenderTarget(this.rtB);
        this.fsQuad.render(this.renderer);

        this.renderer.setRenderTarget(currentTarget);
        this.renderer.autoClear = currentAutoClear;

        return this.rtB.texture;
    }
}
