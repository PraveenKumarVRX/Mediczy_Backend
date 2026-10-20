import { createTeamAuthResponse } from '../services/team-auth-response.service.js';

// Exercise the deserialized field access used by each client, including the
// mobile permission gate that runs immediately after a successful sign-in.
const parseResponse = options => JSON.parse(JSON.stringify(createTeamAuthResponse(options)));
const mobileCanOpenFieldForce = response => response.user?.permissions?.includes('Field Force') === true;
const webCanOpenFieldForce = response => response.teamUser?.permissions?.includes('Field Force') === true;

describe('team authentication mobile and web contracts', () => {
  it('allows an assigned field executive through both client permission gates', () => {
    const response = parseResponse({
      accessToken: 'access-token-marker', refreshToken: 'refresh-token-marker',
      teamUser: { id: 42, tenantId: 11, name: 'Field Executive', permissions: ['Field Force'] },
      assignedCorporates: [], message: 'Team login successful',
    });
    expect(mobileCanOpenFieldForce(response)).toBe(true);
    expect(webCanOpenFieldForce(response)).toBe(true);
    expect(response.user).toEqual(response.teamUser);
    expect(response.accessToken).toBe(response.token);
    expect(response.refreshToken).toBe('refresh-token-marker');
    expect(response.user.tenantId).toBe(11);
    expect(response.assignedCorporates).toEqual([]);
  });

  it.each([{ permissions: [] }, { permissions: ['Doctor CRM'] }])('does not grant Field Force to users lacking the assignment ($permissions)', ({ permissions }) => {
    const response = parseResponse({ accessToken: 'access-token-marker', refreshToken: 'refresh-token-marker', teamUser: { id: 43, permissions } });
    expect(mobileCanOpenFieldForce(response)).toBe(false);
    expect(webCanOpenFieldForce(response)).toBe(false);
    expect(response.user.permissions).toEqual(permissions);
  });

  it('keeps refreshed access tokens compatible without inventing a profile or permissions', () => {
    const response = parseResponse({ accessToken: 'rotated-access-token', refreshToken: 'rotated-refresh-token' });
    expect(response.token).toBe('rotated-access-token');
    expect(response.accessToken).toBe(response.token);
    expect(response.refreshToken).toBe('rotated-refresh-token');
    expect(response.user).toBeUndefined();
    expect(response.teamUser).toBeUndefined();
    expect(mobileCanOpenFieldForce(response)).toBe(false);
  });
});
