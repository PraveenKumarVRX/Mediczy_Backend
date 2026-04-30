import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Conversation, Message } from "../models/chat.model.intelligent.js";
import { sendMessageNotification, sendVideoCallNotification } from "../utils/firebase-admin.js";
import { FCMToken } from "../services/notification.service.js";

// Track online users and their FCM tokens
const onlineUsers = new Map();
const userFCMTokens = new Map(); // userId -> fcmToken (in-memory cache, backed by DB)

let io; // Store io instance for external use

export function setupSocketIO(server) {
  io = new Server(server, {
    path: '/socket.io', // Ensure Socket.io is on standard path
    transports: ['websocket', 'polling'], // Support both WebSocket and polling fallback
    cors: {
      origin: "*", // Allow all origins for testing
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Increase ping timeout for production reliability
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Setup Redis adapter for PM2 cluster mode
  // This ensures Socket.IO events are propagated across all worker processes
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('✅ Socket.IO Redis adapter connected — cluster-safe event propagation enabled');
      })
      .catch((err) => {
        console.warn('⚠️ Socket.IO Redis adapter failed — falling back to in-memory (events will NOT propagate across cluster workers):', err.message);
      });
  } catch (err) {
    console.warn('⚠️ Socket.IO Redis adapter init error:', err.message);
  }

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Handle user connection
    socket.on("user-connect", (userData) => {
      const { userType, fcmToken } = userData;
      // CRITICAL: Normalize userId to String to prevent Map key type mismatches
      // (client may send number from PostgreSQL .id or string from MongoDB ._id)
      const userId = userData.userId != null ? String(userData.userId) : null;

      if (userId) {
        // Store user connection
        onlineUsers.set(userId, {
          socketId: socket.id,
          userType,
          isOnline: true,
        });

        // Store FCM token if provided — persist to DB + cache in memory
        if (fcmToken) {
          userFCMTokens.set(userId, fcmToken);
          // Persist to fcm_tokens table asynchronously (don't block connection)
          FCMToken.upsert({
            userId: parseInt(userId, 10),
            userType: userType === 'doctor' ? 'doctor' : 'patient',
            token: fcmToken,
            deviceType: 'web',
            isActive: true,
          }).catch(err => console.error(`Failed to persist FCM token for user ${userId}:`, err.message));
        }

        // Join user-specific room for targeted notifications
        if (userType === 'doctor') {
          socket.join(`doctor-${userId}`);
          console.log(`👨‍⚕️ Doctor ${userId} joined notification room`);
        } else if (userType === 'nurse') {
          socket.join(`nurse-${userId}`);
          console.log(`👩‍⚕️ Nurse ${userId} joined notification room`);
        } else {
          socket.join(`user-${userId}`);
          console.log(`👤 User ${userId} joined notification room`);
        }

        // Broadcast user online status
        io.emit("user-status-change", {
          userId,
          isOnline: true,
        });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      // Find and remove the disconnected user
      for (const [key, value] of onlineUsers.entries()) {
        if (value.socketId === socket.id) {
          onlineUsers.delete(key);

          // Broadcast user offline status
          io.emit("user-status-change", {
            userId: key,
            isOnline: false,
          });
          break;
        }
      }
    });

    // Handle sending messages
    socket.on("send-message", async (messageData) => {
      try {
        const { senderId, receiverId, text, senderType } = messageData;

        // Determine the other party's type
        const receiverType = senderType === "user" ? "doctor" : "user";

        // Find or create conversation
        let conversation;
        if (senderType === "user") {
          conversation = await Conversation.findOrCreateConversation(
            senderId,
            receiverId
          );
        } else {
          conversation = await Conversation.findOrCreateConversation(
            receiverId,
            senderId
          );
        }

        // Add message to conversation
        await conversation.addMessage({
          senderId,
          receiverId,
          text,
          senderType,
        });

        // Get the updated conversation with the new message
        const updatedConversation = await Conversation.findById(
          conversation._id
        );
        const newMessage =
          updatedConversation.messages[updatedConversation.messages.length - 1];

        // Emit the message to both sender and receiver
        io.emit("new-message", {
          conversationId: conversation._id,
          message: newMessage,
        });

        // Notify receiver about new message if online
        const receiverSocket = onlineUsers.get(receiverId);
        if (receiverSocket) {
          io.to(receiverSocket.socketId).emit("message-notification", {
            conversationId: conversation._id,
            message: newMessage,
          });
        }

        // Send FCM notification if receiver is not online or has FCM token
        const receiverFCMToken = userFCMTokens.get(receiverId);
        if (receiverFCMToken && (!receiverSocket || !receiverSocket.isOnline)) {
          try {
            // Get sender info for notification
            const senderName = senderType === 'user' ? 'Patient' : 'Doctor';
            
            await sendMessageNotification(receiverFCMToken, {
              conversationId: conversation._id.toString(),
              senderId: senderId,
              senderName: senderName,
              messageId: newMessage._id.toString(),
              message: text
            });
            
            console.log(`FCM notification sent to ${receiverId}`);
          } catch (fcmError) {
            console.error('Error sending FCM notification:', fcmError);
          }
        }
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle getting chat history
    socket.on("get-chat-history", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);

        if (conversation) {
          socket.emit("chat-history", {
            conversationId,
            messages: conversation.messages,
          });
        } else {
          socket.emit("chat-history", {
            conversationId,
            messages: [],
          });
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
        socket.emit("error", { message: "Failed to fetch chat history" });
      }
    });

    // Handle marking messages as read
    socket.on("mark-messages-read", async ({ conversationId, userId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);

        if (conversation) {
          await conversation.markAsRead(userId);

          // Find the other participant
          const otherParticipant = conversation.participants.find(
            (p) => p.id.toString() !== userId.toString()
          );

          // Notify the other participant if they're online
          if (otherParticipant) {
            const otherUserSocket = onlineUsers.get(
              otherParticipant.id.toString()
            );
            if (otherUserSocket) {
              io.to(otherUserSocket.socketId).emit("messages-read", {
                conversationId,
                userId,
              });
            }
          }

          socket.emit("messages-marked-read", { conversationId });
        }
      } catch (error) {
        console.error("Error marking messages as read:", error);
        socket.emit("error", { message: "Failed to mark messages as read" });
      }
    });

    // Handle getting user conversations
    socket.on("get-conversations", async ({ userId }) => {
      try {
        const userConversations = await Conversation.find({
          "participants.id": userId,
        });

        // Sort by last message timestamp
        userConversations.sort((a, b) => {
          const aTime = a.lastMessage?.timestamp || a.createdAt;
          const bTime = b.lastMessage?.timestamp || b.createdAt;
          return new Date(bTime).getTime() - new Date(aTime).getTime();
        });

        socket.emit("user-conversations", { conversations: userConversations });
      } catch (error) {
        console.error("Error fetching conversations:", error);
        socket.emit("error", { message: "Failed to fetch conversations" });
      }
    });

    // Handle video call invitation
    socket.on("video-call-invitation", async (callData) => {
      try {
        const { channelName, callerId, callerName } = callData;
        // Normalize recipientId to String to match onlineUsers Map keys
        const recipientId = callData.recipientId != null ? String(callData.recipientId) : null;

        // Emit to recipient if online
        const recipientSocket = recipientId ? onlineUsers.get(recipientId) : null;
        if (recipientSocket) {
          io.to(recipientSocket.socketId).emit("video-call-invitation", {
            channelName,
            callerId,
            callerName,
            recipientId
          });
        }

        // Also emit to Socket.IO room as fallback (room names are always strings)
        if (recipientId) {
          io.to(`user-${recipientId}`).emit("video-call-invitation", {
            channelName,
            callerId,
            callerName,
            recipientId
          });
        }

        // Send FCM notification for video call
        const recipientFCMToken = recipientId ? userFCMTokens.get(recipientId) : null;
        if (recipientFCMToken) {
          try {
            await sendVideoCallNotification(recipientFCMToken, {
              callId: channelName,
              callerId: callerId,
              callerName: callerName,
              channelName: channelName
            });
            
            console.log(`Video call FCM notification sent to ${recipientId}`);
          } catch (fcmError) {
            console.error('Error sending video call FCM notification:', fcmError);
          }
        }
      } catch (error) {
        console.error("Error handling video call invitation:", error);
        socket.emit("error", { message: "Failed to send video call invitation" });
      }
    });

    // Handle FCM token update — persist to DB + cache in memory
    socket.on("update-fcm-token", ({ userId, fcmToken, userType, deviceType }) => {
      if (userId && fcmToken) {
        userFCMTokens.set(userId, fcmToken);
        // Persist to fcm_tokens table
        const resolvedUserType = userType || (onlineUsers.get(userId)?.userType === 'doctor' ? 'doctor' : 'patient');
        FCMToken.upsert({
          userId: parseInt(userId, 10),
          userType: resolvedUserType,
          token: fcmToken,
          deviceType: deviceType || 'web',
          isActive: true,
        }).catch(err => console.error(`Failed to persist FCM token for user ${userId}:`, err.message));
        console.log(`FCM token updated for user ${userId}`);
      }
    });

    // =========================
    // WebRTC Signaling (Generic)
    // =========================
    // Note: LiveKit handles its own signaling via WebSocket.
    // These handlers are kept for backwards compatibility with any
    // custom WebRTC implementations.
    
    // Handle video call join channel
    socket.on("video-join", (data) => {
      const { channel, uid } = data;
      console.log(`Video: User ${uid} joining channel ${channel}`);
      
      // Join the socket room for the channel
      socket.join(channel);
      
      // Notify others in the channel about new user
      socket.to(channel).emit("video-user-joined", { channel, userId: uid });
    });

    // Handle WebRTC offer
    socket.on("video-offer", (data) => {
      const { channel, sdp, type, uid } = data;
      console.log(`Video: Received offer from ${uid} in channel ${channel}`);
      
      // Forward offer to other peers in the channel
      socket.to(channel).emit("video-offer", { channel, sdp, type, uid });
    });

    // Handle WebRTC answer
    socket.on("video-answer", (data) => {
      const { channel, sdp, type, uid } = data;
      console.log(`Video: Received answer from ${uid} in channel ${channel}`);
      
      // Forward answer to other peers in the channel
      socket.to(channel).emit("video-answer", { channel, sdp, type, uid });
    });

    // Handle ICE candidates
    socket.on("video-ice", (data) => {
      const { channel, candidate } = data;
      console.log(`Video: ICE candidate received for channel ${channel}`);
      
      // Forward ICE candidate to other peers in the channel
      socket.to(channel).emit("video-ice", { channel, candidate });
    });

    // Handle leave channel
    socket.on("video-leave", (data) => {
      const { channel } = data;
      console.log(`Video: User leaving channel ${channel}`);
      socket.leave(channel);
      socket.to(channel).emit("video-user-left", { channel, userId: socket.id });
    });

    // ── Team Call Signaling ──────────────────────────────────────────────────
    // Doctor starts a team call — notify only the explicitly selected participants
    socket.on("team_call_start", async (data) => {
      try {
        const { doctorId, doctorName, roomName, callType, participants } = data;
        if (!doctorId || !roomName || !Array.isArray(participants) || participants.length === 0) return;

        const payload = { doctorId, doctorName, roomName, callType };
        for (const p of participants) {
          const { id, memberType } = p;
          if (memberType === 'nurse') {
            io.to(`nurse-${id}`).emit('incoming_team_call', payload);
          } else if (memberType === 'assistant') {
            io.to(`assistant-${id}`).emit('incoming_team_call', payload);
          } else if (memberType === 'doctor') {
            io.to(`doctor-${id}`).emit('incoming_team_call', payload);
          }
          // 'team' (platform staff) rooms can be added when they have a socket login
        }
        console.log(`📞 Team call started by doctor ${doctorId} — notified ${participants.length} selected members`);
      } catch (err) {
        console.error('team_call_start error:', err.message);
      }
    });

    // Doctor ends the team call — notify everyone to dismiss their call UI
    socket.on("team_call_end", (data) => {
      const { doctorId } = data || {};
      if (!doctorId) return;
      // Broadcast to all nurse rooms — client filters by doctorId
      io.emit('team_call_ended', { doctorId });
      console.log(`📵 Team call ended by doctor ${doctorId}`);
    });

    // Member declines incoming call — notify the caller (doctor)
    socket.on("team_call_decline", (data) => {
      const { doctorId, memberName, memberId, memberType } = data || {};
      if (!doctorId) return;
      io.to(`doctor-${doctorId}`).emit('team_call_status', {
        status: 'declined',
        memberName: memberName || 'Team member',
        memberId,
        memberType,
      });
      console.log(`📵 ${memberName} declined call from doctor ${doctorId}`);
    });

    // Member is already in another call — notify caller
    socket.on("team_call_busy", (data) => {
      const { doctorId, memberName } = data || {};
      if (!doctorId) return;
      io.to(`doctor-${doctorId}`).emit('team_call_status', {
        status: 'busy',
        memberName: memberName || 'Team member',
      });
    });
  });

  return io;
}


