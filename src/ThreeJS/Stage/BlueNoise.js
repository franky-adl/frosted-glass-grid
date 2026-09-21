import * as THREE from "three";

const DEFAULT_SIZE = 64;
const SIGMA = 1.9;

function mulberry32(seed) {
    let t = seed >>> 0;

    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);

        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function wrap(value, size) {
    return ((value % size) + size) % size;
}

function generateChannel(size, seed) {
    const count = size * size;
    const occupied = new Uint8Array(count);
    const energy = new Float64Array(count);
    const ranks = new Float32Array(count);
    const radius = Math.ceil(SIGMA * 3);
    const twoSigma2 = 2 * SIGMA * SIGMA;
    const kernel = [];

    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            kernel.push({
                dx,
                dy,
                weight: Math.exp(-(dx * dx + dy * dy) / twoSigma2),
            });
        }
    }

    const addInfluence = (index, sign) => {
        const cx = index % size;
        const cy = (index / size) | 0;

        for (let i = 0; i < kernel.length; i++) {
            const { dx, dy, weight } = kernel[i];
            const x = wrap(cx + dx, size);
            const y = wrap(cy + dy, size);
            energy[y * size + x] += sign * weight;
        }
    };

    const findBest = (wantOccupied, pickMax) => {
        let best = -1;
        let bestEnergy = pickMax ? -Infinity : Infinity;

        for (let i = 0; i < count; i++) {
            if (Boolean(occupied[i]) !== wantOccupied) {
                continue;
            }

            const value = energy[i];

            if (pickMax ? value > bestEnergy : value < bestEnergy) {
                bestEnergy = value;
                best = i;
            }
        }

        return best;
    };

    const rebuildEnergy = (pattern) => {
        energy.fill(0);

        for (let i = 0; i < count; i++) {
            if (pattern[i]) {
                addInfluence(i, 1);
            }
        }
    };

    const rand = mulberry32(seed);
    const initialCount = Math.max(1, Math.floor(count * 0.1));
    const used = new Set();

    while (used.size < initialCount) {
        used.add((rand() * count) | 0);
    }

    for (const index of used) {
        occupied[index] = 1;
        addInfluence(index, 1);
    }

    for (let i = 0; i < initialCount * 4; i++) {
        const cluster = findBest(true, true);
        const voidIndex = findBest(false, false);

        if (cluster < 0 || voidIndex < 0) {
            break;
        }

        if (energy[cluster] <= energy[voidIndex]) {
            break;
        }

        occupied[cluster] = 0;
        addInfluence(cluster, -1);
        occupied[voidIndex] = 1;
        addInfluence(voidIndex, 1);
    }

    const prototype = occupied.slice();
    let onesCount = 0;

    for (let i = 0; i < count; i++) {
        if (prototype[i]) {
            onesCount++;
        }
    }

    for (let rank = onesCount; rank >= 1; rank--) {
        const cluster = findBest(true, true);
        ranks[cluster] = (rank - 0.5) / count;
        occupied[cluster] = 0;
        addInfluence(cluster, -1);
    }

    occupied.set(prototype);
    rebuildEnergy(prototype);

    for (let rank = onesCount + 1; rank <= count; rank++) {
        const voidIndex = findBest(false, false);
        ranks[voidIndex] = (rank - 0.5) / count;
        occupied[voidIndex] = 1;
        addInfluence(voidIndex, 1);
    }

    return ranks;
}

export default class BlueNoise {
    constructor(size = DEFAULT_SIZE) {
        this.size = size;
        this.texture = this.createTexture(size);
    }

    createTexture(size) {
        const count = size * size;
        const data = new Uint8Array(count * 4);
        const red = generateChannel(size, 1);
        const green = generateChannel(size, 2);

        for (let i = 0; i < count; i++) {
            const offset = i * 4;
            data[offset] = Math.min(255, red[i] * 256);
            data[offset + 1] = Math.min(255, green[i] * 256);
            data[offset + 2] = 0;
            data[offset + 3] = 255;
        }

        const texture = new THREE.DataTexture(
            data,
            size,
            size,
            THREE.RGBAFormat,
        );
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.NoColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;

        return texture;
    }
}
