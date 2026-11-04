import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ actorId: 7, consult: vi.fn(), clear: vi.fn(), apiPost:vi.fn(), apiGet:vi.fn(), startCall:vi.fn() }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ currentUser: { id: state.actorId }, currentDoctor: null, userType: 'user' }) }));
vi.mock('@/context/VideoCallContext', () => ({ useVideoCall: () => ({ startCall: state.startCall }) }));
vi.mock('@/services/drIsha', () => ({ drIshaAPI: { consult: state.consult, clearSession: state.clear, startNewSession: () => '' } }));
vi.mock('@/utils/api', () => ({ default: { post: state.apiPost, get:state.apiGet } }));
import { DrISHAChat } from '../DrISHAChat';

afterEach(()=>cleanup());

describe('actual chat account isolation and source rendering', () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks(); localStorage.clear(); state.actorId = 7;
    state.consult.mockResolvedValue({ success: true, data: { response: 'Unique private answer', sessionId: 'chat_server', confidence: 0,
      retrieval: { supportingSources: [{ documentId: '1', chunkId: '2', title: 'Source guideline', excerpt: 'Grounding excerpt' }] } } });
    state.clear.mockResolvedValue({ success: true });
  });
  it('does not restore legacy browser PHI and resets on account switch', async () => {
    localStorage.setItem('dr_isha_session', JSON.stringify({ messages: [{ content: 'Old private transcript' }] }));
    const view = render(<BrowserRouter><DrISHAChat /></BrowserRouter>);
    expect(screen.queryByText('Old private transcript')).toBeNull();
    const input = screen.getByPlaceholderText('Ask Dr. iSHA about your health...');
    fireEvent.change(input, { target: { value: 'A health question' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('Unique private answer')).toBeTruthy());
    expect(screen.getByText('Source guideline')).toBeTruthy();
    expect(screen.queryByText('90%')).toBeNull();
    expect(localStorage.getItem('dr_isha_session')).toBeNull();
    state.actorId = 8;
    view.rerender(<BrowserRouter><DrISHAChat /></BrowserRouter>);
    expect(screen.queryByText('Unique private answer')).toBeNull();
  });
  it('requires explicit confirmation and only reports an appointment change after commit',async()=>{
    state.consult.mockResolvedValue({success:true,data:{response:'Please confirm cancellation.',sessionId:'chat_owned',action:{actionId:'chat_action',confirmationToken:'token',requiresConfirmation:true,action:{kind:'cancel',appointmentId:42}}}});
    state.apiPost.mockResolvedValue({data:{committed:true,appointmentId:42,status:'cancelled'}});
    render(<BrowserRouter><DrISHAChat /></BrowserRouter>);
    const input=screen.getByPlaceholderText('Ask Dr. iSHA about your health...');
    fireEvent.change(input,{target:{value:'cancel appointment 42'}});fireEvent.submit(input.closest('form')!);
    const confirm=await screen.findByRole('button',{name:'Confirm cancellation'});
    expect(state.apiPost).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(()=>expect(screen.getByText('Appointment #42: cancelled.')).toBeTruthy());
    expect(state.apiPost).toHaveBeenCalledWith('/medical-ai/actions/confirm',{actionId:'chat_action',confirmationToken:'token',confirmed:true});
  });

});
