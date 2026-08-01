/** Camera hardware helpers for dense Aadhaar Secure QR capture. */

export type VideoRoi = { sx: number; sy: number; sw: number; sh: number };

/**
 * Map object-fit:cover preview → source rectangle in video pixel space.
 * Without this, center-ROI decode looks at the wrong area on Android/desktop
 * (landscape sensor + portrait UI), while iOS often “luckily” aligns.
 */
export function objectCoverSourceRect(video: HTMLVideoElement): VideoRoi {
  const vw = video.videoWidth || 0;
  const vh = video.videoHeight || 0;
  const ew = video.clientWidth || video.offsetWidth || vw;
  const eh = video.clientHeight || video.offsetHeight || vh;
  if (vw < 2 || vh < 2 || ew < 2 || eh < 2) {
    return { sx: 0, sy: 0, sw: Math.max(0, vw), sh: Math.max(0, vh) };
  }
  const videoAspect = vw / vh;
  const elemAspect = ew / eh;
  if (videoAspect > elemAspect) {
    // Wider than box — crop left/right
    const visibleW = vh * elemAspect;
    return { sx: (vw - visibleW) / 2, sy: 0, sw: visibleW, sh: vh };
  }
  // Taller than box — crop top/bottom
  const visibleH = vw / elemAspect;
  return { sx: 0, sy: (vh - visibleH) / 2, sw: vw, sh: visibleH };
}

/** Viewfinder square (CSS ratio of the visible cover area) → video pixels. */
export function viewfinderRoiInVideo(
  video: HTMLVideoElement,
  viewfinderRatio = 0.58
): VideoRoi {
  const cover = objectCoverSourceRect(video);
  const side = Math.max(64, Math.min(cover.sw, cover.sh) * viewfinderRatio);
  return {
    sx: Math.max(0, Math.floor(cover.sx + (cover.sw - side) / 2)),
    sy: Math.max(0, Math.floor(cover.sy + (cover.sh - side) / 2)),
    sw: Math.floor(side),
    sh: Math.floor(side),
  };
}

export type CameraOpenResult = {
  stream: MediaStream;
  track: MediaStreamTrack;
  videoWidth: number;
  videoHeight: number;
  deviceLabel: string;
  torchSupported: boolean;
  stillMaxWidth: number | null;
  stillMaxHeight: number | null;
};

type Caps = MediaTrackCapabilities & {
  torch?: boolean;
  focusMode?: string[];
  zoom?: { min: number; max: number; step?: number };
};

type PhotoCaps = {
  imageWidth?: { min: number; max: number; step?: number };
  imageHeight?: { min: number; max: number; step?: number };
  fillLightMode?: string[];
};

function ImageCaptureCtor():
  | (new (t: MediaStreamTrack) => {
      takePhoto: (settings?: Record<string, unknown>) => Promise<Blob>;
      grabFrame: () => Promise<ImageBitmap>;
      getPhotoCapabilities: () => Promise<PhotoCaps>;
    })
  | null {
  return (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => any }).ImageCapture || null;
}

async function preferRearDeviceId(): Promise<string | undefined> {
  try {
    // Prefer facingMode first; only enumerate when labels are already available
    // (avoid open-then-stop permission flicker that breaks some kiosk browsers)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (!cams.length || cams.every((d) => !d.label)) return undefined;
    const scored = cams
      .map((d) => {
        const label = (d.label || "").toLowerCase();
        let score = 0;
        if (/back|rear|environment|world|wide/.test(label)) score += 10;
        if (/ultra|tele/.test(label)) score += 2;
        if (/front|user|face|selfie/.test(label)) score -= 10;
        return { id: d.deviceId, score, label: d.label };
      })
      .sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].id : undefined;
  } catch {
    return undefined;
  }
}

async function applyMaxVideoConstraints(track: MediaStreamTrack): Promise<void> {
  const caps = (track.getCapabilities?.() || {}) as Caps;
  const maxW = caps.width?.max;
  const maxH = caps.height?.max;
  const advanced: Record<string, unknown>[] = [];

  if (caps.focusMode?.includes?.("continuous")) {
    advanced.push({ focusMode: "continuous" });
  }
  if (typeof caps.zoom?.max === "number" && caps.zoom.max > (caps.zoom.min || 1)) {
    // Slight zoom helps module size on dense Secure QR without losing too much FOV
    const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min || 1, 1.2));
    advanced.push({ zoom: z });
  }

  const constraintSets: MediaTrackConstraints[] = [];
  if (maxW && maxH) {
    constraintSets.push({
      width: { ideal: maxW },
      height: { ideal: maxH },
      ...(advanced.length ? { advanced: advanced as unknown as MediaTrackConstraintSet[] } : {}),
    });
  }
  constraintSets.push({
    width: { ideal: 3840 },
    height: { ideal: 2160 },
  });
  constraintSets.push({
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  });

  for (const c of constraintSets) {
    try {
      await track.applyConstraints(c);
      return;
    } catch {
      /* try next */
    }
  }
}

