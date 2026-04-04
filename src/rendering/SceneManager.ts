import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private animationId = 0;
  private onBeforeRenderCallback: (() => void) | null = null;
  private arVideoAspect: number | null = null;

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 10);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    // Lighting (matching ac_graphics.c material params)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 1, 1);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-1, -0.5, -1);
    this.scene.add(fillLight);

    // Controls — rotation works anywhere on canvas, scroll to zoom
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 1.2;
    this.controls.enablePan = false;   // pan adds confusion for molecules
    this.controls.minDistance = 1;
    this.controls.maxDistance = 100;

    // Resize
    window.addEventListener('resize', this.onResize);

    // Start render loop
    this.animate();
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  fitToMolecule(boundingRadius: number): void {
    const distance = Math.max(boundingRadius * 3, 5);
    this.camera.position.set(0, 0, distance);
    this.camera.lookAt(0, 0, 0);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // ─── AR integration ───────────────────────────────────────────────────────

  /**
   * Register a callback invoked at the start of every animation frame,
   * before controls.update() and the render call.
   * ArManager uses this to run marker detection in sync with rendering.
   */
  setOnBeforeRender(cb: (() => void) | null): void {
    this.onBeforeRenderCallback = cb;
  }

  /**
   * Use a video element as the scene background (AR camera feed).
   * Pass the ArManager.video element here.
   */
  setVideoBackground(video: HTMLVideoElement): void {
    this.scene.background = new THREE.VideoTexture(video);
  }

  /**
   * Override the camera's projection matrix with the ARToolKit calibrated matrix.
   * Patches updateProjectionMatrix() to a no-op so the resize handler and
   * OrbitControls can't overwrite the AR calibration.
   */
  setArProjectionMatrix(matrix: Float64Array): void {
    this.camera.projectionMatrix.fromArray(matrix);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    // Prevent Three.js from recomputing the projection (no flag exists in r183 —
    // we override the method instead).
    this.camera.updateProjectionMatrix = () => { /* locked to AR calibration */ };
  }

  /**
   * Switch between AR mode and desktop mode.
   * AR mode: disables OrbitControls, resets camera to AR convention (origin, looking -Z),
   *   locks resize to preserve the video aspect ratio.
   * Desktop mode: re-enables OrbitControls, restores solid background and projection.
   *
   * @param videoAspect - width/height of the webcam feed; passed in AR mode to
   *   keep the canvas (and therefore the video background) undistorted on resize.
   */
  setArMode(enabled: boolean, videoAspect?: number): void {
    this.controls.enabled = !enabled;
    if (enabled) {
      this.camera.position.set(0, 0, 0);
      this.camera.rotation.set(0, 0, 0);
      this.arVideoAspect = videoAspect ?? null;
      if (videoAspect !== undefined) this.onResize();
    } else {
      this.scene.background = new THREE.Color(0x1a1a2e);
      // Restore the original updateProjectionMatrix from the prototype
      delete (this.camera as Partial<typeof this.camera>).updateProjectionMatrix;
      this.camera.position.set(0, 0, 10);
      this.arVideoAspect = null;
      this.onResize();
    }
  }

  /**
   * Switch between markerless (hand-tracking) mode and desktop mode.
   *
   * Markerless mode: disables OrbitControls so hand gestures control rotation
   * instead of the mouse. Background and camera position remain unchanged
   * (solid colour, camera at (0,0,10)) — this is the key difference from AR mode.
   *
   * Desktop mode: re-enables OrbitControls, resets camera/target, triggers resize.
   */
  setMarkerlessMode(enabled: boolean): void {
    this.controls.enabled = !enabled;
    if (!enabled) {
      this.camera.position.set(0, 0, 10);
      this.camera.lookAt(0, 0, 0);
      this.controls.target.set(0, 0, 0);
      this.onResize();
    }
    // When enabling, camera stays at its current position and the solid background
    // is preserved — no changes needed beyond disabling controls.
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.onBeforeRenderCallback?.();
    // Skip OrbitControls update in AR mode — controls are disabled and calling
    // update() would push the camera away from origin (minDistance clamping),
    // breaking the AR assumption that the camera sits at (0,0,0).
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    // In AR mode, fix the canvas height to preserve the webcam aspect ratio so
    // the VideoTexture background renders undistorted.
    const h = this.arVideoAspect !== null
      ? Math.round(w / this.arVideoAspect)
      : parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
