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
      // Same-origin paths — nginx proxies /pacs → Orthanc DICOMweb (no CORS)
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
};
