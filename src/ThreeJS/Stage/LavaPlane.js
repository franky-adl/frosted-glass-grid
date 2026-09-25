import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import vertexShader from "./shaders/lava/vertex.glsl";
import fragmentShader from "./shaders/lava/fragment.glsl";

const BLOB_COUNT = 7;

// Deterministic PRNG (mulberry32) so the blob layout is identical on every reload.
function createRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export default class LavaPlane {
    constructor(planeGrid, spotPlane) {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.camera = this.orc.camera.instance;
        this.debug = this.orc.debug;
        this.planeGrid = planeGrid;
        this.spotPlane = spotPlane;

        this.params = {
            blobRadius: 1.8,
            radiusVariance: 0.6,
            smoothness: 1.6,
            edgeSoftness: 0.185,
            speed: 0.35,
            travel: 0.75,
            pointerEnabled: true,
            pointerRadius: 2,
            yOffset: -0.05,
        };

        this.baseColor = new THREE.Color("#f5f2ea");
        this.colorA = new THREE.Color("#ff4d00");
        this.colorB = new THREE.Color("#9e06e5");
        this.colorC = new THREE.Color("#f9df00");
        this.time = 0;

        this.setBlobs();
        this.setMaterial();
        this.setMesh();
        this.setDebug();
    }

    setBlobs() {
        const random = createRandom(7);
        const palette = [this.colorA, this.colorB, this.colorC];

        this.blobs = [];
        this.blobUniforms = [];
        this.blobColors = [];

        for (let i = 0; i < BLOB_COUNT; i++) {
            this.blobs.push({
                freqX: 0.3 + random() * 0.7,
                freqZ: 0.3 + random() * 0.7,
                phaseX: random() * Math.PI * 2,
                phaseZ: random() * Math.PI * 2,
                radiusSeed: random() * 2 - 1,
            });
            this.blobUniforms.push(new THREE.Vector3());
            this.blobColors.push(palette[i % palette.length]);
        }

        this.updateBlobs();
    }

    setMaterial() {
        this.material = new THREE.ShaderMaterial({
            defines: {
                BLOB_COUNT,
            },
            uniforms: {
                uBlobs: { value: this.blobUniforms },
                uBlobColors: { value: this.blobColors },
                uBaseColor: { value: this.baseColor },
                uColorA: { value: this.colorA },
                uPointer: { value: this.spotPlane.spotPosition },
                uPointerRadius: { value: this.params.pointerRadius },
                uSmoothness: { value: this.params.smoothness },
                uEdgeSoftness: { value: this.params.edgeSoftness },
            },
            vertexShader,
            fragmentShader,
            toneMapped: false,
        });
    }

    setMesh() {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.renderOrder = -1;
        this.mesh.visible = false;
        this.scene.add(this.mesh);

        this.syncTransform();
    }

    syncTransform() {
        const { width, height } = this.planeGrid.getSize();

        this.mesh.scale.set(width, 1, height);
        this.mesh.position.y = this.params.yOffset;
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debugFolder = this.debug.ui.addFolder("lava");

        this.debugFolder
            .add(this.params, "blobRadius")
            .min(0.3)
            .max(4)
            .step(0.01);
        this.debugFolder
            .add(this.params, "radiusVariance")
            .min(0)
            .max(1)
            .step(0.01);
        this.debugFolder
            .add(this.params, "smoothness")
            .min(0.01)
            .max(4)
            .step(0.01);
        this.debugFolder
            .add(this.params, "edgeSoftness")
            .min(0)
            .max(0.5)
            .step(0.001);
        this.debugFolder.add(this.params, "speed").min(0).max(2).step(0.01);
        this.debugFolder
            .add(this.params, "travel")
            .min(0.2)
            .max(1.2)
            .step(0.01);
        this.debugFolder.add(this.params, "pointerEnabled").name("pointer");
        this.debugFolder
            .add(this.params, "pointerRadius")
            .min(0)
            .max(4)
            .step(0.01);

        this.debug.addColor(this.debugFolder, this.baseColor, "baseColor");
        this.debug.addColor(this.debugFolder, this.colorA, "colorA");
        this.debug.addColor(this.debugFolder, this.colorB, "colorB");
        this.debug.addColor(this.debugFolder, this.colorC, "colorC");
    }

    // Bounded by the camera view rather than the grid, which extends past the screen.
    updateBlobs() {
        const halfW = this.camera.right * this.params.travel;
        const halfH = this.camera.top * this.params.travel;

        for (let i = 0; i < BLOB_COUNT; i++) {
            const blob = this.blobs[i];
            const radiusScale = Math.max(
                1 + blob.radiusSeed * this.params.radiusVariance,
                0.1,
            );

            this.blobUniforms[i].set(
                Math.sin(this.time * blob.freqX + blob.phaseX) * halfW,
                Math.sin(this.time * blob.freqZ + blob.phaseZ) * halfH,
                this.params.blobRadius * radiusScale,
            );
        }
    }

    syncUniforms() {
        this.material.uniforms.uPointerRadius.value = this.params.pointerEnabled
            ? this.params.pointerRadius
            : 0;
        this.material.uniforms.uSmoothness.value = this.params.smoothness;
        this.material.uniforms.uEdgeSoftness.value = this.params.edgeSoftness;
    }

    update(elapsed, delta) {
        this.time += delta * this.params.speed;
        this.syncTransform();
        this.updateBlobs();
        this.syncUniforms();
    }
}
