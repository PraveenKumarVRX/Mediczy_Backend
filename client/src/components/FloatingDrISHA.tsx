import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrISHAChat } from "@/components/DrISHAChat";
import { cn } from "@/lib/utils";

/**
 * Floating AI Doctor button that appears on all pages.
 * Opens a slide-up chat panel with Dr. iSHA.
 */
export function FloatingDrISHA() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!hasInteracted) setHasInteracted(true);
  }, [hasInteracted]);

  return (
    <>
      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.92 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className={cn(
              "fixed z-[60] shadow-2xl rounded-2xl overflow-hidden",
              "border border-slate-200 dark:border-slate-700",
              "bg-white dark:bg-slate-900",
              // Mobile: full width, bottom sheet style
              "bottom-20 left-3 right-3 max-h-[70vh]",
              // Desktop: positioned at bottom right
              "md:bottom-24 md:left-auto md:right-6 md:w-[420px] md:max-h-[600px]"
            )}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Dr. iSHA</h3>
                  <p className="text-[10px] text-teal-100">AI Health Assistant</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] bg-white/15 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Online
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                className="text-white hover:bg-white/20 h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Chat Body */}
            <DrISHAChat
              className="border-0 shadow-none"
              maxHeight="calc(70vh - 56px)"
              placeholder="Ask me anything about your health..."
              welcomeMessage="👋 Hi! I'm Dr. iSHA, your AI health assistant. I can help with symptoms, medications, diet tips, and more. How can I help?"
              showVoiceInput={true}
              showWelcomeCard={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button */}
      <motion.button
        onClick={toggle}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "fixed z-[61] flex items-center justify-center",
          "w-14 h-14 rounded-full shadow-xl",
          "transition-colors duration-300",
          "bottom-20 right-4 md:bottom-6 md:right-6",
          isOpen
            ? "bg-slate-700 hover:bg-slate-600 shadow-slate-700/30"
            : "bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 shadow-teal-500/40"
        )}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="bot"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
            >
              <Bot className="w-6 h-6 text-white" />
              {/* Sparkle indicator for first-time users */}
              {!hasInteracted && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  className="absolute -top-1 -right-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse ring for attention */}
        {!hasInteracted && !isOpen && (
          <span className="absolute inset-0 rounded-full border-2 border-teal-400 animate-ping opacity-30" />
        )}
      </motion.button>
    </>
  );
}

export default FloatingDrISHA;
