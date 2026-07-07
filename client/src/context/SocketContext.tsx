import React, { createContext, useContext, useEffect, useRef } from "react";
import io, { Socket } from "socket.io-client";
import { useAuth } from "@/auth/AuthProvider";
import { getSocketUrl } from "@/utils/socket";

declare global {
  interface Window { socket: Socket | null; }
}

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const socketRef = useRef<Socket | null>(null);
  const { currentUser, currentDoctor, userType } = useAuth();

  const currentId = userType === "user"
    ? (currentUser?._id || currentUser?.id)
    : (currentDoctor?._id || currentDoctor?.id);

  useEffect(() => {
    if (!currentId) return;

    // Connect to socket server
    socketRef.current = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      query: {
        userId: currentId,
        userType,
      },
    });

    socketRef.current.on("connect", () => {
      socketRef.current?.emit("user-connect", { userId: currentId, userType });
      // Expose globally so VideoCallNotification and legacy callers can access it
      window.socket = socketRef.current as any;
    });

    // Send immediately if already connected (race-condition safety)
    if (socketRef.current.connected) {
      socketRef.current.emit("user-connect", { userId: currentId, userType });
      window.socket = socketRef.current as any;
    }

    socketRef.current.on("disconnect", () => {
      window.socket = null;
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        window.socket = null;
      }
    };
  }, [currentId, userType]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current }}>
      {children}
    </SocketContext.Provider>
  );
}; 