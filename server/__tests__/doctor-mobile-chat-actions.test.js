import {jest,it,expect,afterEach} from '@jest/globals';
import {readFileSync} from 'node:fs';
const {createDoctorCopilotClient}=await import('data:text/javascript,'+encodeURIComponent(readFileSync(new URL('../../shared/doctor-mobile-api/doctorCopilot.client.js',import.meta.url),'utf8')));
const original=global.fetch;
afterEach(()=>{global.fetch=original;});
it('exposes real confirmed task adapters and refuses implicit confirmation',async()=>{
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({committed:true})}));
 const client=createDoctorCopilotClient({baseUrl:'http://local.test/api',getToken:async()=>'test-token'});
 await expect(client.confirmAppointmentChange({actionId:'action',confirmationToken:'token',confirmed:false})).rejects.toThrow('Explicit');
 expect(global.fetch).not.toHaveBeenCalled();
 await client.confirmAppointmentChange({actionId:'action',confirmationToken:'token',confirmed:true});
 expect(global.fetch.mock.calls[0][0]).toBe('http://local.test/api/medical-ai/actions/confirm');
 expect(JSON.parse(global.fetch.mock.calls[0][1].body).confirmed).toBe(true);
});
