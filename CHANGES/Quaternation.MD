# Hand-Driven Relative Quaternion Rotation for a Molecule Viewer

## Goal

Use the **right hand** as a **clutchable rotational input device** to rotate a 3D molecule in all directions.

The molecule rotation is driven by **relative hand orientation changes**, not by absolute hand pose.

---

## Core Interaction Model

### Interaction states

Define the interaction as a finite state machine:

1. **No Hand**
2. **Hand Detected**
3. **Ready**
4. **Grabbed**
5. **Rotating**
6. **Released**
7. **Tracking Lost**

### Required user feedback

Always show the current state on screen.

Recommended feedback labels:

* `No hand detected`
* `Right hand detected`
* `Ready to rotate`
* `Grab active`
* `Rotating`
* `Released`
* `Tracking lost`

Also show:

* right-hand indicator
* grab indicator
* optional confidence indicator

---

## High-Level System Structure

## 1. Tracking layer

Use MediaPipe Hand Landmarker to produce:

* right-hand landmarks
* right-hand world landmarks
* handedness
* timestamp

Output per frame:

```ts
type HandTrackingFrame = {
  detected: boolean
  handedness: 'Left' | 'Right' | null
  confidence: number
  landmarks: Vec3[] | null
  worldLandmarks: Vec3[] | null
  timestamp: number
}
```

---

## 2. Interaction layer

Consumes tracking data and produces:

* current UI state
* engage/release state
* hand quaternion
* hand delta quaternion
* target molecule quaternion

Output per frame:

```ts
type RotationControlFrame = {
  state:
    | 'NO_HAND'
    | 'HAND_DETECTED'
    | 'READY'
    | 'GRABBED'
    | 'ROTATING'
    | 'RELEASED'
    | 'TRACKING_LOST'
  grabActive: boolean
  handQuaternion: Quaternion | null
  deltaQuaternion: Quaternion | null
  targetObjectQuaternion: Quaternion | null
}
```

---

## 3. Rendering layer

three.js applies:

* target quaternion
* smoothing
* state feedback UI
* molecule rendering

---

## Input Filtering Rules

Use only the **right hand**.

Ignore frame if any of the following is true:

* no hand detected
* handedness is not `Right`
* confidence below threshold
* required landmarks missing
* hand frame cannot be constructed

When ignored:

* freeze molecule
* update UI state accordingly

---

## Grab / Release Model

Use a **pinch-based clutch**.

### Pinch ratio

```math
r = ||thumbTip - indexTip|| / ||indexMCP - pinkyMCP||
```

### Hysteresis

Use two thresholds:

* engage when `r < pinchOnThreshold`
* release when `r > pinchOffThreshold`

Constraint:

```text
pinchOffThreshold > pinchOnThreshold
```

### Recommended state flow

* right hand detected + not pinching → `READY`
* pinch begins and becomes stable → `GRABBED`
* hand moves while grabbed → `ROTATING`
* pinch released → `RELEASED`
* hand lost during grab → `TRACKING_LOST`

---

## Hand Pose Representation

Build a stable hand coordinate frame from palm landmarks.

Required landmarks:

* `wrist`
* `indexMCP`
* `middleMCP`
* `pinkyMCP`

### Basis vectors

```math
x = normalize(indexMCP - pinkyMCP)
```

```math
y' = normalize(middleMCP - wrist)
```

```math
z = normalize(x × y')
```

```math
y = normalize(z × x)
```

### Rotation matrix

Construct a rotation matrix from:

* `x`
* `y`
* `z`

Then convert it to a quaternion:

```text
q_hand = Quaternion.fromRotationMatrix(handBasisMatrix)
```

---

## Relative Rotation Model

Store the previous hand quaternion when grab starts.

### Delta quaternion

```math
q_delta = q_hand_prev^-1 * q_hand_now
```

### Camera-relative delta

Apply rotation in camera-relative space:

```math
q_worldDelta = q_camera * q_delta * q_camera^-1
```

### Object update

```math
q_object_target = normalize(q_worldDelta * q_object_current)
```

Then update:

```text
q_hand_prev = q_hand_now
```

This runs only while `grabActive === true`.

---

## Render Update Model

The object should rotate toward the target quaternion smoothly.

### Smoothing

```math
q_object_render = slerp(q_object_render, q_object_target, alpha)
```

Use:

* `alpha` for smoothing factor
* `normalize()` after quaternion updates where needed

---

## Dead Zone

Ignore tiny rotations.

### Angular threshold

Let:

```math
theta = angle(q_delta)
```

If:

```text
theta < minRotationAngle
```

Then:

* do not update target rotation
* remain in `GRABBED` or `READY`, depending on grab state

