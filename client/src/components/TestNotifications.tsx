// Test file to verify notification system without Firebase
// This demonstrates that the notification system works independently

import { useNotifications } from '@/hooks/useNotifications';

function TestNotifications() {
  const {
    notifications,
    unreadCount,
    notifyVideoCall,
    notifyMessage,
    notifySystemAlert
  } = useNotifications({
    userId: 'test-user-123',
    userType: 'user',
    enablePushNotifications: false // Disable Firebase for testing
  });

  const testBasicNotification = () => {
    notifySystemAlert('Test Notification', 'This is a test notification without Firebase', 'info');
  };

  const testVideoCallNotification = () => {
    notifyVideoCall(
      'Dr. Smith',
      'test-channel-123',
      () => console.log('Answer clicked'),
      () => console.log('Decline clicked')
    );
  };

  const testMessageNotification = () => {
    notifyMessage(
      'Dr. Smith',
      'Hello, how can I help you today?',
      'conv-123'
    );
  };

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Notification System Test</h2>
      <p className="text-sm text-muted-foreground">
        Testing notification system without Firebase push notifications
      </p>

      <div className="flex gap-2">
        <button 
          onClick={testBasicNotification}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test System Alert
        </button>

        <button 
          onClick={testVideoCallNotification}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Test Video Call
        </button>

        <button 
          onClick={testMessageNotification}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Test Message
        </button>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold">Unread Notifications: {unreadCount}</h3>
        <div className="space-y-2 mt-4">
          {notifications.map((notification) => (
            <div 
              key={notification.id}
              className={`p-4 rounded border ${
                notification.read ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="font-semibold">{notification.title}</div>
              <div className="text-sm text-gray-600">{notification.message}</div>
              <div className="text-xs text-gray-400 mt-1">
                {notification.type} - {notification.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TestNotifications;