// Export function to get Socket.IO instance
export function getIO() {
  return io;
}

// Export function to get online users
export function getOnlineUsers() {
  return onlineUsers;
}

// Export function to get user FCM token
export function getUserFCMToken(userId) {
  return userFCMTokens.get(userId);
}

// Export function to emit triage call request (Hybrid: Socket.IO + FCM)
export async function emitTriageCallRequest(doctorId, callData) {
  let socketSent = false;
  let fcmSent = false;

  // Try Socket.IO first (instant for active connections)
  if (io) {
    // Send to doctor's room (works even if doctor reconnects)
    io.to(`doctor-${doctorId}`).emit("triage-call-request", callData);
    console.log(`✅ Socket.IO notification sent to doctor-${doctorId} room`);
    
    // Also send directly to socket if available
    const doctorSocket = onlineUsers.get(doctorId);
    if (doctorSocket) {
      io.to(doctorSocket.socketId).emit("triage-call-request", callData);
      console.log(`✅ Socket.IO notification also sent to doctor socket ${doctorSocket.socketId}`);
    }
    socketSent = true;
  }

  // Send FCM as backup (for mobile apps or background)
  const fcmToken = userFCMTokens.get(doctorId);
  if (fcmToken) {
    try {
      const { sendTriageCallNotification } = await import('../utils/firebase-admin.js');
      await sendTriageCallNotification(fcmToken, callData);
      console.log(`✅ FCM push notification sent to doctor ${doctorId}`);
      fcmSent = true;
    } catch (error) {
      console.error('FCM notification failed:', error.message);
    }
  }

  return { socketSent, fcmSent, method: socketSent ? 'socket.io' : (fcmSent ? 'fcm' : 'none') };
}

