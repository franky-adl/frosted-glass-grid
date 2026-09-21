import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import PlaneGrid from "./PlaneGrid.js";
import SpotPlane from "./SpotPlane.js";

export default class Stage {
    constructor() {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.debug = this.orc.debug;

        this.setBackground();
        this.planeGrid = new PlaneGrid();
        this.spotPlane = new SpotPlane(this.planeGrid);
        this.setDebug();
    }

    setBackground() {
        this.backgroundColor = new THREE.Color("#f5f5f5");
        this.scene.background = this.backgroundColor;
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debugFolder = this.debug.ui.addFolder("scene");
        this.debug.addColor(
            this.debugFolder,
            this.backgroundColor,
            "background",
        );
    }

    // both time params are measured in seconds
    update(elapsed, delta) {
        this.spotPlane.update(elapsed, delta);
    }
}
