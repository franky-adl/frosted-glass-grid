import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import BlueNoise from "./BlueNoise.js";
import vertexShader from "./shaders/planeGrid/vertex.glsl";
import fragmentShader from "./shaders/planeGrid/fragment.glsl";

export default class PlaneGrid {
    constructor() {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.camera = this.orc.camera.instance;
        this.renderer = this.orc.renderer.instance;
        this.sizes = this.orc.sizes;
        this.debug = this.orc.debug;

        this.params = {
            columns: 20,
            rows: 10,
            planeSize: 1.68,
            gap: 0.03,
            cornerRoundness: 0.15,
            ior: 2,
            thickness: 2,
            jitter: 0.3,
            jitterOffset: 0.3,
            chromaticAberration: 0.1,
            grainAmount: 50,
            grainScale: 0.8,
            rimWidth: 0.1,
            normalStrength: 2.4,
            troughDepth: 0.05,
            troughSquareness: 0.0,
            sdfSmooth: 0.15,
            highlightWidth: 0.08,
            showNormals: false,
            tonemapStrength: 0.07,
        };

        this.dummy = new THREE.Object3D();
        this.viewProjection = new THREE.Matrix4();
        this.drawingBufferSize = new THREE.Vector2();
        this.texelSize = new THREE.Vector2(1, 1);

        this.setGrabTarget();
        this.setBlueNoise();
        this.setMaterial();
        this.rebuild();
        this.setDebug();
    }

