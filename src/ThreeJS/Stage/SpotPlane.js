import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import vertexShader from "./shaders/spotPlane/vertex.glsl";
import fragmentShader from "./shaders/spotPlane/fragment.glsl";

export default class SpotPlane {
    constructor(planeGrid) {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.camera = this.orc.camera.instance;
        this.sizes = this.orc.sizes;
        this.debug = this.orc.debug;
        this.planeGrid = planeGrid;

        this.params = {
            radius: 6,
            damping: 6,
            yOffset: -0.05,
        };

        this.baseColor = new THREE.Color("#ffe5f0");
        this.color = new THREE.Color("#244ef5");
        this.color2 = new THREE.Color("#f50a93");
        this.pointer = new THREE.Vector2();
        this.spotTarget = new THREE.Vector2();
        this.spotPosition = new THREE.Vector2();
        this.intersection = new THREE.Vector3();
        this.planeNormal = new THREE.Vector3(0, 1, 0);
        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane();

        this.setMaterial();
        this.setMesh();
        this.setPointerTracking();
        this.setDebug();
    }

    setMaterial() {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uBaseColor: { value: this.baseColor },
                uColor: { value: this.color },
                uColor2: { value: this.color2 },
                uSpotPosition: { value: this.spotPosition },
                uRadius: { value: this.params.radius },
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
        this.scene.add(this.mesh);

        this.syncTransform();
    }

    setPointerTracking() {
        this.onPointerMove = (event) => {
            this.pointer.x = (event.clientX / this.sizes.width) * 2 - 1;
            this.pointer.y = -(event.clientY / this.sizes.height) * 2 + 1;
        };

        window.addEventListener("pointermove", this.onPointerMove);
    }

    syncTransform() {
        const { width, height } = this.planeGrid.getSize();

        this.mesh.scale.set(width, 1, height);
        this.mesh.position.y = this.params.yOffset;
        this.groundPlane.set(this.planeNormal, -this.params.yOffset);
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debugFolder = this.debug.ui.addFolder("spot");

        this.debugFolder.add(this.params, "radius").min(0.1).max(24).step(0.1);

        this.debug.addColor(this.debugFolder, this.baseColor, "baseColor");
        this.debug.addColor(this.debugFolder, this.color, "color");
        this.debug.addColor(this.debugFolder, this.color2, "color2");

        this.debugFolder.add(this.params, "damping").min(0.5).max(20).step(0.1);
    }

    updateSpot(delta) {
        this.raycaster.setFromCamera(this.pointer, this.camera);

        if (
            this.raycaster.ray.intersectPlane(
                this.groundPlane,
                this.intersection,
            )
        ) {
            this.spotTarget.set(this.intersection.x, this.intersection.z);
        }

        this.spotPosition.x = THREE.MathUtils.damp(
            this.spotPosition.x,
            this.spotTarget.x,
            this.params.damping,
            delta,
        );
        this.spotPosition.y = THREE.MathUtils.damp(
            this.spotPosition.y,
            this.spotTarget.y,
            this.params.damping,
            delta,
        );

        this.material.uniforms.uRadius.value = this.params.radius;
    }

    update(elapsed, delta) {
        this.syncTransform();
        this.updateSpot(delta);
    }
}
