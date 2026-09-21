# Frosted Glass Cubes

A Three.js scene of instanced frosted-glass tiles sitting just above a ground plane. Each tile is a flat mesh, but the fragment shader treats it as a thin slab of glass: a rounded rim, a shallow trough in the center, refraction of whatever is underneath, chromatic aberration, and a blue-noise grain that breaks up sampling artifacts.

The ground is one of two interchangeable backdrops — a mouse-following color spot, or a landscape photograph. A grab pass captures that backdrop (without the tiles) every frame so the glass can sample it as if looking through a lens.

## Setup

Download [Node.js](https://nodejs.org/en/download/).
Run the following commands:

```bash
# Install dependencies (only the first time)
pnpm i

# Run the local server at localhost:5173
pnpm dev

# Build for production in the dist/ directory
pnpm build
```

The lil-gui panel and GPU stats overlay are enabled automatically on localhost, or by appending `#debug` to the URL.

---

## How the scene is put together

`src/script.js` creates a single `Orchestrator` and hands it the WebGL canvas. From there the lifetime of the app is:

1. **Orchestrator** builds shared services (debug, sizes, resources, camera, renderer) and then the **Stage**.
2. **Stage** creates the three visible pieces: **PlaneGrid** (the glass), **SpotPlane** (default ground), and **ImagePlane** (optional photo ground).
3. Each animation frame, Stage updates the ground and then PlaneGrid. PlaneGrid hides itself, renders the rest of the scene into a grab texture, then becomes visible again. The renderer’s final pass draws everything, and the glass shader samples that grab texture.

Render order is important: both ground meshes use `renderOrder = -1`, the glass uses `renderOrder = 1`. That keeps the tiles on top even though they sit at almost the same Y as the ground.

```
                    ┌─────────────┐
                    │  Camera     │  orthographic, looking straight down
                    └──────┬──────┘
                           │
   pointer ──► SpotPlane   │   ImagePlane
               (spot ground)   (photo ground)
                           │
                    grab pass (tiles hidden)
                           │
                    PlaneGrid  ── samples grab + blue-noise grain
                           │
                    final render (tiles visible)
```

---

## Orchestrator

`src/ThreeJS/Orchestrator.js` is a singleton. Every other class does `new Orchestrator()` and receives the same instance, which is how Camera, Stage, and PlaneGrid share the scene, renderer, and event bus without prop-drilling.

On construction it:

- Creates a `mitt` event emitter used for `"resize"` and `"ready"` (resources finished loading).
- Starts `THREE.Timer` connected to `document`, so large `delta` spikes after a hidden tab are suppressed via the Page Visibility API.
- Instantiates Debug, Sizes, Resources, Camera, Renderer, and Stage.
- If debug is active, mounts `stats-gl` in the top-left corner with GPU timing.
- Registers `renderer.setAnimationLoop(() => this.animate())`.

Each tick: clock → camera → `stage.update(elapsed, delta)` → `renderer.update()` (the actual `WebGLRenderer.render` call) → stats.

`destroy()` disconnects the clock, disposes geometries/materials/renderer, and tears down the GUI. It is not called automatically; it is there if the experience is ever unmounted.

---

## Camera

`src/ThreeJS/Camera.js` uses an **orthographic** camera looking straight down the Y axis from `(0, 10, 0)`.

That choice matters for the glass. An orthographic view has no perspective foreshortening, so every tile is the same size on screen and the grab-pass UVs line up cleanly with world XZ. Because a default `up` of `(0, 1, 0)` is collinear with a downward look, the camera’s up vector is set to `(0, 0, -1)` so “up” on screen is world −Z.

The vertical frustum height is a fixed `frustumSize` of 12 world units. On resize, left/right are recomputed from the window aspect so the view does not stretch. The camera is fixed; there is no orbit, pan, or zoom.

---

## Renderer

`src/ThreeJS/Renderer.js` wraps `THREE.WebGLRenderer` with antialiasing, a dark clear color, and pixel-ratio capped by `Sizes` (max 2). Tone mapping and shadows are present but commented out; the glass and spot shaders set `toneMapped: false` and convert to output color space themselves via `linearToOutputTexel`.

Post-processing (`EffectComposer` + `RenderPass` + `OutputPass`) is wired but gated by `usePostProcessing = false`. The live path is a single `renderer.render(scene, camera)` after Stage has already filled the grab target.

---

## Stage

`src/ThreeJS/Stage/Stage.js` is the scene’s content root.

It sets the scene background to `#f5f5f5`, then constructs:

1. `PlaneGrid` — the frosted tiles
2. `SpotPlane(planeGrid)` — color-spot ground, sized to the grid
3. `ImagePlane(planeGrid)` — photo ground, also sized to the grid

`setGround(type)` toggles mesh visibility. Default is `"spot"`. The debug “scene” folder lets you switch to `"image"` and change the background color.

Update order each frame: spot (pointer + damping) → image (cover/transform) → plane grid (uniforms + grab pass). Ground must be up to date _before_ the grab pass, otherwise the glass would refract a stale backdrop.

---

## PlaneGrid

`src/ThreeJS/Stage/PlaneGrid.js` is the visual center of the project: an `InstancedMesh` of rounded rectangles, a full-resolution grab target, and a custom glass shader.

### Layout

Tiles are laid out in a `columns × rows` grid (default 20×10). Each tile has `planeSize` and a `gap` between neighbors. Positions are centered on the origin:

```
step = planeSize + gap
offsetX = (columns - 1) * step / 2   // same idea for Z / rows
```

`getSize()` returns the outer width/height of that grid. SpotPlane and ImagePlane scale themselves to those dimensions so the ground always sits flush under the tiles, including when you change width/height/size/gap in the GUI.

Changing columns, rows, plane size, or corner roundness calls `rebuild()`, which disposes the old mesh and creates a new `InstancedMesh`. Changing only the gap calls `updateInstances()`, which rewrites instance matrices without reallocating geometry.

### Rounded geometry

`createRoundedPlaneGeometry` builds a `THREE.Shape` with four `absarc` corners, triangulates it with `ShapeGeometry`, then rotates it −90° around X so the plane lies in XZ (normal +Y). If roundness is effectively zero it falls back to a plain `PlaneGeometry`. Roundness is clamped to half the tile size so the arcs cannot overlap.

### Per-instance jitter

Each instance gets a random `vec2 aJitter` in `[-1, 1]`. The fragment shader uses X to vary IOR and Y to vary thickness:

```
ior       = uIor       * (1 + (jitter.x + uJitterOffset) * uJitterRange)
thickness = uThickness * (1 + (jitter.y + uJitterOffset) * uJitterRange)
```

That is why neighboring tiles do not all magnify the ground the same way. `jitterOffset` slides the whole distribution; `jitter` is the amplitude.

### Grab pass

`setGrabTarget()` allocates an RGBA unsigned-byte render target with a depth buffer, linear filtering, no mipmaps, and `NoColorSpace` (the shader does its own output conversion).

Every frame `renderGrabPass()`:

1. Resizes the target to the drawing buffer if needed, and stores `uTexelSize = 1 / resolution`.
2. Hides the instanced mesh.
3. Renders the scene (background + visible ground) into the grab target.
4. Restores the previous render target and shows the mesh again.

The later full-frame render then draws the tiles on top. The shader never samples the tiles themselves — only whatever was behind them.

`uViewProjection` is `projectionMatrix * viewMatrix` rebuilt each frame so world-space refraction offsets can be projected back into grab UVs.

---

## Glass shader

`src/ThreeJS/Stage/shaders/planeGrid/fragment.glsl` is where the “frosted glass” look is invented. The mesh is still a flat plane; the shader fakes a 3D surface from a 2D height field.

### Height field

Working in each tile’s local XZ:

1. **Signed distance** to a rounded box (`sdRoundedBoxSmooth`), with polynomial smooth-min/max so the rim can be softened (`uSdfSmooth`).
2. **Meniscus / rim.** `heightFromDist` maps distance-from-edge into a circular roundover of about 70°. Height is highest at the lip and C1-continuous with the interior.
3. **Trough.** `troughProfile` carves a well in the middle. At `troughSquareness = 0` it is a separable circular bowl (`w_x³ · w_y³`). At `1` it is a superellipse well, so the depression follows the four edges more like a squarish dish. `uTroughDepth` is the amplitude.

Final height:

```
h = meniscus - uTroughDepth * troughProfile(...)
```

### Normals

`getSurfaceNormal` central-differences that height at two step sizes and averages them (a cheap multi-scale gradient). The Y component stays 1; X and Z are scaled by `uNormalStrength` (“rimStrength” in the GUI). Steeper rims bend the refracted ray more.

`uShowNormals` bypasses shading and writes `normal * 0.5 + 0.5` so you can inspect the fake surface.

### Refraction / grab sampling

`getIncident()` is the view ray. Under the orthographic camera it is simply the camera’s −Z in world space (constant), which keeps magnification even across the grid.

`getGrabUv` then:

1. Computes `eta = 1 / ior` and `refract(incident, normal, eta)`.
2. Magnifies toward the tile center: thicker / higher-IOR glass pulls the sample point inward (`magnification = 1 + thickness * (ior - 1) * 2`).
3. Marches the refracted ray down by `thickness / max(-refracted.y, 0.08)` — a slab of given thickness under the tile.
4. Projects that world position through `uViewProjection` into grab-texture UVs.

If chromatic aberration is on, the same path is run three times with `ior − ca`, `ior`, and `ior + ca`, and only the matching R/G/B channel is kept. That splits the ground colors at the rims the way a dispersive lens would.

### Grain

`sampleGrab` optionally offsets the UV by a blue-noise vector:

```
offset = (blueNoise.rg * 2 - 1) * uGrainAmount * uTexelSize
```

`uGrainScale` stretches the noise tiling. Because the noise is blue (high-frequency, no clumps), the dither looks like frosting rather than blotchy film grain. Amount is in pixels of the grab buffer.

### Lighting-like extras

There is no scene lighting. Instead:

- **Schlick fresnel** using the per-tile IOR adds a pale edge highlight (`color += 0.22 * fresnel`).
- **Geometric highlight** (`uHighlightWidth`) lights the SDF lip where the fake normal faces a diagonal, so corners catch a thin glint.
- **Reinhard-style compress** `color / (1 + color * uTonemapStrength)` keeps bright refracted spots from clipping.

Finally `linearToOutputTexel` converts to the renderer’s output color space.

The vertex shader only forwards world position, local position (for the SDF), and `aJitter`. Instancing is applied manually so `vLocalPosition` stays in the un-instanced tile frame.

---

## BlueNoise

`src/ThreeJS/Stage/BlueNoise.js` generates a 64×64 repeating RGBA `DataTexture` used as the grain/dither source.

It does **not** load an image. It runs a void-and-cluster ranking on the CPU:

1. Seed ~10% of pixels with a deterministic Mulberry32 RNG.
2. Treat each occupied pixel as a Gaussian energy bump (`σ = 1.9`, toroidal wrap so the texture tiles).
3. Repeatedly move the highest-energy “cluster” into the lowest-energy “void” until the field is even.
4. Rank every pixel by repeatedly removing the current tightest cluster, then filling remaining voids the same way. Rank becomes a value in `(0, 1)`.

Red and green are two independent rankings (seeds 1 and 2). The shader reads `.rg` as a 2D offset. Mag/min filters are nearest, wrap is repeat, color space is linear, no mipmaps — so each texel is a stable, non-interpolated sample.

---

## SpotPlane

`src/ThreeJS/Stage/SpotPlane.js` is the default ground: a 1×1 plane rotated into XZ, scaled to `planeGrid.getSize()`, and sunk by `yOffset` (−0.05) so it sits just under the tiles.

### Pointer → world spot

On `pointermove`, NDC is stored. Each frame a raycaster from the camera hits an infinite `THREE.Plane` at that same Y. The hit’s `(x, z)` is the **target**. The displayed spot is `MathUtils.damp`’d toward that target (`damping` in the GUI), so the blob trails the cursor instead of teleporting.

### Shader

`shaders/spotPlane/fragment.glsl` colors by distance in XZ:

- Inside `falloffOffset`, the mix is 1 (full accent).
- Between `falloffOffset` and `radius`, it lerps to `uBaseColor`.
- The accent itself is `mix(uColor, uColor2, smoothstep(-1, 1, (world.x - spot.x) / radius))`, so the blob is a horizontal gradient (magenta → pink by default) rather than a single hue.

`toneMapped: false` plus `linearToOutputTexel` matches the glass output path so the grab sample and the on-screen ground agree.

---

## ImagePlane

`src/ThreeJS/Stage/ImagePlane.js` is the alternate ground: the same scaled XZ plane, initially hidden, with a `MeshBasicMaterial` whose map is `/textures/landscape.jpg`.

`Resources` loads that texture asynchronously. If it is not ready in the constructor, ImagePlane waits for the orchestrator `"ready"` event. Once applied, `syncCover()` implements CSS-style `object-fit: cover`:

- Compare the plane aspect to the image aspect.
- Repeat/offset the texture so the image fills the plane and the overflow is cropped, centered.

`syncTransform()` runs every frame so cover and scale stay correct when the grid’s columns, rows, size, or gap change.

---

## Supporting systems

### Sizes

`src/ThreeJS/Utils/Sizes.js` tracks `innerWidth` / `innerHeight` and `min(devicePixelRatio, 2)`. On window resize it updates those values and emits `"resize"`. Orchestrator then resizes the camera frustum and the renderer (and the grab target follows on the next PlaneGrid update).

### Resources

`src/ThreeJS/Utils/Resources.js` loads the list in `src/ThreeJS/sources.js`. The only current source is the landscape texture. Loaders for glTF, HDR, and cube maps are already wired. When the last item finishes it emits `"ready"`.

### Debug

`src/ThreeJS/Utils/Debug.js` turns on if the hostname is localhost/127.0.0.1 or the URL hash is `#debug`. Color pickers go through `Debug.addColor`, which converts between the browser’s sRGB hex and Three.js linear-sRGB `Color` objects.

Useful folders:

| Folder     | What it controls                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **scene**  | Background color; ground mode `spot` / `image`                                                        |
| **spot**   | Radius, falloff, colors, damping                                                                      |
| **planes** | Grid layout, IOR, thickness, jitter, chroma, grain, rim/trough SDF, highlight, tonemap, `showNormals` |

---

## Frame recap

A single frame, in order:

1. SpotPlane raycasts the pointer onto the ground plane and damps the spot uniform. ImagePlane rescales/re-covers if the grid size changed.
2. PlaneGrid writes shader uniforms (including the current view-projection).
3. PlaneGrid hides the tiles, renders background + ground into `grabTarget`, shows the tiles again.
4. The WebGLRenderer renders the full scene. Each glass fragment reconstructs a fake height-field normal, refracts into the grab texture (with optional RGB split), dithers with blue noise, and adds fresnel/edge highlights.

The “cubes” are never extruded meshes. The thickness, rim, and frost are all in the PlaneGrid fragment shader, sampling a ground that was captured a few milliseconds earlier in the same frame.

---

## References/Credits

- Calculation reference for the fake rim height-field normal [https://github.com/rxing365/html-liquid-glass-effect-webgl]
