import { Server } from "socket.io";
import { Conversation, Message } from "../models/chat.model.intelligent.js";
import { sendMessageNotification, sendVideoCallNotification } from "../utils/firebase-admin.js";

// Track online users and their FCM tokens
const onlineUsers = new Map();
const userFCMTokens = new Map(); // userId -> fcmToken

export function setupSocketIO(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // Allow all origins for testing
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Handle user connection
    socket.on("user-connect", (userData) => {
      const { userId, userType, fcmToken } = userData;

      if (userId) {
        // Store user connection
        onlineUsers.set(userId, {
          socketId: socket.id,
          userType,
          isOnline: true,
        });

        // Store FCM token if provided
        if (fcmToken) {
          userFCMTokens.set(userId, fcmToken);
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
        const { channelName, callerId, callerName, recipientId } = callData;

        // Emit to recipient if online
        const recipientSocket = onlineUsers.get(recipientId);
        if (recipientSocket) {
          io.to(recipientSocket.socketId).emit("video-call-invitation", {
            channelName,
            callerId,
            callerName,
            recipientId
          });
        }

        // Send FCM notification for video call
        const recipientFCMToken = userFCMTokens.get(recipientId);
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

    // Handle FCM token update
    socket.on("update-fcm-token", ({ userId, fcmToken }) => {
      if (userId && fcmToken) {
        userFCMTokens.set(userId, fcmToken);
        console.log(`FCM token updated for user ${userId}`);
      }
    });

    // =========================
    // MiroTalk WebRTC Signaling
    // =========================
    
    // Handle MiroTalk join channel
    socket.on("mirotalk-join", (data) => {
      const { channel, uid } = data;
      console.log(`MiroTalk: User ${uid} joining channel ${channel}`);
      
      // Join the socket room for the channel
      socket.join(channel);
      
      // Notify others in the channel about new user
      socket.to(channel).emit("mirotalk-user-joined", { channel, userId: uid });
    });

    // Handle MiroTalk WebRTC offer
    socket.on("mirotalk-offer", (data) => {
      const { channel, sdp, type, uid } = data;
      console.log(`MiroTalk: Received offer from ${uid} in channel ${channel}`);
      
      // Forward offer to other peers in the channel with correct event name
      socket.to(channel).emit("mirotalk-offer", { channel, sdp, type, uid });
      
      console.log(`MiroTalk: Forwarded offer to channel ${channel}`);
    });

    // Handle MiroTalk WebRTC answer
    socket.on("mirotalk-answer", (data) => {
      const { channel, sdp, type, uid } = data;
      console.log(`MiroTalk: Received answer from ${uid} in channel ${channel}`);
      
      // Forward answer to other peers in the channel with correct event name
      socket.to(channel).emit("mirotalk-answer", { channel, sdp, type, uid });
      
      console.log(`MiroTalk: Forwarded answer to channel ${channel}`);
    });

    // Handle MiroTalk ICE candidates
    socket.on("mirotalk-ice", (data) => {
      const { channel, candidate } = data;
      console.log(`MiroTalk: ICE candidate received for channel ${channel}`);
      
      // Forward ICE candidate to other peers in the channel
      socket.to(channel).emit("mirotalk-ice", { channel, candidate });
    });

    // Handle MiroTalk leave channel
    socket.on("mirotalk-leave", (data) => {
      const { channel } = data;
      console.log(`MiroTalk: User leaving channel ${channel}`);
      
      // Leave the socket room
      socket.leave(channel);
      
      // Notify others in the channel about user leaving
      socket.to(channel).emit("mirotalk-user-left", { channel, userId: socket.id });
    });
  });

  return io;
}
