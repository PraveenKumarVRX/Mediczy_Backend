/** CRM-specific access renewal. A retried mutation keeps its original request body and key. */
export function createContactCenterClient({fetcher=(...args:Parameters<typeof fetch>)=>fetch(...args),storage=()=>localStorage,onExpired=()=>window.location.assign('/crm/login'),basePath='/api/crm/contact-center'}={}){
 let refresh:Promise<string>|null=null;
 function expired(){for(const key of ['crmToken','crmRefreshToken','crmUser','crmUserData'])storage().removeItem(key);onExpired();return new Error('Your CRM session expired. Sign in again.');}
 async function renew(){
  const credential=storage().getItem('crmRefreshToken');if(!credential)throw expired();
  const r=await fetcher('/api/crm/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:credential})});
  const data=await r.json().catch(()=>null);
  if(storage().getItem('crmRefreshToken')!==credential)throw new Error('The CRM account changed. Review and retry your action.');
  if(!r.ok){if([400,401,403].includes(r.status))throw expired();throw new Error('Session renewal is unavailable. Try again.');}
  if(!data?.token)throw expired();
  storage().setItem('crmToken',data.token);if(data.refreshToken)storage().setItem('crmRefreshToken',data.refreshToken);return data.token as string;
 }
 return async function callApi(path='',method='GET',body?:unknown,key?:string){
  const actor=storage().getItem('crmUserData');const token=storage().getItem('crmToken');const options=(access:string|null):RequestInit=>({method,headers:{Authorization:`Bearer ${access||''}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let r=await fetcher(`${basePath}${path}`,options(token));
  if(r.status===401){
   if(storage().getItem('crmUserData')!==actor)throw new Error('The CRM account changed. Review and retry your action.');
   let access=storage().getItem('crmToken');if(!access||access===token){if(!refresh)refresh=renew().finally(()=>{refresh=null;});access=await refresh;}
   if(storage().getItem('crmUserData')!==actor)throw new Error('The CRM account changed. Review and retry your action.');
   r=await fetcher(`${basePath}${path}`,options(access));
   if(storage().getItem('crmUserData')!==actor||storage().getItem('crmToken')!==access)throw new Error('The CRM session changed. Review and retry your action.');
   if(r.status===401)throw expired();
  }
  const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.error||data?.message||`Request failed (${r.status})`),{code:data?.code,status:r.status});return data;
 };
}
export const contactCenterApi=createContactCenterClient();
