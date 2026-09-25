import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import vertexShader from "./shaders/aurora/vertex.glsl";
import fragmentShader from "./shaders/aurora/fragment.glsl";

const WAVE_COUNT = 3;
const BAND_COUNT = 3;

export default class AuroraPlane {
    constructor(planeGrid, spotPlane) {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.camera = this.orc.camera.instance;
        this.debug = this.orc.debug;
        this.planeGrid = planeGrid;
        this.spotPlane = spotPlane;

        this.params = {
            speed: 1.1,
            wave1Frequency: 0.2,
            wave1Amplitude: 0.8,
            wave1Speed: 1,
            wave1Offset: 0,
            wave2Frequency: 0.42,
            wave2Amplitude: 0.72,
            wave2Speed: 0.55,
            wave2Offset: 1.7,
            wave3Frequency: 0.33,
            wave3Amplitude: 0.68,
            wave3Speed: 1.7,
            wave3Offset: 3.4,
            band1Angle: 33.4,
            band1OffsetX: 0,
            band1OffsetZ: 1.57,
            band1Thickness: 8,
            band1Edge: 5,
            band1WaveOffset: 0,
            band1Sensitivity: 0,
            band2Angle: 30.9,
            band2OffsetX: 2.55,
            band2OffsetZ: 8.74,
            band2Thickness: 4.55,
            band2Edge: 2.33,
            band2WaveOffset: 1.57,
            band2Sensitivity: 0.4,
            band3Angle: 48,
            band3OffsetX: -1.69,
            band3OffsetZ: -6.57,
            band3Thickness: 8,
            band3Edge: 4.2,
            band3WaveOffset: 1.25,
            band3Sensitivity: 0.2,
            yOffset: -0.05,
        };

        this.baseColor = new THREE.Color("#f5f2ea");
        this.bandColor = [
            new THREE.Color("#ff3300"), // #ff3300
            new THREE.Color("#fd2beb"), // #fd2beb
            new THREE.Color("#382af8"), // #382af8
        ];
        this.bandAngle = new Float32Array(BAND_COUNT);
        this.bandOffset = [
            new THREE.Vector2(),
            new THREE.Vector2(),
            new THREE.Vector2(),
        ];
        this.bandThickness = new Float32Array(BAND_COUNT);
        this.bandEdge = new Float32Array(BAND_COUNT);
        this.bandWaveOffset = new Float32Array(BAND_COUNT);
        this.pointerSensitivity = new Float32Array(BAND_COUNT);
        this.waveFrequency = new Float32Array(WAVE_COUNT);
        this.waveAmplitude = new Float32Array(WAVE_COUNT);
        this.waveSpeed = new Float32Array(WAVE_COUNT);
        this.waveOffset = new Float32Array(WAVE_COUNT);
        this.screenOffset = new THREE.Vector2();
        this.time = 0;

        this.setMaterial();
        this.setMesh();
        this.setDebug();
    }

    setMaterial() {
        this.material = new THREE.ShaderMaterial({
            defines: {
                WAVE_COUNT,
                BAND_COUNT,
            },
            uniforms: {
                uAngle: { value: this.bandAngle },
                uOffset: { value: this.bandOffset },
                uThickness: { value: this.bandThickness },
                uEdgeSoftness: { value: this.bandEdge },
                uBandWaveOffset: { value: this.bandWaveOffset },
                uPointerSensitivity: { value: this.pointerSensitivity },
                uScreenOffset: { value: this.screenOffset },
                uTime: { value: this.time },
                uWaveFrequency: { value: this.waveFrequency },
                uWaveAmplitude: { value: this.waveAmplitude },
                uWaveSpeed: { value: this.waveSpeed },
                uWaveOffset: { value: this.waveOffset },
                uBaseColor: { value: this.baseColor },
                uBandColor: { value: this.bandColor },
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

        this.debugFolder = this.debug.ui.addFolder("aurora");
        this.debug.addColor(this.debugFolder, this.baseColor, "baseColor");

        for (let i = 1; i <= BAND_COUNT; i++) {
            const folder = this.debugFolder.addFolder(`band${i}`);

            folder
                .add(this.params, `band${i}Angle`)
                .name("angle")
                .min(0)
                .max(180)
                .step(0.1);
            folder
                .add(this.params, `band${i}OffsetX`)
                .name("offsetX")
                .min(-12)
                .max(12)
                .step(0.01);
            folder
                .add(this.params, `band${i}OffsetZ`)
                .name("offsetZ")
                .min(-12)
                .max(12)
                .step(0.01);
            folder
                .add(this.params, `band${i}Thickness`)
                .name("thickness")
                .min(0.05)
                .max(8)
                .step(0.01);
            folder
                .add(this.params, `band${i}Edge`)
                .name("edge")
                .min(0)
                .max(6)
                .step(0.001);
            folder
                .add(this.params, `band${i}WaveOffset`)
                .name("waveOffset")
                .min(-12)
                .max(12)
                .step(0.01);
            folder
                .add(this.params, `band${i}Sensitivity`)
                .name("sensitivity")
                .min(0)
                .max(2)
                .step(0.01);

            this.debug.addColor(folder, this.bandColor[i - 1], "color");
        }

        const waves = this.debugFolder.addFolder("waves");
        waves.add(this.params, "speed").min(0).max(3).step(0.01);

        for (let i = 1; i <= WAVE_COUNT; i++) {
            waves
                .add(this.params, `wave${i}Frequency`)
                .name(`wave${i}Freq`)
                .min(0)
                .max(4)
                .step(0.01);
            waves
                .add(this.params, `wave${i}Amplitude`)
                .name(`wave${i}Amp`)
                .min(0)
                .max(3)
                .step(0.01);
            waves
                .add(this.params, `wave${i}Speed`)
                .name(`wave${i}Speed`)
                .min(0)
                .max(3)
                .step(0.01);
            waves
                .add(this.params, `wave${i}Offset`)
                .name(`wave${i}Offset`)
                .min(0)
                .max(Math.PI * 2)
                .step(0.01);
        }
    }

    syncUniforms() {
        const pointer = this.spotPlane.pointer;

        this.screenOffset.set(
            pointer.x * this.camera.right,
            pointer.y * this.camera.top,
        );
        this.material.uniforms.uTime.value = this.time;

        for (let i = 0; i < BAND_COUNT; i++) {
            const n = i + 1;

            this.bandAngle[i] = this.params[`band${n}Angle`];
            this.bandOffset[i].set(
                this.params[`band${n}OffsetX`],
                this.params[`band${n}OffsetZ`],
            );
            this.bandThickness[i] = this.params[`band${n}Thickness`];
            this.bandEdge[i] = this.params[`band${n}Edge`];
            this.bandWaveOffset[i] = this.params[`band${n}WaveOffset`];
            this.pointerSensitivity[i] = this.params[`band${n}Sensitivity`];
        }

        for (let i = 0; i < WAVE_COUNT; i++) {
            const n = i + 1;
            this.waveFrequency[i] = this.params[`wave${n}Frequency`];
            this.waveAmplitude[i] = this.params[`wave${n}Amplitude`];
            this.waveSpeed[i] = this.params[`wave${n}Speed`];
            this.waveOffset[i] = this.params[`wave${n}Offset`];
        }
    }

    update(elapsed, delta) {
        this.time += delta * this.params.speed;
        this.syncTransform();
        this.syncUniforms();
    }
}
