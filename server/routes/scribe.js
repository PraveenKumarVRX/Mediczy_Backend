const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');

// GPU Scribe service URL
const SCRIBE_API_URL = process.env.SCRIBE_API_URL || 'http://localhost:8001';

// Multer for audio upload
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

/**
 * POST /api/hospital/scribe/transcribe
 * Transcribe audio to medical text
 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const { field_name } = req.body;
    const audioBuffer = fs.readFileSync(req.file.path);

    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'audio.wav' });
    formData.append('field_name', field_name || 'diagnosis');

    const response = await axios.post(
      `${SCRIBE_API_URL}/api/scribe/transcribe`,
      formData,
      { headers: formData.getHeaders() }
    );

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      transcription: response.data.transcription,
      duration: response.data.duration,
      processing_time: response.data.processing_time,
      field: response.data.field
    });
  } catch (error) {
    console.error('Transcription error:', error.message);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hospital/scribe/expand-abbreviations
 * Expand medical abbreviations (HTN → Hypertension)
 */
router.post('/expand-abbreviations', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await axios.post(
      `${SCRIBE_API_URL}/api/scribe/expand-abbreviations?text=${encodeURIComponent(text)}`
    );

    res.json(response.data);
  } catch (error) {
    console.error('Abbreviation expansion error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hospital/scribe/process
 * Process transcribed text with medical enhancement
 */
router.post('/process', async (req, res) => {
  try {
    const { text, patient_context } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await axios.post(
      `${SCRIBE_API_URL}/api/scribe/process-medical-text?text=${encodeURIComponent(text)}`,
      patient_context ? { patient_context } : {}
    );

    res.json(response.data);
  } catch (error) {
    console.error('Processing error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hospital/scribe/specialties
 * Get list of available medical specialties
 */
router.get('/specialties', async (req, res) => {
  try {
    const response = await axios.get(`${SCRIBE_API_URL}/api/scribe/specialties`);
    res.json(response.data);
  } catch (error) {
    console.error('Specialties error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hospital/scribe/template/:specialty
 * Get discharge summary template for a specialty
 */
router.get('/template/:specialty', async (req, res) => {
  try {
    const { specialty } = req.params;
    const response = await axios.get(
      `${SCRIBE_API_URL}/api/scribe/template/${specialty}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Template error:', error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.detail || error.message 
    });
  }
});

/**
 * POST /api/hospital/scribe/generate-summary
 * Generate complete discharge summary with specialty template
 */
router.post('/generate-summary', async (req, res) => {
  try {
    const { clinicalData, specialty = 'general_medicine' } = req.body;

    if (!clinicalData) {
      return res.status(400).json({ error: 'Clinical data is required' });
    }

    const response = await axios.post(
      `${SCRIBE_API_URL}/api/scribe/generate-discharge-summary?specialty=${specialty}`,
      clinicalData
    );

    res.json(response.data);
  } catch (error) {
    console.error('Summary generation error:', error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.detail || error.message 
    });
  }
});

/**
 * POST /api/hospital/scribe/analyze-text
 * Comprehensive analysis of clinical text
 */
router.post('/analyze-text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await axios.post(
      `${SCRIBE_API_URL}/api/scribe/analyze-text?text=${encodeURIComponent(text)}`
    );

    res.json(response.data);
  } catch (error) {
    console.error('Text analysis error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hospital/scribe/health
 * Check scribe service health
 */
router.get('/health', async (req, res) => {
  try {
    const response = await axios.get(`${SCRIBE_API_URL}/api/scribe/health`);
    res.json(response.data);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: 'Scribe service unavailable'
    });
  }
});

/**
 * GET /api/hospital/scribe/gpu-stats
 * Get GPU statistics
 */
router.get('/gpu-stats', async (req, res) => {
  try {
    const response = await axios.get(`${SCRIBE_API_URL}/api/scribe/gpu-stats`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hospital/scribe/stats
 * Get service statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const response = await axios.get(`${SCRIBE_API_URL}/api/scribe/stats`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
