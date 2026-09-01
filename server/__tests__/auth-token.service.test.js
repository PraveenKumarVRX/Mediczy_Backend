import jwt from 'jsonwebtoken';

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'auth-token-regression-test-secret';

const { issueAccessToken, verifyAccessToken } = await import('../services/auth-token.service.js');

afterAll(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

describe('auth token refresh contract', () => {
  it('issues middleware-compatible identity, role, and tenant claims', () => {
    const token = issueAccessToken({
      dataValues: {
        id: 'user-42',
        email: 'patient@example.com',
        role: 'user',
        isAdmin: false,
        isTeam: false,
        organization_id: 'org-7',
        tenant_id: 'tenant-9',
        organization_type: 'clinic',
        metadata: { tokenVersion: 3 },
      },
    });

    const decoded = verifyAccessToken(token);

    expect(decoded).toEqual(expect.objectContaining({
      sub: 'user-42',
      id: 'user-42',
      userId: 'user-42',
      email: 'patient@example.com',
      role: 'user',
      userType: 'user',
      isAdmin: false,
      isTeam: false,
      organization_id: 'org-7',
      tenant_id: 'tenant-9',
      tenantId: 'tenant-9',
      token_type: 'access',
      tokenVersion: 3,
      iss: 'mediczy',
      aud: 'mediczy-api',
    }));
  });

  it('rejects users without an id instead of issuing an unusable token', () => {
    expect(() => issueAccessToken({ email: 'missing-id@example.com' }))
      .toThrow('Cannot issue access token without a user id');
  });
});
