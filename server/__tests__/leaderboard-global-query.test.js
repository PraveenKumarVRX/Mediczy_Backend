import { jest } from '@jest/globals';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import leaderboardService from '../services/leaderboard.service.js';

test('global leaderboard resolves the user association with real model attributes', async () => {
  const query = jest.spyOn(postgresSequelize, 'query').mockResolvedValue([]);
  try {
    await expect(leaderboardService.getGlobalLeaderboard('ALL_TIME', 10)).resolves.toEqual([]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain('JOIN');
    expect(sql).toContain('firstName');
    expect(sql).not.toContain('user.email');
  } finally {
    query.mockRestore();
  }
});
