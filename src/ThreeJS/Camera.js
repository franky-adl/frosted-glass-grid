import * as THREE from "three";
import Orchestrator from "./Orchestrator.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default class Camera {
    constructor() {
        this.orc = new Orchestrator();
        this.sizes = this.orc.sizes;
        this.scene = this.orc.scene;
        this.canvas = this.orc.canvas;

        // Vertical world-space height of the orthographic view
        this.frustumSize = 12;

        this.setInstance();
        this.setControls();
    }

    setInstance() {
        const aspect = this.sizes.width / this.sizes.height;

        this.instance = new THREE.OrthographicCamera(
            (-this.frustumSize * aspect) / 2,
            (this.frustumSize * aspect) / 2,
            this.frustumSize / 2,
            -this.frustumSize / 2,
            0.1,
            100,
        );
        // Default up is (0, 1, 0), which is collinear with a straight-down look.
        this.instance.up.set(0, 0, -1);
        this.instance.position.set(0, 10, 0);
        this.instance.lookAt(0, 0, 0);
        this.scene.add(this.instance);
    }

    setControls() {
        this.controls = new OrbitControls(this.instance, this.canvas);
        this.controls.enableDamping = true;
        this.controls.enableRotate = false;
        this.controls.screenSpacePanning = true;
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    resize() {
        const aspect = this.sizes.width / this.sizes.height;

        this.instance.left = (-this.frustumSize * aspect) / 2;
        this.instance.right = (this.frustumSize * aspect) / 2;
        this.instance.top = this.frustumSize / 2;
        this.instance.bottom = -this.frustumSize / 2;
        this.instance.updateProjectionMatrix();
    }

    update() {
        this.controls.update();
    }
}
