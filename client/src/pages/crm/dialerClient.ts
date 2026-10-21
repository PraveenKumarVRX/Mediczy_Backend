import {createContactCenterClient} from './contactCenterClient';
// One CRM renewal flight for the dialer's reads and mutations. Late refresh
// responses cannot repopulate a signed-out or switched account.
const request=createContactCenterClient({basePath:'/api/crm'});
export type Call=Record<string,any>;
export type CCOverview={
 providerConfigured:boolean;
 agents:Array<{user_id:string|number;name:string;phone:string;role:string;presence:string;active_call_id:string|null;wrap_until?:string|null}>;
 calls:Call[];
 callbacks:Array<{id:string;call_id:string;owner_id:string|number|null;provider?:string;status:string;due_at:string;attempts:number;destination:string}>;
 metrics:{total:number;active:number};capabilities?:{livekit?:boolean;mediaGatewayConfigured?:boolean};
};
export type CRMLead={id:number;name:string;phone:string;status:string;company?:string};
export type LeadPage={data:CRMLead[];pagination:{total:number;page:number;limit:number;totalPages:number}};
export const getOverview=():Promise<CCOverview>=>request('/contact-center');
export const setPresence=(presence:'available'|'offline'|'busy')=>request('/contact-center/presence','PATCH',{presence});
export const dial=(body:{to:string;callback_id?:string},key:string)=>request('/contact-center/calls','POST',body,key);
export const getCall=(id:string)=>request(`/contact-center/calls/${id}`);
export const reconcileCall=(id:string)=>request(`/contact-center/calls/${id}/reconcile`,'POST',{});
export type Disposition='appointment_followup'|'information_provided'|'callback_required'|'wrong_number'|'no_action';
export const setDisposition=(id:string,disposition:Disposition,followup_at?:string)=>request(`/contact-center/calls/${id}/disposition`,'POST',{disposition,...(followup_at?{followup_at}:{})});
export const claimCallback=(id:string)=>request(`/contact-center/callbacks/${id}`,'PATCH',{status:'in_progress'});
export const logoutCrm=()=>request('/logout','POST',{});
export const getMyLeads=(assignedTo:string|number,page=1):Promise<LeadPage>=>request(`/leads?${new URLSearchParams({assigned_to:String(assignedTo),status:'new',limit:'50',page:String(page)})}`);
export const TERMINAL_CALL_STATES=new Set(['completed','failed','busy','no-answer','canceled']);
