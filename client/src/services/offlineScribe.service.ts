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

const toMilliseconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
};

const toSecondsAsMilliseconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 1000);
  }
  return 0;
};

// Service class
class OfflineScribeService {
  private baseUrl = '/offline-scribe';

  private normalizeDocumentType(value: string | undefined, fallback: DocumentType): DocumentType {
    const normalized = String(value || '').toLowerCase().replace(/_/g, '-');
    if (normalized === 'prescription') return 'prescription';
    if (normalized === 'opd-notes') return 'opd-notes';
    if (normalized === 'ipd-notes') return 'ipd-notes';
    if (normalized === 'discharge' || normalized === 'discharge-summary') return 'discharge';
    return fallback;
  }

  private normalizeDocumentResult(raw: any, fallbackType: DocumentType, fallbackLanguage: LanguageCode): DocumentResult {
    const structuredData = raw?.structured_data || raw?.structured || {};
    const processingTimeMs =
      toMilliseconds(raw?.processing_time_ms) ||
      toMilliseconds(raw?.total_processing_time_ms) ||
      toSecondsAsMilliseconds(raw?.total_time) ||
      toSecondsAsMilliseconds(raw?.generation_time) ||
      toSecondsAsMilliseconds(raw?.total_pipeline_time);

    return {
      formatted_text: raw?.formatted_text || raw?.raw_output || raw?.text || '',
      structured_data: structuredData,
      document_type: this.normalizeDocumentType(raw?.document_type, fallbackType),
      language: raw?.language || raw?.detected_language || fallbackLanguage,
      processing_time_ms: processingTimeMs,
    };
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<HealthStatus> {
    const response = await api.get<HealthStatus>(`${this.baseUrl}/health`);
    if (response.data?.status) {
      return response.data;
    }
    return {
      status: 'error',
      service: 'offline-scribe',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get supported languages
   */
  async getLanguages(): Promise<SupportedLanguages> {
    const response = await api.get<any>(`${this.baseUrl}/languages`);
    const data = response.data || {};

    if (Array.isArray(data.supported_languages)) {
      return data as SupportedLanguages;
    }

    const languageMap = data.languages || {};
    const supportedLanguages = Object.entries(languageMap).map(([code, value]: [string, any]) => ({
      code,
      name: value?.name || String(value),
      native_name: value?.native || value?.native_name || value?.name || String(value),
    }));

    return {
      supported_languages: supportedLanguages,
      default_language: 'hi',
    };
  }

  /**
   * Get document templates
   */
  async getTemplates(): Promise<Templates> {
    const response = await api.get<any>(`${this.baseUrl}/templates`);
    const data = response.data || {};

    if (Array.isArray(data.templates)) {
      return data as Templates;
    }

    const templateMap = data.templates || {};
    return {
      templates: Object.entries(templateMap).map(([type, meta]: [string, any]) => ({
        name: meta?.name || type,
        type,
        sections: Array.isArray(meta?.sections) ? meta.sections : [],
      })),
    };
  }

  /**
   * Transcribe audio to text
   */
  async transcribe(audioBlob: Blob, language: LanguageCode = 'auto'): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('language', language);

    const response = await api.post<any>(
      `${this.baseUrl}/transcribe`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000, // 2 minutes for transcription
      }
    );
    const data = response.data || {};
    return {
      text: data.text || data.transcript || '',
      language: data.language || data.detected_language || language,
      detected_language: data.detected_language || data.language,
      duration_seconds: data.duration_seconds || data.audio_duration,
      processing_time_ms:
        data.processing_time_ms ||
        toSecondsAsMilliseconds(data.transcription_time),
    };
  }

  /**
   * Normalize medical text
   */
  async normalize(text: string, language: LanguageCode = 'hi'): Promise<NormalizationResult> {
    const response = await api.post<any>(`${this.baseUrl}/normalize`, {
      text,
      language,
    });
    const data = response.data || {};
    return {
      original_text: data.original_text || text,
      normalized_text: data.normalized_text || text,
      corrections: data.corrections || data.changes || [],
      processing_time_ms:
        data.processing_time_ms ||
        toSecondsAsMilliseconds(data.processing_time),
    };
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
    const response = await api.post<any>(`${this.baseUrl}/prescription`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return this.normalizeDocumentResult(response.data, 'prescription', language);
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
    const response = await api.post<any>(`${this.baseUrl}/opd-notes`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return this.normalizeDocumentResult(response.data, 'opd-notes', language);
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
    const response = await api.post<any>(`${this.baseUrl}/ipd-notes`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return this.normalizeDocumentResult(response.data, 'ipd-notes', language);
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
    const response = await api.post<any>(`${this.baseUrl}/discharge`, {
      dictation,
      language,
      patient_context: patientContext || {},
    });
    return this.normalizeDocumentResult(response.data, 'discharge', language);
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

    const response = await api.post<any>(
      `${this.baseUrl}/full-pipeline`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 180000, // 3 minutes for full pipeline
      }
    );
    const data = response.data || {};
    return {
      transcription: {
        text: data.transcript || data.text || '',
        language: data.detected_language || data.language || language,
        detected_language: data.detected_language || data.language,
        duration_seconds: data.audio_duration,
        processing_time_ms:
          toSecondsAsMilliseconds(data.transcription_time) ||
          data.processing_time_ms,
      },
      normalization: {
        original_text: data.transcript || '',
        normalized_text: data.normalized_text || '',
        corrections: data.normalization_changes || [],
        processing_time_ms:
          data.normalization_time_ms || 0,
      },
      document: this.normalizeDocumentResult(data, documentType, language),
      language: data.detected_language || data.language || language,
      total_processing_time_ms:
        data.total_processing_time_ms ||
        toSecondsAsMilliseconds(data.total_pipeline_time),
    };
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
