import express from 'express';
import { authDoctor } from '../middleware/auth.middleware.js';
import medicalAIService from '../services/medicalAI.service.js';
import { Prescription, Appointment, User, Doctor } from '../models/index.js';

const router = express.Router();

/**
 * @route   POST /api/ai/generate-prescription
 * @desc    Generate structured prescription from consultation notes using AI
 * @access  Private (Doctor)
 */
router.post('/generate-prescription', authDoctor, async (req, res) => {
  try {
    const {
      consultationNotes,
      sessionNotes,
      existingData,
      appointmentId,
      patientId,
      patientName,
      patientAge,
      patientGender,
      patientPhone,
      vitals,
      saveToDatabase = true
    } = req.body;

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
    const prescriptionContent = {
      chiefComplaints: prescriptionData.chiefComplaints || '',
      diagnosis: prescriptionData.diagnosis || '',
      medications: Array.isArray(prescriptionData.medications) ? prescriptionData.medications : [],
      instructions: Array.isArray(prescriptionData.instructions) ? prescriptionData.instructions : [],
      labTests: Array.isArray(prescriptionData.labTests) ? prescriptionData.labTests : [],
      notes: prescriptionData.notes || ''
    };

    // Save to database if requested
    let savedPrescription = null;
    if (saveToDatabase) {
      try {
        // Get doctor info
        const doctor = req.doctor;
        const doctorId = doctor.id || doctor.dataValues?.id || doctor._id;

        // Get patient info if patientId is provided
        let patientData = {
          patientName: patientName || 'Patient',
          patientAge: patientAge || null,
          patientGender: patientGender || 'Not specified',
          patientPhone: patientPhone || null
        };

        if (patientId) {
          const patient = await User.findByPk(patientId);
          if (patient) {
            let age = patientAge;
            if (!age && patient.dateOfBirth) {
              const dob = new Date(patient.dateOfBirth);
              const today = new Date();
              age = today.getFullYear() - dob.getFullYear();
            }

            patientData = {
              patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patientName,
              patientAge: age,
              patientGender: patient.gender || patientGender || 'Not specified',
              patientPhone: patient.phoneNumber || patient.phone || patientPhone
            };
          }
        }

        // Get appointment if appointmentId is provided
        let appointment = null;
        if (appointmentId) {
          appointment = await Appointment.findByPk(appointmentId);
        }

        // Generate prescription ID
        const prescriptionNumber = `RX${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create prescription in database
        savedPrescription = await Prescription.create({
          prescriptionId: prescriptionNumber,
          appointmentId: appointmentId || null,
          patientId: patientId || null,
          ...patientData,
          doctorId: doctorId,
          doctorName: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim(),
          doctorQualifications: doctor.qualifications || 'MBBS',
          doctorRegNo: doctor.registrationNumber || null,
          specialty: doctor.specialty || 'General Medicine',
          clinicName: doctor.clinicName || 'Mediczy Healthcare',
          clinicAddress: doctor.clinicAddress || 'Virtual Consultation',
          clinicPhone: doctor.clinicPhone || doctor.phone || null,
          clinicEmail: doctor.clinicEmail || doctor.email || null,
          vitals: vitals || {},
          chiefComplaints: Array.isArray(prescriptionContent.chiefComplaints)
            ? prescriptionContent.chiefComplaints
            : [prescriptionContent.chiefComplaints],
          diagnosis: prescriptionContent.diagnosis,
          medications: prescriptionContent.medications,
          adviceList: prescriptionContent.instructions || [],
          advice: prescriptionContent.instructions ? prescriptionContent.instructions.join('; ') : null,
          labTests: prescriptionContent.labTests.map(test => ({
            testName: typeof test === 'string' ? test : test.testName || test.name || 'Lab Test',
            reason: typeof test === 'object' ? test.reason : null
          })),
          notes: prescriptionContent.notes,
          additionalNotes: {
            consultationNotes: consultationNotes
          },
          status: 'issued',
          metadata: {
            generatedBy: 'AI',
            generatedAt: new Date().toISOString(),
            aiModel: 'Llama-3.1-8B-Instruct',
            source: 'ai-prescription-demo'
          }
        });

        console.log(`✅ Prescription saved to database: ${prescriptionNumber}`);
      } catch (dbError) {
        console.error('❌ Failed to save prescription to database:', dbError);
        // Continue anyway, return the prescription data even if save fails
      }
    }

    res.json({
      success: true,
      prescription: prescriptionContent,
      savedPrescription: savedPrescription ? {
        id: savedPrescription.id,
        prescriptionId: savedPrescription.prescriptionId,
        prescriptionNumber: savedPrescription.prescriptionId,
        createdAt: savedPrescription.createdAt
      } : null,
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

async function getMedicalSuggestions(text, type) {
  const lowerText = text.toLowerCase();
  
  // Primary: Use AI model for intelligent suggestions
  try {
    if (type === 'medications') {
      const suggestionPrompt = `Based on the following patient symptoms/condition, suggest appropriate medications with dosages and frequencies.

Patient description: "${text}"

IMPORTANT:
- Only suggest medications that are clinically appropriate for these symptoms
- Include medication name, dosage, and frequency (e.g., "Paracetamol 500mg BD")
- Suggest 3-5 most relevant medications
- Format as a JSON array: ["Med1 dosage freq", "Med2 dosage freq", ...]
- Be specific and medically accurate`;

      const aiResponse = await medicalAIService.consultMedical(
        suggestionPrompt,
        `med_suggestion_${Date.now()}`,
        'en',
        { analysisType: 'medication_suggestion' }
      );

      if (aiResponse.success && aiResponse.response) {
        try {
          // Parse JSON from AI response
          const jsonMatch = aiResponse.response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            if (Array.isArray(suggestions) && suggestions.length > 0) {
              return suggestions;
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse AI medication suggestions:', parseError.message);
        }
      }
    } else if (type === 'diagnosis') {
      const suggestionPrompt = `Based on the following patient symptoms, suggest possible diagnoses.

Symptoms: "${text}"

IMPORTANT:
- Suggest 3-5 possible diagnoses
- Include both common and serious conditions
- Format as a JSON array: ["Diagnosis1", "Diagnosis2", ...]
- Include both provisional and differential diagnoses`;

      const aiResponse = await medicalAIService.consultMedical(
        suggestionPrompt,
        `diag_suggestion_${Date.now()}`,
        'en',
        { analysisType: 'diagnosis_suggestion' }
      );

      if (aiResponse.success && aiResponse.response) {
        try {
          const jsonMatch = aiResponse.response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            if (Array.isArray(suggestions) && suggestions.length > 0) {
              return suggestions;
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse AI diagnosis suggestions:', parseError.message);
        }
      }
    }
  } catch (error) {
    console.error('AI suggestion error:', error.message);
  }

  // Fallback: Use pattern matching if AI fails
  if (type === 'diagnosis') {
    if (lowerText.includes('fever')) return ['Viral Fever', 'Typhoid Fever', 'Dengue Fever', 'Influenza'];
    if (lowerText.includes('cough') || lowerText.includes('cold')) return ['Upper Respiratory Tract Infection', 'Bronchitis', 'Common Cold', 'Pneumonia'];
    if (lowerText.includes('pain') && lowerText.includes('stomach')) return ['Gastritis', 'Peptic Ulcer', 'Indigestion', 'IBS'];
    if (lowerText.includes('headache')) return ['Migraine', 'Tension Headache', 'Sinusitis', 'Cluster Headache'];
    if (lowerText.includes('nausea') || lowerText.includes('vomit')) return ['Gastroenteritis', 'Food Poisoning', 'Migraine', 'Pregnancy'];
    if (lowerText.includes('diarrhea')) return ['Gastroenteritis', 'IBS', 'Food Poisoning', 'Dysentery'];
    if (lowerText.includes('rash')) return ['Urticaria', 'Eczema', 'Contact Dermatitis', 'Chickenpox'];
  } else if (type === 'medications') {
    if (lowerText.includes('fever') || lowerText.includes('pain')) {
      return ['Paracetamol 500mg BD', 'Ibuprofen 400mg BD', 'Diclofenac 50mg BD after meals'];
    }
    if (lowerText.includes('cough') || lowerText.includes('cold')) {
      return ['Cough Syrup (Dextromethorphan) 10ml TDS', 'Cetirizine 10mg OD at bedtime', 'Amoxicillin 500mg TDS after meals'];
    }
    if (lowerText.includes('antibiotic') || lowerText.includes('infection')) {
      return ['Amoxicillin 500mg TDS', 'Azithromycin 500mg OD', 'Ciprofloxacin 500mg BD after meals'];
    }
    if (lowerText.includes('nausea') || lowerText.includes('vomit')) {
      return ['Metoclopramide 10mg TDS', 'Ondansetron 4mg BD', 'Domperidone 10mg TDS'];
    }
    if (lowerText.includes('diarrhea')) {
      return ['Loperamide 2mg after each loose motion', 'Metronidazole 400mg TDS', 'ORS (Oral Rehydration Solution)'];
    }
    if (lowerText.includes('stomach') || lowerText.includes('acidity')) {
      return ['Pantoprazole 40mg OD before meals', 'Omeprazole 20mg OD', 'Ranitidine 150mg BD after meals'];
    }
    if (lowerText.includes('headache')) {
      return ['Paracetamol 500mg TDS', 'Aspirin 500mg BD', 'Propranolol 40mg BD (for migraine prevention)'];
    }
    if (lowerText.includes('allergy') || lowerText.includes('rash')) {
      return ['Cetirizine 10mg OD', 'Loratadine 10mg OD', 'Hydrocortisone cream 1% (topical) BD'];
    }
    if (lowerText.includes('cold') || lowerText.includes('running nose')) {
      return ['Saline nasal drops', 'Cetirizine 10mg OD', 'Amoxicillin 500mg TDS after meals'];
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
