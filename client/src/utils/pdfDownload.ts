import type { AxiosInstance } from "axios";

const textFromBlob = async (blob: Blob) => {
  const text = await blob.text().catch(() => "");
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text;
  } catch {
    return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
};

const assertPdfBlob = async (blob: Blob, contentType = "") => {
  const headerType = contentType.toLowerCase();
  const blobType = (blob.type || "").toLowerCase();
  const head = await blob.slice(0, 4).text().catch(() => "");

  if (head === "%PDF") return;

  const responseText = await textFromBlob(blob);
  const type = headerType || blobType || "non-PDF response";
  const detail = responseText ? ` ${responseText.slice(0, 180)}` : "";
  throw new Error(`Server returned ${type} instead of a valid PDF.${detail}`);
};

export const fetchPrescriptionPdf = async (
  api: AxiosInstance,
  prescriptionId: number | string
) => {
  const response = await api.get(`/prescriptions/${prescriptionId}/pdf`, {
    responseType: "blob",
    headers: { Accept: "application/pdf" },
    validateStatus: () => true,
  });

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data]);
  const contentType = String(response.headers?.["content-type"] || blob.type || "");

  if (response.status < 200 || response.status >= 300) {
    const message = await textFromBlob(blob);
    throw new Error(message || `PDF download failed with HTTP ${response.status}`);
  }

  await assertPdfBlob(blob, contentType);
  return new Blob([blob], { type: "application/pdf" });
};

export const downloadPrescriptionPdf = async (
  api: AxiosInstance,
  prescriptionId: number | string,
  filename: string
) => {
  const blob = await fetchPrescriptionPdf(api, prescriptionId);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};

export const openPrescriptionPdf = async (
  api: AxiosInstance,
  prescriptionId: number | string
) => {
  const blob = await fetchPrescriptionPdf(api, prescriptionId);
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
};
