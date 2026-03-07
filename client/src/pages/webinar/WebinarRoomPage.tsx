import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  Phone, Settings, Users, MessageSquare, 
  Hand, MoreVertical, Volume2, VolumeX,
  Monitor, MonitorOff, Circle, Square, StopCircle
} from 'lucide-react';
import {
  LiveKitRoom,
  VideoConference,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useMediaDeviceSelect,
  TrackToggle,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, Room } from 'livekit-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import api from '@/lib/api';

interface WebinarRoomProps {
  isHost?: boolean;
}

const WebinarRoomPage: React.FC<WebinarRoomProps> = ({ isHost = false }) => {
  const { webinarId } = useParams<{ webinarId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [token, setToken] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [webinarInfo, setWebinarInfo] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    if (webinarId) {
      if (isHost) {
        startWebinar();
      } else {
        joinWebinar();
      }
    }
  }, [webinarId, isHost]);

  const startWebinar = async () => {
    try {
      const response = await api.post(`/doctor/webinars/${webinarId}/start`);
      setToken(response.data.livekit.token);
      setServerUrl(response.data.livekit.serverUrl);
      setWebinarInfo(response.data.webinar);
      setIsConnecting(false);
      setHasJoined(true);
      
      toast({
        title: 'Webinar Started',
        description: 'You are now live!'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to start webinar',
        variant: 'destructive'
      });
      navigate('/doctor/webinars');
    }
  };

  const joinWebinar = async () => {
    try {
      const response = await api.post(`/webinars/${webinarId}/join`);
      setToken(response.data.livekit.token);
      setServerUrl(response.data.livekit.serverUrl);
      setWebinarInfo(response.data.webinar);
      setIsConnecting(false);
      setHasJoined(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to join webinar',
        variant: 'destructive'
      });
      navigate('/webinars');
    }
  };

  const handleDisconnect = async () => {
    try {
      if (isHost) {
        if (confirm('Are you sure you want to end this webinar for everyone?')) {
          await api.post(`/doctor/webinars/${webinarId}/end`);
          toast({
            title: 'Webinar Ended',
            description: 'The webinar has been ended successfully'
          });
          navigate('/doctor/webinars');
        }
      } else {
        await api.post(`/webinars/${webinarId}/leave`);
        navigate('/webinars');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      navigate(isHost ? '/doctor/webinars' : '/webinars');
    }
  };

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <Circle className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <h2 className="text-xl font-semibold mb-2">
              {isHost ? 'Starting Webinar...' : 'Joining Webinar...'}
            </h2>
            <p className="text-gray-600">Please wait...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-500">
              Connection Error
            </h2>
            <p className="text-gray-600 mb-4">
              Unable to connect to the webinar room.
            </p>
            <Button onClick={() => navigate(isHost ? '/doctor/webinars' : '/webinars')}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900">
      <LiveKitRoom
        video={isHost} // Host starts with video on
        audio={isHost} // Host starts with audio on
        token={token}
        serverUrl={serverUrl}
        connect={hasJoined}
        onDisconnected={handleDisconnect}
        data-lk-theme="default"
        className="h-full"
      >
        {/* Room Header */}
        <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-white text-xl font-bold">
                {webinarInfo?.title}
              </h1>
              {isHost && (
                <Badge className="bg-red-500 text-white mt-1">
                  <Circle className="w-2 h-2 fill-current mr-1" />
                  LIVE
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <ParticipantCount />
              
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDisconnect}
              >
                <Phone className="w-4 h-4 mr-2" />
                {isHost ? 'End Webinar' : 'Leave'}
              </Button>
            </div>
          </div>
        </div>

        {/* Main Video Area */}
        <div className="h-full pt-20 pb-24">
          {isHost ? (
            <HostView />
          ) : (
            <AttendeeView />
          )}
        </div>

        {/* Custom Control Bar */}
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/90 to-transparent p-6">
          <WebinarControlBar 
            isHost={isHost} 
            webinarId={webinarId!}
            chatEnabled={webinarInfo?.chatEnabled !== false}
            onLeave={handleDisconnect}
          />
        </div>

        {/* Audio Renderer */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
};

// Host View Component
const HostView: React.FC = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <div className="h-full">
      <GridLayout tracks={tracks}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
};

// Attendee View Component  
const AttendeeView: React.FC = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true } // Attendees only see published tracks
  );

  return (
    <div className="h-full">
      <GridLayout tracks={tracks}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
};

// Participant Count Component
const ParticipantCount: React.FC = () => {
  const room = useRoomContext();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      setCount(room.numParticipants);
    };

    updateCount();
    
    room.on('participantConnected', updateCount);
    room.on('participantDisconnected', updateCount);

    return () => {
      room.off('participantConnected', updateCount);
      room.off('participantDisconnected', updateCount);
    };
  }, [room]);

  return (
    <Badge variant="secondary" className="text-white bg-white/20">
      <Users className="w-4 h-4 mr-1" />
      {count} {count === 1 ? 'Participant' : 'Participants'}
    </Badge>
  );
};

