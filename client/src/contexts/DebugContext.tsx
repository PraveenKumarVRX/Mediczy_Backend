import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface ConsoleLog {
  id: string;
  timestamp: Date;
  type: 'log' | 'error' | 'warn' | 'info' | 'debug';
  message: string;
  data?: any;
}

interface NetworkRequest {
  id: string;
  timestamp: Date;
  method: string;
  url: string;
  status?: number;
  duration?: number;
  error?: string;
}

interface DebugContextType {
  logs: ConsoleLog[];
  networkRequests: NetworkRequest[];
  isDebugMode: boolean;
  toggleDebugMode: () => void;
  clearLogs: () => void;
  clearNetworkRequests: () => void;
  addLog: (type: ConsoleLog['type'], message: string, data?: any) => void;
  addNetworkRequest: (request: NetworkRequest) => void;
}

const DebugContext = createContext<DebugContextType | undefined>(undefined);

export const DebugProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([]);
  const [isDebugMode, setIsDebugMode] = useState<boolean>(() => {
    const debugMode = localStorage.getItem('mediczy_debug_mode') === 'true';
    const isAdmin = localStorage.getItem('userType') === 'admin' && localStorage.getItem('adminToken');
    // Only allow debug mode if user is admin
    return debugMode && !!isAdmin;
  });

  const addLog = useCallback((type: ConsoleLog['type'], message: string, data?: any) => {
    const log: ConsoleLog = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      type,
      message,
      data
    };
    setLogs(prev => [...prev.slice(-99), log]); // Keep last 100 logs
  }, []);

  const addNetworkRequest = useCallback((request: NetworkRequest) => {
    setNetworkRequests(prev => [...prev.slice(-49), request]); // Keep last 50 requests
  }, []);

  const toggleDebugMode = useCallback(() => {
    const isAdmin = localStorage.getItem('userType') === 'admin' && localStorage.getItem('adminToken');
    
    if (!isAdmin) {
      console.warn('Debug mode can only be enabled by administrators');
      return;
    }
    
    setIsDebugMode(prev => {
      const newValue = !prev;
      localStorage.setItem('mediczy_debug_mode', String(newValue));
      return newValue;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);
  const clearNetworkRequests = useCallback(() => setNetworkRequests([]), []);

  // Intercept console methods
  useEffect(() => {
    if (!isDebugMode) return;

    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    const createInterceptor = (type: ConsoleLog['type'], original: any) => {
      return (...args: any[]) => {
        original.apply(console, args);
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        addLog(type, message, args.length > 1 ? args : args[0]);
      };
    };

    console.log = createInterceptor('log', originalConsole.log);
    console.error = createInterceptor('error', originalConsole.error);
    console.warn = createInterceptor('warn', originalConsole.warn);
    console.info = createInterceptor('info', originalConsole.info);

    return () => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
      console.info = originalConsole.info;
      console.debug = originalConsole.debug;
    };
  }, [isDebugMode, addLog]);

  // Intercept fetch for network monitoring
  useEffect(() => {
    if (!isDebugMode) return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = Date.now();
      const request: NetworkRequest = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        method: typeof args[1] === 'object' && args[1]?.method ? args[1].method : 'GET',
        url: args[0].toString()
      };

      try {
        const response = await originalFetch(...args);
        request.status = response.status;
        request.duration = Date.now() - startTime;
        addNetworkRequest(request);
        return response;
      } catch (error) {
        request.error = error instanceof Error ? error.message : 'Unknown error';
        request.duration = Date.now() - startTime;
        addNetworkRequest(request);
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [isDebugMode, addNetworkRequest]);

  const value: DebugContextType = {
    logs,
    networkRequests,
    isDebugMode,
    toggleDebugMode,
    clearLogs,
    clearNetworkRequests,
    addLog,
    addNetworkRequest
  };

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
};

export const useDebug = () => {
  const context = useContext(DebugContext);
  if (context === undefined) {
    throw new Error('useDebug must be used within a DebugProvider');
  }
  return context;
};
