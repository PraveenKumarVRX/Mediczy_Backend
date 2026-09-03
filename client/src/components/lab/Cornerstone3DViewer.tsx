import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Crosshair,
  Maximize2,
  Move,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  ZoomIn,
} from 'lucide-react';

type DicomJsonTag = {
  vr?: string;
  Value?: unknown[];
};

type DicomJsonInstance = Record<string, DicomJsonTag>;

export interface Cornerstone3DInstance {
  sop_instance_uid: string;
  series_instance_uid?: string | null;
  instance_number?: number | string | null;
  file_size?: number | null;
}

interface Cornerstone3DViewerProps {
  studyInstanceUID: string;
  token: string;
  instances: Cornerstone3DInstance[];
  modality?: string | null;
  bodyPart?: string | null;
  onOpenOhif?: () => void;
}

type ViewerStatus = 'idle' | 'loading' | 'ready' | 'fallback' | 'error';
type ToolKey = 'WindowLevel' | 'Pan' | 'Zoom' | 'Length' | 'Scroll' | 'Rotate3D';
type BlendKey = 'composite' | 'mip' | 'average';

const DICOMWEB_ROOT = '/api/hypergrid/dicom';
const MPR_VIEWPORTS = ['AXIAL', 'CORONAL', 'SAGITTAL'] as const;

let cornerstone3DAuthToken = '';
let cornerstone3DInitialized = false;

const getTagValue = (instance: DicomJsonInstance | undefined, tag: string): string => {
  const value = instance?.[tag]?.Value?.[0];
  if (value == null) return '';
  if (typeof value === 'object' && 'Alphabetic' in value) {
    return String((value as { Alphabetic?: string }).Alphabetic || '');
  }
  return String(value);
};

const getTagNumber = (instance: DicomJsonInstance | undefined, tag: string): number => {
  const parsed = Number(getTagValue(instance, tag));
  return Number.isFinite(parsed) ? parsed : 0;
};

const encodeUid = (uid: string) => encodeURIComponent(String(uid || '').trim());

const buildWadoRsImageId = (studyUID: string, seriesUID: string, sopUID: string) => {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `wadors:${base}${DICOMWEB_ROOT}/studies/${encodeUid(studyUID)}/series/${encodeUid(seriesUID)}/instances/${encodeUid(sopUID)}/frames/1`;
};

const viewportTitle: Record<string, string> = {
  AXIAL: 'Axial',
  CORONAL: 'Coronal',
  SAGITTAL: 'Sagittal',
  VOLUME_3D: '3D Volume',
};

async function initCornerstone3D(token: string) {
  cornerstone3DAuthToken = token;

  const [core, tools, dicomImageLoader] = await Promise.all([
    import('@cornerstonejs/core'),
    import('@cornerstonejs/tools'),
    import('@cornerstonejs/dicom-image-loader'),
  ]);

  if (!cornerstone3DInitialized) {
    core.init();
    tools.init();
    dicomImageLoader.init({
      maxWebWorkers: Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)),
      beforeSend: () => (
        cornerstone3DAuthToken
          ? { Authorization: `Bearer ${cornerstone3DAuthToken}` }
          : undefined
      ),
    });

    [
      tools.PanTool,
      tools.WindowLevelTool,
      tools.ZoomTool,
      tools.StackScrollTool,
      tools.LengthTool,
      tools.CrosshairsTool,
      tools.VolumeRotateTool,
    ].forEach((tool) => {
      try { tools.addTool(tool); } catch { /* already registered */ }
    });

    cornerstone3DInitialized = true;
  }

  return { core, tools, dicomImageLoader };
}

