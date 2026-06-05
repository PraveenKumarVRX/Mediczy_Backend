import api from '@/utils/api';

interface ReportActionInput {
  reportId?: string;
  fileName: string;
  fallbackUrl?: string;
}

const openBlobInNewTab = (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const previewReport = async ({ reportId, fallbackUrl }: ReportActionInput) => {
  if (reportId) {
    try {
      const res = await api.get(`/reports/download/${reportId}`, { responseType: 'blob' });
      openBlobInNewTab(res.data);
      return;
    } catch {
      // Fallback handled below.
    }
  }

  if (fallbackUrl) {
    window.open(fallbackUrl, '_blank');
    return;
  }

  throw new Error('Preview is not available for this report');
};

export const downloadReport = async ({ reportId, fileName, fallbackUrl }: ReportActionInput) => {
  if (reportId) {
    try {
      const res = await api.get(`/reports/download/${reportId}`, { responseType: 'blob' });
      triggerBlobDownload(res.data, fileName);
      return;
    } catch {
      // Fallback handled below.
    }
  }

  if (fallbackUrl) {
    const link = document.createElement('a');
    link.href = fallbackUrl;
    link.download = fileName;
    link.click();
    return;
  }

  throw new Error('Download is not available for this report');
};
