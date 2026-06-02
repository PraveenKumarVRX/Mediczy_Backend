import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

import { createDoctorTemplatesRouter } from '../routes/doctor/templates.routes.js';
import { createDoctorMessagesRouter } from '../routes/doctor/messages.routes.js';
import { createDoctorBillingRouter } from '../routes/doctor/billing.routes.js';
import { createDoctorTriageRouter } from '../routes/doctor/triage.routes.js';

const authDoctor = (req, _res, next) => {
  req.doctor = { id: 11, firstName: 'Asha', lastName: 'K' };
  next();
};

const mountDoctorRouter = (router) => {
  const app = express();
  app.use(express.json());
  app.use('/api/doctors', router);
  return app;
};

describe('Doctor Subrouter Modularization Regression', () => {
  describe('templates.routes', () => {
    it('creates a template and clears existing default for same type', async () => {
      const doctor = {
        id: 11,
        firstName: 'Asha',
        lastName: 'K',
        documentTemplates: [
          {
            id: 't-old',
            name: 'Old Rx',
            type: 'prescription',
            content: 'old',
            isDefault: true,
          },
        ],
        changed: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined),
      };

      const Doctor = {
        findByPk: jest.fn().mockResolvedValue(doctor),
      };

      const app = mountDoctorRouter(createDoctorTemplatesRouter({ authDoctor, Doctor }));

      const res = await request(app)
        .post('/api/doctors/templates')
        .send({
          name: 'New Rx',
          type: 'prescription',
          content: 'new',
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(doctor.save).toHaveBeenCalled();
      expect(doctor.documentTemplates[0].isDefault).toBe(false);
      expect(doctor.documentTemplates.at(-1).name).toBe('New Rx');
    });
  });

  describe('messages.routes', () => {
    const MESSAGE_PREFIX = 'doctor:messages:';
    const MESSAGE_TTL = 120;

    const getCachedValue = async (key, fallbackMap, defaultValue) => {
      if (fallbackMap.has(key)) return fallbackMap.get(key);
      return defaultValue;
    };

    const setCachedValue = async (key, value, _ttl, fallbackMap) => {
      fallbackMap.set(key, value);
    };

    it('seeds messages and marks a message as read', async () => {
      const localMessages = new Map();
      const app = mountDoctorRouter(
        createDoctorMessagesRouter({
          authDoctor,
          MESSAGE_PREFIX,
          MESSAGE_TTL,
          localMessages,
          getCachedValue,
          setCachedValue,
        })
      );

      const listRes = await request(app).get('/api/doctors/messages');
      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.messages.length).toBeGreaterThan(0);

      const messageId = listRes.body.messages[0].id;
      const readRes = await request(app).patch(`/api/doctors/messages/${messageId}/read`).send({});
      expect(readRes.status).toBe(200);
      expect(readRes.body).toMatchObject({ success: true, message: 'Message marked as read' });

      const key = `${MESSAGE_PREFIX}11`;
      const cached = localMessages.get(key);
      const changedMessage = cached.find((m) => m.id === messageId);
      expect(changedMessage.status).toBe('read');
    });

    it('returns 400 for invalid reply payload', async () => {
      const app = mountDoctorRouter(
        createDoctorMessagesRouter({
          authDoctor,
          MESSAGE_PREFIX,
          MESSAGE_TTL,
          localMessages: new Map(),
          getCachedValue,
          setCachedValue,
        })
      );

      const res = await request(app).post('/api/doctors/messages/reply').send({ recipientId: null, message: '' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        message: 'Reply content and message ID or recipient ID are required',
      });
    });
  });

  describe('billing.routes', () => {
    it('returns 404 when invoice appointment is missing', async () => {
      const Appointment = {
        findOne: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
      };
      const User = {};
      const app = mountDoctorRouter(createDoctorBillingRouter({ authDoctor, Appointment, User }));

      const res = await request(app)
        .post('/api/doctors/appointments/99/invoice')
        .send({ items: [{ price: 100, quantity: 1 }], discount: 0, taxRate: 0 });

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: 'Appointment not found or access denied' });
    });

    it('creates invoice and persists it in appointment notes', async () => {
      const appointment = {
        id: 77,
        userId: 201,
        patientId: 201,
        notes: {},
        patient: { firstName: 'Riya', lastName: 'S' },
        update: jest.fn().mockResolvedValue(undefined),
      };

      const Appointment = {
        findOne: jest.fn().mockResolvedValue(appointment),
        findAll: jest.fn().mockResolvedValue([]),
      };
      const User = {};
      const app = mountDoctorRouter(createDoctorBillingRouter({ authDoctor, Appointment, User }));

      const res = await request(app)
        .post('/api/doctors/appointments/77/invoice')
        .send({
          items: [
            { name: 'Consultation', price: 500, quantity: 1 },
            { name: 'Procedure', price: 300, quantity: 2 },
          ],
          discount: 100,
          taxRate: 10,
          notes: 'Follow-up in 1 week',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.invoice.total).toBe(1100);
      expect(appointment.update).toHaveBeenCalledTimes(1);

      const updatedNotes = appointment.update.mock.calls[0][0].notes;
      const parsed = JSON.parse(updatedNotes);
      expect(parsed.invoice).toBeDefined();
      expect(parsed.invoice.total).toBe(1100);
    });

    it('returns 400 for invalid invoice status update value', async () => {
      const Appointment = {
        findAll: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
      };
      const User = {};
      const app = mountDoctorRouter(createDoctorBillingRouter({ authDoctor, Appointment, User }));

      const res = await request(app)
        .put('/api/doctors/invoices/INV-1/status')
        .send({ status: 'processing' });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        success: false,
        message: 'Invalid status. Must be: pending, paid, cancelled, or overdue',
      });
    });
  });

  describe('triage.routes', () => {
    const Op = {
      in: 'in',
      or: 'or',
      gte: 'gte',
      lt: 'lt',
      iLike: 'iLike',
    };

    it('returns aggregated triage stats', async () => {
      const Appointment = {
        count: jest
          .fn()
          .mockResolvedValueOnce(7)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(2),
        findAll: jest.fn().mockResolvedValue([
          { notes_json: { urgencyLevel: 'IMMEDIATE' } },
          { notes_json: JSON.stringify({ urgencyLevel: 'URGENT' }) },
          { notes_json: { urgencyLevel: 'URGENT' } },
        ]),
        findOne: jest.fn(),
        findByPk: jest.fn(),
      };

      const app = mountDoctorRouter(
        createDoctorTriageRouter({
          authDoctor,
          Appointment,
          User: { sequelize: { query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } }, findOne: jest.fn(), findByPk: jest.fn() },
          Doctor: {},
          UserPlan: { findOne: jest.fn() },
          Op,
          isMembershipRenewalExemptEmail: jest.fn().mockReturnValue(false),
          ensureMeetingInfo: jest.fn(),
          getProviderLabel: jest.fn(),
          buildLiveKitJoinData: jest.fn(),
        })
      );

      const res = await request(app).get('/api/doctors/triage/stats');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        stats: {
          total: 7,
          pending: 3,
          inProgress: 2,
          resolved: 2,
          immediate: 1,
          urgent: 2,
        },
      });
      expect(Appointment.count).toHaveBeenCalledTimes(4);
    });

    it('returns 404 when accepting a triage case that does not exist', async () => {
      const Appointment = {
        findOne: jest.fn().mockResolvedValue(null),
        findByPk: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
        findAll: jest.fn(),
      };

      const app = mountDoctorRouter(
        createDoctorTriageRouter({
          authDoctor,
          Appointment,
          User: { sequelize: { query: jest.fn(), QueryTypes: { SELECT: 'SELECT' } }, findOne: jest.fn(), findByPk: jest.fn() },
          Doctor: {},
          UserPlan: { findOne: jest.fn() },
          Op,
          isMembershipRenewalExemptEmail: jest.fn().mockReturnValue(false),
          ensureMeetingInfo: jest.fn(),
          getProviderLabel: jest.fn(),
          buildLiveKitJoinData: jest.fn(),
        })
      );

      const res = await request(app).post('/api/doctors/triage/cases/9001/accept').send({});

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ success: false, message: 'Triage case not found' });
    });
  });
});
