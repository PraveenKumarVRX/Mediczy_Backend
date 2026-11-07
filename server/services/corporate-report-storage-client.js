import {S3Client,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
let cached;        // dedicated MinIO/PACS client (legacy / explicit opt-in)
let cachedS3;      // platform AWS S3 client (default for corporate reports)

/** Corporate report storage defaults to the platform AWS S3 bucket, whose
 *  presigned URLs are reachable from any browser and do NOT depend on the
 *  MinIO/PACS Cloudflare tunnel. Set CORPORATE_REPORTS_STORAGE=minio (or =pacs)
 *  to opt a dedicated MinIO/PACS endpoint back in. */
export function corporateReportsUseS3(){
  const mode=(process.env.CORPORATE_REPORTS_STORAGE||'s3').toLowerCase();
  return mode!=='minio'&&mode!=='pacs';
}
function awsS3Client(){
  if(!cachedS3)cachedS3=new S3Client({region:process.env.S3_REGION||process.env.AWS_REGION||'ap-south-1',requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
  return cachedS3;
}
export function corporateReportStorageConfig(){
  const prefix=process.env.CORPORATE_REPORTS_MINIO_ENDPOINT?'CORPORATE_REPORTS_MINIO':process.env.PACS_ARCHIVE_MINIO_ENDPOINT?'PACS_ARCHIVE_MINIO':'MINIO';
  const endpoint=process.env[`${prefix}_ENDPOINT`],accessKeyId=process.env[`${prefix}_ACCESS_KEY`],secretAccessKey=process.env[`${prefix}_SECRET_KEY`];
  if(!endpoint||!accessKeyId||!secretAccessKey)throw Object.assign(new Error('Corporate report storage is not configured'),{status:503,code:'REPORT_STORAGE_NOT_CONFIGURED'});
  return {endpoint:endpoint.replace(/\/$/,''),region:process.env[`${prefix}_REGION`]||'us-east-1',credentials:{accessKeyId,secretAccessKey}};
}
export function getCorporateReportClient(){
  if(corporateReportsUseS3())return awsS3Client();
  if(!cached)cached=new S3Client({...corporateReportStorageConfig(),forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
  return cached;
}
export function corporateStoredFileUrl(key,bucket){
  const path=key.split('/').map(encodeURIComponent).join('/');
  if(corporateReportsUseS3()){
    const region=process.env.S3_REGION||process.env.AWS_REGION||'ap-south-1';
    return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
  }
  return `${corporateReportStorageConfig().endpoint}/${bucket}/${path}`;
}
export async function corporateReportDownloadUrl(key,bucket,expiresIn=900){
  if(!key||!bucket)throw new Error('Report storage location is missing');
  return getSignedUrl(getCorporateReportClient(),new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn});
}
export async function deleteCorporateReportObject(key,bucket){
  await getCorporateReportClient().send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
}

export async function readCorporateReportFile(key,bucket){
  const response=await getCorporateReportClient().send(new GetObjectCommand({Bucket:bucket,Key:key}));
  return Buffer.from(await response.Body.transformToByteArray());
}