export default WebinarRoomPage;
// Custom Control Bar with Recording and Enhanced Controls
interface WebinarControlBarProps {
  isHost: boolean;
  webinarId: string;
  chatEnabled: boolean;
  onLeave: () => void;
}

const WebinarControlBar: React.FC<WebinarControlBarProps> = ({ 
  isHost, 
  webinarId, 
  chatEnabled,
  onLeave 
}) => {
  const room = useRoomContext();
  const { toast } = useToast();
  const { isMicrophoneEnabled, isScreenShareEnabled, isCameraEnabled } = useLocalParticipant();
  
  const [isRecording, setIsRecording] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Toggle recording (host only)
  const toggleRecording = async () => {
    try {
      if (!isRecording) {
        await api.post(`/doctor/webinars/${webinarId}/start-recording`);
        setIsRecording(true);
        toast({
          title: 'Recording Started',
          description: 'This webinar is now being recorded',
        });
      } else {
        await api.post(`/doctor/webinars/${webinarId}/stop-recording`);
        setIsRecording(false);
        toast({
          title: 'Recording Stopped',
          description: 'Recording has been saved',
        });
      }
    } catch (error) {
      toast({
        title: 'Recording Error',
        description: 'Failed to toggle recording',
        variant: 'destructive',
      });
    }
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    try {
      if (isScreenShareEnabled) {
        await room.localParticipant.setScreenShareEnabled(false);
      } else {
        await room.localParticipant.setScreenShareEnabled(true);
        toast({
          title: 'Screen Sharing',
          description: 'You are now sharing your screen',
        });
      }
    } catch (error) {
      toast({
        title: 'Screen Share Error',
        description: 'Failed to toggle screen sharing',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Microphone Toggle */}
      <TrackToggle
        source={Track.Source.Microphone}
        className={`p-4 rounded-full transition-all ${
          isMicrophoneEnabled 
            ? 'bg-gray-700 hover:bg-gray-600' 
            : 'bg-red-500 hover:bg-red-600'
        }`}
      >
        {isMicrophoneEnabled ? (
          <Mic className="w-6 h-6 text-white" />
        ) : (
          <MicOff className="w-6 h-6 text-white" />
        )}
      </TrackToggle>

      {/* Camera Toggle (Host only or if enabled) */}
      {isHost && (
        <TrackToggle
          source={Track.Source.Camera}
          className={`p-4 rounded-full transition-all ${
            isCameraEnabled 
              ? 'bg-gray-700 hover:bg-gray-600' 
              : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          {isCameraEnabled ? (
            <VideoIcon className="w-6 h-6 text-white" />
          ) : (
            <VideoOff className="w-6 h-6 text-white" />
          )}
        </TrackToggle>
      )}

      {/* Screen Share Toggle (Host only) */}
      {isHost && (
        <Button
          onClick={toggleScreenShare}
          size="lg"
          className={`rounded-full p-4 ${
            isScreenShareEnabled 
              ? 'bg-blue-500 hover:bg-blue-600' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isScreenShareEnabled ? (
            <MonitorOff className="w-6 h-6 text-white" />
          ) : (
            <Monitor className="w-6 h-6 text-white" />
          )}
        </Button>
      )}

      {/* Recording Toggle (Host only) */}
      {isHost && (
        <Button
          onClick={toggleRecording}
          size="lg"
          className={`rounded-full p-4 ${
            isRecording 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isRecording ? (
            <StopCircle className="w-6 h-6 text-white" />
          ) : (
            <Circle className="w-6 h-6 text-white" />
          )}
        </Button>
      )}

      {/* Chat Toggle */}
      {chatEnabled && (
        <Button
          onClick={() => setShowChat(!showChat)}
          size="lg"
          className={`rounded-full p-4 ${
            showChat 
              ? 'bg-blue-500 hover:bg-blue-600' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </Button>
      )}

      {/* More Options */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="rounded-full p-4 bg-gray-700 hover:bg-gray-600"
          >
            <MoreVertical className="w-6 h-6 text-white" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Webinar Controls</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {isHost && (
            <>
              <DropdownMenuItem onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Users className="w-4 h-4 mr-2" />
                Manage Participants
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem>
            <Volume2 className="w-4 h-4 mr-2" />
            Audio Settings
          </DropdownMenuItem>
          <DropdownMenuItem>
            <VideoIcon className="w-4 h-4 mr-2" />
            Video Settings
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={onLeave}
            className="text-red-500 focus:text-red-600"
          >
            <Phone className="w-4 h-4 mr-2" />
            {isHost ? 'End Webinar' : 'Leave Webinar'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leave/End Button */}
      <Button
        onClick={onLeave}
        size="lg"
        className="rounded-full p-4 bg-red-500 hover:bg-red-600 ml-4"
      >
        <Phone className="w-6 h-6 text-white" />
      </Button>
    </div>
  );
};

