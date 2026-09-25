import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import vertexShader from "./shaders/bands/vertex.glsl";
import fragmentShader from "./shaders/bands/fragment.glsl";

const BAND_COUNT = 6;

// Deterministic PRNG (mulberry32) so the per-band thickness variation is
// identical on every reload.
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

export default class BandsPlane {
    constructor(planeGrid) {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.debug = this.orc.debug;
        this.planeGrid = planeGrid;

        this.params = {
            angle: 0.5,
            offset: 0,
            bandThickness: 1.3,
            thicknessVariance: 0.5,
            waveAmplitude: 1.1,
            wave1Frequency: 0.3,
            wave1Speed: 0.35,
            wave2Frequency: 0.7,
            wave2Speed: 0.7,
            wave3Frequency: 1.4,
            wave3Speed: 1.15,
            edgeSoftness: 0.08,
            yOffset: -0.05,
        };

        this.colorA = new THREE.Color("#0b0b2b");
        this.colorB = new THREE.Color("#1100ff");
        this.colorC = new THREE.Color("#9e06e5");
        this.colorD = new THREE.Color("#f5f2ea");

        // One time accumulator per wave, so nudging a speed slider never
        // makes the pattern jump - only its future rate of change.
        this.waveTime = [0, 0, 0];

        this.setBandSeeds();
        this.setMaterial();
        this.setMesh();
        this.setDebug();
    }

    setBandSeeds() {
        const random = createRandom(11);

        this.bandSeeds = [];
        this.bandThickness = [];

        for (let i = 0; i < BAND_COUNT; i++) {
            this.bandSeeds.push(random() * 2 - 1);
            this.bandThickness.push(this.params.bandThickness);
        }
    }

    setMaterial() {
        this.material = new THREE.ShaderMaterial({
            defines: {
                BAND_COUNT,
            },
            uniforms: {
                uAngle: { value: this.params.angle },
                uOffset: { value: this.params.offset },
                uBandThickness: { value: this.bandThickness },
                uWaveAmplitude: { value: this.params.waveAmplitude },
                uWave1Frequency: { value: this.params.wave1Frequency },
                uWave1Time: { value: 0 },
                uWave2Frequency: { value: this.params.wave2Frequency },
                uWave2Time: { value: 0 },
                uWave3Frequency: { value: this.params.wave3Frequency },
                uWave3Time: { value: 0 },
                uEdgeSoftness: { value: this.params.edgeSoftness },
                uColorA: { value: this.colorA },
                uColorB: { value: this.colorB },
                uColorC: { value: this.colorC },
                uColorD: { value: this.colorD },
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

        this.debugFolder = this.debug.ui.addFolder("bands");

        this.debugFolder.add(this.params, "angle").min(0).max(Math.PI).step(0.01);
        this.debugFolder.add(this.params, "offset").min(-6).max(6).step(0.01);

        this.debugFolder
            .add(this.params, "bandThickness")
            .name("thickness")
            .min(0.2)
            .max(4)
            .step(0.01);
        this.debugFolder
            .add(this.params, "thicknessVariance")
            .name("thicknessVar")
            .min(0)
            .max(1)
            .step(0.01);

        this.debugFolder
            .add(this.params, "waveAmplitude")
            .name("waveAmp")
            .min(0)
            .max(4)
            .step(0.01);

        this.debugFolder
            .add(this.params, "wave1Frequency")
            .name("wave1Freq")
            .min(0.02)
            .max(2)
            .step(0.001);
        this.debugFolder
            .add(this.params, "wave1Speed")
            .min(0)
            .max(2)
            .step(0.01);

        this.debugFolder
            .add(this.params, "wave2Frequency")
            .name("wave2Freq")
            .min(0.02)
            .max(3)
            .step(0.001);
        this.debugFolder
            .add(this.params, "wave2Speed")
            .min(0)
            .max(2)
            .step(0.01);

        this.debugFolder
            .add(this.params, "wave3Frequency")
            .name("wave3Freq")
            .min(0.02)
            .max(4)
            .step(0.001);
        this.debugFolder
            .add(this.params, "wave3Speed")
            .min(0)
            .max(3)
            .step(0.01);

        this.debugFolder
            .add(this.params, "edgeSoftness")
            .name("edge")
            .min(0)
            .max(0.6)
            .step(0.001);

        this.debug.addColor(this.debugFolder, this.colorA, "colorA");
        this.debug.addColor(this.debugFolder, this.colorB, "colorB");
        this.debug.addColor(this.debugFolder, this.colorC, "colorC");
        this.debug.addColor(this.debugFolder, this.colorD, "colorD");
    }

    updateBandThickness() {
        for (let i = 0; i < BAND_COUNT; i++) {
            const scale = Math.max(
                1 + this.bandSeeds[i] * this.params.thicknessVariance,
                0.1,
            );

            this.bandThickness[i] = this.params.bandThickness * scale;
        }
    }

    syncUniforms() {
        this.material.uniforms.uAngle.value = this.params.angle;
        this.material.uniforms.uOffset.value = this.params.offset;
        this.material.uniforms.uWaveAmplitude.value = this.params.waveAmplitude;
        this.material.uniforms.uWave1Frequency.value = this.params.wave1Frequency;
        this.material.uniforms.uWave2Frequency.value = this.params.wave2Frequency;
        this.material.uniforms.uWave3Frequency.value = this.params.wave3Frequency;
        this.material.uniforms.uEdgeSoftness.value = this.params.edgeSoftness;
    }

    update(elapsed, delta) {
        this.waveTime[0] += delta * this.params.wave1Speed;
        this.waveTime[1] += delta * this.params.wave2Speed;
        this.waveTime[2] += delta * this.params.wave3Speed;

        this.material.uniforms.uWave1Time.value = this.waveTime[0];
        this.material.uniforms.uWave2Time.value = this.waveTime[1];
        this.material.uniforms.uWave3Time.value = this.waveTime[2];

        this.updateBandThickness();
        this.syncTransform();
        this.syncUniforms();
    }
}
