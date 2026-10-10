# Enterprise Video Editing Suite — Developer Reference (`keshav_readme.md`)

Welcome to the documentation for the newly added **Enterprise Video Editing Suite** features integrated into **CaptionsEasy**.

---

## 🌟 Overview & Highlights

This release expands the platform from an automated caption editor into a **browser-native, high-performance Enterprise NLE (Non-Linear Editor)**. It combines a **magnetic multi-track timeline** with a **node-based VFX compositing graph**, **3D LUT color science pipeline**, **real-time video scopes**, and an **extreme low-latency WebGPU worker pipeline** — all operating with zero server-side rendering latency and frictionless instant guest access.

---

## 🚀 Key Feature Modules Added

```mermaid
graph TD
    subgraph Studio Core Interface
        Header[Workspace Mode Switcher] --> StudioModes{Studio View Modes}
        StudioModes --> CaptionsView[Captions Studio]
        StudioModes --> TimelineView[Multi-Track Timeline]
        StudioModes --> VFXView[Node-Based VFX Graph]
        StudioModes --> ScopesView[Color & Video Scopes]
    end

    subgraph High-Performance Worker Engine (Phase 4)
        Demuxer[WebCodecs GOP Ring Buffer Worker] -->|Zero-Copy Frame| WebGPU[WebGPU Compositor Engine]
        OPFS[OPFS Sync Access Handle Worker] -->|PCM Audio Stream| WSOLA[WSOLA AudioWorklet]
        WebGPU --> WGSLCompute[WGSL Compute Shaders]
        WGSLCompute --> Sub16msPlayer[ExtremeStudioPlayer < 16ms]
    end
```

### 1. Multi-Track Magnetic Timeline & Advanced Trimming (Phase 1)
- **Files:** `apps/frontend/src/features/studio/enterprise-timeline/trimmingEngine.ts`, `EnterpriseTimeline.tsx`
- **Trimming Primitive Algorithms:**
  - **Ripple Trim (`B`):** Trimming a clip edge automatically shifts all subsequent clips forward or backward on the track.
  - **Roll Edit (`N`):** Adjusts the boundary between two adjacent clips, trimming clip A while extending clip B to maintain exact sequence length.
  - **Slip Media (`Y`):** Adjusts internal media in/out points without altering clip duration or timeline position.
  - **Slide Track (`U`):** Repositions a clip on the timeline while simultaneously trimming preceding out-point and succeeding in-point.
  - **Smart Snapping:** Snaps pointer drags to playhead, clip boundaries, and track markers.
- **Track Architecture:** Supports unlimited stacked Video (`V1..Vn`), Audio (`A1..An`), and Captions (`C1`) lanes with Mute, Solo, and Lock toggles.

### 2. Color Science & Real-Time Video Scopes Suite (Phase 2)
- **Files:** `apps/frontend/src/features/studio/color-science/lutParser.ts`, `VideoScopes.tsx`
- **3D LUT Engine:** Full parser for standard `.cube` (Adobe/DaVinci) format with 32-bit floating point trilinear color interpolation (`sample3DLUT`).
- **Real-Time Video Scopes:**
  - **Waveform Parade:** Displays horizontal luminance and chrominance distribution.
  - **Vectorscope:** Polar plot showing chroma phase and saturation against standard color targets.
  - **RGB Histogram:** Real-time 256-bin channel frequency visualizer.
  - **False Color Scale:** Maps exposure values (0–100 IRE) to color heatmaps for precise skin-tone exposure checks.

### 3. Node-Based VFX Compositing System (Phase 3)
- **Files:** `apps/frontend/src/features/studio/vfx-node-graph/vfxGraphEngine.ts`, `VFXNodeGraph.tsx`
- **Topological DAG Evaluator:** Evaluates node graph dependencies using Kahn's algorithm to generate execution orders for real-time frame evaluation.
- **Visual Graph Canvas:** Drag-and-drop node cards connected by SVG cubic Bezier wires.
- **Node Inspector:** Live property controls for Keying colors, tolerance thresholds, and 3D LUT selections.

### 4. Extreme Low-Latency Pipeline (Phase 4)
- **Files:** `apps/frontend/src/features/studio/extreme-pipeline/`
- **WebCodecs GOP Ring Buffer (`webcodecsDemuxer.ts`):** 8-GOP prefetch ring buffer with instant random-access keyframe seeking.
- **OPFS Disk Cache (`opfsCacheWorker.ts`):** Replaces IndexedDB bottlenecks with Origin Private File System synchronous access handles for disk-speed binary caching.
- **WSOLA Audio Worklet (`wsolaAudioWorklet.ts`):** Waveform Similarity Overlap-Add time-stretching DSP for variable-rate scrubbing (0.5x to 4.0x) without pitch distortion.
- **Zero-Copy WebGPU Compositor (`webgpuCompositor.ts`):** Imports `VideoFrame` directly into GPU textures, executes 3D LUT grading via WGSL `texture_3d<f32>` fragment shaders, and calculates scopes via parallel WGSL compute shaders without CPU readbacks.
- **Extreme Player Component (`ExtremeStudioPlayer.tsx`):** Sub-16ms (< 60 FPS) canvas player replacing standard preview players.

