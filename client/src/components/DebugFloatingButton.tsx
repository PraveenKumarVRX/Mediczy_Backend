import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Bug, X } from 'lucide-react';
import { useDebug } from '@/contexts/DebugContext';

const DebugFloatingButton = () => {
  const navigate = useNavigate();
  const { isDebugMode } = useDebug();
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('mediczy_debug_button_dismissed') === 'true';
  });

  // Only show in development or if debug mode is enabled
  const shouldShow = (import.meta.env.MODE === 'development' || isDebugMode) && !isDismissed;

  if (!shouldShow) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('mediczy_debug_button_dismissed', 'true');
  };

  const handleClick = () => {
    navigate('/debug');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      <Button
        onClick={handleClick}
        className="rounded-full w-14 h-14 shadow-lg bg-purple-600 hover:bg-purple-700 relative group"
        title="Open Debug Dashboard"
      >
        <Bug className="w-6 h-6" />
        {isDebugMode && (
          <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse"></span>
        )}
        <span className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Debug Dashboard
        </span>
      </Button>
      <Button
        onClick={handleDismiss}
        variant="ghost"
        size="sm"
        className="rounded-full w-8 h-8 p-0"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default DebugFloatingButton;
