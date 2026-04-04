import { HandTracker, type HandFrame } from './HandTracker';

export interface HandManagerOptions {
  /** Camera capture width in pixels. Default 640. */
  videoWidth?: number;
  /** Camera capture height in pixels. Default 480. */
  videoHeight?: number;
}

/**
 * Camera initialisation and MediaPipe Hand Landmarker lifecycle.
 *
 * Analogous to ArManager, but simpler — no projection matrix, no marker
 * patterns, and no video background (video feeds MediaPipe only).
 *
 * Lifecycle:
 *   const hm = new HandManager();
 *   await hm.init();                             // request camera, load model
 *   sceneManager.setOnBeforeRender(() => {
 *     const frame = hm.processFrame();
 *     if (frame) handObjectManager.update(frame);
 *   });
 *   // on teardown:
 *   hm.dispose();
 */
export class HandManager {
  /** Hidden video element fed by getUserMedia — input to MediaPipe only. */
  readonly video: HTMLVideoElement;

  private readonly tracker: HandTracker;
  private readonly opts: Required<HandManagerOptions>;
  private lastTimestamp = -1;

  constructor(opts: HandManagerOptions = {}) {
    this.opts = {
      videoWidth:  opts.videoWidth  ?? 640,
      videoHeight: opts.videoHeight ?? 480,
    };
    this.tracker = new HandTracker();

    // Create video element immediately so it can start buffering once init()
    // completes. It is never displayed — only fed to detectForVideo().
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', ''); // required on iOS
    this.video.setAttribute('autoplay', '');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);
  }

  /**
   * Request camera access and load the MediaPipe model.
   * Uses the front-facing camera (facingMode: 'user') so hand movements
   * feel natural and mirror the user's perspective.
   * Throws if camera access is denied or not available (requires HTTPS).
   */
  async init(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:      { ideal: this.opts.videoWidth },
        height:     { ideal: this.opts.videoHeight },
        facingMode: 'user',
      },
      audio: false,
    });

    this.video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      this.video.onloadedmetadata = () => resolve();
      this.video.onerror = reject;
    });
    await this.video.play();

    await this.tracker.init();
  }

  /**
   * Run one detection cycle. Called each frame from SceneManager's rAF loop
   * via setOnBeforeRender(). Returns null if the video is not yet ready or
   * the same frame has already been processed.
   */
  processFrame(): HandFrame | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

    const timestamp = performance.now();
    // MediaPipe requires strictly increasing timestamps for VIDEO mode.
    if (timestamp <= this.lastTimestamp) return null;
    this.lastTimestamp = timestamp;

    return this.tracker.detect(this.video, timestamp);
  }

  /** Stop the camera stream, remove the video element, and release the model. */
  dispose(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.video.remove();
    this.tracker.dispose();
  }
}
