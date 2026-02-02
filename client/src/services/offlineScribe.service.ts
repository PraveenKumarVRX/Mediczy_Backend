/**
 * Offline AI Scribe Service
 * Handles communication with the offline scribe backend (CPU-only, Indian languages)
 */

import api from '@/utils/api';

// Types for offline scribe
export interface TranscriptionResult {
  text: string;
  language: string;
  detected_language?: string;
  duration_seconds?: number;
  processing_time_ms?: number;
}

export interface NormalizationResult {
  original_text: string;
  normalized_text: string;
  corrections: Array<{
    original: string;
    corrected: string;
    type: string;
  }>;
  processing_time_ms: number;
}

export interface Medication {
  name: string;
  composition?: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions: string;
}

export interface PrescriptionData {
  chiefComplaints?: string;
  diagnosis?: string;
  medications: Medication[];
  instructions: string[];
  labTests: string[];
  notes?: string;
  vitals?: {
    bp?: string;
    pulse?: string;
    temperature?: string;
    spo2?: string;
    weight?: string;
  };
}

export interface DocumentResult {
  formatted_text: string;
  structured_data: PrescriptionData;
  document_type: string;
  language: string;
  processing_time_ms: number;
}

export interface FullPipelineResult {
  transcription: TranscriptionResult;
  normalization: NormalizationResult;
  document: DocumentResult;
  language: string;
  total_processing_time_ms: number;
}

export interface HealthStatus {
  status: 'ok' | 'error' | 'degraded';
  service: string;
  backend?: {
    status: string;
    llm_loaded: boolean;
    stt_available: boolean;
  };
  timestamp: string;
}

export interface SupportedLanguages {
  supported_languages: Array<{
    code: string;
    name: string;
    native_name: string;
  }>;
  default_language: string;
}

export interface DocumentTemplate {
  name: string;
  type: string;
  sections: string[];
}

export interface Templates {
  templates: DocumentTemplate[];
}

export type DocumentType = 'prescription' | 'opd-notes' | 'ipd-notes' | 'discharge';
export type LanguageCode = 'hi' | 'ta' | 'te' | 'en' | 'auto';

// Service class
class OfflineScribeService {
  private baseUrl = '/offline-scribe';

  /**
   * Check service health
   */
  async checkHealth(): Promise<HealthStatus> {
    const response = await api.get<HealthStatus>(`${this.baseUrl}/health`);
    return response.data;
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<SupportedLanguages> {
    const response = await api.get<SupportedLanguages>(`${this.baseUrl}/languages`);
    return response.data;
  }

  /**
   * Get document templates
   */
  async getTemplates(): Promise<Templates> {
    const response = await api.get<Templates>(`${this.baseUrl}/templates`);
    return response.data;
  }

  /**
   * Transcribe audio to text
   */
  async transcribe(audioBlob: Blob, language: LanguageCode = 'auto'): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);

    const response = await api.post<TranscriptionResult>(
      `${this.baseUrl}/transcribe`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minutes for transcription
      }
    );
    return response.data;
  }

  /**
   * Normalize medical text
   */
  async normalize(text: string, language: LanguageCode = 'hi'): Promise<NormalizationResult> {
    const response = await api.post<NormalizationResult>(`${this.baseUrl}/normalize`, {
      text,
      language,
    });
    return response.data;
  }

  /**
   * Generate prescription from dictation
   */
  async generatePrescription(
    dictation: string,
    language: LanguageCode = 'hi',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
    }
  ): Promise<DocumentResult> {
    const response = await api.post<DocumentResult>(`${this.baseUrl}/prescription`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return response.data;
  }

  /**
   * Generate OPD notes from dictation
   */
  async generateOPDNotes(
    dictation: string,
    language: LanguageCode = 'hi',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
    }
  ): Promise<DocumentResult> {
    const response = await api.post<DocumentResult>(`${this.baseUrl}/opd-notes`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return response.data;
  }

  /**
   * Generate IPD notes from dictation
   */
  async generateIPDNotes(
    dictation: string,
    language: LanguageCode = 'hi',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
    }
  ): Promise<DocumentResult> {
    const response = await api.post<DocumentResult>(`${this.baseUrl}/ipd-notes`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return response.data;
  }

  /**
   * Generate discharge summary from dictation
   */
  async generateDischargeSummary(
    dictation: string,
    language: LanguageCode = 'hi',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
      admission_date?: string;
      discharge_date?: string;
    }
  ): Promise<DocumentResult> {
    const response = await api.post<DocumentResult>(`${this.baseUrl}/discharge`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return response.data;
  }

  /**
   * Full pipeline: Audio → Transcription → Normalization → Document
   */
  async fullPipeline(
    audioBlob: Blob,
    documentType: DocumentType = 'prescription',
    language: LanguageCode = 'auto',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
    }
  ): Promise<FullPipelineResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);
    formData.append('document_type', documentType);
    formData.append('patient_context', JSON.stringify(patientContext || {}));

    const response = await api.post<FullPipelineResult>(
      `${this.baseUrl}/full-pipeline`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 180000, // 3 minutes for full pipeline
      }
    );
    return response.data;
  }

  /**
   * Generate document from text (after transcription)
   */
  async generateDocument(
    dictation: string,
    documentType: DocumentType,
    language: LanguageCode = 'hi',
    patientContext?: {
      name?: string;
      age?: number;
      gender?: string;
      patient_id?: string;
    }
  ): Promise<DocumentResult> {
    switch (documentType) {
      case 'prescription':
        return this.generatePrescription(dictation, language, patientContext);
      case 'opd-notes':
        return this.generateOPDNotes(dictation, language, patientContext);
      case 'ipd-notes':
        return this.generateIPDNotes(dictation, language, patientContext);
      case 'discharge':
        return this.generateDischargeSummary(dictation, language, patientContext);
      default:
        return this.generatePrescription(dictation, language, patientContext);
    }
  }

  /**
   * Get detailed service status
   */
  async getStatus(): Promise<{
    service: string;
    status: string;
    health: any;
    languages: any;
    templates: any;
    configuration: {
      features: string[];
      model: string;
    };
  }> {
    const response = await api.get(`${this.baseUrl}/status`);
    return response.data;
  }
}

// Export singleton instance
export const offlineScribeService = new OfflineScribeService();
export default offlineScribeService;
