import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('../hooks/auth',()=>({getToken:()=>localStorage.getItem('hospitalToken'),getUserType:()=>localStorage.getItem('userType')}));
import api from './api';
import {getClinicalPortal} from '../config/clinicalPortalPaths';
beforeEach(()=>{localStorage.clear();history.replaceState({},'', '/nurse/ward');localStorage.setItem('hospitalToken','wrong-hospital');localStorage.setItem('nurseToken','correct-nurse');localStorage.setItem('userType','hospital');});
describe('visible nurse session identity',()=>{
 it('chooses the nurse actor even after another portal changed shared login state',async()=>{
   const result=await api.get('/v1/nursing/patients',{adapter:async config=>({data:config.headers.Authorization,status:200,statusText:'OK',headers:{},config})});expect(result.data).toBe('Bearer correct-nurse');expect(getClinicalPortal()).toBe('nurse');
 });
 it('preserves an explicitly selected Authorization header',async()=>{
   const result=await api.get('/v1/emar/due',{headers:{Authorization:'Bearer explicit-actor'},adapter:async config=>({data:config.headers.Authorization,status:200,statusText:'OK',headers:{},config})});expect(result.data).toBe('Bearer explicit-actor');
 });
 it('never borrows a hospital token when the nurse token is missing',async()=>{
   localStorage.removeItem('nurseToken');const result=await api.get('/v1/nursing/patients',{adapter:async config=>({data:config.headers.Authorization||null,status:200,statusText:'OK',headers:{},config})});expect(result.data).toBeNull();
 });
 it('locks an expired nurse session without navigating away from in-memory drafts',async()=>{
   const expired=vi.fn();window.addEventListener('nursing-session-expired',expired);
   try{await expect(api.get('/v1/nursing/patients',{adapter:async config=>{throw {config,response:{status:401}};}})).rejects.toBeTruthy();expect(expired).toHaveBeenCalledOnce();expect(location.pathname).toBe('/nurse/ward');}finally{window.removeEventListener('nursing-session-expired',expired);}
 });
});