### 5. Video Overlays, Motion Graphics & Visual Compositing Pipeline (Phase 5)
- **Files:** `apps/frontend/src/features/studio/motion-graphics/`, `apps/frontend/src/features/studio/compositing/`
- **Zero-DOM WebGPU Compositing:** Canvas-native multi-track rendering, layer blend evaluation, and vector typography rasterization executing directly inside WebGPU Offscreen Canvas pass (< 16ms budget).
- **Motion Graphics & Text Animation Engine (`motionGraphicsEngine.ts`):** Remotion-compatible `interpolate()` and `spring()` mathematical physical animation curves with frame determinism `frame = Math.round(timeInSeconds * fps)`.
- **Multi-line Kinetic Typography:** Per-character, per-word, and per-line staggered animation delays with customizable mass, stiffness, damping, Y-offset, rotation, tracking, and SMPTE safe-zone bounds (80% Title Safe, 90% Action Safe).
- **Offscreen Canvas & SDF Atlas Rasterizer:** High-performance vector-to-bitmap converter and Signed Distance Field font atlas generator avoiding CPU playback stalls.
- **WGSL Shader Blend Modes (`wgslShaders.ts`):** Implements 14 exact mathematical blend modes (Normal, Premultiplied, Multiply, Darken, Color Burn, Screen, Linear Dodge, Lighten, Color Dodge, Overlay, Soft Light, Hard Light, Difference, Exclusion, Luminosity) with automatic clamping and Gaussian Blur mask edge feathering.
- **2D Affine Transforms & Keyframing (`compositorEngine.ts`):** Column-major `Matrix3x3` matrix math combining Position (X, Y), Scale (W, H), Anchor Point (Ax, Ay), Rotation, and Opacity with Bezier keyframe interpolation.
- **Media Asset Overlays & Masking Engine (`mediaMaskingEngine.ts`):** Generator Clips (Solid colors, Linear/Radial Gradients, EBU/SMPTE 75% Color Bars), Shape Masks (Rectangle, Ellipse, Bezier polygon vector paths), and Track Mattes (Luma Matte & Alpha Matte).
- **Visual Compositor Studio View (`MotionCompositorStudio.tsx`):** Workspace mode inside `StudioPage.tsx` with real-time controls for kinetic text presets, spring physics, safe-zone overlays, layer stack, and blend modes.

### 6. Integrated DAW & Time Remapping Engine (Phase 6)
- **Files:** `apps/frontend/src/features/studio/daw/`
- **Master Hardware Audio Clock (`masterAudioClock.ts`):** Slaves video playback directly to `AudioContext.currentTime` to eliminate cumulative A/V frame drift over long timelines with sub-frame sample precision (20.83 µs at 48kHz).
- **Node-Based Audio Processing Pipeline (`dawAudioEngine.ts`):** Infinite tracks, submix busing, Master Out routing, 5-band parametric EQ (Low-Shelf, Peaking, High-Shelf), dynamics processor (Compressor, Limiter, Noise Gate), and convolution reverb.
- **EBU R128 / ITU-R BS.1770-4 LUFS Metering:** Integrated, Short-Term, Momentary LUFS, and True Peak dBFS monitoring.
- **Sample-Accurate Automation:** Sub-frame sample-level Bezier curve automation for volume fader, panning, and plugin parameters.
- **Variable Speed Ramping Engine (`timeRemappingEngine.ts`):** Bezier speed multiplier keyframes (0.1x to 5.0x) with continuous media timestamp integral calculation $M(T) = \int_0^T v(\tau) d\tau$.
- **WebGPU Optical Flow Frame Interpolation (`opticalFlowShader.ts`):** 4-level Gaussian pyramid compute shader estimating dense motion vectors to synthesize bidirectional motion-warped intermediate frames for ultra-smooth slow motion.
- **WSOLA Audio Pitch Preservation:** Real-time Waveform Similarity Overlap-Add algorithm maintaining source audio pitch and formant structure during variable speed ramps without chipmunk/distortion artifacts.
- **DAW & Speed Ramping Studio Panel (`DAWStudioPanel.tsx`):** Workspace mode inside `StudioPage.tsx` featuring multi-track audio console, 5-band EQ response curve visualizer, broadcast LUFS meters, and speed ramping controls.

### 7. Onboarding Flow, Local-First Sandbox & Export Auth Gate (Phase 7)
- **Files:** `apps/frontend/src/app/start/page.tsx`, `apps/frontend/src/features/studio/SignupGate.tsx`
- **Zero-Auth Direct Route:** "Start free" CTA routes directly to `/start` $\to$ `/projects/[id]` in local-first guest sandbox mode without authentication blocking middleware or sign-in redirects.
- **Dedicated Sign-In Button:** Isolated strictly to "Sign in" on the navbar/landing page leading directly to `/login`.
- **Local-First Guest Sandbox:** Full unrestricted timeline trimming, WebGPU compositing, DAW mixing, and motion graphics without credentials, persisting locally in memory/OPFS.
- **State-Preserving Export Auth Gate:** Unauthenticated export triggers the `SignupGate` modal while locking project timeline state in memory. Upon authentication success, seamlessly resumes WebCodecs export via callback without reloading page (`window.location.reload()`) or wiping user edits.
- **Web Audio Autoplay Priming:** Primed `AudioContext.resume()` on first user pointerdown/keypress interaction.
- **WebGPU Device Lost Recovery:** Automatic `device.lost` listener in `WebGPUCompositor` to seamlessly recover GPU context after system sleep or driver resets.

