# MediQzy PACS Low-Bandwidth Teleradiology Implementation

Date: 2026-08-14
Owner: Imaging platform
Status: Phase 1 implemented

## Goal

Doctors must be able to open CT and MRI studies remotely with diagnostic fidelity, predictable loading, and clear failure behavior on weak networks. The diagnostic WADO-RS frame path must remain lossless/original; low-bandwidth optimizations must improve startup, preview, caching, and observability without degrading the final image used for reporting.

## Current Architecture

- Viewer: OHIF at `/ohif`.
- DICOMweb API: `server/routes/hypergrid-dicom.route.js`.
- Archive source: HyperGrid rows backed by S3 or Orthanc instance pointers.
- Metrics surface: `server/services/imaging/imaging-observability.service.js` exposed through `/api/imaging/platform/metrics`.

## Phase 1 Implemented

1. Adaptive DICOMweb policy
   - Detects `Save-Data`, `ECT`, `quality`, `bandwidth`, and `imagingMode`.
   - Emits response hints:
     - `X-Mediqzy-Imaging-Mode`
     - `X-Mediqzy-Low-Bandwidth`
     - `X-Mediqzy-Prefetch-Window`
   - Supports `constrained`, `balanced`, and `diagnostic` modes.

2. Private caching
   - DICOM metadata and frames are cacheable only in private browser caches.
   - Frame and metadata cache TTLs are extended for low-bandwidth sessions.
   - `Vary: Authorization, Cookie, Accept` prevents cross-user cache reuse.

3. Server timing and telemetry
   - Adds `Server-Timing` for DICOMweb study, series, metadata, instance, and frame responses.
   - Records non-PHI metrics for:
     - metadata request count and latency
     - diagnostic frame request count, latency, and bytes
     - rendered preview request count, latency, and bytes
   - Labels avoid StudyInstanceUID, SeriesInstanceUID, SOPInstanceUID, patient identifiers, and accession numbers.

4. Rendered preview endpoint
   - Adds optional lightweight JPEG preview retrieval:
     - `/studies/:studyUID/series/:seriesUID/instances/:sopUID/frames/:frame/rendered`
   - Intended for mobile, thumbnails, previews, and very weak network flows.
   - Preserves original diagnostic WADO-RS frame retrieval for reporting.
   - Currently supports server-side rendering for uncompressed monochrome CT/MR style frames.
   - Compressed transfer syntaxes continue to use diagnostic frame retrieval unless a decompression/transcoding layer is added.

5. Safer OHIF metadata
   - Non-image DICOM objects are excluded from OHIF image stacks.
   - Additional DICOM geometry, slice, and windowing tags are included where available.

## Operating Modes

### Constrained

Triggered by `Save-Data: on`, `ECT: slow-2g|2g|3g`, or query hints such as `?quality=preview`.

- Prefetch window: 2
- Rendered preview target width: 768 px
- Rendered JPEG quality: 62
- Frame cache TTL: 7200 seconds

### Balanced

Default mode for normal remote viewing.

- Prefetch window: 8
- Rendered preview target width: 1024 px
- Rendered JPEG quality: 76
- Frame cache TTL: 3600 seconds

### Diagnostic

Triggered by `?quality=diagnostic`, `?imagingMode=diagnostic`, or `?bandwidth=full`.

- Prefetch window: 16
- Rendered preview target width: 2048 px
- Rendered JPEG quality: 90
- Diagnostic WADO-RS frames remain original transfer syntax payloads.

## Validation Commands

Run focused server checks:

```bash
cd /home/ubuntu/Mediczy
node --check server/services/dicomweb-ohif.service.js
node --check server/routes/hypergrid-dicom.route.js
cd server
npm test -- __tests__/dicomweb-ohif.test.js
```

Live DICOMweb checks should verify:

- series endpoint returns `200`
- metadata endpoint returns `200`
- frame endpoint returns `200`
- frame response includes transfer syntax
- `X-Mediqzy-Imaging-Mode` changes when `Save-Data: on` is supplied
- metadata/frame responses include private cache headers
- metrics appear in `/api/imaging/platform/metrics`

## Next Phases

1. OHIF client prefetch integration
   - Use the `X-Mediqzy-Prefetch-Window` hint to tune scroll-direction prefetch.
   - Disable hidden-series prefetch in constrained mode.

2. Compressed rendered previews
   - Add server-side decompression/transcoding for JPEG lossless, JPEG-LS, JPEG 2000, and RLE.
   - Then enable rendered previews for all modalities and scanner transfer syntaxes.

3. Edge acceleration
   - Put static OHIF assets behind CloudFront with Brotli and HTTP/3.
   - Keep DICOM PHI endpoints private/authenticated and avoid public edge caching unless a compliant signed/private cache design is approved.

4. Progressive transfer syntax pilot
   - Evaluate HTJ2K for future archive normalization.
   - Do not migrate diagnostic storage until viewer, archive, codec, and regulatory validation are complete.

5. Reading-room SLOs
   - Track p95 metadata latency, p95 first frame latency, frame error rate, and bytes per opened study.
   - Suggested initial targets:
     - metadata p95 below 1200 ms for 300-slice studies
     - first diagnostic frame p95 below 800 ms on normal broadband
     - frame 5xx below 0.1 percent
     - no non-image DICOM objects in OHIF image display sets
