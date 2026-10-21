import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {ContactLiveKit,VoiceCampaigns,VoiceIdentity} from './ContactVoiceTools';
import ContactVoiceJoin from '../ContactVoiceJoin';
const {connect,disconnect}=vi.hoisted(()=>({connect:vi.fn(),disconnect:vi.fn()}));
vi.mock('@/hooks/useContactLiveKit',()=>({useContactLiveKit:()=>({connect,disconnect,connected:false,error:null})}));
const perform=async(fn:()=>Promise<any>)=>{await fn();};
beforeEach(()=>{vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop:vi.fn()}]}))}});});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');});
describe('native voice workflows',()=>{
 it('requires explicit action and consent evidence before dispatching a bot',async()=>{
  const api=vi.fn(async(path:string)=>path==='/calls/livekit'?{id:'native-call'}:{primary:{token:'synthetic'}});
  render(<ContactLiveKit api={api} data={{agents:[{user_id:'1',presence:'available'}],calls:[],capabilities:{livekit:true,voiceProcessing:true,voiceBot:true}}} perform={perform} supervisor={false} userId={1}/>);
  expect(api).not.toHaveBeenCalled();fireEvent.click(screen.getByLabelText('Use the hospital reception voice bot'));
  const start=screen.getByRole('button',{name:'Start browser voice session'}) as HTMLButtonElement;expect(start.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Voice processing consent'),{target:{value:'approved-reference'}});fireEvent.click(start);
  await waitFor(()=>expect(connect).toHaveBeenCalled());
  const request=api.mock.calls.find(([path])=>path==='/calls/livekit') as unknown as any[];
  expect(request[1]).toBe('POST');expect(request[2]).toMatchObject({transcribe:true,bot:true,consent:{status:'granted',evidence:'approved-reference'}});expect(request[3]).toBeTruthy();expect(request[2].tenantUid).toBeUndefined();
 });
 it('loads campaigns without publishing or originating any call',async()=>{
  const api=vi.fn(async()=>[{id:'campaign-id',name:'Approved follow-up',status:'draft',completed:0,recipients:1,unknown:0}]);
  render(<VoiceCampaigns api={api} perform={perform} userId={1}/>);await screen.findByText('Approved follow-up');expect(api.mock.calls).toEqual([['/voice-campaigns']]);expect((screen.getByRole('button',{name:'Create linked journey'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('requests a biometric challenge for an existing identity without recording on mount',async()=>{
  const api=vi.fn(async()=>({id:'challenge-id',phrase:'1 2 3 4 5 6'}));render(<VoiceIdentity api={api} perform={perform} configured/>);expect(api).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Voice identity CRM ID'),{target:{value:'101'}});fireEvent.click(screen.getByRole('button',{name:'Request enroll challenge'}));await screen.findByText('Say these digits clearly: 1 2 3 4 5 6');expect(api).toHaveBeenCalledWith('/biometrics/challenges','POST',{identity_id:101,purpose:'enroll'});expect((screen.getByRole('button',{name:'Submit enroll'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('redeems the fragment invitation with disclosed consent and removes it after joining',async()=>{
  history.replaceState(null,'','/contact-center/join#tenant=HOSPITAL_11&call=synthetic-id&invite=synthetic-invite');
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({primary:{token:'synthetic'}})}));vi.stubGlobal('fetch',fetcher);render(<ContactVoiceJoin/>);expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Join hospital call'}));await waitFor(()=>expect(connect).toHaveBeenCalled());
  expect(fetcher.mock.calls[0][0]).toBe('/api/contact-center/hooks/guest/HOSPITAL_11');expect(JSON.parse((fetcher.mock.calls[0] as any[])[1].body)).toEqual({callId:'synthetic-id',invite:'synthetic-invite',consent:true});expect(location.hash).toBe('');
 });
});
