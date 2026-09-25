# Frosted Glass Cubes

A Three.js scene of instanced frosted-glass tiles sitting just above a ground plane. Each tile is a flat mesh, but the fragment shader treats it as a thin slab of glass: a rounded rim, a shallow trough in the center, refraction of whatever is underneath, chromatic aberration, and a blue-noise grain that breaks up sampling artifacts.

The ground is one of several interchangeable backdrops: a mouse-following color spot, drifting aurora ribbons, lava metaballs, or wavy color bands. A grab pass captures the visible backdrop (without the tiles) every frame so the glass can sample it as if looking through a lens.

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
2. **Stage** creates **PlaneGrid** (the glass) and the backdrops: **SpotPlane** (default), **AuroraPlane**, **LavaPlane**, and **BandsPlane**. Only one backdrop mesh is visible at a time.
3. Each animation frame, Stage updates every backdrop, then PlaneGrid. The hidden ones still run, because aurora and lava read the spot’s pointer. PlaneGrid hides itself, renders the rest of the scene into a grab texture, then becomes visible again. The renderer’s final pass draws everything, and the glass shader samples that grab texture.

Render order is important: every ground mesh uses `renderOrder = -1`, the glass uses `renderOrder = 1`. That keeps the tiles on top even though they sit at almost the same Y as the ground.

```
                    ┌─────────────┐
                    │  Camera     │  orthographic, looking straight down
                    └──────┬──────┘
                           │
         spot · aurora · lava · bands
              (one ground visible)
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

`src/ThreeJS/Renderer.js` wraps `THREE.WebGLRenderer` with antialiasing, a dark clear color, and pixel-ratio capped by `Sizes` (max 2). Tone mapping and shadows are present but commented out; the glass and ground shaders set `toneMapped: false` and convert to output color space themselves via `linearToOutputTexel`.

Post-processing (`EffectComposer` + `RenderPass` + `OutputPass`) is wired but gated by `usePostProcessing = false`. The live path is a single `renderer.render(scene, camera)` after Stage has already filled the grab target.

---

## Stage

`src/ThreeJS/Stage/Stage.js` is the scene’s content root.

It sets the scene background to `#f5f5f5`, then constructs:

1. `PlaneGrid` — the frosted tiles
2. `SpotPlane` — color-spot ground, sized to the grid, and the shared pointer
3. `AuroraPlane`, `LavaPlane`, and `BandsPlane` — the other backdrops, also sized to the grid

`ImagePlane` (a photo of `/textures/landscape.jpg`) is still constructed, but it is commented out of `grounds`, so it is not part of the switcher.

`setGround(type)` walks `grounds` and shows only the matching mesh. It also shows that ground’s lil-gui folder and hides the others. Default is `"spot"`. The debug “scene” folder lists the keys of `grounds` — currently `spot`, `aurora`, `lava`, and `bands` — plus the background color and an HTML overlay toggle.

Update order each frame: every ground, then the plane grid. Spot runs first, which matters because lava reads its damped spot position. Aurora reads the same pointer in NDC and shifts its ribbons by a per-band sensitivity. Ground must be up to date _before_ the grab pass, otherwise the glass would refract a stale backdrop. Hidden grounds still update, so switching back does not resume from a frozen frame.

---

## PlaneGrid

`src/ThreeJS/Stage/PlaneGrid.js` is the visual center of the project: an `InstancedMesh` of rounded rectangles, a full-resolution grab target, and a custom glass shader.

### Layout

Tiles are laid out in a `columns × rows` grid (default 20×10). Each tile has `planeSize` and a `gap` between neighbors. Positions are centered on the origin:

```
step = planeSize + gap
offsetX = (columns - 1) * step / 2   // same idea for Z / rows
```

`getSize()` returns the outer width/height of that grid. Every ground scales itself to those dimensions so the backdrop always sits flush under the tiles, including when you change width/height/size/gap in the GUI.

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
- The accent itself is `mix(uColor, uColor2, smoothstep(-1, 1, (world.x - spot.x) / radius))`, so the blob is a horizontal gradient (blue → purple by default) rather than a single hue.

`toneMapped: false` plus `linearToOutputTexel` matches the glass output path so the grab sample and the on-screen ground agree.

---

## AuroraPlane

`src/ThreeJS/Stage/AuroraPlane.js` draws three colored ribbons on a paper-colored base. The mesh is the same scaled XZ plane as the spot, sunk by `yOffset` (−0.05), with `renderOrder = -1`, and it starts hidden.