    setGrabTarget() {
        this.grabTarget = new THREE.WebGLRenderTarget(1, 1, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false,
        });
        this.grabTarget.texture.generateMipmaps = false;
        this.grabTarget.texture.colorSpace = THREE.NoColorSpace;
    }

    setBlueNoise() {
        this.blueNoise = new BlueNoise(64);
    }

    setMaterial() {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uGrabTexture: { value: this.grabTarget.texture },
                uViewProjection: { value: this.viewProjection },
                uIor: { value: this.params.ior },
                uThickness: { value: this.params.thickness },
                uJitterRange: { value: this.params.jitter },
                uJitterOffset: { value: this.params.jitterOffset },
                uChromaticAberration: {
                    value: this.params.chromaticAberration,
                },
                uBlueNoise: { value: this.blueNoise.texture },
                uBlueNoiseTexel: {
                    value: new THREE.Vector2(
                        1 / this.blueNoise.size,
                        1 / this.blueNoise.size,
                    ),
                },
                uTexelSize: { value: this.texelSize },
                uGrainAmount: {
                    value: this.params.grainAmount * this.getGrainFactor(),
                },
                uGrainScale: {
                    value: this.params.grainScale * this.getGrainFactor(),
                },
                uPlaneSize: { value: this.params.planeSize },
                uCornerRadius: { value: this.params.cornerRoundness },
                uRimWidth: { value: this.params.rimWidth },
                uNormalStrength: { value: this.params.normalStrength },
                uTroughDepth: { value: this.params.troughDepth },
                uTroughSquareness: { value: this.params.troughSquareness },
                uSdfSmooth: { value: this.params.sdfSmooth },
                uHighlightWidth: { value: this.params.highlightWidth },
                uShowNormals: { value: 0 },
                uTonemapStrength: { value: this.params.tonemapStrength },
            },
            vertexShader,
            fragmentShader,
            toneMapped: false,
        });
    }

    createRoundedPlaneGeometry(size, radius) {
        const clampedRadius = Math.min(Math.max(radius, 0), size / 2);

        if (clampedRadius < 1e-4) {
            const geometry = new THREE.PlaneGeometry(size, size);
            geometry.rotateX(-Math.PI / 2);
            return geometry;
        }

        const shape = new THREE.Shape();
        const x = -size / 2;
        const y = -size / 2;
        const r = clampedRadius;

        shape.moveTo(x + r, y);
        shape.lineTo(x + size - r, y);
        shape.absarc(x + size - r, y + r, r, -Math.PI / 2, 0, false);
        shape.lineTo(x + size, y + size - r);
        shape.absarc(x + size - r, y + size - r, r, 0, Math.PI / 2, false);
        shape.lineTo(x + r, y + size);
        shape.absarc(x + r, y + size - r, r, Math.PI / 2, Math.PI, false);
        shape.lineTo(x, y + r);
        shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);

        const geometry = new THREE.ShapeGeometry(shape, 12);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    updateInstances() {
        const { columns, rows, planeSize, gap } = this.params;
        const step = planeSize + gap;
        const offsetX = ((columns - 1) * step) / 2;
        const offsetZ = ((rows - 1) * step) / 2;

        let index = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                this.dummy.position.set(
                    col * step - offsetX,
                    0,
                    row * step - offsetZ,
                );
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(index, this.dummy.matrix);
                index++;
            }
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.computeBoundingSphere();
    }

    ensureJitter(instanceCount) {
        const componentCount = instanceCount * 2;

        if (this.jitterData && this.jitterData.length === componentCount) {
            return;
        }

        this.jitterData = new Float32Array(componentCount);

        for (let i = 0; i < instanceCount; i++) {
            this.jitterData[i * 2] = Math.random() * 2 - 1;
            this.jitterData[i * 2 + 1] = Math.random() * 2 - 1;
        }
    }

    getSize() {
        const { columns, rows, planeSize, gap } = this.params;

        return {
            width: columns * planeSize + Math.max(columns - 1, 0) * gap,
            height: rows * planeSize + Math.max(rows - 1, 0) * gap,
        };
    }

    rebuild() {
        const geometry = this.createRoundedPlaneGeometry(
            this.params.planeSize,
            this.params.cornerRoundness,
        );
        const instanceCount = this.params.columns * this.params.rows;

        this.ensureJitter(instanceCount);
        geometry.setAttribute(
            "aJitter",
            new THREE.InstancedBufferAttribute(this.jitterData.slice(), 2),
        );

        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.dispose();
        }

        this.mesh = new THREE.InstancedMesh(
            geometry,
            this.material,
            instanceCount,
        );
        this.mesh.renderOrder = 1;
        this.scene.add(this.mesh);
        this.updateInstances();
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debugFolder = this.debug.ui.addFolder("planes");

        this.debugFolder
            .add(this.params, "columns")
            .name("width")
            .min(1)
            .max(32)
            .step(1)
            .onChange(() => {
                this.rebuild();
            });

        this.debugFolder
            .add(this.params, "rows")
            .name("height")
            .min(1)
            .max(32)
            .step(1)
            .onChange(() => {
                this.rebuild();
            });

        this.debugFolder
            .add(this.params, "planeSize")
            .name("size")
            .min(0.1)
            .max(3)
            .step(0.01)
            .onChange(() => {
                this.syncRoundnessMax();
                this.rebuild();
            });

        this.debugFolder
            .add(this.params, "gap")
            .min(0)
            .max(2)
            .step(0.01)
            .onChange(() => {
                this.updateInstances();
            });

        this.roundnessController = this.debugFolder
            .add(this.params, "cornerRoundness")
            .name("roundness")
            .min(0)
            .max(this.params.planeSize / 2)
            .step(0.001)
            .onChange(() => {
                this.rebuild();
            });

        this.debugFolder
            .add(this.params, "ior")
            .name("ior")
            .min(1)
            .max(2.5)
            .step(0.01);

        this.debugFolder.add(this.params, "thickness").min(0).max(2).step(0.01);

        this.debugFolder.add(this.params, "jitter").min(0).max(1).step(0.01);
        this.debugFolder
            .add(this.params, "jitterOffset")
            .name("jitterOffset")
            .min(-1)
            .max(1)
            .step(0.01);

        this.debugFolder
            .add(this.params, "chromaticAberration")
            .name("chroma")
            .min(0)
            .max(0.2)
            .step(0.001);

        this.debugFolder
            .add(this.params, "grainAmount")
            .name("grain")
            .min(0)
            .max(320)
            .step(0.1);

        this.debugFolder
            .add(this.params, "grainScale")
            .name("grainScale")
            .min(0.1)
            .max(16)
            .step(0.01);

        this.debugFolder
            .add(this.params, "rimWidth")
            .name("rim")
            .min(0.001)
            .max(0.8)
            .step(0.001);

        this.debugFolder
            .add(this.params, "normalStrength")
            .name("rimStrength")
            .min(0)
            .max(4)
            .step(0.01);

        this.debugFolder
            .add(this.params, "troughDepth")
            .name("trough")
            .min(0)
            .max(2)
            .step(0.01);

        this.debugFolder
            .add(this.params, "troughSquareness")
            .name("troughSq")
            .min(0)
            .max(1)
            .step(0.01);

        this.debugFolder
            .add(this.params, "sdfSmooth")
            .name("rimSmooth")
            .min(0)
            .max(0.4)
            .step(0.001);

        this.debugFolder
            .add(this.params, "highlightWidth")
            .name("highlight")
            .min(0)
            .max(0.3)
            .step(0.001);

        this.debugFolder.add(this.params, "showNormals").name("showNormals");

        this.debugFolder
            .add(this.params, "tonemapStrength")
            .name("tonemap")
            .min(0)
            .max(4)
            .step(0.01);
    }

    syncRoundnessMax() {
        if (!this.roundnessController) return;

        const maxRoundness = this.params.planeSize / 2;
        this.roundnessController.max(maxRoundness);

        if (this.params.cornerRoundness > maxRoundness) {
            this.params.cornerRoundness = maxRoundness;
            this.roundnessController.updateDisplay();
        }
    }

    getGrainFactor() {
        return this.sizes.pixelRatio <= 1 ? 0.5 : 1;
    }

    syncUniforms() {
        const grainFactor = this.getGrainFactor();

        this.material.uniforms.uIor.value = this.params.ior;
        this.material.uniforms.uThickness.value = this.params.thickness;
        this.material.uniforms.uJitterRange.value = this.params.jitter;
        this.material.uniforms.uJitterOffset.value = this.params.jitterOffset;
        this.material.uniforms.uChromaticAberration.value =
            this.params.chromaticAberration;
        this.material.uniforms.uGrainAmount.value =
            this.params.grainAmount * grainFactor;
        this.material.uniforms.uGrainScale.value =
            this.params.grainScale * grainFactor;
        this.material.uniforms.uPlaneSize.value = this.params.planeSize;
        this.material.uniforms.uCornerRadius.value =
            this.params.cornerRoundness;
        this.material.uniforms.uRimWidth.value = this.params.rimWidth;
        this.material.uniforms.uNormalStrength.value =
            this.params.normalStrength;
        this.material.uniforms.uTroughDepth.value = this.params.troughDepth;
        this.material.uniforms.uTroughSquareness.value =
            this.params.troughSquareness;
        this.material.uniforms.uSdfSmooth.value = this.params.sdfSmooth;
        this.material.uniforms.uHighlightWidth.value =
            this.params.highlightWidth;
        this.material.uniforms.uShowNormals.value = this.params.showNormals
            ? 1
            : 0;
        this.material.uniforms.uTonemapStrength.value =
            this.params.tonemapStrength;

        this.camera.updateMatrixWorld();
        this.viewProjection.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse,
        );
    }

    resizeGrabTarget() {
        this.renderer.getDrawingBufferSize(this.drawingBufferSize);

        const width = Math.max(1, Math.floor(this.drawingBufferSize.x));
        const height = Math.max(1, Math.floor(this.drawingBufferSize.y));

        if (
            this.grabTarget.width !== width ||
            this.grabTarget.height !== height
        ) {
            this.grabTarget.setSize(width, height);
        }

        this.texelSize.set(1 / width, 1 / height);
    }

    renderGrabPass() {
        this.resizeGrabTarget();

        const currentTarget = this.renderer.getRenderTarget();

        this.mesh.visible = false;
        this.renderer.setRenderTarget(this.grabTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(currentTarget);
        this.mesh.visible = true;
    }

    update() {
        this.syncUniforms();
        this.renderGrabPass();
    }
}
