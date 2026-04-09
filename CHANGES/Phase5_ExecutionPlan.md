# Phase 5 Execution Plan: AR Objects -- Cube, Transport, Elements

## Context

Phases 1-4 are complete: chemistry engine (654 tests), 3D rendering, desktop molecule building, and AR marker detection. Phase 5 adds the AR interaction objects that let users build molecules using physical markers. The AR infrastructure (`MarkerState` API) is ready -- Phase 5 builds the *interaction logic* on top of it.

The original C code lives in `aco/src/` (5 files, ~1700 lines total). We're porting to a new `src/objects/` directory.

---

## Substep 1: FuzzyBoolean, ElementMarker, Cube

**Goal**: Port the two independent AR objects plus the shared debouncing utility. No dependencies on Transport or Platform.

### 1.1 `src/objects/FuzzyBoolean.ts` (~30 lines)

Shared debounce primitive used by ElementMarker and PushButton. Extracted from the identical pattern in `aco_element.c:181-187` and `aco_state.c:177-194`.

**Constants**: `THRESHOLD = 10` (from `FUZZY_BOOLEAN_TRUE`)

**API**:
```ts
class FuzzyBoolean {
  constructor(bidirectional: boolean = false)
  update(rawVisible: boolean): void   // increment/decrement counter
  get value(): boolean                // true when counter >= THRESHOLD
  reset(): void                       // counter = 0
}
```

**Behavior**:
- `bidirectional=false` (ElementMarker): increments toward 10 when visible; resets to 0 immediately when not visible
- `bidirectional=true` (PushButton): increments when visible, decrements when not visible; state changes only at thresholds (10 and 0)

### 1.2 `src/objects/ElementMarker.ts` (~80 lines)

Ports `aco_element.c`. One instance per element marker (11 total).

**C function mapping**: `aco_element_03refreshState` -> `ElementMarker.refreshState()`

**State**: `markerName`, `element` (chemistry Element ref), `fuzzy: FuzzyBoolean`, `visible`, `matrix: THREE.Matrix4`

**`refreshState(markerState: MarkerState)`**:
1. Read `markerState.getPose(this.markerName)`
2. If raw marker not visible: `fuzzy.reset()`, `visible = false`, hide mesh
3. Else: `fuzzy.update(true)`. If `fuzzy.value`: `visible = true`, copy pose matrix, show mesh at marker position

**Three.js**: Owns a `THREE.Mesh` (sphere with element-colored material from `MaterialLibrary`). `mesh.matrixAutoUpdate = false`. Position set from marker matrix each frame.

**Convenience**: `getPosition(): THREE.Vector3` extracts translation from matrix (for Transport distance calc).

Note: `para2glf()` conversion is already done in `ArManager` -- `MarkerState` matrices are in Three.js RH space. No additional conversion needed.

### 1.3 `src/objects/Cube.ts` (~120 lines)

Ports `aco_cube.c` (260 lines). Single instance, 6 cube face markers.

**C function mapping**: `aco_cube_03refreshState` -> `Cube.refreshState()`

**Constants to port verbatim** (from `aco_cube.c:61-68`):
```ts
const AC_CUBE_TRANSFORM: THREE.Matrix4[] = [
  // 6 column-major 4x4 matrices, one per face
  new THREE.Matrix4().fromArray([1,0,0,0, 0,0,-1,0, 0,1,0,0, 0,0,0,1]),  // face 0
  new THREE.Matrix4().fromArray([0,0,1,0, 1,0,0,0, 0,1,0,0, 0,0,0,1]),   // face 1
  new THREE.Matrix4().fromArray([-1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1]),  // face 2
  new THREE.Matrix4().fromArray([0,0,-1,0, -1,0,0,0, 0,1,0,0, 0,0,0,1]), // face 3
  new THREE.Matrix4().fromArray([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),   // face 4
  new THREE.Matrix4().fromArray([1,0,0,0, 0,-1,0,0, 0,0,-1,0, 0,0,0,1]), // face 5
];
const SLERP_FRICTION = 0.4;
const RAD_45 = Math.PI / 4;
```

**State**: `visible`, `posIsValid` (countdown 5→0), `position: THREE.Vector3`, `rotation: THREE.Quaternion`, `matrix: THREE.Matrix4`

