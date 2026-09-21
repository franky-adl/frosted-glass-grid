import * as THREE from "three";
import Orchestrator from "../Orchestrator.js";

export default class ImagePlane {
    constructor(planeGrid) {
        this.orc = new Orchestrator();
        this.scene = this.orc.scene;
        this.resources = this.orc.resources;
        this.planeGrid = planeGrid;

        this.params = {
            yOffset: -0.05,
        };

        this.setMaterial();
        this.setMesh();
        this.setTexture();
    }

    setMaterial() {
        this.material = new THREE.MeshBasicMaterial({
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

    setTexture() {
        const applyTexture = () => {
            const texture = this.resources.items.landscape;
            if (!texture) return;

            this.texture = texture;
            this.texture.wrapS = THREE.ClampToEdgeWrapping;
            this.texture.wrapT = THREE.ClampToEdgeWrapping;
            this.material.map = this.texture;
            this.material.needsUpdate = true;
            this.syncCover();
        };

        if (this.resources.items.landscape) {
            applyTexture();
            return;
        }

        this.orc.emitter.on("ready", applyTexture);
    }

    syncCover() {
        if (!this.texture?.image) return;

        const { width, height } = this.planeGrid.getSize();
        const planeAspect = width / Math.max(height, 1e-6);
        const imageWidth = this.texture.image.width;
        const imageHeight = Math.max(this.texture.image.height, 1e-6);
        const imageAspect = imageWidth / imageHeight;

        if (imageAspect > planeAspect) {
            const repeatX = planeAspect / imageAspect;
            this.texture.repeat.set(repeatX, 1);
            this.texture.offset.set((1 - repeatX) / 2, 0);
        } else {
            const repeatY = imageAspect / planeAspect;
            this.texture.repeat.set(1, repeatY);
            this.texture.offset.set(0, (1 - repeatY) / 2);
        }
    }

    syncTransform() {
        const { width, height } = this.planeGrid.getSize();

        this.mesh.scale.set(width, 1, height);
        this.mesh.position.y = this.params.yOffset;
        this.syncCover();
    }

    update() {
        this.syncTransform();
    }
}
