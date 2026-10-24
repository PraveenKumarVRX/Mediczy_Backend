import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import CRMContactCenterPage from './CRMContactCenterPage';
vi.mock('./CRMModulePages',()=>({CRMLayout:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('@/hooks/useExotelPhone',()=>({useExotelPhone:()=>({state:'offline',connected:false,hasCall:false,connect:vi.fn(),disconnect:vi.fn(),control:vi.fn()})}));
const overview=(configured=false)=>({providerConfigured:configured,config:null,agents:configured?[{user_id:1,name:'QA agent',presence:'available',role:'agent'}]:[],queues:[],calls:[],callbacks:[],flows:[],metrics:{total:0,active:0,provider_duration_seconds:0},capabilities:{browserMedia:false}});
describe('contact-center operator console',()=>{
  beforeEach(()=>{localStorage.clear();localStorage.setItem('crmToken','synthetic-token');localStorage.setItem('crmUserData',JSON.stringify({id:1,crmRole:'telecaller'}));});
  afterEach(()=>{cleanup();vi.unstubAllGlobals();});
  it('shows real unconfigured state and disables calling',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>overview()})));
    render(<CRMContactCenterPage/>);
    await screen.findByText(/Exotel calling is not configured/);
    fireEvent.change(screen.getByLabelText('Customer number'),{target:{value:'+919876543210'}});
    expect((screen.getByRole('button',{name:'Start call'}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button',{name:'Settings'})).toBeNull();
  });
  it('disables dialing when the provider is configured but no agent is available',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({...overview(true),agents:[]})})));
    render(<CRMContactCenterPage/>); await screen.findByLabelText('Customer number');
    fireEvent.change(screen.getByLabelText('Customer number'),{target:{value:'+919876543210'}});
    expect((screen.getByRole('button',{name:'Start call'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('uses an idempotency key and authenticated server scope for a call',async()=>{
    const fetcher=vi.fn(async(url:string,options:RequestInit={})=>({ok:true,json:async()=>String(url).endsWith('/calls')?{id:'call-id'}:String(url).endsWith('/calls/call-id')?{call:{id:'call-id',destination:'+919876543210',state:'queued'},transcripts:[],artifacts:[]}:overview(true)}));
    vi.stubGlobal('fetch',fetcher);render(<CRMContactCenterPage/>);
    await screen.findByLabelText('Customer number');
    fireEvent.change(screen.getByLabelText('Customer number'),{target:{value:'+919876543210'}});
    fireEvent.click(screen.getByRole('button',{name:'Start call'}));
    await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).endsWith('/calls'))).toBe(true));
    const [,options]=fetcher.mock.calls.find(([url])=>String(url).endsWith('/calls'))!;
    expect((options.headers as Record<string,string>)['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(options.body as string)).toEqual({to:'+919876543210',record:false,transport:'phone'});
  });
  it('claims a callback before presenting an explicitly linked call',async()=>{
    const callback={id:'callback-id',destination:'+919876543210',status:'open',attempts:0,due_at:new Date().toISOString()};
    const fetcher=vi.fn(async(url:string,options:RequestInit={})=>({ok:true,json:async()=>String(url).endsWith('/calls')?{id:'call-id'}:String(url).endsWith('/calls/call-id')?{call:{id:'call-id',destination:callback.destination,state:'queued'},transcripts:[],artifacts:[]}:String(url).endsWith('/callbacks/callback-id')?{...callback,status:'in_progress'}:{...overview(true),callbacks:[callback]}}));
    vi.stubGlobal('fetch',fetcher);render(<CRMContactCenterPage/>);await screen.findByLabelText('Customer number');
    fireEvent.click(screen.getByRole('button',{name:'Callbacks'}));fireEvent.click(screen.getByRole('button',{name:'Take callback'}));
    await waitFor(()=>expect((screen.getByLabelText('Customer number') as HTMLInputElement).value).toBe(callback.destination));
    expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/calls'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:'Start call'}));await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/calls'))).toHaveLength(1));
    expect(JSON.parse(fetcher.mock.calls.find(([url])=>String(url).endsWith('/calls'))![1].body as string).callback_id).toBe('callback-id');
  });
  it('uses a new key for edited input after a rejected request',async()=>{
    const fetcher=vi.fn(async(url:string,options:RequestInit={})=>({ok:!String(url).endsWith('/calls'),json:async()=>String(url).endsWith('/calls')?{error:'Call rejected'}:overview(true)}));
    vi.stubGlobal('fetch',fetcher);render(<CRMContactCenterPage/>);await screen.findByLabelText('Customer number');
    fireEvent.change(screen.getByLabelText('Customer number'),{target:{value:'+919876543210'}});fireEvent.click(screen.getByRole('button',{name:'Start call'}));await screen.findByText('Call rejected');
    await waitFor(()=>expect((screen.getByRole('button',{name:'Start call'}) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Customer number'),{target:{value:'+919876543211'}});fireEvent.click(screen.getByRole('button',{name:'Start call'}));
    await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/calls'))).toHaveLength(2));
    const attempts=fetcher.mock.calls.filter(([url])=>String(url).endsWith('/calls'));expect((attempts[0][1].headers as Record<string,string>)['Idempotency-Key']).not.toBe((attempts[1][1].headers as Record<string,string>)['Idempotency-Key']);
  });
});
