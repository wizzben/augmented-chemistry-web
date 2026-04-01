/**
 * ArManager — camera initialisation, ARController setup, and per-frame detection.
 *
 * Lifecycle:
 *   const ar = new ArManager(registry, state);
 *   await ar.init();                   // requests camera, loads patterns
 *   sceneManager.setOnBeforeRender(() => ar.processFrame());
 *   sceneManager.setVideoBackground(ar.video);
 *   sceneManager.setArProjectionMatrix(ar.getProjectionMatrix()!);
 *
 * Coordinate system notes:
 *   ARToolKit produces a 3×4 column-major matrix in its own left-hand space.
 *   transMatToGLMat()   → 4×4 GL matrix (still left-hand)
 *   arglCameraViewRHf() → 4×4 right-hand matrix, ready for Three.js
 *   THREE.Matrix4.fromArray() expects column-major, which is exactly what we get.
 */

import ARLib from '@ar-js-org/artoolkit5-js';
import type { MarkerRegistry } from './MarkerRegistry';
import { MARKER_DEFS } from './MarkerRegistry';
import type { MarkerState } from './MarkerState';

const { ARController } = ARLib;

export interface ArManagerOptions {
  /** Camera capture width in pixels. Default 640. */
  videoWidth?: number;
  /** Camera capture height in pixels. Default 480. */
  videoHeight?: number;
  /** URL of the camera calibration file. Default '/accamerapara.dat'. */
  cameraParamUrl?: string;
}

export class ArManager {
  /** The hidden video element fed by getUserMedia — pass to SceneManager.setVideoBackground */
  readonly video: HTMLVideoElement;

  private readonly registry: MarkerRegistry;
  private readonly state: MarkerState;
  private readonly opts: Required<ArManagerOptions>;

  private controller: InstanceType<typeof ARController> | null = null;
  private projectionMatrix: Float64Array | null = null;
  private frameCount = 0;

  // Reused buffers for per-marker transform computation
  private readonly transMat = new Float64Array(12);
  private readonly glMat    = new Float64Array(16);
  private readonly rhMat    = new Float64Array(16);

  constructor(registry: MarkerRegistry, state: MarkerState, opts: ArManagerOptions = {}) {
    this.registry = registry;
    this.state = state;
    this.opts = {
      videoWidth:     opts.videoWidth     ?? 640,
      videoHeight:    opts.videoHeight    ?? 480,
      cameraParamUrl: opts.cameraParamUrl ?? '/accamerapara.dat',
    };

    // Create video element now so SceneManager can use it as a VideoTexture
    // before init() completes.
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');  // required on iOS
    this.video.setAttribute('autoplay', '');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  /**
   * Full initialisation: request camera, create ARController, load all patterns.
   * Throws if camera access is denied or unavailable (e.g. no HTTPS).
   */
  async init(): Promise<void> {
    // 1. Request camera
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:       { ideal: this.opts.videoWidth },
        height:      { ideal: this.opts.videoHeight },
        facingMode:  'environment',
      },
      audio: false,
    });

    this.video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      this.video.onloadedmetadata = () => resolve();
      this.video.onerror = reject;
    });
    await this.video.play();

    // Use the actual camera dimensions (may differ from requested ideal)
    const width  = this.video.videoWidth  || this.opts.videoWidth;
    const height = this.video.videoHeight || this.opts.videoHeight;

    // 2. Initialise ARController with calibrated camera parameters
    this.controller = await ARController.initWithDimensions(
      width,
      height,
      this.opts.cameraParamUrl,
    );

    // 3. Threshold matching the original C app (thresh = 100)
    this.controller.setThreshold(100);

    // 4. Load all 24 pattern files; registry stores name→runtimeId map
    await this.registry.loadAll(this.controller);

    // 5. Register all marker names in MarkerState
    this.state.init(MARKER_DEFS.map((d) => d.name));

    // 6. Capture projection matrix for SceneManager
    this.projectionMatrix = this.controller.getCameraMatrix();
  }

  /**
   * Run one detection cycle. Called each frame from SceneManager's rAF loop
   * via setOnBeforeRender(). No-op if not yet initialised.
   */
  processFrame(): void {
    if (!this.controller) return;

    this.state.beginFrame();
    this.controller.detectMarker(this.video);

    const markerNum = this.controller.getMarkerNum();

    // Mirror the original ac_main_03display loop (lines 787–812):
    // For each registered marker, find the detected instance with the highest
    // confidence factor, then compute its pose transform.
    for (const def of MARKER_DEFS) {
      const runtimeId = this.registry.getRuntimeId(def.name);
      if (runtimeId === undefined) continue;

      let bestIdx = -1;
      let bestCf  = -1;

      for (let j = 0; j < markerNum; j++) {
        const info = this.controller.getMarker(j) as { idPatt: number; cf: number } | undefined;
        if (!info) continue;
        if (info.idPatt === runtimeId && info.cf > bestCf) {
          bestCf  = info.cf;
          bestIdx = j;
        }
      }

      if (bestIdx === -1) continue;

      // getTransMatSquare → transMatToGLMat → arglCameraViewRHf
      this.controller.getTransMatSquare(bestIdx, def.width, this.transMat);
      this.controller.transMatToGLMat(this.transMat, this.glMat, 1.0);
      this.controller.arglCameraViewRHf(this.glMat, this.rhMat, 1.0);

      this.state.updateMarker(def.name, bestCf, this.rhMat, this.frameCount);
    }

    this.frameCount++;
  }

  /**
   * Returns the ARToolKit projection matrix (16-element column-major Float64Array)
   * to pass to SceneManager.setArProjectionMatrix(). Null before init().
   */
  getProjectionMatrix(): Float64Array | null {
    return this.projectionMatrix;
  }

  /** Stop camera stream and clean up. */
  dispose(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.video.remove();
    this.controller = null;
  }
}
