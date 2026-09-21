import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";

export default class PlaneGrid {
    constructor() {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.debug = this.orc.debug;

        this.params = {
            columns: 32,
            rows: 16,
            planeSize: 1,
            gap: 0.03,
            cornerRoundness: 0.15,
        };

        this.dummy = new THREE.Object3D();

        this.setMaterial();
        this.rebuild();
        this.setDebug();
    }

    setMaterial() {
        this.material = new THREE.MeshBasicMaterial({
            color: "#ffffff",
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
}
