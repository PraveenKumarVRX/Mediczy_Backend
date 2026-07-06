/**
 * React hook for Dr. iSHA screen — mirrors web DoctorVoiceAssistant send flow.
 *
 * Usage in msh_d_app Isha screen:
 *   const { sendMessage, isProcessing, lastResult } = useDoctorIshaCopilot({
 *     currentScreen: 'dashboard',
 *     currentPatient,
 *     onNavigate: (routeName, params) => navigation.navigate(routeName, params),
 *     onSpeak: (text) => Tts.speak(text),
 *   });
 */

import { useCallback, useRef, useState } from 'react';
import { parseIshaAction, sendIshaMessage } from './ishaCopilot.service.js';

function toHistory(messages = []) {
  return messages
    .filter((m) => m?.text && m.role !== 'system')
    .slice(-10)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      text: String(m.text),
    }));
}

export function useDoctorIshaCopilot({
  currentScreen = 'dashboard',
  currentPatient = null,
  onNavigate,
  onSpeak,
  onError,
} = {}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const messagesRef = useRef([]);

  const setMessagesRef = useCallback((messages) => {
    messagesRef.current = messages || [];
  }, []);

  const executeParsedAction = useCallback(
    (parsed, { deferNavigation = false } = {}) => {
      if (!parsed?.navigation || parsed.navigation.type !== 'navigate') return;
      if (!onNavigate) return;

      const runNav = () => onNavigate(parsed.navigation.routeName, parsed.navigation.params || {});

      if (deferNavigation && parsed.speak && onSpeak) {
        onSpeak(parsed.speak, runNav);
      } else {
        if (parsed.speak && onSpeak) onSpeak(parsed.speak);
        runNav();
      }
    },
    [onNavigate, onSpeak]
  );

  const sendMessage = useCallback(
    async (text, { mode = 'auto' } = {}) => {
      const message = String(text || '').trim();
      if (!message) return null;

      setIsProcessing(true);
      try {
        const result = await sendIshaMessage({
          message,
          history: toHistory(messagesRef.current),
          context: {
            currentScreen,
            currentPatient: currentPatient
              ? {
                  id: currentPatient.id,
                  name: currentPatient.name || currentPatient.patientName,
                }
              : null,
          },
          mode,
        });

        const parsed = parseIshaAction(result);
        setLastResult(parsed);

        if (parsed.requiresConfirmation) {
          setPendingAction(parsed);
          if (parsed.speak && onSpeak) onSpeak(parsed.speak);
        } else if (parsed.action === 'navigate_to' || parsed.action === 'search_patient') {
          executeParsedAction(parsed, { deferNavigation: true });
        } else {
          if (parsed.speak && onSpeak) onSpeak(parsed.speak);
          executeParsedAction(parsed);
        }

        return parsed;
      } catch (err) {
        const msg = err?.message || 'Something went wrong';
        onError?.(msg, err);
        return { error: msg };
      } finally {
        setIsProcessing(false);
      }
    },
    [currentScreen, currentPatient, executeParsedAction, onError, onSpeak]
  );

  const confirmPendingAction = useCallback(() => {
    if (!pendingAction) return;
    executeParsedAction(pendingAction);
    setPendingAction(null);
  }, [pendingAction, executeParsedAction]);

  const cancelPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

  return {
    sendMessage,
    isProcessing,
    lastResult,
    pendingAction,
    confirmPendingAction,
    cancelPendingAction,
    setMessagesRef,
  };
}

export default useDoctorIshaCopilot;