**`refreshState(markerState: MarkerState)`** (port of lines 181-258):
1. Collect visible cube face indices from `markerState`
2. If none: `visible = false`, decrement `posIsValid`, return
3. `visible = true`, `posIsValid = 5`
4. **Master face selection** (lines 212-234): If 1 face visible, use it. If multiple, for each face compute angle between camera Z-axis (from matrix columns 8-10) and position vector (columns 12-14). Pick face closest to 45 degrees: `angle = acos(dot([-m[8],-m[9],-m[10]], [m[12],m[13],m[14]]) / length([m[12],m[13],m[14]]))`
5. **Compute orientation** (lines 237-242): Get master face matrix from `MarkerState`, multiply by `AC_CUBE_TRANSFORM[masterFace]`. Extract position from raw matrix (before cube transform). Zero translation in result (rotation-only).
6. **SLERP smoothing** (lines 244-256): Convert result to quaternion, SLERP with current `this.rotation` at `friction=0.4`, store back. Use `THREE.Quaternion.slerpFlat()` or `q.slerp()`.
7. Compose `this.matrix` from smoothed rotation + position.

**Three.js**: The Cube renders no mesh (the physical cube is visible). It provides `matrix` and `rotation` for Platform to orient the molecule.

### 1.4 Tests

**`tests/objects/FuzzyBoolean.test.ts`**:
- Starts at value=false
- 9 visible updates → still false; 10th → true
- Unidirectional: single not-visible resets to false immediately
- Bidirectional: decrements gradually (10 frames from true→false)
- `reset()` sets counter to 0

**`tests/objects/ElementMarker.test.ts`**:
- Not visible initially
- Becomes visible after 10 consecutive detected frames
- Returns to not-visible immediately when marker disappears
- `getPosition()` returns correct translation
- Handles missing marker gracefully

**`tests/objects/Cube.test.ts`**:
- `AC_CUBE_TRANSFORM` values match original C arrays exactly
- Single face visible → selected as master
- Two faces visible → selects one closest to 45 degrees
- SLERP: orientation changes gradually between frames
- `posIsValid` decrement/hold behavior

---

## Substep 2: Transport, PushButton, ArObjectManager, Main Wiring

**Goal**: Port Transport (depends on ElementMarker[]) and PushButton (simple toggle). Create ArObjectManager to orchestrate all objects. Wire into `main.ts` replacing the proof-of-concept red sphere.

### 2.1 `src/objects/Transport.ts` (~100 lines)

Ports `aco_transport.c`. Single instance, `'transport'` marker.

**C function mapping**: `aco_transport_03refreshState` -> `Transport.refreshState()`

**Constants**: `GRAB_DISTANCE = 140.0` (line 256)

**State**: `visible`, `matrix: THREE.Matrix4`, `grabbedElement: ElementMarker | null`, `flirt: ElementMarker | null`, `distanceToFlirt: number`

**`refreshState(markerState: MarkerState, elements: ElementMarker[])`** (port of lines 218-292):
1. Read transport marker pose. If not visible: `visible = false`, return
2. `visible = true`, copy matrix
3. Extract transport position from matrix [12,13,14]
4. For each visible `ElementMarker` (skip if same as `grabbedElement`): compute Euclidean distance to transport position
5. Find closest. If distance < 140.0 → `grabbedElement = closest`, `flirt = null`
6. Else → `flirt = closest`, `distanceToFlirt = distance`

**Sticky grab**: Once grabbed, element stays grabbed until a different element is picked up. No release on distance increase.

**Three.js rendering** (in ArObjectManager):
- When `flirt` set and distance < 300: arrow mesh from transport toward flirt (simple cone+cylinder, oriented with `Object3D.lookAt()`)
- When `grabbedElement` set: element sphere rendered at transport position

### 2.2 `src/objects/PushButton.ts` (~70 lines)

Ports `aco_state.c`. One instance per control marker (5 total: labeling, el_negativity, browser, empty, benzene).

**C function mapping**: `aco_state_03pushbuttonRefreshState` -> `PushButton.refreshState()`

**State**: `markerName`, `fuzzy: FuzzyBoolean(bidirectional=true)`, `value: boolean`, `confirmed: boolean`, `platformAddict: boolean`, `onToggle` callback

