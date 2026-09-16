/** @type {AppConfig} */
window.config = {
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
        qidoRoot: '/api/hypergrid/dicom',
        wadoRoot: '/api/hypergrid/dicom',
        wadoUriRoot: '/api/hypergrid/dicom',
        qidoSupportsIncludeField: true,
        supportsFuzzyMatching: true,
        supportsWildcard: true,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
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
  ],

  // Phase 4: modality hanging protocols (Cornerstone3D / OHIF v3)
  hangingProtocols: [
    {
      id: 'ct-chest-standard',
      name: 'CT Chest',
      protocolMatchingRules: [{ attribute: 'ModalitiesInStudy', constraint: { contains: 'CT' } }],
      stages: [{ id: 'ct-stage', viewportStructure: { layoutType: 'grid', properties: { rows: 2, columns: 2 } } }],
    },
    {
      id: 'mri-brain-standard',
      name: 'MRI Brain',
      protocolMatchingRules: [{ attribute: 'ModalitiesInStudy', constraint: { contains: 'MR' } }],
      stages: [{ id: 'mr-stage', viewportStructure: { layoutType: 'grid', properties: { rows: 2, columns: 2 } } }],
    },
    {
      id: 'xr-chest-standard',
      name: 'Chest X-Ray',
      protocolMatchingRules: [{ attribute: 'ModalitiesInStudy', constraint: { contains: 'CR' } }],
      stages: [{ id: 'xr-stage', viewportStructure: { layoutType: 'grid', properties: { rows: 1, columns: 1 } } }],
    },
  ],

  investigationalUseDialog: {
    option: 'never',
  },
};
