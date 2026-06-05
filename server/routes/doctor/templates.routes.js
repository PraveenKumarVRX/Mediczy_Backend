import express from 'express';

export const createDoctorTemplatesRouter = ({ authDoctor, Doctor }) => {
  const router = express.Router();

  router.get('/templates', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { type } = req.query;

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      let templates = doctor.documentTemplates || [];
      if (type) {
        templates = templates.filter((t) => t.type === type);
      }

      res.json({ success: true, templates });
    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch templates',
        error: error.message,
      });
    }
  });

  router.post('/templates', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { name, type, content, isDefault, specialty, sections, diagram } = req.body;

      if (!name || !type || !content) {
        return res.status(400).json({
          success: false,
          message: 'Name, type, and content are required',
        });
      }

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const templates = doctor.documentTemplates || [];
      if (isDefault) {
        templates.forEach((t) => {
          if (t.type === type) t.isDefault = false;
        });
      }

      const newTemplate = {
        id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        type,
        content,
        isDefault: isDefault || false,
        specialty: specialty || null,
        sections: sections || null,
        diagram: diagram || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      templates.push(newTemplate);
      doctor.documentTemplates = [...templates];
      doctor.changed('documentTemplates', true);
      await doctor.save();

      res.status(201).json({ success: true, template: newTemplate });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create template',
        error: error.message,
      });
    }
  });

  router.put('/templates/:templateId', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { templateId } = req.params;
      const { name, type, content, isDefault } = req.body;

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const templates = doctor.documentTemplates || [];
      const templateIndex = templates.findIndex((t) => t.id === templateId);

      if (templateIndex === -1) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      if (isDefault) {
        templates.forEach((t) => {
          if (t.type === (type || templates[templateIndex].type)) t.isDefault = false;
        });
      }

      templates[templateIndex] = {
        ...templates[templateIndex],
        name: name || templates[templateIndex].name,
        type: type || templates[templateIndex].type,
        content: content || templates[templateIndex].content,
        isDefault: isDefault !== undefined ? isDefault : templates[templateIndex].isDefault,
        updatedAt: new Date().toISOString(),
      };

      doctor.documentTemplates = [...templates];
      doctor.changed('documentTemplates', true);
      await doctor.save();

      res.json({ success: true, template: templates[templateIndex] });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update template',
        error: error.message,
      });
    }
  });

  router.delete('/templates/:templateId', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const { templateId } = req.params;

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const templates = doctor.documentTemplates || [];
      const templateIndex = templates.findIndex((t) => t.id === templateId);

      if (templateIndex === -1) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }

      templates.splice(templateIndex, 1);
      doctor.documentTemplates = [...templates];
      doctor.changed('documentTemplates', true);
      await doctor.save();

      res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete template',
        error: error.message,
      });
    }
  });

  router.get('/template-settings', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      const defaultSettings = {
        logo: null,
        logoPosition: 'left',
        clinicName: doctor.clinicName || '',
        clinicAddress: '',
        clinicPhone: doctor.phoneNumber || '',
        clinicEmail: doctor.email || '',
        clinicWebsite: '',
        registrationNumber: doctor.registrationNumber || '',
        seal: null,
        signature: null,
        signatureName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        footerText: 'This is a computer-generated document.',
        headerColor: '#1a56db',
        showWatermark: false,
      };

      res.json({
        success: true,
        settings: doctor.templateSettings || defaultSettings,
      });
    } catch (error) {
      console.error('Get template settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch template settings',
        error: error.message,
      });
    }
  });

  router.put('/template-settings', authDoctor, async (req, res) => {
    try {
      const doctorId = req.doctor.id;
      const settings = req.body;

      const doctor = await Doctor.findByPk(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      doctor.templateSettings = {
        ...(doctor.templateSettings || {}),
        ...settings,
        updatedAt: new Date().toISOString(),
      };
      doctor.changed('templateSettings', true);
      await doctor.save();

      res.json({
        success: true,
        message: 'Template settings updated successfully',
        settings: doctor.templateSettings,
      });
    } catch (error) {
      console.error('Update template settings error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update template settings',
        error: error.message,
      });
    }
  });

  return router;
};