**`refreshState(markerState: MarkerState, platformVisible: boolean)`**:
1. `fuzzy.update(markerState.isVisible(this.markerName))`
2. `value = fuzzy.value`
3. If `platformAddict && !platformVisible`: `value = false`
4. Edge detection: if `value !== confirmed` → fire `onToggle(value)`, update `confirmed`

**Action mapping** (wired in ArObjectManager):
| Marker | platformAddict | Action |
|--------|---------------|--------|
| `labeling` | no | Toggle atom labels (stub for Phase 6) |
| `el_negativity` | no | Toggle electronegativity display (stub) |
| `browser` | yes | Toggle browse mode on Platform |
| `empty` | yes | `builder.reset()` |
| `benzene` | yes | Load benzene from library |

### 2.3 `src/objects/ArObjectManager.ts` (~150 lines)

Orchestrator that owns all AR objects. Replaces the proof-of-concept code in `main.ts`.

**Constructor**: `(markerState, builder, scene, materialLibrary)`

**Creates**:
- 11 `ElementMarker` instances (mapping `element_C` → Element with symbol `C`, etc.)
- 1 `Cube`
- 1 `Transport`
- 5 `PushButton` instances with action callbacks
- 1 `Platform` (stubbed in Substep 2, implemented in Substep 3)
- Arrow mesh + grabbed element sphere (reusable, shown/hidden)

**`update()` method** (called each frame after `arManager.processFrame()`):
```
1. elementMarkers.forEach(e => e.refreshState(markerState))
2. cube.refreshState(markerState)
3. transport.refreshState(markerState, elementMarkers)
4. pushButtons.forEach(b => b.refreshState(markerState, platform?.visible))
5. platform?.refreshState(markerState)  // Substep 3
6. Update transport grabbed element → builder.setElement()
7. Update Three.js mesh visibilities and positions
```

**`dispose()`**: Remove all meshes, dispose geometries/materials.

### 2.4 Changes to `src/main.ts`

In the AR toggle-on block (lines ~148-205):
1. **Remove** the proof-of-concept red sphere code (lines 174-193)
2. After `arManager.init()`: create `ArObjectManager(markerState, builder, scene, materialLibrary)`
3. In `setOnBeforeRender`: `arManager.processFrame()` then `arObjectManager.update()`
4. In AR toggle-off: `arObjectManager.dispose()`

### 2.5 Tests

**`tests/objects/Transport.test.ts`**:
- Not visible when marker not detected
- Grabs nearest visible element within 140.0
- Sets flirt (not grab) beyond 140.0
- Sticky: keeps grabbed element when moving away
- New grab replaces old when closer to different element
- Skips already-grabbed element in distance scan

**`tests/objects/PushButton.test.ts`**:
- Bidirectional fuzzy: gradual on/off
- Edge detection fires callback only on state change
- platformAddict=true requires platformVisible
- No callback when value unchanged

---

## Substep 3: Platform (Molecule Assembly Surface)

**Goal**: Port `aco_platform.c` (~1100 lines) -- the core piece connecting Transport+Element to molecule building. This is the most complex object but delegates molecule mutations to the existing `MoleculeBuilder`.

### 3.1 `src/objects/Platform.ts` (~250 lines)

Ports `aco_platform.c`. Single instance, `'platform'` marker.

**C function mapping**:
| C Function | TS Method |
|-----------|-----------|
| `aco_platform_03refreshState` | `Platform.refreshState()` |
| `aco_platform_05mouseEvent` | `Platform.triggerLink()` |
| `aco_platform_06linkNow` | Delegates to `MoleculeBuilder.linkNow()` |
| `aco_platform_07undoLastAtom` | Delegates to `MoleculeBuilder.undoLastAtom()` |

**Constants**: `TRANQUILIZER = 0.9`, `CORNER_DISTANCE_THRESHOLD = 0.3`

**Dependencies** (constructor): `transport: Transport`, `cube: Cube`, `builder: MoleculeBuilder`, `tetraMatrices: TetraMatrices`, `markerState: MarkerState`

**State**: `visible`, `matrix: THREE.Matrix4`, `selection: Atom | null`, `selectionBitField: number`, `circlePartner: Atom | null`, `browserMode: boolean`

