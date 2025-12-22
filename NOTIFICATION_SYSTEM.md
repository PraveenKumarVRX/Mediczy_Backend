# Notification System Documentation

## Overview
The Mediczy platform now includes a comprehensive notification system that enhances the video calling and messaging experience with real-time browser notifications and in-app notification management.

## Components

### 1. useNotifications Hook (`/client/src/hooks/useNotifications.ts`)
A React hook that provides notification management functionality:

**Features:**
- Browser notification permissions management
- Video call notifications
- Message notifications  
- System alerts (success, error, info)
- Notification history tracking
- Real-time notification updates

**API:**
```typescript
const {
  notifications,        // Array of all notifications
  unreadCount,         // Number of unread notifications
  notifyVideoCall,     // Function to send video call notifications
  notifyMessage,       // Function to send message notifications  
  notifySystemAlert,   // Function to send system alerts
  markAsRead,          // Mark notification as read
  markAllAsRead,       // Mark all notifications as read
  clearNotification,   // Remove specific notification
  requestPermission    // Request browser notification permissions
} = useNotifications({ userId, userType });
```

### 2. NotificationCenter Component (`/client/src/components/NotificationCenter.tsx`)
A UI component that displays notifications in a dropdown interface:

**Features:**
- Bell icon with unread count badge
- Dropdown list of recent notifications
- Mark as read/unread actions
- Clear individual notifications
- Mark all as read functionality
- Responsive design with smooth animations

### 3. Video Chat Integration (`/client/src/pages/chat/VideoChatdoctor.tsx`)
Enhanced video chat interface with integrated notifications:

**Enhanced Features:**
- Video call start/end notifications
- User join/leave notifications during calls
- Message notifications with context
- Browser notification permissions auto-request
- Real-time notification display in header

## Notification Types

### 1. Video Call Notifications
```typescript
notifyVideoCall(title, message, metadata)
```
- **Use case**: Video call started, ended, user joined/left
- **Metadata**: Call ID, type (incoming/outgoing), participant info
- **Browser notification**: Yes (with permission)

### 2. Message Notifications
```typescript
notifyMessage(title, message, metadata)
```
- **Use case**: New chat messages received
- **Metadata**: Conversation ID, sender ID, message ID
- **Browser notification**: Yes (with permission)

### 3. System Alerts
```typescript
notifySystemAlert(title, message, type)
```
- **Types**: success, error, info, warning, destructive
- **Use case**: System status, errors, confirmations
- **Browser notification**: Optional

## Implementation Details

### Browser Notification Support
- Automatic permission request on component mount
- Graceful fallback for denied permissions
- Notification persistence in browser
- Click-to-focus functionality

### State Management
- React useState for local notification state
- Real-time updates via useEffect
- Automatic cleanup on unmount
- Memory-efficient notification history

### Styling
- Tailwind CSS for responsive design
- shadcn/ui components for consistency
- Smooth animations and transitions
- Accessibility-compliant design

## Usage Examples

### Basic Setup
```tsx
import { useNotifications } from '@/hooks/useNotifications';
import NotificationCenter from '@/components/NotificationCenter';

function MyComponent() {
  const { notifySystemAlert } = useNotifications({
    userId: currentUser.id,
    userType: 'user'
  });

  return (
    <div>
      <NotificationCenter />
      <button onClick={() => notifySystemAlert('Success', 'Action completed', 'success')}>
        Test Notification
      </button>
    </div>
  );
}
```

### Video Call Integration
```tsx
const { notifyVideoCall } = useNotifications({ userId, userType });

// When starting a video call
await joinChannel(channelName, uid);
notifyVideoCall('Video call started', `Connecting to ${recipientName}`, {
  callId: channelName,
  type: 'outgoing',
  recipientId: recipient.id
});
```

## Configuration

### Environment Variables
No additional environment variables required for basic functionality.

### Agora Integration
Notifications work seamlessly with Agora video calling:
- Automatic notifications on user join/leave
- Call start/end notifications
- Error handling with user feedback

## Browser Compatibility
- Modern browsers with Notification API support
- Graceful degradation for unsupported browsers
- Progressive enhancement approach

## Performance Considerations
- Lightweight implementation with minimal re-renders
- Efficient notification cleanup
- Memory management for notification history
- Optimized re-render cycles

## Future Enhancements
1. **Push Notifications**: Server-side push notification support
2. **Email/SMS Integration**: Multi-channel notification delivery
3. **Notification Templates**: Predefined notification formats
4. **Analytics**: Notification engagement tracking
5. **Customization**: User preference settings
6. **Sound Alerts**: Audio notification support

## Testing
Test the notification system by:
1. Starting a video call to see call notifications
2. Sending messages to see message notifications
3. Clicking the notification bell to view history
4. Checking browser notifications (if permission granted)

## Troubleshooting

### Common Issues:
1. **Browser notifications not showing**: Check permission status
2. **Notifications not updating**: Verify userId/userType props
3. **Styling issues**: Check Tailwind CSS imports
4. **TypeScript errors**: Verify notification type definitions

The notification system enhances user experience by providing real-time feedback and maintaining communication context across the healthcare platform.