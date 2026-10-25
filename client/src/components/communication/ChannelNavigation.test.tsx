import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChannelNavigation from './ChannelNavigation';
afterEach(cleanup);
describe('channel navigation', () => {
  it('keeps Team links in its portal without admin fallback', () => {
    render(<MemoryRouter><ChannelNavigation active="chat" links={{ chat: '/team/chat', email: '/team/email-inbox', whatsapp: '/team/whatsapp-inbox' }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Chat' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('link').every(link => link.getAttribute('href')?.startsWith('/team/'))).toBe(true);
    expect(screen.getByText('SMS').getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('link', { name: 'Video' })).toBeNull();
  });
  it('preserves CRM channel deep links', () => {
    render(<MemoryRouter><ChannelNavigation active="sms" links={{ sms: '/crm/hospital/communication-hub?channel=sms' }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'SMS' }).getAttribute('href')).toContain('?channel=sms');
    expect(screen.getByRole('link', { name: 'SMS' }).getAttribute('aria-current')).toBe('page');
  });
});