#### `refreshState(markerState: MarkerState)` -- the big method

Port of `aco_platform_03refreshState` (lines 319-634):

**Step 1 -- Visibility + smoothing** (lines 349-371):
- Read platform marker pose. If not visible: return
- Apply tranquilizer smoothing on translation: `matrix[i] = raw[i] + (matrix[i] - raw[i]) * 0.9`
- This is a low-pass filter reducing AR jitter

**Step 2 -- Position molecule on platform**:
- If molecule empty: show placeholder indicator, return
- `moleculeAnchor.matrix` = platformTranslation * cubeRotation
- The `moleculeAnchor` is a `THREE.Group` parenting the molecule renderer's group
- When cube is visible, its smoothed rotation orients the molecule
- When cube not visible, molecule keeps last known rotation

**Step 3 -- Transport interaction** (lines 451-633, only when transport visible + has grabbed element + molecule not saturated):

a. **Find closest unsaturated atom** (lines 467-481):
   - For each atom in molecule (from `builder.getMolecule()`): if not `done`, compute distance to transport position
   - Closest → `selection`

b. **Compute tetrahedral corner positions** (lines 489-513):
   - For each of the 4 corner slots (bitfield indices 0,1,3,7 → CONNECTION values 1,2,4,8):
   - `cornerMatrix = tetraMatrices.transform[selection.language][cornerIdx] * selection.matrix`
   - Extract position from each corner matrix [12,13,14]
   - **Reuse**: This is the same `CORNER_INDICES = [0, 1, 3, 7]` already defined in `GhostRenderer.ts`

c. **Determine selectionBitField** (lines 515-527):
   - Compute distance from transport to each corner
   - Find min/max. Normalize: `relative = (dist - min) / (max - min)`
   - Corners with `relative < 0.3` contribute their bit: `bitfield |= CONNECTION_BITS[i]`

d. **Validate connection** (lines 533-563):
   - Check: `(selection.bitField & selectionBitField) === 0` (no overlap with existing)
   - Check: total connections wouldn't exceed valence
   - If invalid: use `getPoolOfPossibleConnections()` to find closest valid alternative
   - **Reuse**: Same validation logic as in `GhostRenderer.showGhosts()` and `MoleculeBuilder`

e. **Circle detection** (lines 572-632):
   - Compute where new atom would be: `expectedPos = tetraMatrices.transform[selection.language][selectionBitField-1] * selection.matrix`
   - Check if any existing atom is at that position (tolerance ~0.1 per axis)
   - If found → `circlePartner = thatAtom`
   - Note: circular bonding is disabled in original code (line 1040-1046), so we detect but don't link

#### `triggerLink()` -- tap-to-bond

Called from `main.ts` on canvas tap when AR mode active:
- If molecule empty AND transport has element: `builder.addFirstAtom()`
- If `selection` valid AND transport has element: `builder.linkNow(selection, selectionBitField)`
- After link: molecule re-renders via `builder.onChanged` callback

#### Three.js Scene Graph

```
scene
  +-- moleculeAnchor (Group, matrixAutoUpdate=false)
  |     matrix = platform translation * cube rotation
  |     +-- moleculeGroup (from MoleculeRenderer -- reparented in AR mode)
  |     +-- ghostSphere (pulsing preview at target bond position)
  |     +-- selectionHighlight (pulsing emissive on selected atom)
  +-- elementMarker[0..10].mesh
  +-- transport arrow/element meshes
```

Key insight: `MoleculeRenderer` already outputs a `THREE.Group` with atom/bond meshes in local molecule space. In AR mode, we reparent that group under `moleculeAnchor` which positions it at the platform marker. Desktop mode keeps it at scene root. No changes to MoleculeRenderer itself.

#### Ghost preview in AR mode

When `selection` and `selectionBitField` are valid:
- Show a pulsing sphere at the target bond position (under `moleculeAnchor`)
- Reuse material from `GhostRenderer` pattern, but simpler: only show the one target position, not all ghosts
- Pulse via `sin(time)` on emissive (matching original `aco_platform_04display` lines 798-804)

### 3.2 Changes to `src/main.ts`

