import React, { createContext, useContext, useEffect, useState } from 'react';

interface ChatContextType {
  isAuthenticated: boolean;
  userInfo: any;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  incrementUnread: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChatContext = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
};

interface ChatProviderProps {
  children: React.ReactNode;
}

export const ChatProvider: React.FC<ChatProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Check authentication status
    const adminToken = localStorage.getItem('adminToken');
    const userToken = localStorage.getItem('userToken');
    const adminData = localStorage.getItem('adminData');
    const userData = localStorage.getItem('userData');

    if (adminToken && adminData) {
      setIsAuthenticated(true);
      setUserInfo(JSON.parse(adminData));
    } else if (userToken && userData) {
      setIsAuthenticated(true);
      setUserInfo(JSON.parse(userData));
    } else {
      setIsAuthenticated(false);
      setUserInfo(null);
    }
  }, []);

  const incrementUnread = () => {
    setUnreadCount(prev => prev + 1);
  };

  const value: ChatContextType = {
    isAuthenticated,
    userInfo,
    unreadCount,
    setUnreadCount,
    incrementUnread
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};