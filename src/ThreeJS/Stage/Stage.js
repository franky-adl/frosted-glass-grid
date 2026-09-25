import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";
import PlaneGrid from "./PlaneGrid.js";
import SpotPlane from "./SpotPlane.js";
import ImagePlane from "./ImagePlane.js";
import AuroraPlane from "./AuroraPlane.js";
import LavaPlane from "./LavaPlane.js";
import BandsPlane from "./BandsPlane.js";

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
        // Folders are ordered by creation. Create this before the ground
        // folders so it sits directly under "planes".
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder("scene");
        }
        this.spotPlane = new SpotPlane(this.planeGrid);
        this.imagePlane = new ImagePlane(this.planeGrid);
        this.grounds = {
            spot: this.spotPlane,
            // image: this.imagePlane,
            aurora: new AuroraPlane(this.planeGrid, this.spotPlane),
            lava: new LavaPlane(this.planeGrid, this.spotPlane),
            bands: new BandsPlane(this.planeGrid),
        };
        this.setGround(this.params.ground);
        this.setOverlay(this.params.overlay);
        this.setDebug();
    }

    setBackground() {
        this.backgroundColor = new THREE.Color("#f5f5f5");
        this.scene.background = this.backgroundColor;
    }

    setGround(type) {
        for (const [name, ground] of Object.entries(this.grounds)) {
            const active = name === type;

            ground.mesh.visible = active;
            ground.debugFolder?.show(active);
        }
    }

    setOverlay(visible) {
        if (!this.overlay) return;
        this.overlay.style.display = visible ? "" : "none";
    }

    setDebug() {
        if (!this.debug.active) return;

        this.debug.addColor(
            this.debugFolder,
            this.backgroundColor,
            "background",
        );
        this.debugFolder
            .add(this.params, "ground", Object.keys(this.grounds))
            .onChange((value) => {
                this.setGround(value);
            });
        this.debugFolder.add(this.params, "overlay").onChange((value) => {
            this.setOverlay(value);
        });
    }

    // both time params are measured in seconds
    update(elapsed, delta) {
        // Every ground updates (spot drives the lava cursor blob), and the
        // grab pass must run last so it captures this frame's backdrop.
        for (const ground of Object.values(this.grounds)) {
            ground.update(elapsed, delta);
        }
        this.planeGrid.update();
    }
}