/**
 * Open the best rear camera at the highest video resolution the device allows.
 */
export async function openAadhaarCamera(): Promise<CameraOpenResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API not available in this browser");
  }

  const deviceId = await preferRearDeviceId();
  // Prefer facingMode over exact deviceId — exact often fails on kiosk Chrome after reload
  const tries: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
    },
    ...(deviceId
      ? [
          {
            audio: false,
            video: {
              deviceId: { ideal: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          } as MediaStreamConstraints,
        ]
      : []),
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];

  let stream: MediaStream | null = null;
  let lastErr: unknown = null;
  for (const constraints of tries) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!stream) {
    throw lastErr instanceof Error ? lastErr : new Error("Could not open camera");
  }

  const track = stream.getVideoTracks()[0];
  await applyMaxVideoConstraints(track);

  const settings = track.getSettings?.() || {};
  const caps = (track.getCapabilities?.() || {}) as Caps;

  let stillMaxWidth: number | null = null;
  let stillMaxHeight: number | null = null;
  const IC = ImageCaptureCtor();
  if (IC) {
    try {
      const photoCaps = await new IC(track).getPhotoCapabilities();
      stillMaxWidth = photoCaps.imageWidth?.max ?? null;
      stillMaxHeight = photoCaps.imageHeight?.max ?? null;
    } catch {
      /* ignore */
    }
  }

  return {
    stream,
    track,
    videoWidth: settings.width || 0,
    videoHeight: settings.height || 0,
    deviceLabel: track.label || "Camera",
    torchSupported: Boolean(caps.torch),
    stillMaxWidth,
    stillMaxHeight,
  };
}

export async function setTorch(track: MediaStreamTrack | null, on: boolean): Promise<boolean> {
  if (!track) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    } as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

function bitmapToImageData(bitmap: ImageBitmap): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export type StillCapture = {
  imageData: ImageData;
  width: number;
  height: number;
  source: "takePhoto" | "grabFrame" | "video";
  bitmap?: ImageBitmap;
  /** JPEG/PNG blob when available — preferred input for zxing-wasm */
  blob?: Blob;
};

export function supportsImageCapture(): boolean {
  return Boolean(ImageCaptureCtor());
}

export function isMobilePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Capture at full still-camera resolution via ImageCapture.takePhoto().
 * takePhoto is hard-timeout'd — hangs must never block the scanner loop.
 * Falls back to grabFrame / video frame if unavailable.
 */
export async function captureMaxResStill(
  track: MediaStreamTrack | null,
  video?: HTMLVideoElement | null,
  opts?: { takePhotoTimeoutMs?: number }
): Promise<StillCapture | null> {
  const takePhotoTimeoutMs = opts?.takePhotoTimeoutMs ?? 2500;
  const IC = ImageCaptureCtor();
  if (track && IC) {
    try {
      const capture = new IC(track);
      let settings: Record<string, unknown> = { fillLightMode: "auto" };
      try {
        const caps = await withTimeout(capture.getPhotoCapabilities(), 1200, "getPhotoCapabilities");
        if (caps.imageWidth?.max) settings.imageWidth = caps.imageWidth.max;
        if (caps.imageHeight?.max) settings.imageHeight = caps.imageHeight.max;
      } catch {
        settings = {};
      }
      const blob = await withTimeout(capture.takePhoto(settings), takePhotoTimeoutMs, "takePhoto");
      const bitmap = await createImageBitmap(blob);
      const imageData = bitmapToImageData(bitmap);
      if (imageData) {
        return {
          imageData,
          width: bitmap.width,
          height: bitmap.height,
          source: "takePhoto",
          bitmap,
          blob,
        };
      }
      bitmap.close?.();
    } catch {
      /* fall through — never hang the scanner */
    }

    try {
      const capture = new IC(track);
      const bitmap = await withTimeout(capture.grabFrame(), 1500, "grabFrame");
      const imageData = bitmapToImageData(bitmap);
      if (imageData) {
        return {
          imageData,
          width: bitmap.width,
          height: bitmap.height,
          source: "grabFrame",
          bitmap,
        };
      }
      bitmap.close?.();
    } catch {
      /* fall through */
    }
  }

  if (video && video.videoWidth > 0) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return {
      imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
      width: canvas.width,
      height: canvas.height,
      source: "video",
    };
  }
  return null;
}
