import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4';

interface MedicalConsultationOptions {
  language?: string;
  conversationHistory?: Array<{role: string, content: string}>;
  userContext?: {
    age?: number;
    gender?: string;
    conditions?: string[];
    medications?: string[];
  };
  severity?: 'mild' | 'moderate' | 'severe' | 'emergency';
}

interface SymptomAnalysis {
  symptoms: string[];
  description?: string;
  duration?: string;
  severity?: string;
  triggers?: string[];
}

interface GeminiResponse {
  success: boolean;
  response?: string;
  sessionId?: string;
  timestamp?: string;
  error?: string;
  type?: 'consultation' | 'symptom_analysis' | 'emergency_check';
}

class GeminiMedicalAI {
  private genAI: GoogleGenerativeAI;
  private currentSessionId: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    this.currentSessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `mediczy_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Create medical consultation prompt in multiple languages
   */
  private createMedicalPrompt(
    query: string, 
    options: MedicalConsultationOptions = {}
  ): string {
    const { language = 'english', conversationHistory = [], userContext = {} } = options;
    
    const languageNames = {
      'en': 'English',
      'es': 'Spanish', 
      'hi': 'Hindi',
      'bn': 'Bengali',
      'ar': 'Arabic',
      'zh': 'Chinese',
      'ur': 'Urdu',
      'te': 'Telugu',
      'ta': 'Tamil',
      'mr': 'Marathi'
    };

    const targetLanguage = languageNames[language] || language;

    const historyContext = conversationHistory.length > 0 
      ? `\nConversation History:\n${conversationHistory.map(h => `${h.role}: ${h.content}`).join('\n')}\n`
      : '';

    const userInfo = Object.keys(userContext).length > 0 
      ? `\nPatient Context: Age: ${userContext.age || 'not provided'}, Gender: ${userContext.gender || 'not provided'}, Conditions: ${userContext.conditions?.join(', ') || 'none mentioned'}, Current Medications: ${userContext.medications?.join(', ') || 'none mentioned'}\n`
      : '';

    return `You are Dr. Isha, a highly experienced, compassionate AI medical assistant integrated into Mediczy healthcare platform. You provide medical guidance with empathy and precision.

CRITICAL INSTRUCTIONS:
1. Respond ONLY in ${targetLanguage} language
2. Use clear, simple medical terminology appropriate for patients
3. Always include medical disclaimers
4. If symptoms suggest emergency, clearly state "SEEK IMMEDIATE MEDICAL ATTENTION"
5. Structure responses with clear sections using emojis
6. Be empathetic and supportive
7. Never diagnose definitively - provide possibilities and recommendations

RESPONSE STRUCTURE:
🔍 **Understanding Your Concern**
[Acknowledge their symptoms/concern]

💡 **Possible Explanations**
[List 2-3 possible causes in simple terms]

🏥 **Recommended Actions**
[Clear steps they should take]

⚠️ **When to Seek Immediate Care**
[Red flag symptoms that need urgent attention]

💊 **General Wellness Tips**
[Relevant lifestyle/care recommendations]

📋 **Medical Disclaimer**
This is AI-generated medical guidance. Please consult with qualified healthcare professionals for proper diagnosis and treatment. In emergencies, contact emergency services immediately.

${historyContext}${userInfo}

Patient Query: ${query}

Please provide comprehensive medical guidance in ${targetLanguage}:`;
  }

  /**
   * Create specialized symptom analysis prompt
   */
  private createSymptomAnalysisPrompt(
    analysis: SymptomAnalysis,
    language: string = 'english'
  ): string {
    const targetLanguage = language === 'en' ? 'English' : language;
    
    return `You are Dr. Isha performing symptom analysis. Analyze these symptoms systematically:

SYMPTOMS: ${analysis.symptoms.join(', ')}
DESCRIPTION: ${analysis.description || 'Not provided'}
DURATION: ${analysis.duration || 'Not specified'}
SEVERITY: ${analysis.severity || 'Moderate'}
TRIGGERS: ${analysis.triggers?.join(', ') || 'None identified'}

Provide analysis in ${targetLanguage} with this structure:

🔍 **Symptom Analysis Summary**
[Brief overview of the symptom pattern]

📊 **Severity Assessment**
[Rate severity and urgency]

🎯 **Possible Conditions**
[List 3-4 possible conditions with brief explanations]

🚨 **Red Flags to Watch**
[Warning signs that require immediate medical attention]

🏥 **Recommended Next Steps**
[Immediate actions and when to see a doctor]

💊 **Self-Care Recommendations**
[Safe home remedies and management tips]

⏰ **Timeline for Improvement**
[Expected recovery timeline if following recommendations]

📋 **Medical Disclaimer**
This AI analysis is not a substitute for professional medical evaluation. Consult healthcare providers for proper diagnosis and treatment.`;
  }

  /**
   * Medical consultation using Gemini Pro
   */
  async consultMedical(
    query: string,
    options: MedicalConsultationOptions = {}
  ): Promise<GeminiResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
          },
        ],
      });

      const prompt = this.createMedicalPrompt(query, options);
      const result = await model.generateContent(prompt);
      const response = result.response;

      return {
        success: true,
        response: response.text(),
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
        type: 'consultation'
      };

    } catch (error) {
      console.error('Gemini medical consultation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Medical consultation failed',
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Analyze symptoms with structured response
   */
  async analyzeSymptoms(
    analysis: SymptomAnalysis,
    language: string = 'en'
  ): Promise<GeminiResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.6,
          topK: 40,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      });

      const prompt = this.createSymptomAnalysisPrompt(analysis, language);
      const result = await model.generateContent(prompt);
      const response = result.response;

      return {
        success: true,
        response: response.text(),
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
        type: 'symptom_analysis'
      };

    } catch (error) {
      console.error('Gemini symptom analysis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Symptom analysis failed',
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Emergency check - quickly assess if immediate medical attention is needed
   */
  async emergencyCheck(
    symptoms: string[],
    description: string,
    language: string = 'en'
  ): Promise<GeminiResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.3, // Lower temperature for more consistent emergency assessments
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 1024,
        },
      });

      const prompt = `You are Dr. Isha performing emergency triage assessment.

URGENT EVALUATION NEEDED:
Symptoms: ${symptoms.join(', ')}
Description: ${description}

Provide immediate assessment in ${language}:

🚨 **EMERGENCY LEVEL**
[NONE | LOW | MEDIUM | HIGH | CRITICAL]

⏰ **TIME SENSITIVITY**
[How quickly medical attention is needed]

🏥 **IMMEDIATE ACTIONS**
[What to do right now]

📞 **WHO TO CONTACT**
[Emergency services, urgent care, or regular doctor]

⚠️ **WARNING SIGNS**
[Symptoms that would make this an emergency]

This is AI triage assistance only. When in doubt, seek immediate medical care or call emergency services.`;

      const result = await model.generateContent(prompt);
      const response = result.response;

      return {
        success: true,
        response: response.text(),
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
        type: 'emergency_check'
      };

    } catch (error) {
      console.error('Gemini emergency check error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Emergency check failed',
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Analyze medical image/report using Gemini Vision
   */
  async analyzeMedicalImage(
    imageBase64: string,
    query: string,
    language: string = 'en'
  ): Promise<GeminiResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash" 
      });

      const prompt = `You are Dr. Isha analyzing a medical image or report.

Instructions:
1. Respond in ${language}
2. Analyze the medical image/document carefully
3. Provide observations in simple terms
4. Include appropriate disclaimers
5. Recommend professional medical review

Query: ${query}

Structure your response:

🔍 **Image Analysis**
[What you observe in the image]

📋 **Key Findings**
[Important elements noted]

💡 **Interpretation**
[Possible meanings in simple terms]

🏥 **Recommendations**
[Next steps and professional consultation needed]

⚠️ **Important Notice**
AI image analysis is not a substitute for professional medical interpretation. Please have this reviewed by qualified healthcare professionals.`;

      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg" // Adjust based on actual image type
        }
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;

      return {
        success: true,
        response: response.text(),
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
        type: 'consultation'
      };

    } catch (error) {
      console.error('Gemini image analysis error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Medical image analysis failed',
        sessionId: this.currentSessionId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current session information
   */
  getSessionInfo() {
    return {
      sessionId: this.currentSessionId,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Start new consultation session
   */
  startNewSession(): string {
    this.currentSessionId = this.generateSessionId();
    return this.currentSessionId;
  }

  /**
   * Check if Gemini API is available
   */
  async healthCheck(): Promise<{available: boolean, error?: string}> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent("Hello, this is a health check. Please respond with 'OK'.");
      const response = result.response;
      
      return {
        available: response.text().includes('OK') || response.text().length > 0
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Health check failed'
      };
    }
  }
}

// Export singleton instance
export const geminiMedicalAI = new GeminiMedicalAI();
export default geminiMedicalAI;