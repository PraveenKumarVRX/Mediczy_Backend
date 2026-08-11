/** @type {AppConfig} */
window.config = {
  // Served under /ohif/ via nginx proxy — React Router needs this to match routes
  // like /viewer against the real browser path /ohif/viewer. Left as '/' the router
  // couldn't match any route against the actual URL, rendering a blank screen even
  // though the JS bundle loaded and Cornerstone initialized fine.
  routerBasename: '/ohif/',
  showStudyList: true,
  extensions: [],
  modes: [],
  defaultDataSourceName: 'mediczy-hypergrid',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'mediczy-hypergrid',
      configuration: {
        friendlyName: 'Mediczy HyperGrid DICOMweb',
        name: 'mediczy',
        // Relative paths — same-origin via app nginx / API host.
        // Do NOT hardcode https://mediqzy.com (marketing site has no /api proxy).
        wadoUriRoot: '/api/hypergrid/dicom',
        qidoRoot: '/api/hypergrid/dicom',
        wadoRoot: '/api/hypergrid/dicom',
        qidoSupportsIncludeField: true,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        staticWado: false,
        singlepart: 'bulkdata,video,pdf',
        requestOptions: {
          auth: (options) => {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('access_token') || params.get('token');
            if (token) {
              options.headers = options.headers || {};
              options.headers.Authorization = `Bearer ${token}`;
            }
            return options;
          },
        },
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthanc-local',
      configuration: {
        friendlyName: 'Orthanc (local C-STORE)',
        name: 'orthanc',
        wadoUriRoot: 'http://localhost:8042/dicom-web',
        qidoRoot: 'http://localhost:8042/dicom-web',
        wadoRoot: 'http://localhost:8042/dicom-web',
        qidoSupportsIncludeField: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
      },
    },
  ],
};
