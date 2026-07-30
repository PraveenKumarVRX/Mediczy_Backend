/**
 * DicomViewer — Cornerstone.js PACS/DICOM viewer component
 *
 * Supports:
 *  • DICOM files  → rendered via cornerstone-wado-image-loader (wadouri scheme)
 *  • Images (JPEG/PNG/BMP/TIFF) → fallback <img>
 *  • Videos (mp4/webm/ogg) → fallback <video>
 *  • PDFs  → fallback <iframe>
 *
 * Tools: Window/Level, Zoom, Pan, Length, Angle, Invert, Reset
 * Multi-frame: slider control
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn, ZoomOut, Move, Sliders, RotateCcw, SunMedium,
  Ruler, Maximize2, Minimize2, ChevronLeft, ChevronRight, X,
} from 'lucide-react';

interface DicomViewerProps {
  studyId: number | string;
  fileName: string;
  mimeType: string;
  isDicom: boolean;
  patientName: string;
  modality: string;
  studyDate: string;
  onClose?: () => void;
  /** Override the default labToken with a different token (e.g. doctor's JWT) */
  tokenOverride?: string;
  /** Override the default /api/lab/ris API base (e.g. /api/doctors/ris-referred) */
  apiBaseOverride?: string;
  /** Use a fully-qualified or relative file URL instead of `${apiBase}/file/${studyId}` */
  fileUrlOverride?: string;
}

interface CornerstoneLib {
  cornerstone: unknown;
  cornerstoneWADOImageLoader: unknown;
  cornerstoneTools: unknown;
  dicomParser: unknown;
}

const API_BASE = typeof window !== 'undefined' && window.location.pathname.startsWith('/clinic/')
  ? '/api/clinic/ris'
  : '/api/lab/ris';

/* ────── Tool button helper ────────────────────────────────────────────────── */
const ToolBtn: React.FC<{
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, title, onClick, children }) => (
  <button
    title={title}
    onClick={onClick}
    className={`p-2 rounded-lg transition-all text-sm flex items-center gap-1 ${
      active
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900'
        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
    }`}
  >
    {children}
  </button>
);