- Add canvas tap handler: when AR mode active, call `platform.triggerLink()`
- Reparent `moleculeRenderer.getGroup()` under `moleculeAnchor` when entering AR mode, back to scene when exiting

### 3.3 Changes to `src/objects/ArObjectManager.ts`

- Create Platform instance with all dependencies
- Add Platform to update loop (step 5)
- Manage `moleculeAnchor` group lifecycle
- Wire `builder.onChanged` to re-render molecule in AR (same as desktop, group just has different parent)

### 3.4 Tests

**`tests/objects/Platform.test.ts`** (pure logic, mock MarkerState + MoleculeBuilder):
- Tranquilizer smoothing: position converges gradually
- Closest atom selection: picks nearest unsaturated atom
- Tetrahedral corner distance → correct selectionBitField for known positions
- Validation: rejects connections exceeding valence
- Validation: falls back to nearest valid alternative
- Circle detection: identifies existing atom at target position
- `triggerLink()` calls `builder.addFirstAtom()` when molecule empty
- `triggerLink()` calls `builder.linkNow(selection, bitfield)` when molecule exists

---

## Summary of New Files

| File | Substep | ~Lines | Ports |
|------|---------|--------|-------|
| `src/objects/FuzzyBoolean.ts` | 1 | 30 | `aco_element.c` + `aco_state.c` shared pattern |
| `src/objects/ElementMarker.ts` | 1 | 80 | `aco_element.c` |
| `src/objects/Cube.ts` | 1 | 120 | `aco_cube.c` |
| `src/objects/Transport.ts` | 2 | 100 | `aco_transport.c` |
| `src/objects/PushButton.ts` | 2 | 70 | `aco_state.c` |
| `src/objects/ArObjectManager.ts` | 2+3 | 150 | New orchestrator |
| `src/objects/Platform.ts` | 3 | 250 | `aco_platform.c` |
| `tests/objects/*.test.ts` | 1-3 | ~400 | Unit tests |

**Modified**: `src/main.ts` (replace proof-of-concept sphere, add tap handler)

## Constants Porting Reference

| Constant | Value | Source | Destination |
|----------|-------|--------|-------------|
| `FUZZY_BOOLEAN_TRUE` | 10 | `aco_element.c:71` | `FuzzyBoolean.ts` |
| `AC_CUBE_TRANSFORM[6][16]` | 6 rotation matrices | `aco_cube.c:61-68` | `Cube.ts` |
| `SLERP_FRICTION` | 0.4 | `aco_cube.c:118` | `Cube.ts` |
| `RAD_45` | pi/4 | `aco_cube.c:58` | `Cube.ts` |
| `GRAB_DISTANCE` | 140.0 | `aco_transport.c:256` | `Transport.ts` |
| `TRANQUILIZER` | 0.9 | `aco_platform.c:227` | `Platform.ts` |
| `CORNER_DISTANCE_THRESHOLD` | 0.3 | `aco_platform.c:334` | `Platform.ts` |

## Verification

After each substep:
1. **Run tests**: `npm run test` -- all existing 654 tests still pass + new tests pass
2. **Manual AR test** (after Substep 2): Print markers, verify element spheres appear at markers, cube rotation smooths, transport grabs elements
3. **Manual AR test** (after Substep 3): Build water molecule (H-O-H) using platform + transport markers, verify recognition

## Key Design Decisions

1. **Reuse MoleculeBuilder**: Platform delegates all molecule mutations to the existing `MoleculeBuilder` (addFirstAtom, linkNow, undoLastAtom, reset). No duplicate chemistry logic.
2. **moleculeAnchor pattern**: A `THREE.Group` positioned at platform+cube transform, parenting the existing molecule renderer group. Zero changes to MoleculeRenderer.
3. **No InputManager**: Desktop mode works via `DesktopControls`. AR objects consume `MarkerState` directly. A unified abstraction is unnecessary complexity for Phase 5.
4. **Reuse GhostRenderer pattern**: Platform's bond preview uses the same `CORNER_INDICES` and material approach from `GhostRenderer.ts`, but simplified (one target position, not all ghosts).
5. **Coordinate space**: `MarkerState` already provides right-handed Three.js matrices. No additional `para2glf()` conversion needed anywhere in Phase 5.
