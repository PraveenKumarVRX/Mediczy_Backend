import { jest } from '@jest/globals';

import VideoController from '../controller/video.controller.js';
import { redisClient } from '../config/redis.js';

describe('LiveKit POST token compatibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (redisClient.status !== 'end') {
      await redisClient.quit();
    }
  });

  it('routes appointment-based POST requests through the canonical GET resolver', async () => {
    const req = {
      body: {
        appointmentId: 1093,
        roomName: 'apt-1093-abcdef12',
        identity: 'patient-1093-test',
      },
      query: {},
      user: { id: 19, role: 'user' },
    };
    const res = {};
    const canonicalResolver = jest
      .spyOn(VideoController, 'generateLiveKitTokenFromQuery')
      .mockResolvedValue('delegated');

    const result = await VideoController.generateLiveKitToken(req, res);

    expect(result).toBe('delegated');
    expect(canonicalResolver).toHaveBeenCalledWith(req, res);
    expect(req.query).toEqual({
      appointmentId: '1093',
      roomId: 'apt-1093-abcdef12',
      identity: 'patient-1093-test',
    });
  });

  it('does not silently create a random room for a participant', async () => {
    const req = {
      body: {},
      query: {},
      user: { id: 19, role: 'user' },
    };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    await VideoController.generateLiveKitToken(req, { status });

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringMatching(/appointmentId/),
    }));
  });
});