---

## Required UI State Feedback

State feedback is mandatory.

## State display

Show a persistent label in the UI.

Example mapping:

| Internal State  | User Label          |
| --------------- | ------------------- |
| `NO_HAND`       | No hand detected    |
| `HAND_DETECTED` | Right hand detected |
| `READY`         | Ready to rotate     |
| `GRABBED`       | Grab active         |
| `ROTATING`      | Rotating            |
| `RELEASED`      | Released            |
| `TRACKING_LOST` | Tracking lost       |

## Optional additional indicators

* hand icon: visible / hidden
* grab icon: active / inactive
* tracking confidence bar
* debug axes overlay for hand frame

---

## Recommended State Machine

```text
NO_HAND
  -> HAND_DETECTED
  -> READY
  -> GRABBED
  -> ROTATING
  -> RELEASED
  -> READY

Any state
  -> TRACKING_LOST
  -> NO_HAND or HAND_DETECTED
```

### Transition rules

* `NO_HAND -> HAND_DETECTED`

  * right hand appears
* `HAND_DETECTED -> READY`

  * landmarks stable and valid
* `READY -> GRABBED`

  * pinch crosses engage threshold and remains stable
* `GRABBED -> ROTATING`

  * valid angular delta exceeds dead zone
* `ROTATING -> RELEASED`

  * pinch crosses release threshold
* `GRABBED/ROTATING -> TRACKING_LOST`

  * tracking invalid or hand disappears
* `RELEASED -> READY`

  * right hand still present and valid

---

## Runtime Loop

Per frame:

```text
1. Read MediaPipe frame
2. Validate right hand
3. Update state feedback
4. Compute pinch state
5. If grab starts:
     - store q_hand_prev
6. If grab active:
     - compute q_hand_now
     - compute q_delta
     - apply dead zone
     - convert to camera-relative delta
     - update q_object_target
     - store q_hand_prev = q_hand_now
7. If grab released:
     - keep current object pose
8. Render molecule using smoothed quaternion
9. Render current UI state
```

---

## Configuration Parameters

Define all tuning values centrally.

```ts
type RotationConfig = {
  minTrackingConfidence: number
  pinchOnThreshold: number
  pinchOffThreshold: number
  minRotationAngle: number
  smoothingAlpha: number
  grabStabilityFrames: number
  lostTrackingGraceMs: number
}
```

---

## three.js Responsibilities

The molecule object should expose:

* `object.quaternion`
* `targetQuaternion`

The render loop should:

* apply `slerp()` from current to target quaternion
* normalize periodically
* never reset object orientation unless explicitly requested

---

## Minimum UX Controls

In addition to hand control, provide:

* `Reset orientation`
* `Front view`
* `Side view`
* `Top view`

These are part of the core UI.

---

## Implementation Rules

* Use only the **right hand**
* Use only **relative quaternion deltas**
* Do not map absolute hand pose directly to absolute molecule pose
* Freeze the object when tracking is invalid
* Always show the current interaction state
* Keep the molecule pose persistent across grab/release cycles

---

## Minimal Pseudocode

```ts
if (!rightHandIsValid(frame)) {
  state = frame.detected ? 'TRACKING_LOST' : 'NO_HAND'
  showState(state)
  return
}

const qHandNow = computeHandQuaternion(frame.worldLandmarks)
const pinchRatio = computePinchRatio(frame.landmarks)

if (!grabActive && pinchRatio < pinchOnThreshold) {
  grabActive = true
  qHandPrev = qHandNow.clone()
  state = 'GRABBED'
  showState(state)
  return
}

if (grabActive && pinchRatio > pinchOffThreshold) {
  grabActive = false
  state = 'RELEASED'
  showState(state)
  return
}

if (!grabActive) {
  state = 'READY'
  showState(state)
  return
}

const qDelta = qHandPrev.clone().invert().multiply(qHandNow).normalize()

if (angle(qDelta) < minRotationAngle) {
  state = 'GRABBED'
  showState(state)
  return
}

const qWorldDelta = qCamera.clone().multiply(qDelta).multiply(qCamera.clone().invert()).normalize()
targetQuaternion = qWorldDelta.clone().multiply(targetQuaternion).normalize()

qHandPrev.copy(qHandNow)
state = 'ROTATING'
showState(state)
```

---

## Final Concept Definition

**The right hand acts as a clutchable rotational controller. While grabbed, the system converts the palm-based hand orientation into relative quaternion deltas and applies them camera-relatively to the molecule. The molecule keeps its pose on release. The UI always displays the current interaction state.**

If you want, I can turn this next into a **technical implementation skeleton** with module names, interfaces, and a suggested project folder structure.
