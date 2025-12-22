import express from 'express';
import { authDoctor } from '../middleware/auth.middleware.js';
import medicalAIService from '../services/medicalAI.service.js';

const router = express.Router();

/**
 * @route   POST /api/ai/generate-prescription
 * @desc    Generate structured prescription from consultation notes using AI
 * @access  Private (Doctor)
 */
router.post('/generate-prescription', authDoctor, async (req, res) => {
  try {
    const { consultationNotes, sessionNotes, existingData } = req.body;

    if (!consultationNotes?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Consultation notes are required'
      });
    }

    // Build AI prompt for prescription generation
    const prompt = `You are an expert medical AI assistant helping a doctor create a structured prescription.

CONSULTATION TRANSCRIPT:
${consultationNotes}

${sessionNotes?.length ? `\nSESSION NOTES:\n${sessionNotes.join('\n')}` : ''}

${existingData ? `\nEXISTING DATA:\n${JSON.stringify(existingData, null, 2)}` : ''}

TASK:
Extract and structure the following information from the consultation notes:

1. **Chief Complaints**: Patient's main symptoms and concerns
2. **Diagnosis**: Medical diagnosis or provisional diagnosis
3. **Medications**: List of medications with:
   - Name
   - Composition (if mentioned)
   - Dosage (e.g., 500mg)
   - Frequency (e.g., BD/TDS/QID)
   - Duration (e.g., 7 days)
   - Instructions (e.g., After meals, Before sleep)
4. **General Instructions**: Patient care instructions
5. **Lab Tests**: Recommended investigations
6. **Notes**: Additional doctor's notes

RESPONSE FORMAT (JSON):
{
  "chiefComplaints": "string",
  "diagnosis": "string",
  "medications": [
    {
      "name": "Paracetamol",
      "composition": "Paracetamol 500mg",
      "dosage": "500mg",
      "frequency": "TDS",
      "duration": "5 days",
      "quantity": "15 tablets",
      "instructions": "After meals"
    }
  ],
  "instructions": [
    "Rest for 2-3 days",
    "Drink plenty of fluids",
    "Avoid cold foods"
  ],
  "labTests": [
    "Complete Blood Count (CBC)",
    "Blood Sugar Fasting"
  ],
  "notes": "Follow-up after 7 days if symptoms persist"
}

IMPORTANT:
- Use standard medical abbreviations (BD=Twice daily, TDS=Thrice daily, QID=Four times daily)
- Include only information mentioned in the consultation
- If something is not mentioned, use empty string or empty array
- Be precise with dosages and frequencies
- Ensure medication names are spelled correctly

Generate the prescription JSON:`;

    // Call AI service
    const aiResponse = await medicalAIService.consultMedical(
      prompt,
      `prescription_${Date.now()}`,
      'en',
      {
        analysisType: 'prescription_generation',
        doctorId: req.doctor.id
      }
    );

    if (!aiResponse.success) {
      throw new Error('AI service failed');
    }

    // Parse AI response to extract JSON
    let prescriptionData;
    try {
      const responseText = aiResponse.text || aiResponse.response || '';
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        prescriptionData = JSON.parse(jsonStr);
      } else {
        // Fallback: parse entire response
        prescriptionData = JSON.parse(responseText);
      }
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      
      // Fallback: Create basic structure from notes
      prescriptionData = {
        chiefComplaints: extractSection(consultationNotes, ['complaint', 'symptom', 'problem']),
        diagnosis: extractSection(consultationNotes, ['diagnosis', 'diagnosed with', 'condition']),
        medications: extractMedications(consultationNotes),
        instructions: extractInstructions(consultationNotes),
        labTests: extractLabTests(consultationNotes),
        notes: consultationNotes
      };
    }

    // Validate and sanitize prescription data
    const prescription = {
      chiefComplaints: prescriptionData.chiefComplaints || '',
      diagnosis: prescriptionData.diagnosis || '',
      medications: Array.isArray(prescriptionData.medications) ? prescriptionData.medications : [],
      instructions: Array.isArray(prescriptionData.instructions) ? prescriptionData.instructions : [],
      labTests: Array.isArray(prescriptionData.labTests) ? prescriptionData.labTests : [],
      notes: prescriptionData.notes || ''
    };

    res.json({
      success: true,
      prescription,
      aiResponse: aiResponse.text || aiResponse.response,
      model: aiResponse.model || 'AI',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Prescription generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate prescription',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/ai/scribe
 * @desc    Process voice transcript with AI enhancements
 * @access  Private (Doctor)
 */
router.post('/scribe', authDoctor, async (req, res) => {
  try {
    const { text, field, context } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    // Smart processing based on field
    let processedText = text;
    let suggestions = [];

    if (field === 'diagnosis') {
      suggestions = getMedicalSuggestions(text, 'diagnosis');
    } else if (field === 'medications') {
      suggestions = getMedicalSuggestions(text, 'medications');
      processedText = formatMedicationText(text);
    } else if (field === 'chiefComplaints') {
      processedText = formatComplaintsText(text);
    }

    res.json({
      success: true,
      processedText,
      suggestions,
      originalText: text
    });

  } catch (error) {
    console.error('Scribe processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process text',
      error: error.message
    });
  }
});

// Helper functions for fallback parsing
function extractSection(text, keywords) {
  const lines = text.toLowerCase().split('\n');
  for (const line of lines) {
    for (const keyword of keywords) {
      if (line.includes(keyword)) {
        return line.split(':')[1]?.trim() || line;
      }
    }
  }
  return '';
}

function extractMedications(text) {
  const medications = [];
  const commonMeds = ['paracetamol', 'ibuprofen', 'amoxicillin', 'azithromycin', 'cetirizine', 'omeprazole'];
  const lines = text.toLowerCase().split('\n');
  
  for (const line of lines) {
    for (const med of commonMeds) {
      if (line.includes(med)) {
        medications.push({
          name: med.charAt(0).toUpperCase() + med.slice(1),
          dosage: extractDosage(line),
          frequency: extractFrequency(line),
          duration: extractDuration(line),
          instructions: 'After meals'
        });
      }
    }
  }
  return medications;
}

function extractDosage(text) {
  const dosageMatch = text.match(/(\d+)\s*(mg|ml|g)/i);
  return dosageMatch ? dosageMatch[0] : '500mg';
}

function extractFrequency(text) {
  if (text.includes('twice') || text.includes('bd')) return 'BD';
  if (text.includes('thrice') || text.includes('tds')) return 'TDS';
  if (text.includes('four') || text.includes('qid')) return 'QID';
  if (text.includes('once') || text.includes('od')) return 'OD';
  return 'BD';
}

function extractDuration(text) {
  const durationMatch = text.match(/(\d+)\s*days?/i);
  return durationMatch ? durationMatch[0] : '7 days';
}

function extractInstructions(text) {
  const instructions = [];
  const keywords = ['rest', 'fluid', 'avoid', 'take', 'drink'];
  const lines = text.toLowerCase().split('\n');
  
  for (const line of lines) {
    for (const keyword of keywords) {
      if (line.includes(keyword)) {
        instructions.push(line.trim());
        break;
      }
    }
  }
  return instructions;
}

function extractLabTests(text) {
  const tests = [];
  const commonTests = ['cbc', 'blood sugar', 'urine', 'x-ray', 'ecg', 'ultrasound'];
  const lowerText = text.toLowerCase();
  
  for (const test of commonTests) {
    if (lowerText.includes(test)) {
      tests.push(test.toUpperCase());
    }
  }
  return tests;
}

function getMedicalSuggestions(text, type) {
  const lowerText = text.toLowerCase();
  
  if (type === 'diagnosis') {
    if (lowerText.includes('fever')) return ['Viral Fever', 'Typhoid', 'Dengue'];
    if (lowerText.includes('cough')) return ['URTI', 'Bronchitis', 'Pneumonia'];
    if (lowerText.includes('pain')) return ['Gastritis', 'Migraine', 'Arthritis'];
  } else if (type === 'medications') {
    if (lowerText.includes('fever') || lowerText.includes('pain')) {
      return ['Paracetamol 500mg', 'Ibuprofen 400mg', 'Diclofenac 50mg'];
    }
    if (lowerText.includes('antibiotic')) {
      return ['Amoxicillin 500mg', 'Azithromycin 500mg', 'Ciprofloxacin 500mg'];
    }
  }
  return [];
}

function formatMedicationText(text) {
  // Capitalize first letter of each line
  return text.split('\n').map(line => 
    line.charAt(0).toUpperCase() + line.slice(1)
  ).join('\n');
}

function formatComplaintsText(text) {
  // Format complaints properly
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default router;
