// No prompts, transcripts, tokens, patient names or clinical context enter telemetry.
export async function recordChatTrace(trace) {
  try {
    const { recordChatTelemetry } = await import('./ai-brain/evaluation-engine.js');
    await recordChatTelemetry(trace);
  } catch { /* A telemetry outage cannot bypass safety or fail a completed response. */ }
}
