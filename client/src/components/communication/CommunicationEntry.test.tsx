import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommunicationChatPage from '@/pages/CommunicationChatPage';
import api from '@/utils/api';
vi.mock('@/utils/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@/pages/admin/AdminChatDashboard',()=>({default:()=> <div>Legacy tools</div>}));
vi.mock('@/components/layout/AdminLayout',()=>({default:({children}:any)=><div>{children}</div>}));
vi.mock('@/components/layout/MainLayout',()=>({default:({children}:any)=><div>{children}</div>}));
vi.mock('./ChatwootWorkspace',()=>({default:()=>null}));
vi.mock('./ConversationWorkspace',async importOriginal=>{const actual=await importOriginal<any>();return {...actual,default:()=> <div>Scoped conversations</div>};});
afterEach(()=>{cleanup();localStorage.clear();vi.resetAllMocks();});
it('waits for capabilities without mounting legacy requests first',async()=>{
 localStorage.setItem('teamToken','team');let resolve:(value:any)=>void=()=>{};
 vi.mocked(api.get).mockReturnValue(new Promise(done=>{resolve=done;}) as any);
 render(<MemoryRouter><CommunicationChatPage portal="team"/></MemoryRouter>);
 expect(screen.queryByText('Legacy tools')).toBeNull();expect(screen.getByRole('status')).toBeTruthy();
 resolve({data:{data:{enabled:true,tenantUid:'TENANT_A',userId:1,canWrite:true}}});
 expect(await screen.findByText('Scoped conversations')).toBeTruthy();expect(screen.queryByText('Legacy tools')).toBeNull();
});
it('preserves legacy tools for tenants that are not enabled',async()=>{
 localStorage.setItem('teamToken','team');vi.mocked(api.get).mockResolvedValue({data:{data:{enabled:false}}});
 render(<MemoryRouter><CommunicationChatPage portal="team"/></MemoryRouter>);
 expect(await screen.findByText('Legacy tools')).toBeTruthy();expect(screen.queryByText('Scoped conversations')).toBeNull();
 await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/team/communication-workspace/capabilities',expect.objectContaining({communicationPortal:'team'})));
});
