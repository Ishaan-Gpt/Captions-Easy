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
*Output:* `34/34` passing unit tests across 6 test suites.

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
