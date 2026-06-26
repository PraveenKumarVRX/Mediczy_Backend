#!/usr/bin/env node
/**
 * Isolated harness that mounts the REAL voice-assistant router with a stub auth
 * (req.skipAuth + injected doctor) so the actual route handlers — STT fallback
 * chain, agent deterministic routing, LLM fastDeadline plumbing — can be smoke
 * tested against the real DB + real llm-provider without the unrelated global
 * ring-fencing / doctor-schema auth plumbing.
 */
import 'dotenv/config';
import express from 'express';
import voiceRouter from '../../routes/voice-assistant.route.js';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.skipAuth = true; // authUser short-circuits to next()
  req.user = { id: 1, role: 'doctor', firstName: 'Arjun', email: 'doctor@mediczy.com' };
  req.userRole = 'doctor';
  next();
});
app.use('/api/voice-assistant', voiceRouter);

const PORT = Number(process.env.HARNESS_PORT || 8099);
app.listen(PORT, () => console.log(`voice-harness listening on ${PORT}`));
