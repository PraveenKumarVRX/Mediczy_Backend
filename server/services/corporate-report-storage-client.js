import {S3Client,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
let cached;        // dedicated MinIO/PACS client (legacy / explicit opt-in)
let cachedS3;      // platform AWS S3 client (default for corporate reports)

/** Which backend corporate report storage uses, in precedence order:
 *  1. CORPORATE_REPORTS_STORAGE forces it: s3|aws => native AWS S3; minio|pacs|s3c => a
 *     dedicated S3-compatible endpoint (MinIO, iDrive e2, Wasabi, ...).
 *  2. Else, if a dedicated endpoint is explicitly configured
 *     (CORPORATE_REPORTS_MINIO_ENDPOINT), use that endpoint.
 *  3. Else default to the platform AWS S3 bucket, whose presigned URLs are
 *     browser-reachable and do NOT depend on the MinIO/PACS Cloudflare tunnel.
 *  A configured custom endpoint (e.g. iDrive e2) therefore needs no extra flag —
 *  just set CORPORATE_REPORTS_MINIO_ENDPOINT/_ACCESS_KEY/_SECRET_KEY/_REGION/_BUCKET. */
export function corporateReportsUseS3(){
  const mode=(process.env.CORPORATE_REPORTS_STORAGE||'').toLowerCase();
  if(mode==='s3'||mode==='aws')return true;
  if(mode==='minio'||mode==='pacs'||mode==='s3c'||mode==='s3-compatible')return false;
  return !process.env.CORPORATE_REPORTS_MINIO_ENDPOINT;
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

/* Reports were uploaded to whichever store was current at the time (minio.mediqzy.com,
 * minio-pacs.mediqzy.com, iDrive e2, AWS S3), and the stored URL names that store. Read each one
 * from its own store: the default client alone cannot reach files written before a switch. */
const STORE_PREFIXES=['CORPORATE_REPORTS_MINIO','PACS_ARCHIVE_MINIO','MINIO','PACS_MINIO'];
const storeClients=new Map();
function storeForHost(host){
  for(const prefix of STORE_PREFIXES){
    const endpoint=process.env[`${prefix}_ENDPOINT`],accessKeyId=process.env[`${prefix}_ACCESS_KEY`],secretAccessKey=process.env[`${prefix}_SECRET_KEY`];
    if(!endpoint||!accessKeyId||!secretAccessKey)continue;
    let endpointHost;try{endpointHost=new URL(endpoint).host;}catch{continue;}
    if(endpointHost!==host)continue;
    if(!storeClients.has(prefix))storeClients.set(prefix,new S3Client({endpoint:endpoint.replace(/\/$/,''),region:process.env[`${prefix}_REGION`]||'us-east-1',credentials:{accessKeyId,secretAccessKey},forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2}));
    return storeClients.get(prefix);
  }
  return null;
}
/** Read a stored report: from the store its URL names (path-style URL: /<bucket>/<key>), else the default store. */
export async function readStoredReportFile({key,url=null,bucket=null}){
  if(!key)throw new Error('Report storage location is missing');
  let client=null,urlBucket=null;
  if(url){try{const u=new URL(url);client=storeForHost(u.host);urlBucket=decodeURIComponent(u.pathname.split('/')[1]||'')||null;}catch{/* not a URL */}}
  if(client){
    const response=await client.send(new GetObjectCommand({Bucket:urlBucket||bucket,Key:key}));
    return Buffer.from(await response.Body.transformToByteArray());
  }
  if(!bucket)throw new Error('Report storage location is missing');
  return readCorporateReportFile(key,bucket);
}