Each band has its own angle, XZ offset, thickness, edge softness, wave phase, color, and pointer sensitivity. A shared set of three sines bends the ribbon along its length: the shader projects the world point onto the band’s axis, sums `amplitude * sin(frequency * (along - time * speed) + phase)`, then masks by distance across the band. Soft edges use `smoothstep` around the half-width; a zero edge is a hard cut.

The pointer comes from SpotPlane’s NDC, scaled into the orthographic frustum (`pointer * camera.right/top`). Each band adds `screenOffset * sensitivity` to its offset, so a sensitivity of 0 stays put and a higher value lets that ribbon follow the cursor.

---

## LavaPlane

`src/ThreeJS/Stage/LavaPlane.js` is a field of seven metaballs. Positions are `sin` paths inside the camera view (`travel` scales how far they roam), not the grid, which extends past the screen. Radius, frequency, and phase are seeded once with a Mulberry32 PRNG (seed 7) so the layout is the same on every reload. Colors cycle through `colorA`, `colorB`, and `colorC`.

The fragment shader smooth-mins the distance to each blob (`smin`, polynomial k = `smoothness`). Blob color is an inverse-square weighted mix of the nearby centers, slightly darkened toward the interior. `edgeSoftness` feathers the field into `baseColor`.

If `pointerEnabled` is on, the damped SpotPlane position is an extra blob of `pointerRadius`, colored with `colorA`. Setting the radius uniform to 0 removes it.

---

## BandsPlane

`src/ThreeJS/Stage/BandsPlane.js` fills the ground with six stripes of a four-color palette (`colorA` through `colorD`, then the cycle repeats). The stripes run along a shared angle. Three sines, at falling amplitudes (1, 0.5, 0.25), bend the boundaries. Each wave has its own time accumulator, so changing a speed slider only affects the future rate and does not jump the pattern.

Thickness is a base value times a per-band seed from another Mulberry32 sequence (seed 11). `thicknessVariance` is how far those seeds may pull each stripe. The shader wraps the along-axis coordinate by the total thickness, finds which band contains the point, and blends into the previous and next palette colors across `edgeSoftness`.

Bands do not read the pointer.

---

## ImagePlane

`src/ThreeJS/Stage/ImagePlane.js` is a photo ground that is not currently selectable. Stage still constructs it, but the `image` entry in `grounds` is commented out, so `setGround` never shows it and it has no debug folder.

When it is wired back in, it is the same scaled XZ plane with a `MeshBasicMaterial` mapped to `/textures/landscape.jpg`. `Resources` loads that texture asynchronously; if it is not ready in the constructor, ImagePlane waits for the orchestrator `"ready"` event. `syncCover()` then implements CSS-style `object-fit: cover` by repeating and offsetting the texture so the image fills the plane and the overflow is cropped, centered.

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
| **scene**  | Background color; ground mode `spot` / `aurora` / `lava` / `bands`; HTML overlay                      |
| **spot**   | Radius, falloff, colors, damping. Shown only while spot is the active ground                         |
| **aurora** | Three bands (angle, offset, thickness, edge, wave offset, pointer sensitivity, color) and shared waves |
| **lava**   | Blob radius and variance, smoothness, edge, speed, travel, pointer blob, four colors                 |
| **bands**  | Angle, offset, thickness and variance, three waves, edge, four colors                                |
| **planes** | Grid layout, IOR, thickness, jitter, chroma, grain, rim/trough SDF, highlight, tonemap, `showNormals` |

---

## Frame recap

A single frame, in order:

1. Every ground updates. SpotPlane raycasts the pointer onto the ground plane and damps the spot. Aurora, lava, and bands advance their own motion; aurora and lava also read that pointer.
2. PlaneGrid writes shader uniforms (including the current view-projection).
3. PlaneGrid hides the tiles, renders background + the visible ground into `grabTarget`, shows the tiles again.
4. The WebGLRenderer renders the full scene. Each glass fragment reconstructs a fake height-field normal, refracts into the grab texture (with optional RGB split), dithers with blue noise, and adds fresnel/edge highlights.

The “cubes” are never extruded meshes. The thickness, rim, and frost are all in the PlaneGrid fragment shader, sampling a ground that was captured a few milliseconds earlier in the same frame.

---

## References/Credits

- Calculation reference for the fake rim height-field normal [https://github.com/rxing365/html-liquid-glass-effect-webgl]
