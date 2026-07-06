/**
 * OHIF ↔ MediQzy measurement bridge (loaded by parent window opener).
 * Parent calls listenOhifMeasurements() after openOhifViewer().
 */
(function () {
  const ALLOWED_ORIGIN = window.location.origin;

  window.addEventListener('message', (event) => {
    if (event.origin !== ALLOWED_ORIGIN) return;
    if (event.data?.type !== 'MEDICZY_OHIF_MEASUREMENT') return;
    const payload = event.data.payload || {};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'MEDICZY_OHIF_MEASUREMENT', payload }, ALLOWED_ORIGIN);
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'MEDICZY_OHIF_MEASUREMENT', payload }, ALLOWED_ORIGIN);
    }
  });

  window.MediczyOhifBridge = {
    publishMeasurement(payload) {
      window.postMessage({ type: 'MEDICZY_OHIF_MEASUREMENT', payload }, ALLOWED_ORIGIN);
    },
  };
})();
