import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import CRMAIInsightsPage from './CRMAIInsightsPage';
import CRMSocialGrowthPage from './CRMSocialGrowthPage';
import CRMSocialContentPage from './CRMSocialContentPage';
import { CRMActivitiesPage } from './CRMModulePages';
import { HospitalCRMGovernancePage } from './HospitalCRMOperationsPages';
vi.mock('@/utils/api', () => ({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
const get=vi.mocked(api.get);
const show=(node:React.ReactNode)=>render(<MemoryRouter>{node}</MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();localStorage.setItem('crmToken','synthetic');localStorage.setItem('crmUserData',JSON.stringify({crmRole:'admin',firstName:'QA'}));get.mockResolvedValue({data:{success:true,data:[],posts:[]}} as never);});
afterEach(cleanup);
it('shows a readable template language while preserving its provider code',()=>{
 show(<CRMSocialGrowthPage/>);
 const language=screen.getByRole('combobox',{name:'Template language'}) as HTMLSelectElement;
 expect(language.value).toBe('en_US');expect(language.selectedOptions[0].textContent).toBe('American English');
 fireEvent.change(language,{target:{value:'kn'}});expect(language.selectedOptions[0].textContent).toBe('Kannada');
});
it('does not offer calendar add buttons for past dates',()=>{
 show(<CRMSocialContentPage/>);
 const today=new Date();today.setHours(0,0,0,0);
 const buttons=screen.getAllByRole('button',{name:/Create post for/});
 expect(buttons.length).toBeGreaterThan(0);
 for(const button of buttons){const date=new Date(button.getAttribute('aria-label')!.replace('Create post for ',''));expect(date.getTime()).toBeGreaterThanOrEqual(today.getTime());}
});
it('shows audit actor names and a success notice after loading',async()=>{
 get.mockImplementation(async(url:any)=>({data:{success:true,data:url.includes('audit-log')?[{id:1,actor_name:'QA Manager',actor_user_id:4,entity_type:'deal',event_type:'created',created_at:'2026-10-24T12:00:00Z'}]:[]}}) as never);
 show(<HospitalCRMGovernancePage/>);fireEvent.click(screen.getByRole('button',{name:'View audit log'}));
 expect((await screen.findByText(/QA Manager/)).textContent).not.toContain('User 4');
 const notice=await screen.findByText('Audit log loaded.');expect(notice.className).not.toContain('red');
});
it('shows an automatic activity timestamp without striking through its title',async()=>{
 get.mockResolvedValue({data:{success:true,data:[{id:1,type:'note',title:'Lead created: QA',completed_at:'2026-10-24T12:00:00Z',created_at:'2026-10-24T12:00:00Z'}]}} as never);
 show(<CRMActivitiesPage/>);
 const title=await screen.findByText('Lead created: QA');expect(title.className).not.toContain('line-through');
 expect(screen.getByText(/Completed:/)).toBeTruthy();
});

it('adds decimal-string deal values numerically and preserves a half-thousand forecast',async()=>{
 get.mockResolvedValue({data:{data:{leads:[],deals:[{id:1,title:'Open deal',value:'5000.00',stage:'discovery',probability:50}],campaigns:[],forecast:{weighted:2500,optimistic:3750,pessimistic:1250,monthly:[],dealCount:1},pipelineHealth:{healthScore:80,status:'Healthy',observations:[],alerts:[],opportunities:[]}}}} as never);
 show(<CRMAIInsightsPage/>);
 expect(await screen.findByText('₹5K')).toBeTruthy();
 expect(screen.getAllByText('₹2.5K').length).toBeGreaterThan(0);
 expect(screen.queryByText(/₹05000/)).toBeNull();
});
