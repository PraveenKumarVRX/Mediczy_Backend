/** Remove repeated honorifics in historical notifications without changing stored names. */
export const notificationText = (text: string) =>
  text.replace(/\bDr\.?\s+(?:Dr\.?\s+)+/gi, 'Dr. ');
