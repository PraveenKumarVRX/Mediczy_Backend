/** Remove repeated honorifics in historical notifications without changing stored names. */
export const notificationText = (text: string) =>
  String(text || '').replace(/\bDr\.?\s+(?:Dr\.?\s+)+/gi, 'Dr. ')
    .replace(/(\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2})(?::\d{2})?(?: IST)?/g, (_, day, time) => {
      const date = new Date(`${day}T${time}:00+05:30`);
      return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    });
