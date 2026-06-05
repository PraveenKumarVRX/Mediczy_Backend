import express from 'express';

export const createDoctorBillingRouter = ({ authDoctor, Appointment, User }) => {
  const router = express.Router();

  router.post('/appointments/:appointmentId/invoice', authDoctor, async (req, res) => {
    try {
      const { appointmentId } = req.params;
      const doctorId = req.doctor.id;
      const { items: rawItems, discount = 0, notes, taxRate = 0, amount, service, description } = req.body;

      const appointment = await Appointment.findOne({
        where: { id: appointmentId, doctorId },
        include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found or access denied',
        });
      }

      const fallbackAmount = Number(amount ?? appointment.paymentAmount ?? appointment.consultationFee ?? 0);
      const items = Array.isArray(rawItems) && rawItems.length > 0
        ? rawItems
        : [{ description: service || description || 'Doctor consultation', price: fallbackAmount, quantity: 1 }];

      const normalizedItems = items.map((item, index) => {
        const quantity = Math.max(1, Number(item.quantity ?? item.qty ?? 1) || 1);
        const price = Number(item.price ?? item.amount ?? item.rate ?? 0);
        return {
          id: item.id || ('item_' + (index + 1)),
          description: item.description || item.service || item.name || ('Item ' + (index + 1)),
          quantity,
          price: Number.isFinite(price) ? price : 0,
        };
      });

      if (!normalizedItems.length || normalizedItems.some((item) => item.price < 0 || item.quantity <= 0)) {
        return res.status(400).json({ success: false, message: 'At least one valid invoice item is required' });
      }

      const subtotal = normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const discountAmount = Number(discount) || 0;
      const taxAmount = ((subtotal - discountAmount) * (Number(taxRate) || 0)) / 100;
      const total = subtotal - discountAmount + taxAmount;

      const invoiceNumber = `INV-${Date.now()}-${appointmentId}`;
      const invoice = {
        invoiceNumber,
        appointmentId,
        doctorId,
        patientId: appointment.userId ?? appointment.patientId,
        items: normalizedItems,
        subtotal,
        discount: discountAmount,
        taxRate: taxRate || 0,
        taxAmount,
        total,
        status: 'pending',
        notes,
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      let appointmentNotes = {};
      try {
        appointmentNotes = appointment.notes
          ? (typeof appointment.notes === 'string' ? JSON.parse(appointment.notes) : appointment.notes)
          : {};
      } catch {
        appointmentNotes = {};
      }

      await appointment.update({
        notes: JSON.stringify({
          ...appointmentNotes,
          invoice,
        }),
      });

      res.status(201).json({
        success: true,
        message: 'Invoice created successfully',
        invoice: {
          ...invoice,
          patientName: appointment.patient ? `${appointment.patient.firstName} ${appointment.patient.lastName}` : 'Unknown',
          doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`,
        },
      });
    } catch (error) {
      console.error('Create invoice error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create invoice',
        error: error.message,
      });
    }
  });

  router.get('/invoices', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { status, limit = 50 } = req.query;

      const appointments = await Appointment.findAll({
        where: { doctorId },
        include: [{ model: User, as: 'patient', attributes: ['id', 'firstName', 'lastName', 'email'] }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit, 10),
      });

      const invoices = [];
      for (const apt of appointments) {
        try {
          const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
          if (notes.invoice) {
            const inv = notes.invoice;
            if (!status || inv.status === status) {
              invoices.push({
                ...inv,
                appointmentDate: apt.appointmentDate,
                patientName: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
              });
            }
          }
        } catch {
          console.warn(`Failed to parse notes for appointment ${apt.id}`);
        }
      }

      res.json({ success: true, count: invoices.length, invoices });
    } catch (error) {
      console.error('Get invoices error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch invoices',
        error: error.message,
      });
    }
  });

  router.get('/invoices/:invoiceNumber', authDoctor, async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      const doctorId = req.doctor.id;

      const appointments = await Appointment.findAll({
        where: { doctorId },
        include: [{ model: User, as: 'patient' }],
      });

      let foundInvoice = null;
      let foundAppointment = null;

      for (const apt of appointments) {
        try {
          const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
          if (notes.invoice && notes.invoice.invoiceNumber === invoiceNumber) {
            foundInvoice = notes.invoice;
            foundAppointment = apt;
            break;
          }
        } catch {
          // ignore malformed notes
        }
      }

      if (!foundInvoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      res.json({
        success: true,
        invoice: {
          ...foundInvoice,
          appointmentDate: foundAppointment.appointmentDate,
          patientName: foundAppointment.patient ? `${foundAppointment.patient.firstName} ${foundAppointment.patient.lastName}` : 'Unknown',
          patientEmail: foundAppointment.patient?.email,
          patientPhone: foundAppointment.patient?.phoneNumber,
          doctorName: `Dr. ${req.doctor.firstName} ${req.doctor.lastName}`,
        },
      });
    } catch (error) {
      console.error('Get invoice error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch invoice',
        error: error.message,
      });
    }
  });

  router.put('/invoices/:invoiceNumber/status', authDoctor, async (req, res) => {
    try {
      const { invoiceNumber } = req.params;
      const { status } = req.body;
      const doctorId = req.doctor.id;

      if (!['pending', 'paid', 'cancelled', 'overdue'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be: pending, paid, cancelled, or overdue',
        });
      }

      const appointments = await Appointment.findAll({ where: { doctorId } });
      let updated = false;

      for (const apt of appointments) {
        try {
          const notes = apt.notes ? (typeof apt.notes === 'string' ? JSON.parse(apt.notes) : apt.notes) : {};
          if (notes.invoice && notes.invoice.invoiceNumber === invoiceNumber) {
            notes.invoice.status = status;
            if (status === 'paid') {
              notes.invoice.paidDate = new Date();
            }
            await apt.update({ notes: JSON.stringify(notes) });
            updated = true;
            break;
          }
        } catch {
          // ignore malformed notes
        }
      }

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      res.json({
        success: true,
        message: 'Invoice status updated successfully',
        invoiceNumber,
        status,
      });
    } catch (error) {
      console.error('Update invoice status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update invoice status',
        error: error.message,
      });
    }
  });

  router.post('/services/add', authDoctor, async (req, res) => {
    try {
      const { name, description, price, duration, isActive = true } = req.body;
      if (!name || !price) {
        return res.status(400).json({ success: false, message: 'Service name and price are required' });
      }
      const serviceId = `svc_${req.doctor.id}_${Date.now()}`;
      res.status(201).json({
        success: true,
        message: 'Service added successfully',
        service: { id: serviceId, name, description, price, duration, isActive, createdAt: new Date() },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to add service', error: error.message });
    }
  });

  router.delete('/services/:id', authDoctor, async (req, res) => {
    res.json({ success: true, message: 'Service deleted', id: req.params.id });
  });

  router.get('/services', authDoctor, async (req, res) => {
    try {
      res.json({ success: true, services: [] });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.put('/services', authDoctor, async (req, res) => {
    try {
      const { id, name, price, duration, description, isActive } = req.body;
      if (!id) return res.status(400).json({ success: false, message: 'Service id is required' });
      res.json({
        success: true,
        message: 'Service updated',
        service: { id, name, price, duration, description, isActive },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.put('/appointments/:appointmentId', authDoctor, async (req, res) => {
    try {
      const { notes, diagnosis, consultationNotes, followUpDate } = req.body;
      const { appointmentId } = req.params;
      const db = req.app.locals.db || (await import('../../db.js')).default;
      await db.query(
        `UPDATE appointments
           SET consultation_notes = $1,
               diagnosis          = $2,
               follow_up_date     = $3,
               updated_at         = NOW()
         WHERE id = $4`,
        [consultationNotes || notes || null, diagnosis || null, followUpDate || null, appointmentId]
      );
      res.json({ success: true, message: 'Appointment updated' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.put('/appointments/:appointmentId/next-review', authDoctor, async (req, res) => {
    try {
      const { date, notes } = req.body;
      const { appointmentId } = req.params;
      const db = req.app.locals.db || (await import('../../db.js')).default;
      await db.query(
        `UPDATE appointments
           SET next_review_date  = $1,
               next_review_notes = $2,
               updated_at        = NOW()
         WHERE id = $3`,
        [date || null, notes || null, appointmentId]
      );
      res.json({ success: true, message: 'Next review date set' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/invoices', authDoctor, async (req, res) => {
    try {
      const { patientName, amount, service, dueDate } = req.body;
      if (!patientName || !amount) {
        return res.status(400).json({ success: false, message: 'patientName and amount are required' });
      }
      const invoiceNumber = `INV-${req.doctor.id}-${Date.now()}`;
      res.status(201).json({
        success: true,
        invoice: {
          invoiceNumber,
          patientName,
          amount: Number(amount),
          service: service || '',
          dueDate: dueDate || null,
          status: 'pending',
          doctorId: req.doctor.id,
          createdAt: new Date(),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  return router;
};
