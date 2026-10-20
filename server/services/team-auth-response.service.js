// Web clients use token/teamUser; the published mobile contract uses
// accessToken/user. Both views must describe the same authenticated session.
export function createTeamAuthResponse({ accessToken, refreshToken, teamUser, assignedCorporates, message }) {
  return {
    success: true,
    ...(message !== undefined ? { message } : {}),
    token: accessToken,
    accessToken,
    refreshToken,
    ...(teamUser !== undefined ? { teamUser, user: teamUser } : {}),
    ...(assignedCorporates !== undefined ? { assignedCorporates } : {}),
  };
}
