/** @type {AppConfig} */
window.config = {
  routerBasename: '/ohif',
  showStudyList: true,

  dataSources: [{
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'mediqzyOrthanc',
    configuration: {
      friendlyName: 'MediQzy PACS',
      name: 'orthanc',
      qidoRoot: '/pacs/dicom-web',
      wadoRoot: '/pacs/dicom-web',
      wadoUriRoot: '/pacs/wado',
      qidoSupportsIncludeField: true,
      supportsFuzzyMatching: true,
      supportsWildcard: true,
      imageRendering: 'wadors',
      thumbnailRendering: 'wadors',
      enableStudyLazyLoad: true,
    },
  }],

  defaultDataSourceName: 'mediqzyOrthanc',

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