// Emit call accepted notification (Hybrid)
export async function emitCallAccepted(patientId, acceptData) {
  let socketSent = false;
  let fcmSent = false;

  // Socket.IO (instant) - send to room and direct socket
  if (io) {
    // Send to user's room
    io.to(`user-${patientId}`).emit("triage-call-accepted", acceptData);
    console.log(`✅ Socket.IO call accepted sent to user-${patientId} room`);
    
    // Also send directly to socket if available
    const patientSocket = onlineUsers.get(patientId);
    if (patientSocket) {
      io.to(patientSocket.socketId).emit("triage-call-accepted", acceptData);
    }
    socketSent = true;
  }

  // FCM (mobile backup)
  const fcmToken = userFCMTokens.get(patientId);
  if (fcmToken) {
    try {
      const { sendCallAcceptedNotification } = await import('../utils/firebase-admin.js');
      await sendCallAcceptedNotification(fcmToken, acceptData);
      console.log(`✅ FCM call accepted sent to patient ${patientId}`);
      fcmSent = true;
    } catch (error) {
      console.error('FCM notification failed:', error.message);
    }
  }

  return { socketSent, fcmSent };
}

// Emit call rejected notification (Hybrid)
export async function emitCallRejected(patientId, rejectData) {
  let socketSent = false;
  let fcmSent = false;

  // Socket.IO (instant) - send to room and direct socket
  if (io) {
    // Send to user's room
    io.to(`user-${patientId}`).emit("triage-call-rejected", rejectData);
    console.log(`✅ Socket.IO call rejected sent to user-${patientId} room`);
    
    // Also send directly to socket if available
    const patientSocket = onlineUsers.get(patientId);
    if (patientSocket) {
      io.to(patientSocket.socketId).emit("triage-call-rejected", rejectData);
    }    socketSent = true;
  }

  // FCM (mobile backup)
  const fcmToken = userFCMTokens.get(patientId);
  if (fcmToken) {
    try {
      const { sendCallRejectedNotification } = await import('../utils/firebase-admin.js');
      await sendCallRejectedNotification(fcmToken, rejectData);
      console.log(`✅ FCM call rejected sent to patient ${patientId}`);
      fcmSent = true;
    } catch (error) {
      console.error('FCM notification failed:', error.message);
    }
  }

  return { socketSent, fcmSent };
}

