import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '@/utils/api';
import { HospitalCRMEngagementPage, HospitalCRMExperiencePage } from './HospitalCRMOperationsPages';
import { CRMLeadsPage, CRMDealsPage, CRMPipelinePage } from './CRMModulePages';
vi.mock('@/utils/api', () => ({ default: { get:vi.fn(), post:vi.fn(), put:vi.fn(), delete:vi.fn() } }));
const get = vi.mocked(api.get), post = vi.mocked(api.post);
beforeEach(() => {
  vi.clearAllMocks(); localStorage.setItem('crmToken','synthetic'); localStorage.setItem('crmUserData', JSON.stringify({firstName:'QA',crmRole:'admin'}));
  get.mockResolvedValue({ data: { success:true, data:[], pagination:{total:0,totalPages:1} } } as never);
});
afterEach(cleanup);
const show = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
describe('CRM QA report fixes', () => {
  it('locks Create immediately and ignores repeat clicks while saving a lead', async () => {
    post.mockImplementation(() => new Promise(() => {}));
    show(<CRMLeadsPage/>); fireEvent.click(screen.getByRole('button',{name:'New Lead'}));
    fireEvent.change(screen.getByPlaceholderText('Lead name'),{target:{value:'QA'}});
    const create=screen.getByRole('button',{name:'Create'}); fireEvent.click(create); fireEvent.click(create);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1)); expect((create as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the duplicate error from the server and keeps the form open', async () => {
    post.mockRejectedValue({response:{status:409,data:{message:'A lead with this email or phone already exists'}}});
    show(<CRMLeadsPage/>); fireEvent.click(screen.getByRole('button',{name:'New Lead'}));
    fireEvent.change(screen.getByPlaceholderText('Lead name'),{target:{value:'QA'}}); fireEvent.click(screen.getByRole('button',{name:'Create'}));
    expect((await screen.findByRole('alert')).textContent).toContain('already exists'); expect(screen.getByPlaceholderText('Lead name')).toBeTruthy();
  });
  it('blocks invalid deal values with visible feedback before posting', async () => {
    show(<CRMDealsPage/>); fireEvent.click(screen.getByRole('button',{name:'New Deal'}));
    fireEvent.change(screen.getByPlaceholderText('Deal title'),{target:{value:'QA'}});
    fireEvent.change(screen.getByPlaceholderText('0'),{target:{value:'-5000'}}); fireEvent.click(screen.getByRole('button',{name:'Create'}));
    expect((await screen.findByRole('alert')).textContent).toContain('zero or greater'); expect(post).not.toHaveBeenCalled();
  });
  it('requires an explicit consent decision instead of defaulting to opt-in', () => {
    show(<HospitalCRMEngagementPage/>);
    expect((screen.getByDisplayValue('Unknown') as HTMLSelectElement).value).toBe('unknown');
  });
  it('starts feedback and ratings empty with explicit ranges', () => {
    show(<HospitalCRMExperiencePage/>);
    expect((screen.getByLabelText('Feedback score (0 to 10)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Review rating (1 to 5)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Feedback score (0 to 10)') as HTMLInputElement).required).toBe(true);
  });
  it('shows won and lost columns and a real deal card on the pipeline', async () => {
    get.mockImplementation(async (url: any) => ({data:{success:true,data:url.includes('pipeline') ? [{stage:'discovery',count:1,total_value:5000,weighted_value:2500}] : [{id:1,title:'QA deal',stage:'discovery',value:5000,probability:50}], pagination:{totalPages:1}}}) as never);
    show(<CRMPipelinePage/>); expect(await screen.findByRole('link',{name:'QA deal'})).toBeTruthy(); expect(screen.getAllByText('Won')[0]).toBeTruthy(); expect(screen.getAllByText('Lost')[0]).toBeTruthy();
  });
});
