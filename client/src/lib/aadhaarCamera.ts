/** Camera hardware helpers for dense Aadhaar Secure QR capture. */

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

async function unlockDeviceLabels(): Promise<void> {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach((t) => t.stop());
  } catch {
    /* permission denied later */
  }
}

async function preferRearDeviceId(): Promise<string | undefined> {
  try {
    await unlockDeviceLabels();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === "videoinput");
    if (!cams.length) return undefined;
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
    return scored[0]?.id;
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
  const tries: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
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
};

/**
 * Capture at full still-camera resolution via ImageCapture.takePhoto().
 * Falls back to grabFrame / video frame if unavailable.
 */
export async function captureMaxResStill(
  track: MediaStreamTrack | null,
  video?: HTMLVideoElement | null
): Promise<StillCapture | null> {
  const IC = ImageCaptureCtor();
  if (track && IC) {
    try {
      const capture = new IC(track);
      let settings: Record<string, unknown> = { fillLightMode: "auto" };
      try {
        const caps = await capture.getPhotoCapabilities();
        if (caps.imageWidth?.max) settings.imageWidth = caps.imageWidth.max;
        if (caps.imageHeight?.max) settings.imageHeight = caps.imageHeight.max;
      } catch {
        settings = {};
      }
      const blob = await capture.takePhoto(settings);
      const bitmap = await createImageBitmap(blob);
      const imageData = bitmapToImageData(bitmap);
      if (imageData) {
        return {
          imageData,
          width: bitmap.width,
          height: bitmap.height,
          source: "takePhoto",
          bitmap,
        };
      }
      bitmap.close?.();
    } catch {
      /* fall through */
    }

    try {
      const capture = new IC(track);
      const bitmap = await capture.grabFrame();
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
