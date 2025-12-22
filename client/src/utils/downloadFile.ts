export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const downloadArrayBuffer = (
  data: ArrayBuffer,
  filename: string,
  mimeType = 'application/octet-stream'
) => {
  downloadBlob(new Blob([data], { type: mimeType }), filename);
};

export const downloadText = (
  text: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8'
) => {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
};
