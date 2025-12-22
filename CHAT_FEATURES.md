# Chat Applet Features

## Overview
The Mediczy Chat Applet provides real-time communication between all team members including doctors, nurses, assistants, and admin users.

## Key Features

### 1. **Team Members Directory**
- View all team members with their online/offline status
- See member roles (doctor, nurse, assistant, admin)
- Real-time online status indicators (green = online, gray = offline)
- Last seen timestamps for offline members

### 2. **Direct Messaging**
- **Click any team member** to start a direct chat
- Works for both online and offline members
- Messages are stored and delivered when recipient comes online
- Supports persistent chat history

### 3. **File Attachments**
- **All file types supported** (documents, images, PDFs, videos, etc.)
- Maximum file size: 10MB per file
- Image files are displayed inline with preview
- Other files show as downloadable attachments
- Download button for all attached files

### 4. **Multi-Role Support**
All user roles can access the chat:
- ✅ **Admins** - Full access to all chats
- ✅ **Doctors** - Can chat with team members
- ✅ **Nurses** - Can chat with team members
- ✅ **Assistants** - Can chat with team members
- ✅ **Team Members** - Internal communication

## How to Use

### Starting a Chat
1. Click the **Chat** button (blue circle icon) in the bottom-right corner
2. Click the **Team** tab to view all team members
3. **Click on any team member** to start a direct conversation
4. The chat window will automatically switch to the chat tab

### Sending Messages
1. Type your message in the input field at the bottom
2. Press **Enter** or click the **Send** button
3. Messages appear instantly in the conversation

### Sending Files
1. Click the **Paperclip** icon (📎) next to the message input
2. Select any file from your computer
3. File will upload and appear in the chat
4. Recipients can download the file by clicking the **Download** button

### File Type Support
**Images**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`
- Displayed inline with preview
- Click to view full size in new tab

**Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- Shown as downloadable attachments with file name and size

**Archives**: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
- Downloadable with file info

**Other**: Any other file type up to 10MB
- All files are supported and downloadable

### Online/Offline Chat
- **Online members**: Green dot indicator, shows "Online"
- **Offline members**: Gray dot indicator, shows "Last seen Recently" or "Offline"
- Messages can be sent to both online and offline members
- Offline members will receive messages when they come online

## Technical Details

### Authentication
- All requests are authenticated using JWT tokens
- Supports multiple token types: `nurseToken`, `assistantToken`, `doctorToken`, `adminToken`, `userToken`
- Tokens stored in localStorage

### API Endpoints
- `GET /api/chat/team-members` - Fetch all team members
- `POST /api/chat/rooms/:roomId/join` - Join a chat room
- `POST /api/chat/rooms/:roomId/messages` - Send a message
- `POST /api/chat/upload` - Upload file attachment
- `GET /api/chat/files/:fileName` - Download file

### Real-time Updates
- Messages update in real-time when sent
- Team member list can be refreshed manually
- Online status tracking for all members

## Troubleshooting

### Team Members Not Showing
1. Click the **Refresh** button in the Team tab
2. Ensure you're logged in with valid credentials
3. Check browser console for errors

### File Upload Fails
1. Check file size (max 10MB)
2. Ensure you have a valid authentication token
3. Try a different file type

### Chat Not Loading
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache and localStorage
3. Log out and log in again with fresh credentials

## Security Features
- JWT-based authentication for all requests
- Role-based access control (RBAC)
- File size limits to prevent abuse
- Secure file storage and serving
- Authorization checks on all endpoints

## Future Enhancements
- Real-time socket.io integration for instant notifications
- Typing indicators
- Read receipts
- Message reactions (emoji)
- Group chat rooms
- Voice/video call integration
- Message search functionality
- File preview for more types
