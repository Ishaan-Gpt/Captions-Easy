# Enterprise Video Editing Suite — Master NLE Requirements (`nle-requirements.md`)

---

### A. Multi-Track Magnetic Timeline & Trimming Engine (Phase 1)
- Trimming Primitives: Ripple Trim (`B`), Roll Edit (`N`), Slip Media (`Y`), Slide Track (`U`), Smart Snapping.
- Multi-track architecture: Unlimited Video (`V1..Vn`), Audio (`A1..An`), and Captions (`C1`) lanes.

### B. Color Science & Real-Time Video Scopes Suite (Phase 2)
- 3D LUT Engine: Full parser for `.cube` format with 32-bit floating point trilinear color interpolation.
- Real-Time Video Scopes: Waveform Parade, Vectorscope, RGB Histogram, False Color Scale.

### C. Node-Based VFX Compositing System (Phase 3)
- Topological DAG Evaluator: Kahn's algorithm for dependency evaluation.
- Visual Graph Canvas & Node Inspector (Keying, LUTs, Blur, Transforms).

### D. Extreme Low-Latency Pipeline (Phase 4)
- WebCodecs GOP Ring Buffer, OPFS Disk Cache Worker, WSOLA Audio Worklet, Zero-Copy WebGPU Compositor.

### H. Video Overlays, Motion Graphics & Visual Compositing Pipeline (Phase 5)
- Zero-DOM WebGPU Compositing pipeline (`OffscreenCanvas`).
- Remotion-compatible mathematical animation curves (`interpolate()`, `spring()`).
- Multi-line kinetic typography, SMPTE safe-zone bounds (80%/90%), SDF font atlases.
- 14 WGSL fragment blend modes with automatic clamping, 2D Affine transform matrices, Bezier keyframing.
- Media Asset Overlays, Generator Clips (Solid, Gradients, SMPTE Color Bars), Shape Masks, Gaussian edge feathering, Track Mattes (Luma/Alpha).

---

### I. Integrated DAW & Time Remapping Engine (Phase 6)

#### 1. Core Synchronization Foundation
- **Master Clock Architecture:** Implement an `AudioContext`-driven master clock. The video playhead must slave to the hardware audio clock to prevent drift over long timelines, rather than relying on `requestAnimationFrame` timing.
- **Sub-Frame Precision:** Audio edits, keyframes, and cuts must support sub-frame accuracy (sample-accurate editing at 48kHz / 192kHz), detaching from the video frame grid (e.g., 24fps or 60fps).

#### 2. Advanced Audio Processing Pipeline (DAW)
- **Node-Based Audio Routing:** Implement a Web Audio API `AudioWorklet` graph for routing. Support infinite tracks, busing (submixes), and Master Out routing.
- **Real-Time FX Chain:**
  - Parametric EQ (multi-band with Q-factor).
  - Dynamics Processing: Compressor, Limiter, Noise Gate.
  - Spatial FX: Reverb (convolution-based) and Delay.
- **Automation:** Bezier curve keyframing for volume, panning, and all plugin parameters.
- **Loudness Metering:** Native LUFS (Loudness Units relative to Full Scale) monitoring for broadcast compliance.

#### 3. Time Remapping & Speed Ramping (Video + Audio)
- **Variable Speed Ramping:** Bezier keyframe curves on clip speed (e.g., smoothly ramping from 100% to 500% and down to 10%).
- **Video Frame Interpolation:** 
  - *Nearest Neighbor:* For rigid, stylistic cuts.
  - *Frame Blending:* Crossfading adjacent frames for basic smoothing.
  - *Optical Flow:* AI-driven pixel motion analysis to synthesize entirely new intermediate frames for ultra-smooth slow motion.
- **Audio Pitch Correction (WSOLA):** Implement a Waveform Similarity Overlap-Add (WSOLA) algorithm within an `AudioWorklet`. When video speed changes, audio must remain pitch-corrected (no "chipmunk" or "Darth Vader" voices) without digital artifacting.

---

### J. Onboarding Flow, Unauthenticated Sandbox & Export Gate (Phase 7)

#### 1. Routing & Button Behavior
- **"Start Now" / "Start Free Trial" Button:**
  - Must route directly to the main video editor workspace (`/editor` or main timeline route) in guest/sandbox mode.
  - Must **never** redirect or popup an authentication modal/page upon click.
- **Dedicated "Sign In" / "Log In" Button:**
  - Must route to the authentication interface (`/auth`, `/signin`, or Supabase Auth modal).
  - Isolated strictly to user intent for logging into existing accounts.

#### 2. Local-First Guest Sandbox
- Unauthenticated users must have full access to:
  - Timeline operations (trim, split, ripple, roll, slip, slide).
  - AudioWorklet playback, pitch stretching (WSOLA), and master clock sync.
  - Motion graphics, kinetic text animation, and WebGPU overlay compositing.
  - Waveform previews, video scopes, and real-time playback.
- All timeline changes, loaded clips, and edits must persist locally in memory or OPFS/IndexedDB without requiring user credentials.

#### 3. Export Authentication Gate
- When clicking the **"Export Video" / "Render"** button:
  - If authenticated: Proceed directly with WebCodecs hardware rendering and download.
  - If unauthenticated (Guest): Pause the export pipeline and display an authentication modal/gate ("Sign in or create a free account to download your exported video").
  - Preserved State: After authentication completes, the user must stay on the exact timeline state without losing any edits or requiring a page reload.

