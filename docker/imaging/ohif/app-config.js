/** @type {AppConfig} */
window.config = {
  routerBasename: '/',
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
        // Override at deploy time via envsubst or edit for your host:
        wadoUriRoot: 'https://mediqzy.com/api/hypergrid/dicom',
        qidoRoot: 'https://mediqzy.com/api/hypergrid/dicom',
        wadoRoot: 'https://mediqzy.com/api/hypergrid/dicom',
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
