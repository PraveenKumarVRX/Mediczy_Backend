import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import ConversationWorkspace from './ConversationWorkspace';
import api from '@/utils/api';
vi.mock('@/utils/api',()=>({default:{defaults:{baseURL:'https://tenant.example/api'},get:vi.fn(),post:vi.fn()}}));
const capability={enabled:true,tenantUid:'TENANT_A',userId:1,canWrite:true,attachments:true};
const rooms=[{id:'room-a',name:'Team Chat',unread:0},{id:'room-b',name:'Private room',unread:2}];
function initial(){vi.mocked(api.get).mockImplementation(async(url:any)=>({data:{data:String(url).endsWith('/rooms')?rooms:String(url).endsWith('/members')?[{id:1,name:'Self'},{id:2,name:'Colleague'}]:{messages:[],hasMore:false}}}) as any);vi.mocked(api.post).mockResolvedValue({data:{data:{read:true}}});}
function mount(){return render(<ConversationWorkspace endpoint="/crm/workspace" portal="crm" capability={capability}/>);}
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();localStorage.setItem('crmToken','crm-only');Object.defineProperty(document,'hidden',{configurable:true,value:false});initial();});
afterEach(cleanup);
describe('shared conversation workspace',()=>{
 it('shows real empty history, searches rooms, inserts emoji and mention names',async()=>{
  mount();await screen.findByPlaceholderText('Message #Team Chat');
  expect(screen.getByText('No messages yet. Start the conversation.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Choose emoji'}));fireEvent.click(await screen.findByRole('button',{name:'Insert 👍'}));
  fireEvent.click(screen.getByRole('button',{name:'Mention member'}));fireEvent.click(await screen.findByRole('button',{name:'Colleague'}));
  expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe('👍@Colleague ');
  fireEvent.change(screen.getByRole('textbox',{name:'Search conversations'}),{target:{value:'Private'}});
  expect(screen.queryByRole('button',{name:/Team Chat/})).toBeNull();
 });
 it('keeps drafts with their original conversation and restores them',async()=>{
  mount();await screen.findByPlaceholderText('Message #Team Chat');
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Private draft for A'}});
  fireEvent.click(screen.getByRole('button',{name:/Private room/}));
  await screen.findByPlaceholderText('Message #Private room');expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe('');
  fireEvent.click(screen.getByRole('button',{name:/Team Chat/}));
  await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe('Private draft for A'));
 });
 it('reuses the same durable request identity after an uncertain send',async()=>{
  mount();await screen.findByPlaceholderText('Message #Team Chat');
  vi.mocked(api.post).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({data:{data:{id:'sent',sequence:'1',body:'Hello',sender_id:1,created_at:new Date().toISOString()}}});
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Hello'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText('Hello');const calls=vi.mocked(api.post).mock.calls.filter(([url])=>String(url).endsWith('/messages'));
  expect(calls).toHaveLength(2);expect(calls[0][1].clientId).toBe(calls[1][1].clientId);
  expect(calls[0][2]?.headers?.Authorization).toBe('Bearer crm-only');expect(calls[0][2]?.communicationPortal).toBe('crm');
 });
 it('discards late responses from the previous room',async()=>{
  let resolveOld:(value:any)=>void=()=>{};
  vi.mocked(api.get).mockImplementation((url:any)=>{
   if(String(url).includes('/room-a/messages'))return new Promise(resolve=>{resolveOld=resolve;}) as any;
   return Promise.resolve({data:{data:String(url).endsWith('/rooms')?rooms:String(url).endsWith('/members')?[]:{messages:[],hasMore:false}}}) as any;
  });
  mount();await screen.findByPlaceholderText('Message #Team Chat');fireEvent.click(screen.getByRole('button',{name:/Private room/}));await screen.findByPlaceholderText('Message #Private room');
  resolveOld({data:{data:{messages:[{id:'old',sequence:'1',sender_id:1,body:'Wrong room message',created_at:new Date().toISOString()}],hasMore:false}}});
  await new Promise(resolve=>setTimeout(resolve,20));expect(screen.queryByText('Wrong room message')).toBeNull();
 });
 it('does not expose send or attachment actions to read-only users',async()=>{
  render(<ConversationWorkspace endpoint="/crm/workspace" portal="crm" capability={{...capability,canWrite:false}}/>);await screen.findByPlaceholderText('Message #Team Chat');
  expect((screen.getByRole('button',{name:'Send message'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Attach file'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button',{name:'New conversation'})).toBeNull();
 });
});
it('creates a private conversation with explicit participants',async()=>{
 mount();await screen.findByPlaceholderText('Message #Team Chat');
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:{id:'created',name:'Care handover',unread:0}}});
 fireEvent.click(screen.getByRole('button',{name:'New conversation'}));fireEvent.change(screen.getByRole('textbox',{name:'Conversation name'}),{target:{value:'Care handover'}});
 fireEvent.click(screen.getByRole('button',{name:'Create conversation'}));await screen.findByPlaceholderText('Message #Care handover');
 expect(api.post).toHaveBeenCalledWith('/crm/workspace/rooms',{name:'Care handover',members:[]},expect.objectContaining({communicationPortal:'crm'}));
});
it('uploads an attachment through the current room and includes its identity in the message',async()=>{
 mount();await screen.findByPlaceholderText('Message #Team Chat');
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:{id:'attachment-1',name:'notes.txt'}}}).mockResolvedValueOnce({data:{data:{id:'message-1',sequence:'1',sender_id:1,body:'notes.txt',attachment_id:'attachment-1',created_at:new Date().toISOString()}}});
 fireEvent.change(screen.getByLabelText('Choose attachment'),{target:{files:[new File(['notes'],'notes.txt',{type:'text/plain'})]}});
 await screen.findByRole('button',{name:'Remove attachment'});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
 await screen.findByRole('button',{name:'Download attachment'});
 expect(api.post).toHaveBeenLastCalledWith('/crm/workspace/rooms/room-a/messages',expect.objectContaining({attachmentId:'attachment-1',body:'notes.txt'}),expect.anything());
});
