// These routes own their multipart stream after authentication, using a 5 MB memory limit.
export const NURSING_IMAGE_UPLOAD_PATHS = Object.freeze([
  '/api/v1/nursing/images',
  '/api/v1/nursing-ipd/images'
]);