const Cornerstone3DViewer: React.FC<Cornerstone3DViewerProps> = ({
  studyInstanceUID,
  token,
  instances,
  modality,
  bodyPart,
  onOpenOhif,
}) => {
  const axialRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const volume3DRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef<any>(null);
  const toolGroupsRef = useRef<{ mpr?: string; volume?: string }>({});
  const viewportIdsRef = useRef<string[]>([]);
  const volumeIdRef = useRef<string>('');
  const coreRef = useRef<any>(null);

  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [message, setMessage] = useState('Preparing Cornerstone3D workstation…');
  const [loadedSeriesUID, setLoadedSeriesUID] = useState<string>('');
  const [loadedImageCount, setLoadedImageCount] = useState(0);
  const [activeTool, setActiveTool] = useState<ToolKey>('WindowLevel');
  const [blendMode, setBlendMode] = useState<BlendKey>('composite');
  const [preset, setPreset] = useState('CT-Bone');

  const instanceSeriesHint = useMemo(() => {
    const counts = new Map<string, number>();
    instances.forEach((inst) => {
      const seriesUID = inst.series_instance_uid || '';
      if (seriesUID) counts.set(seriesUID, (counts.get(seriesUID) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, [instances]);

  const cleanup = useCallback(() => {
    const renderingEngine = renderingRef.current;
    if (renderingEngine) {
      try { renderingEngine.destroy(); } catch { /* noop */ }
    }
    renderingRef.current = null;

    const core = coreRef.current;
    if (core && volumeIdRef.current) {
      try { core.cache.removeVolumeLoadObject?.(volumeIdRef.current); } catch { /* noop */ }
      try { core.cache.removeVolume?.(volumeIdRef.current); } catch { /* noop */ }
    }
    volumeIdRef.current = '';

    const { mpr, volume } = toolGroupsRef.current;
    if (mpr || volume) {
      import('@cornerstonejs/tools').then((tools) => {
        try { if (mpr) tools.ToolGroupManager.destroyToolGroup(mpr); } catch { /* noop */ }
        try { if (volume) tools.ToolGroupManager.destroyToolGroup(volume); } catch { /* noop */ }
      }).catch(() => {});
    }
    toolGroupsRef.current = {};
    viewportIdsRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (!studyInstanceUID || !token) {
      setStatus('fallback');
      setMessage('Missing study access token or StudyInstanceUID.');
      return;
    }
    if (!axialRef.current || !coronalRef.current || !sagittalRef.current || !volume3DRef.current) return;

    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      setMessage('Fetching DICOMweb series metadata…');
      cleanup();

      try {
        const { core, tools, dicomImageLoader } = await initCornerstone3D(token);
        coreRef.current = core;

        const commonHeaders = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/dicom+json, application/json',
        };

        const seriesResponse = await fetch(`${DICOMWEB_ROOT}/studies/${encodeUid(studyInstanceUID)}/series`, {
          headers: commonHeaders,
        });
        if (!seriesResponse.ok) throw new Error(`Series lookup failed with HTTP ${seriesResponse.status}`);

        const seriesPayload = await seriesResponse.json();
        const seriesList: DicomJsonInstance[] = Array.isArray(seriesPayload)
          ? seriesPayload
          : Array.isArray(seriesPayload?.series)
            ? seriesPayload.series
            : [];

        const seriesUID = instanceSeriesHint || seriesList
          .map((entry) => ({
            uid: getTagValue(entry, '0020000E'),
            count: getTagNumber(entry, '00201209'),
          }))
          .sort((a, b) => b.count - a.count)[0]?.uid;

        if (!seriesUID) throw new Error('No displayable DICOM series found for this study.');
        if (cancelled) return;

        setMessage('Caching WADO-RS metadata for Cornerstone3D…');
        const metadataResponse = await fetch(
          `${DICOMWEB_ROOT}/studies/${encodeUid(studyInstanceUID)}/series/${encodeUid(seriesUID)}/metadata`,
          { headers: commonHeaders },
        );
        if (!metadataResponse.ok) throw new Error(`Series metadata failed with HTTP ${metadataResponse.status}`);

        const metadata: DicomJsonInstance[] = await metadataResponse.json();
        const sortedMetadata = metadata
          .filter((entry) => getTagValue(entry, '00080018'))
          .sort((a, b) => {
            const instanceA = getTagNumber(a, '00200013');
            const instanceB = getTagNumber(b, '00200013');
            if (instanceA !== instanceB) return instanceA - instanceB;
            return getTagNumber(a, '00201041') - getTagNumber(b, '00201041');
          });

        const imageIds = sortedMetadata.map((entry) => {
          const actualSeriesUID = getTagValue(entry, '0020000E') || seriesUID;
          const sopUID = getTagValue(entry, '00080018');
          const imageId = buildWadoRsImageId(studyInstanceUID, actualSeriesUID, sopUID);
          dicomImageLoader.wadors.metaDataManager.add(imageId, entry);
          return imageId;
        });

        try {
          const metadataLib = await import('@cornerstonejs/metadata');
          imageIds.forEach((imageId, index) => {
            try {
              metadataLib.utilities.addDicomWebInstance(imageId, sortedMetadata[index]);
            } catch { /* legacy metadata manager remains available */ }
          });
        } catch { /* optional metadata package fallback */ }

        if (imageIds.length < 2) {
          setStatus('fallback');
          setLoadedSeriesUID(seriesUID);
          setLoadedImageCount(imageIds.length);
          setMessage('This series has fewer than 2 image instances, so MPR/volume rendering is not available. Use OHIF or the quick preview for single-image review.');
          return;
        }

        if (cancelled) return;
        setMessage(`Creating ${imageIds.length}-slice volume…`);

        const renderingEngineId = `mediqzy-cs3d-${Date.now()}`;
        const viewportPrefix = renderingEngineId.replace(/[^a-zA-Z0-9_-]/g, '');
        const viewportIds = {
          axial: `${viewportPrefix}-AXIAL`,
          coronal: `${viewportPrefix}-CORONAL`,
          sagittal: `${viewportPrefix}-SAGITTAL`,
          volume3d: `${viewportPrefix}-VOLUME_3D`,
        };
        viewportIdsRef.current = Object.values(viewportIds);

        const renderingEngine = new core.RenderingEngine(renderingEngineId);
        renderingRef.current = renderingEngine;

        renderingEngine.setViewports([
          {
            viewportId: viewportIds.axial,
            type: core.Enums.ViewportType.ORTHOGRAPHIC,
            element: axialRef.current,
            defaultOptions: {
              orientation: core.Enums.OrientationAxis.AXIAL,
              background: [0, 0, 0],
            },
          },
          {
            viewportId: viewportIds.coronal,
            type: core.Enums.ViewportType.ORTHOGRAPHIC,
            element: coronalRef.current,
            defaultOptions: {
              orientation: core.Enums.OrientationAxis.CORONAL,
              background: [0, 0, 0],
            },
          },
          {
            viewportId: viewportIds.sagittal,
            type: core.Enums.ViewportType.ORTHOGRAPHIC,
            element: sagittalRef.current,
            defaultOptions: {
              orientation: core.Enums.OrientationAxis.SAGITTAL,
              background: [0, 0, 0],
            },
          },
          {
            viewportId: viewportIds.volume3d,
            type: core.Enums.ViewportType.VOLUME_3D,
            element: volume3DRef.current,
            defaultOptions: {
              background: [0, 0, 0],
            },
          },
        ]);

        const mprToolGroupId = `${viewportPrefix}-MPR_TOOLS`;
        const volumeToolGroupId = `${viewportPrefix}-VR_TOOLS`;
        toolGroupsRef.current = { mpr: mprToolGroupId, volume: volumeToolGroupId };

        const mprToolGroup = tools.ToolGroupManager.createToolGroup(mprToolGroupId);
        const volumeToolGroup = tools.ToolGroupManager.createToolGroup(volumeToolGroupId);
        if (!mprToolGroup || !volumeToolGroup) throw new Error('Unable to create Cornerstone3D tool groups.');

        [
          tools.WindowLevelTool.toolName,
          tools.PanTool.toolName,
          tools.ZoomTool.toolName,
          tools.StackScrollTool.toolName,
          tools.LengthTool.toolName,
          tools.CrosshairsTool.toolName,
        ].forEach((toolName) => {
          try { mprToolGroup.addTool(toolName); } catch { /* already added */ }
        });
        [
          tools.VolumeRotateTool.toolName,
          tools.PanTool.toolName,
          tools.ZoomTool.toolName,
        ].forEach((toolName) => {
          try { volumeToolGroup.addTool(toolName); } catch { /* already added */ }
        });

        [viewportIds.axial, viewportIds.coronal, viewportIds.sagittal].forEach((viewportId) => {
          mprToolGroup.addViewport(viewportId, renderingEngineId);
        });
        volumeToolGroup.addViewport(viewportIds.volume3d, renderingEngineId);

        const { MouseBindings } = tools.Enums;
        mprToolGroup.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        mprToolGroup.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
        mprToolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });
        mprToolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] });
        mprToolGroup.setToolPassive(tools.LengthTool.toolName);
        mprToolGroup.setToolPassive(tools.CrosshairsTool.toolName);

        volumeToolGroup.setToolActive(tools.VolumeRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
        volumeToolGroup.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: MouseBindings.Auxiliary }] });
        volumeToolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: MouseBindings.Secondary }] });

        const volumeId = `cornerstoneStreamingImageVolume:${viewportPrefix}-volume`;
        volumeIdRef.current = volumeId;
        const volume = await core.volumeLoader.createAndCacheVolume(volumeId, { imageIds });
        volume.load();

        await core.setVolumesForViewports(
          renderingEngine,
          [{ volumeId }],
          [viewportIds.axial, viewportIds.coronal, viewportIds.sagittal, viewportIds.volume3d],
        );

        const vrViewport = renderingEngine.getViewport(viewportIds.volume3d) as any;
        try {
          vrViewport.setProperties({ preset: 'CT-Bone' }, volumeId);
          vrViewport.setBlendMode(core.Enums.BlendModes.COMPOSITE);
        } catch { /* preset is best-effort */ }

        renderingEngine.renderViewports(Object.values(viewportIds));

        if (cancelled) return;
        setLoadedSeriesUID(seriesUID);
        setLoadedImageCount(imageIds.length);
        setStatus('ready');
        setMessage('Cornerstone3D MPR + volume rendering is live.');
      } catch (error: any) {
        if (cancelled) return;
        console.error('[Cornerstone3DViewer] load failed:', error);
        setStatus('error');
        setMessage(error?.message || 'Cornerstone3D could not render this study.');
      }
    };

    load();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [studyInstanceUID, token, instanceSeriesHint, cleanup]);

  const setMprTool = useCallback(async (tool: ToolKey) => {
    const toolGroups = toolGroupsRef.current;
    if (!toolGroups.mpr) return;
    const tools = await import('@cornerstonejs/tools');
    const group = tools.ToolGroupManager.getToolGroup(toolGroups.mpr);
    if (!group) return;
    const { MouseBindings } = tools.Enums;
    const map: Partial<Record<ToolKey, string>> = {
      WindowLevel: tools.WindowLevelTool.toolName,
      Pan: tools.PanTool.toolName,
      Zoom: tools.ZoomTool.toolName,
      Length: tools.LengthTool.toolName,
      Scroll: tools.StackScrollTool.toolName,
    };
    Object.values(map).forEach((toolName) => {
      try { group.setToolPassive(toolName); } catch { /* noop */ }
    });
    const toolName = map[tool];
    if (toolName) {
      group.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
      if (tool !== 'Scroll') {
        try { group.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: MouseBindings.Wheel }] }); } catch { /* noop */ }
      }
    }
    setActiveTool(tool);
  }, []);

  const setVolumeBlend = useCallback(async (nextBlendMode: BlendKey) => {
    const renderingEngine = renderingRef.current;
    const core = coreRef.current;
    const volumeViewportId = viewportIdsRef.current.find((id) => id.endsWith('VOLUME_3D'));
    if (!renderingEngine || !core || !volumeViewportId) return;
    const viewport = renderingEngine.getViewport(volumeViewportId) as any;
    const blend = nextBlendMode === 'mip'
      ? core.Enums.BlendModes.MAXIMUM_INTENSITY_BLEND
      : nextBlendMode === 'average'
        ? core.Enums.BlendModes.AVERAGE_INTENSITY_BLEND
        : core.Enums.BlendModes.COMPOSITE;
    try {
      viewport.setBlendMode(blend);
      viewport.render();
      setBlendMode(nextBlendMode);
    } catch { /* best-effort */ }
  }, []);

  const activate3DRotate = useCallback(async () => {
    const toolGroups = toolGroupsRef.current;
    if (!toolGroups.volume) return;
    const tools = await import('@cornerstonejs/tools');
    const group = tools.ToolGroupManager.getToolGroup(toolGroups.volume);
    if (!group) return;
    const { MouseBindings } = tools.Enums;
    try {
      group.setToolActive(tools.VolumeRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
      setActiveTool('Rotate3D');
    } catch { /* noop */ }
  }, []);

  const applyPreset = useCallback(async (nextPreset: string) => {
    const renderingEngine = renderingRef.current;
    const volumeViewportId = viewportIdsRef.current.find((id) => id.endsWith('VOLUME_3D'));
    if (!renderingEngine || !volumeViewportId || !volumeIdRef.current) {
      setPreset(nextPreset);
      return;
    }
    const viewport = renderingEngine.getViewport(volumeViewportId) as any;
    try {
      viewport.setProperties({ preset: nextPreset }, volumeIdRef.current);
      viewport.render();
    } catch { /* best-effort */ }
    setPreset(nextPreset);
  }, []);

  const resetCameras = useCallback(() => {
    const renderingEngine = renderingRef.current;
    if (!renderingEngine) return;
    viewportIdsRef.current.forEach((viewportId) => {
      try {
        const viewport = renderingEngine.getViewport(viewportId) as any;
        viewport.resetCamera?.();
        viewport.render?.();
      } catch { /* noop */ }
    });
  }, []);

  const renderPanel = (id: string, ref: React.RefObject<HTMLDivElement>) => (
    <div className="relative min-h-[230px] overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-inner">
      <div ref={ref} className="h-full min-h-[230px] w-full" onContextMenu={(e) => e.preventDefault()} />
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-700/80 bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-slate-200">
        {viewportTitle[id]}
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-black/65 px-2 py-1 text-[10px] text-slate-400">
        {id === 'VOLUME_3D' ? 'Left: rotate · Right: zoom' : 'Wheel: scroll · Middle: pan · Right: zoom'}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/85 shadow-2xl shadow-black/40">
      <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/95 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              status === 'ready' ? 'bg-emerald-500/15 text-emerald-200'
                : status === 'loading' ? 'bg-cyan-500/15 text-cyan-200'
                  : 'bg-amber-500/15 text-amber-200'
            }`}>
              {status === 'ready' ? 'Cornerstone3D live' : status === 'loading' ? 'Loading volume' : 'Viewer fallback'}
            </span>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
              {loadedImageCount || instances.length || 0} slices
            </span>
            {loadedSeriesUID && (
              <span className="max-w-[340px] truncate rounded-full bg-slate-900 px-2.5 py-1 font-mono text-[10px] text-slate-500">
                Series {loadedSeriesUID}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {modality || 'DICOM'} {bodyPart ? `· ${bodyPart}` : ''} · {message}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            ['WindowLevel', SlidersHorizontal, 'WL'] as const,
            ['Pan', Move, 'Pan'] as const,
            ['Zoom', ZoomIn, 'Zoom'] as const,
            ['Length', Ruler, 'Measure'] as const,
            ['Scroll', Crosshair, 'Scroll'] as const,
          ].map(([tool, Icon, label]) => (
            <button
              key={tool}
              type="button"
              onClick={() => setMprTool(tool)}
              disabled={status !== 'ready'}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                activeTool === tool ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
          <button
            type="button"
            onClick={activate3DRotate}
            disabled={status !== 'ready'}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Box size={13} /> 3D rotate
          </button>
          <button
            type="button"
            onClick={resetCameras}
            disabled={status !== 'ready'}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-900 disabled:opacity-40"
          >
            <RotateCcw size={13} /> Reset
          </button>
          {onOpenOhif && (
            <button
              type="button"
              onClick={onOpenOhif}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/20"
            >
              <Maximize2 size={13} /> OHIF
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div className="grid min-h-0 gap-3">
          {renderPanel('AXIAL', axialRef)}
          <div className="grid gap-3 lg:grid-cols-2">
            {renderPanel('CORONAL', coronalRef)}
            {renderPanel('SAGITTAL', sagittalRef)}
          </div>
        </div>
        <div className="grid min-h-0 gap-3">
          {renderPanel('VOLUME_3D', volume3DRef)}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Volume controls</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ['composite', 'Composite'],
                ['mip', 'MIP'],
                ['average', 'Average'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setVolumeBlend(key as BlendKey)}
                  disabled={status !== 'ready'}
                  className={`rounded-lg px-2 py-2 text-xs disabled:opacity-40 ${
                    blendMode === key ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {['CT-Bone', 'CT-Bones', 'CT-Cardiac', 'CT-Lung'].map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => applyPreset(entry)}
                  disabled={status !== 'ready'}
                  className={`rounded-lg px-2 py-2 text-xs disabled:opacity-40 ${
                    preset === entry ? 'bg-cyan-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {entry.replace('CT-', '')}
                </button>
              ))}
            </div>
            {(status === 'error' || status === 'fallback') && (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{message}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cornerstone3DViewer;
