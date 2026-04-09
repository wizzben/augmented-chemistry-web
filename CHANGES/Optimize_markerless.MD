# Markerless Mode Visual Feedback & Interaction Robustness — Plan

## Problem Statement

Markerless mode currently gives the user **zero visual feedback** about where their hands are relative to the 3D scene. The user can't tell:
1. Whether their left (grabber) hand is in the camera's field of view
2. Where their index finger is pointing relative to atoms/ghosts
3. Whether their right (rotation) hand is being tracked
4. Whether rotation is actually happening
5. When a pinch is being recognized vs. missed

The HandOverlay draws a 2D skeleton on a canvas overlay, but this is **disconnected from the 3D scene**. The skeleton floats in 2D space with no relationship to the atoms it needs to interact with. The grabber sphere (`_grabbedSphere`) exists in 3D but is a tiny translucent ball that's easy to miss.

Additionally, the pinch gesture needs to be more robust: the current `PINCH_ON_THRESHOLD = 0.04` normalized distance is very tight, and there's no visual feedback about how close the user is to triggering a pinch.

## Root Cause Analysis

The current design treats the 2D hand overlay and the 3D molecule scene as separate worlds. There are no visual bridges between them:
- No **targeting line** from fingertip to the nearest atom
- No **crosshair/cursor** projected into the 3D scene showing where the finger is pointing
- No **proximity indicator** showing distance to nearest atom
- No **pinch progress indicator** showing how close thumb and index are
- No **rotation feedback** on the rotation hand (no visual confirmation it's working)
- No **"hand not detected"** state indicator

---

## Alternative Approaches for the Grabber Hand

### Option A: Direct Fingertip Cursor (recommended)

**How it works:** A visible 3D cursor (ring or crosshair) is projected into the scene at the z=0 plane where the finger is pointing. A dashed line connects the cursor to the nearest unsaturated atom when within range. The cursor changes color/size based on state (idle, approaching, docking). Pinch progress is shown as a closing ring around the cursor.

**Pros:** Intuitive. The user sees exactly where they're "pointing" in 3D space. Works like a laser pointer. Natural mapping between hand movement and cursor movement.

**Cons:** Slight disconnect between 2D hand position and 3D cursor position (parallax from camera projection). Requires the user to learn that their index finger controls a cursor.

**Feasibility:** High. We already have `_updateGrabbedSphere` which does the screen-to-3D unprojection. We just need to make the cursor always visible (not just in GRABBED state) and add connecting lines.

### Option B: Raycast Beam from Screen Edge

**How it works:** A visible beam/ray enters the scene from the screen edge corresponding to the finger's Y position and extends toward the molecule. Like a laser pointer entering from outside the frame.

**Pros:** Very clear visual affordance. Familiar metaphor (laser pointer).

**Cons:** Harder to aim precisely. Weird angle if finger is at screen center. More complex to implement.

**Feasibility:** Medium. Unusual UX, might confuse users.

### Option C: Virtual Hand in 3D Scene

**How it works:** A simplified 3D hand model (or just fingertip sphere) is rendered in the Three.js scene at a position derived from the hand landmarks. The virtual hand "reaches into" the molecule.

**Pros:** Most immersive. Direct spatial mapping.

**Cons:** Depth mapping from 2D webcam is noisy. The hand would jitter in Z. Requires careful calibration of the mapping from normalized [0,1] coords to 3D scene coords. The z=0 plane assumption is too simplistic for a "reaching" gesture.

**Feasibility:** Low-medium. Depth estimation from a single 2D camera is inherently approximate. Would require significant calibration work.

### Option D: Abandon Hand Grabber, Use Click-to-Select

**How it works:** The left hand only controls a 2D cursor on screen. The atom grab list becomes clickable via the cursor (pinch = click). Once an element is selected, the user moves their finger over the molecule and pinch-clicks on a ghost sphere to place the atom. Essentially the same as desktop mouse mode but with hand-controlled cursor.

**Pros:** Most reliable. Click-to-select is a well-understood interaction. No need for complex state machine.

**Cons:** Less "magical" than hand grabbing. Feels like a mouse replacement rather than a new interaction paradigm.

**Feasibility:** Very high. Simplest to implement. Reuses existing DesktopControls logic with a different input source.

### Recommendation

**Option A (Direct Fingertip Cursor)** is the best balance of feasibility, visual clarity, and "wow factor." It keeps the core grab-and-place metaphor but adds the visual bridges the user needs. Option D is the fallback if A proves too imprecise in practice.

---

## Detailed Plan: Option A — Direct Fingertip Cursor with Full Visual Feedback

### Step 1: Always-visible 3D cursor at fingertip position

**Files:** `HandObjectManager.ts`, `HandOverlay.ts`

**What changes:**
- The grabbed sphere (`_grabbedSphere`) currently only shows in GRABBED/APPROACHING/DOCKING states. Change it to show **whenever the grabber hand is detected**, in ALL states (IDLE, BROWSING, GRABBED, APPROACHING, DOCKING).
- In IDLE/BROWSING: render as a small white ring/torus (not a filled sphere) at the z=0 plane position. This is the "cursor."
- In GRABBED: render as a filled sphere colored by the selected element (current behavior, but larger and more visible -- 0.4 radius instead of 0.3).
- In APPROACHING: pulse the cursor (scale oscillation via `sin(time)`) to indicate "getting close."
- In DOCKING: render with a bright green tint to indicate "ready to place."
- Add a **second mesh** (`_cursorRing`): a flat torus/ring that always faces the camera (billboard). This acts as the crosshair. The grabbed sphere sits inside it.

**Visual states of the cursor:**

| State | Cursor appearance |
|-------|------------------|
| No hand detected | Nothing |
| IDLE (hand visible, no element) | Small white ring, 60% opacity |
| BROWSING (over atom list) | Ring highlights to match hovered element color |
| GRABBED (element selected) | Filled sphere in element color + white ring |
| APPROACHING (near atom) | Sphere pulses + connecting line to atom |
| DOCKING (over ghost) | Sphere + ring turn green, "ready to place" |

### Step 2: Targeting line from cursor to nearest atom

**Files:** `HandObjectManager.ts`

**What changes:**
- When the grabber hand has an element selected (GRABBED state) and there are atoms in the molecule, draw a **dashed line** from the 3D cursor position to the nearest unsaturated atom's world position.
- Use `THREE.Line` with a `LineDashedMaterial` for the dashed effect. Color: white at 50% opacity. Dash pattern: `dashSize: 0.15, gapSize: 0.1`.
- Update the line endpoints every frame. Hide the line when no atom is within `ATOM_APPROACH_PX * 2` (show it earlier than the approach threshold so the user has guidance).
- When in APPROACHING state, the line becomes **solid and colored** (element color) to indicate active connection.
- When in DOCKING state, the line connects to the specific ghost sphere.

### Step 3: Pinch progress indicator

**Files:** `HandOverlay.ts`, `GestureDetector.ts`

**What changes:**
- Add `pinchProgress: number` (0 to 1) to `GestureDetector`. Computed as: `1 - clamp((dist - PINCH_ON_THRESHOLD) / (PINCH_OFF_THRESHOLD - PINCH_ON_THRESHOLD), 0, 1)`. This goes from 0 (fingers apart) to 1 (pinched).
- Export the raw `thumbIndexDistance` so the overlay can use it.
- On the 2D overlay, draw a **closing arc** around the index fingertip. The arc sweeps from 0 degrees (fingers far apart) to 360 degrees (pinch triggered). Color transitions from white to green as it closes.
- When pinch triggers, flash the arc green for 2 frames.
- Widen the pinch threshold slightly: `PINCH_ON_THRESHOLD = 0.05` (was 0.04). This makes it easier to trigger.

### Step 4: Rotation hand feedback

**Files:** `HandOverlay.ts`, `HandObjectManager.ts`

**What changes:**
- When the rotation hand is detected and the palm is open (rotating):
  - Draw a **rotation arc indicator** on the 2D overlay near the palm center. This is a curved arrow that shows the direction of rotation being applied.
  - The arc's sweep angle corresponds to how much rotation delta is being applied this frame (scaled up for visibility). Color: soft blue (matching current skeleton color).
- When the rotation hand makes a fist (zooming):
  - Draw a **zoom indicator**: two arrows (up/down) near the fist, with the active direction highlighted. Show a small "+" (zoom in) or "-" (zoom out) label.
- When the rotation hand is NOT detected:
  - Show a translucent text hint in the top-right of the canvas overlay: "Show right hand to rotate" (fades in after 2 seconds of no detection, fades out when hand appears).

### Step 5: "Hand not detected" indicators

**Files:** `HandOverlay.ts`, `HandObjectManager.ts`

**What changes:**
- Track how many frames since each hand was last seen.
- After 60 frames (~1 second) without the grabber hand: show a translucent prompt on the 2D overlay, positioned left-center: "Show left hand" with a hand icon outline.
- After 60 frames without the rotation hand: show on right-center: "Show right hand."
- These hints fade in over 0.3s and fade out immediately when the hand reappears.
- Also show the current state in the info bar at the bottom: "Left: grabbing Carbon | Right: rotating" or "Left: not visible | Right: zooming"

### Step 6: Robust pinch for first atom placement

**Files:** `HandObjectManager.ts`

**What changes:**
- Currently `_stateGrabbed` with an empty molecule fires `addFirstAtom()` on pinch. The user has no visual indication of WHERE the first atom will be placed.
- Change: when molecule is empty and element is grabbed, show a **ghost atom** at the cursor's 3D position (the z=0 plane intersection). This ghost atom pulses gently.
- On pinch: place the atom at the origin (current behavior, since MoleculeBuilder always places at origin). Flash the ghost to solid, then transition to the real atom mesh.
- The targeting line is not needed here (no existing atoms to connect to). Instead, show a small "Pinch to place first atom" text near the cursor on the 2D overlay.

### Step 7: Improve pinch detection robustness

**Files:** `GestureDetector.ts`

**What changes:**
- Widen `PINCH_ON_THRESHOLD` from 0.04 to **0.055** (more forgiving).
- Reduce `PINCH_COOLDOWN_MS` from 300 to **200** (faster repeat if user wants to place multiple atoms quickly).
- Add a **confirmation hold**: instead of triggering on the instant the threshold is crossed, require the pinch to be held for **3 consecutive frames** (about 100ms at 30fps). This prevents false triggers from hand jitter while still feeling responsive.
- The pinch progress arc (Step 3) gives the user visual feedback about how close they are, reducing frustration from missed pinches.

### Step 8: Info bar state display

**Files:** `main.ts`

**What changes:**
- Update the info bar text dynamically based on the current state:
  - No hands: "Show your hands to the camera"
  - Only rotation hand: "Left hand: show to grab atoms"
  - Only grabber hand, IDLE: "Move finger over element list to pick"
  - BROWSING: "Pinch to grab [Element Name]"
  - GRABBED, no atoms: "Pinch anywhere to place first atom"
  - GRABBED, has atoms: "Move toward an atom to bond"
  - APPROACHING: "Move closer to a bond position"
  - DOCKING: "Pinch to place [Element Name]"
- This gives the user step-by-step guidance at all times.

---

## Implementation Order

Steps 1-3 first (cursor, targeting line, pinch indicator) -- these are the critical visual bridges. Then steps 4-5 (rotation feedback, hand detection hints). Then steps 6-8 (first atom, robustness, info bar). Each step is independently testable.

## Files Modified (summary)

| File | Changes |
|------|---------|
| `src/hand/HandObjectManager.ts` | Always-visible cursor, targeting line, first-atom ghost, state export for info bar |
| `src/hand/HandOverlay.ts` | Pinch arc, rotation indicator, zoom indicator, hand-not-detected hints |
| `src/hand/GestureDetector.ts` | `pinchProgress`, wider threshold, confirmation hold, export thumb-index distance |
| `src/main.ts` | Dynamic info bar text based on grabber state + hand visibility |
| `index.html` | Minor CSS if needed for hint text positioning |

No new files. No new dependencies. All changes are within the existing module boundaries.
