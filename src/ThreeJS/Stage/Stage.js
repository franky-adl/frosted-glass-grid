import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import PlaneGrid from "./PlaneGrid.js";
import SpotPlane from "./SpotPlane.js";
import ImagePlane from "./ImagePlane.js";

export default class Stage {
    constructor() {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.debug = this.orc.debug;

        this.params = {
            ground: "spot",
            overlay: true,
        };

        this.overlay = document.querySelector(".overlay");
        this.setBackground();
        this.planeGrid = new PlaneGrid();
        this.spotPlane = new SpotPlane(this.planeGrid);
        this.imagePlane = new ImagePlane(this.planeGrid);
        this.setGround(this.params.ground);
        this.setOverlay(this.params.overlay);
        this.setDebug();
    }

    setBackground() {
        this.backgroundColor = new THREE.Color("#f5f5f5");
        this.scene.background = this.backgroundColor;
    }

    setGround(type) {
        this.spotPlane.mesh.visible = type === "spot";
        this.imagePlane.mesh.visible = type === "image";
    }

    setOverlay(visible) {
        if (!this.overlay) return;
        this.overlay.style.display = visible ? "" : "none";
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debugFolder = this.debug.ui.addFolder("scene");
        this.debug.addColor(
            this.debugFolder,
            this.backgroundColor,
            "background",
        );
        this.debugFolder
            .add(this.params, "ground", ["spot", "image"])
            .onChange((value) => {
                this.setGround(value);
            });
        this.debugFolder.add(this.params, "overlay").onChange((value) => {
            this.setOverlay(value);
        });
    }

    // both time params are measured in seconds
    update(elapsed, delta) {
        this.spotPlane.update(elapsed, delta);
        this.imagePlane.update();
        this.planeGrid.update();
    }
}
