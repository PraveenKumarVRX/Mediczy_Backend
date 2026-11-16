export function validateDedicatedEnvironment(env) {
 if(!/^[A-Za-z0-9._-]{1,80}$/.test(env.RELEASE_SHA||''))throw Error('An explicit release identity is required.');
 const origin=new URL(env.CRM_PUBLIC_ORIGIN||'');
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Explicit dedicated HTTPS origin is required.');
 if(!/^[A-Z0-9]{6}$/.test(env.CRM_TENANT_UID||'')||!/^[1-9][0-9]*$/.test(env.CRM_TENANT_ID||''))throw Error('Explicit dedicated tenant identity is required.');
 if(env.CRM_V2_DEFAULT_TENANT_ID!==env.CRM_TENANT_ID)throw Error('CRM fallback identity must equal the dedicated tenant.');
 for(const name of ['JWT_SECRET','CRM_CREDENTIAL_ENCRYPTION_KEY','POSTGRES_HOST','POSTGRES_DATABASE','POSTGRES_USER','POSTGRES_PASSWORD','REDIS_HOST','REDIS_PASSWORD'])if(!env[name])throw Error(name+' must be explicitly configured.');
 if(!/^[a-f0-9]{64}$/i.test(env.CRM_CREDENTIAL_ENCRYPTION_KEY))throw Error('A dedicated credential encryption key is required.');
 if(env.JWT_SECRET.length<48)throw Error('A dedicated session secret is required.');
 if(env.SSM_PARAM_PATH?.startsWith('/mediczy/')||env.AWS_ACCESS_KEY_ID||env.AWS_SECRET_ACCESS_KEY)throw Error('Central AWS credentials are not permitted in the dedicated CRM runtime.');
 return {origin:origin.origin,hostname:origin.hostname,tenantUid:env.CRM_TENANT_UID,tenantId:Number(env.CRM_TENANT_ID)};
}
export function dedicatedBoundary(installation){return(req,res,next)=>{
 if(req.get('host')?.toLowerCase()!==new URL(installation.origin).host)return res.status(421).json({success:false,code:'wrong_installation_host'});
 for(const header of ['X-Tenant-ID','X-Tenant-Code']){const value=req.get(header);if(value&&![String(installation.tenantId),installation.tenantUid].includes(value))return res.status(403).json({success:false,code:'wrong_installation_tenant'});}
 if(!req.path.startsWith('/api/crm')&&!req.path.startsWith('/api/mobile/')&&!req.path.startsWith('/api/feature-flags')&&!req.path.startsWith('/api/password-reset')&&!req.path.startsWith('/api/branding')&&!req.path.startsWith('/api/onboarding')&&!req.path.startsWith('/api/channel-webhooks/')&&!req.path.startsWith('/api/team/')&&!req.path.startsWith('/api/field/'))return res.status(404).json({success:false,code:'not_in_crm_runtime'});
 next();
};}