/* ────── DicomViewer ────────────────────────────────────────────────────────── */
const DicomViewer: React.FC<DicomViewerProps> = ({
  studyId,
  fileName,
  mimeType,
  isDicom,
  patientName,
  modality,
  studyDate,
  onClose,
  tokenOverride,
  apiBaseOverride,
  fileUrlOverride,
}) => {
  const viewerRef  = useRef<HTMLDivElement>(null);
  const resolvedApiBase = apiBaseOverride || API_BASE;
  const [csLib, setCsLib]             = useState<CornerstoneLib | null>(null);
  const [activeTool, setActiveTool]   = useState<string>('Wwwc');
  const [inverted, setInverted]       = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [frame, setFrame]             = useState(1);
  const [totalFrames, setTotalFrames] = useState(1);
  const [ww, setWw]                   = useState<number | null>(null);
  const [wc, setWc]                   = useState<number | null>(null);
  const [csError, setCsError]         = useState<string | null>(null);
  const [loaded, setLoaded]           = useState(false);

  const fileUrl = fileUrlOverride || `${resolvedApiBase}/file/${studyId}`;
  const defaultTokenKey = typeof window !== 'undefined' && window.location.pathname.startsWith('/clinic/')
    ? 'clinicToken'
    : 'labToken';
  const token   = tokenOverride || localStorage.getItem(defaultTokenKey) || '';

  /* ── Load cornerstone libs lazily ─────────────────────────────────────── */
  useEffect(() => {
    if (!isDicom) { setLoaded(true); return; }

    (async () => {
      try {
        const [cs, csWado, csTools, dcmParser] = await Promise.all([
          import('cornerstone-core'),
          import('cornerstone-wado-image-loader'),
          import('cornerstone-tools'),
          import('dicom-parser'),
        ]);

        // Configure WADO image loader
        const wadoMod = csWado as unknown as { external: { cornerstone: unknown; dicomParser: unknown }; configure: (o: unknown) => void };
        wadoMod.external.cornerstone  = cs;
        wadoMod.external.dicomParser  = dcmParser;
        wadoMod.configure({
          beforeSend: (xhr: XMLHttpRequest) => {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          },
          useWebWorkers: true,
        });

        // Configure tools
        const toolsMod = csTools as unknown as {
          external: { cornerstone: unknown; cornerstoneMath: unknown };
          init: (o: unknown) => void;
        };
        toolsMod.external.cornerstone      = cs;
        toolsMod.external.cornerstoneMath  = null;
        toolsMod.init({ globalToolSyncEnabled: false });

        setCsLib({ cornerstone: cs, cornerstoneWADOImageLoader: csWado, cornerstoneTools: csTools, dicomParser: dcmParser });
      } catch (err) {
        console.error('[DicomViewer] Library load error:', err);
        setCsError('Could not load DICOM viewer libraries.');
        setLoaded(true);
      }
    })();
  }, [isDicom, token]);

  /* ── Enable element & load image after lib is ready ───────────────────── */
  useEffect(() => {
    if (!isDicom || !csLib || !viewerRef.current) return;

    const el = viewerRef.current;
    const cs = csLib.cornerstone as {
      enable: (el: HTMLElement) => void;
      loadAndCacheImage: (id: string) => Promise<unknown>;
      displayImage: (el: HTMLElement, img: unknown, vp?: unknown) => void;
      getViewport: (el: HTMLElement) => { voi?: { windowWidth: number; windowCenter: number }; invert?: boolean };
      setViewport: (el: HTMLElement, vp: unknown) => void;
      events: { ELEMENT_DISABLED: string };
    };

    try { cs.enable(el); } catch {}

    const imageId = `wadouri:${fileUrl}`;

    cs.loadAndCacheImage(imageId).then((image: unknown) => {
      cs.displayImage(el, image);
      const vp = cs.getViewport(el);
      if (vp?.voi) {
        setWw(Math.round(vp.voi.windowWidth));
        setWc(Math.round(vp.voi.windowCenter));
      }

      // Detect total frames via numFrames metadata
      const img = image as { data?: { string?: (tag: string) => string } };
      const numFrames = img?.data?.string?.('x00280008');
      if (numFrames) setTotalFrames(parseInt(numFrames) || 1);

      setLoaded(true);
    }).catch((err: Error) => {
      console.error('[DicomViewer] Image load error:', err);
      setCsError('Could not load DICOM image. File may be corrupted or non-standard.');
      setLoaded(true);
    });

    return () => {
      try { (cs as { disable?: (el: HTMLElement) => void }).disable?.(el); } catch {}
    };
  }, [csLib, isDicom, fileUrl]);

  /* ── Activate tool ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isDicom || !csLib || !viewerRef.current || !loaded) return;
    const tools = csLib.cornerstoneTools as {
      setToolActiveForElement: (el: HTMLElement, name: string, opts: unknown) => void;
      setToolPassiveForElement?: (el: HTMLElement, name: string) => void;
    };
    const el = viewerRef.current;
    const toolMap: Record<string, string> = {
      Wwwc: 'Wwwc',
      Zoom: 'Zoom',
      Pan: 'Pan',
      Length: 'Length',
      Angle: 'Angle',
    };
    const name = toolMap[activeTool];
    if (name) {
      try {
        tools.setToolActiveForElement(el, name, { mouseButtonMask: 1 });
      } catch {}
    }
  }, [activeTool, csLib, isDicom, loaded]);

  /* ── Invert ─────────────────────────────────────────────────────────────── */
  const toggleInvert = useCallback(() => {
    if (!csLib || !viewerRef.current) return;
    const cs = csLib.cornerstone as {
      getViewport: (el: HTMLElement) => unknown;
      setViewport: (el: HTMLElement, vp: unknown) => void;
    };
    const el = viewerRef.current;
    const vp = cs.getViewport(el) as { invert?: boolean };
    if (vp) {
      vp.invert = !vp.invert;
      cs.setViewport(el, vp);
      setInverted(v => !v);
    }
  }, [csLib]);

  /* ── Reset ──────────────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    if (!csLib || !viewerRef.current) return;
    const cs = csLib.cornerstone as { reset: (el: HTMLElement) => void };
    try { cs.reset(viewerRef.current); } catch {}
    setInverted(false);
  }, [csLib]);

  /* ── Frame navigation ───────────────────────────────────────────────────── */
  const goToFrame = useCallback((f: number) => {
    if (!csLib || !viewerRef.current) return;
    const cs = csLib.cornerstone as {
      loadAndCacheImage: (id: string) => Promise<unknown>;
      displayImage: (el: HTMLElement, img: unknown) => void;
    };
    const imageId = `wadouri:${fileUrl}?frame=${f - 1}`;
    cs.loadAndCacheImage(imageId).then(img => {
      cs.displayImage(viewerRef.current!, img);
      setFrame(f);
    }).catch(console.error);
  }, [csLib, fileUrl]);

  /* ── Determine fallback type ────────────────────────────────────────────── */
  const isVideo = mimeType.startsWith('video/');
  const isPdf   = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  /* ── Viewport update listener ───────────────────────────────────────────── */
  useEffect(() => {
    if (!isDicom || !csLib || !viewerRef.current) return;
    const el = viewerRef.current;
    const onVpChange = () => {
      try {
        const cs = csLib.cornerstone as {
          getViewport: (el: HTMLElement) => { voi?: { windowWidth: number; windowCenter: number } };
        };
        const vp = cs.getViewport(el);
        if (vp?.voi) {
          setWw(Math.round(vp.voi.windowWidth));
          setWc(Math.round(vp.voi.windowCenter));
        }
      } catch {}
    };
    el.addEventListener('cornerstoneimagerendered', onVpChange);
    return () => el.removeEventListener('cornerstoneimagerendered', onVpChange);
  }, [isDicom, csLib]);

  return (
    <div className={`flex flex-col bg-black text-white ${fullscreen ? 'fixed inset-0 z-50' : 'h-full rounded-xl overflow-hidden'}`}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700 flex-wrap">
        {/* Patient info */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-indigo-300 truncate">{patientName}</div>
          <div className="text-xs text-gray-400">{modality} · {studyDate}</div>
        </div>

        {/* WW/WC readout */}
        {isDicom && ww !== null && (
          <div className="text-xs text-gray-400 hidden sm:flex gap-2 font-mono">
            <span>WW:{ww}</span>
            <span>WC:{wc}</span>
          </div>
        )}

        {/* Tools */}
        {isDicom && (
          <>
            <ToolBtn active={activeTool === 'Wwwc'} title="Window/Level" onClick={() => setActiveTool('Wwwc')}>
              <Sliders size={14} />
            </ToolBtn>
            <ToolBtn active={activeTool === 'Zoom'} title="Zoom" onClick={() => setActiveTool('Zoom')}>
              <ZoomIn size={14} />
            </ToolBtn>
            <ToolBtn active={activeTool === 'Pan'} title="Pan" onClick={() => setActiveTool('Pan')}>
              <Move size={14} />
            </ToolBtn>
            <ToolBtn active={activeTool === 'Length'} title="Measure Length" onClick={() => setActiveTool('Length')}>
              <Ruler size={14} />
            </ToolBtn>
            <ToolBtn active={inverted} title="Invert" onClick={toggleInvert}>
              <SunMedium size={14} />
            </ToolBtn>
            <ToolBtn title="Reset" onClick={handleReset}>
              <RotateCcw size={14} />
            </ToolBtn>
          </>
        )}

        <ToolBtn title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={() => setFullscreen(v => !v)}>
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </ToolBtn>
        {onClose && (
          <ToolBtn title="Close Viewer" onClick={onClose}>
            <X size={14} />
          </ToolBtn>
        )}
      </div>

      {/* ── Viewport area ──────────────────────────────────────────────── */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {isDicom && !csError && (
          <div
            ref={viewerRef}
            className="w-full h-full"
            style={{ minHeight: '300px' }}
          />
        )}

        {/* Loading spinner */}
        {!loaded && !csError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* DICOM error → try image fallback */}
        {isDicom && csError && (
          <div className="flex flex-col items-center gap-3 text-center p-6">
            <div className="text-red-400 text-sm">{csError}</div>
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-full max-h-96 object-contain"
              onError={() => {}}
            />
          </div>
        )}

        {/* Non-DICOM image */}
        {!isDicom && isImage && (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
          />
        )}

        {/* Video */}
        {!isDicom && isVideo && (
          <video controls className="max-w-full max-h-full">
            <source src={fileUrl} type={mimeType} />
            Your browser does not support the video tag.
          </video>
        )}

        {/* PDF */}
        {!isDicom && isPdf && (
          <iframe
            src={fileUrl}
            title={fileName}
            className="w-full h-full border-0"
          />
        )}

        {/* Unsupported fallback */}
        {!isDicom && !isImage && !isVideo && !isPdf && (
          <div className="text-gray-400 text-sm text-center p-6">
            <div className="mb-2">Preview not available</div>
            <a
              href={fileUrl}
              download={fileName}
              className="text-indigo-400 underline"
            >
              Download file
            </a>
          </div>
        )}
      </div>

      {/* ── Frame slider (multi-frame DICOM) ───────────────────────────── */}
      {isDicom && totalFrames > 1 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-t border-gray-700">
          <button
            onClick={() => goToFrame(Math.max(1, frame - 1))}
            disabled={frame <= 1}
            className="p-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="range"
            min={1}
            max={totalFrames}
            value={frame}
            onChange={e => goToFrame(parseInt(e.target.value))}
            className="flex-1 accent-indigo-500"
          />
          <button
            onClick={() => goToFrame(Math.min(totalFrames, frame + 1))}
            disabled={frame >= totalFrames}
            className="p-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
          <span className="text-xs text-gray-400 tabular-nums w-16 text-right">
            {frame} / {totalFrames}
          </span>
        </div>
      )}
    </div>
  );
};

export default DicomViewer;