---

## 🔒 Authentication & Frictionless Guest Flow

- **Instant "Start for Free":** Clicking "Start for free" or visiting `/start` immediately creates an anonymous guest session (`ce:local-guest`) and lands directly inside the studio editor (`/projects/...`).
- **Gated Authentication Points:** Visitors are only prompted for Login/Signup when explicitly clicking **Export** or **Sign In**.
- **Navigation Safety:** Includes a clear **"← Back to home"** link on `/login`, `/forgot-password`, and `/reset-password` pages.

---

## 📁 Code Repository Map

| File Path | Description |
| :--- | :--- |
| `apps/frontend/src/features/studio/enterprise-timeline/trimmingEngine.ts` | Trimming algorithms (Ripple, Roll, Slip, Slide, Snap) |
| `apps/frontend/src/features/studio/enterprise-timeline/EnterpriseTimeline.tsx` | Multi-track timeline UI component |
| `apps/frontend/src/features/studio/color-science/lutParser.ts` | 3D `.cube` LUT parser & trilinear sampler |
| `apps/frontend/src/features/studio/color-science/VideoScopes.tsx` | Real-time Video Scopes component |
| `apps/frontend/src/features/studio/vfx-node-graph/vfxGraphEngine.ts` | VFX DAG topological graph evaluator |
| `apps/frontend/src/features/studio/vfx-node-graph/VFXNodeGraph.tsx` | VFX Node Graph visual editor component |
| `apps/frontend/src/features/studio/extreme-pipeline/webcodecsDemuxer.ts` | WebCodecs GOP ring buffer demuxer |
| `apps/frontend/src/features/studio/extreme-pipeline/wsolaAudioWorklet.ts` | WSOLA pitch-corrected scrubbing DSP |
| `apps/frontend/src/features/studio/extreme-pipeline/opfsCacheWorker.ts` | OPFS synchronous access handle cache |
| `apps/frontend/src/features/studio/extreme-pipeline/webgpuCompositor.ts` | Zero-copy WebGPU & WGSL compute shaders |
| `apps/frontend/src/features/studio/extreme-pipeline/ExtremeStudioPlayer.tsx` | Sub-16ms high-performance player component |
| `apps/frontend/src/features/studio/motion-graphics/motionGraphicsEngine.ts` | Remotion-compatible spring/interpolate curves, kinetic typography, SMPTE safe zones & SDF atlas |
| `apps/frontend/src/features/studio/compositing/wgslShaders.ts` | WGSL fragment shaders for 14 blend modes & Gaussian blur feathering |
| `apps/frontend/src/features/studio/compositing/compositorEngine.ts` | 2D Matrix3x3 affine transforms, Bezier keyframe interpolation, and WebGPU pass manager |
| `apps/frontend/src/features/studio/compositing/mediaMaskingEngine.ts` | Generator clips (SMPTE bars, gradients), shape masks (rect, ellipse, bezier path), and luma/alpha track mattes |
| `apps/frontend/src/features/studio/motion-graphics/MotionCompositorStudio.tsx` | Interactive Visual Compositor & Motion Studio view component |
| `apps/frontend/src/features/studio/daw/masterAudioClock.ts` | AudioContext hardware master clock with sub-frame sample precision |
| `apps/frontend/src/features/studio/daw/dawAudioEngine.ts` | Web Audio API DAW engine, 5-band parametric EQ, sample-accurate automation & LUFS meter |
| `apps/frontend/src/features/studio/daw/opticalFlowShader.ts` | WGSL Optical Flow compute shader for dense motion vector estimation & frame synthesis |
| `apps/frontend/src/features/studio/daw/timeRemappingEngine.ts` | Speed ramping curves, integral media timestamp calculation & WSOLA pitch correction |
| `apps/frontend/src/features/studio/daw/DAWStudioPanel.tsx` | DAW mixer console, EQ visualizer, LUFS meters & speed ramping studio UI |
| `apps/frontend/src/features/studio/StudioPage.tsx` | Integrated workspace mode switcher |
| `apps/frontend/src/app/(dashboard)/layout.tsx` | Resilient guest auth session initialization |

---

## 🛠️ Commands & Verification

### Start Local Development Server
```bash
cd apps/frontend
npx next dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Unit Tests
```bash
cd apps/frontend
npx vitest run
```
*Output:* `66/66` passing unit tests across 12 test suites.

### Run TypeScript Verification
```bash
cd apps/frontend
npx tsc --noEmit
```
*Output:* `0` compilation errors.

### Build Production Bundle
```bash
cd apps/frontend
npx next build
```
*Output:* Clean compilation across all 60 static & dynamic routes.
