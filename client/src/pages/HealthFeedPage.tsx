import { useEffect, useState } from "react";
import axios from "axios";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Loader2, RefreshCw, ChevronUp, ChevronDown, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPlayer } from "@/components/features/VideoPlayer";

interface YouTubeSnippet {
  title: string;
  description: string;
  thumbnails: {
    medium: {
      url: string;
      width: number;
      height: number;
    };
  };
  publishedAt: string;
  channelTitle: string;
}

interface YouTubeVideo {
  id: {
    videoId: string;
  };
  snippet: YouTubeSnippet;
  contentDetails?: {
    duration: string;
  };
}

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  channelTitle: string;
  duration?: string;
  isShort: boolean;
}

export default function HealthFeedPage() {
  const [videos, setVideos] = useLocalStorage<Video[]>("health-videos", []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [currentShortIndex, setCurrentShortIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const fetchHealthVideos = async () => {
    try {
      const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;
      if (!apiKey) {
        setError("YouTube API key is missing. Please check your .env file.");
        return;
      }

      setLoading(true);
      setError("");
      
      // Fetch both regular videos and shorts with doctor-focused content
      const [regularVideos, shorts] = await Promise.all([
        axios.get<{ items: YouTubeVideo[] }>(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=doctor consultation health advice medical tips&type=video&key=${apiKey}&videoDuration=medium&order=date`
        ),
        axios.get<{ items: YouTubeVideo[] }>(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=doctor health tips medical advice shorts&type=video&key=${apiKey}&videoDuration=short&order=date`
        )
      ]);

      const allVideos = [...regularVideos.data.items, ...shorts.data.items];
      const videoIds = allVideos.map(item => item.id.videoId).join(',');

      // Get video durations
      const videoDetails = await axios.get<{ items: YouTubeVideo[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`
      );

      const durationMap = new Map(
        videoDetails.data.items.map(item => [item.id, item.contentDetails?.duration])
      );

      const newVideos = allVideos.map(item => {
        const duration = durationMap.get(item.id.videoId);
        const isShort = duration ? parseDuration(duration) <= 60 : false;

        return {
          id: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails.medium.url,
          publishedAt: new Date(item.snippet.publishedAt).toLocaleDateString(),
          channelTitle: item.snippet.channelTitle,
          duration,
          isShort
        };
      });

      setVideos(newVideos);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 403) {
          setError("API key is invalid or quota exceeded");
        } else if (status === 400) {
          setError("Invalid request. Please check API parameters");
        } else {
          setError(`Failed to fetch videos: ${err.response?.data?.error?.message || err.message}`);
        }
      } else {
        setError("An unexpected error occurred");
      }
      console.error("YouTube API Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (videos.length === 0) {
      fetchHealthVideos();
    }
  }, []);

  const parseDuration = (duration: string) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0; // Return 0 if no valid duration format found
    const hours = (match[1] || '0H').slice(0, -1);
    const minutes = (match[2] || '0M').slice(0, -1);
    const seconds = (match[3] || '0S').slice(0, -1);
    
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  };

  const shortsVideos = videos.filter(v => v.isShort);
  const longVideos = videos.filter(v => !v.isShort);

  const nextShort = () => {
    if (currentShortIndex < shortsVideos.length - 1) {
      setCurrentShortIndex(prev => prev + 1);
    }
  };

  const previousShort = () => {
    if (currentShortIndex > 0) {
      setCurrentShortIndex(prev => prev - 1);
    }
  };

  const ShortsView = () => (
    <div className="fixed inset-0 bg-slate-900 dark:bg-slate-950">
      <div className="relative h-full flex items-center justify-center">
        <div className="absolute h-full w-full max-w-sm mx-auto">
          {shortsVideos.length > 0 && (
            <VideoPlayer 
              videoId={shortsVideos[currentShortIndex].id} 
              isShort={true}
              isMuted={isMuted}
              autoplay={true}
            />
          )}
          
          {/* Navigation Controls */}
          <div className="absolute right-4 bottom-20 flex flex-col gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-slate-800/70 text-white hover:bg-teal-600 hover:text-white transition-colors"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
            </Button>
          </div>

          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-slate-800/70 text-white hover:bg-teal-600 hover:text-white transition-colors disabled:opacity-40"
              onClick={previousShort}
              disabled={currentShortIndex === 0}
            >
              <ChevronUp className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full bg-slate-800/70 text-white hover:bg-teal-600 hover:text-white transition-colors disabled:opacity-40"
              onClick={nextShort}
              disabled={currentShortIndex === shortsVideos.length - 1}
            >
              <ChevronDown className="h-6 w-6" />
            </Button>
          </div>

          {/* Video Info */}
          <div className="absolute bottom-4 left-4 right-16 text-white bg-gradient-to-t from-slate-900/90 to-transparent p-4 rounded-lg">
            <h3 className="font-semibold text-white">{shortsVideos[currentShortIndex]?.title}</h3>
            <p className="text-sm text-slate-300">{shortsVideos[currentShortIndex]?.channelTitle}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const RegularVideoGrid = () => (
    <>
      {selectedVideo && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 dark:bg-slate-950/95 flex items-center justify-center backdrop-blur-sm">
          <div className="relative w-full max-w-7xl mx-auto p-4">
            <Button
              variant="outline"
              size="icon"
              className="absolute top-4 right-4 z-50 bg-slate-800 border-slate-700 text-white hover:bg-teal-600 hover:border-teal-600 hover:text-white transition-colors"
              onClick={() => setSelectedVideo(null)}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="aspect-video w-full rounded-lg overflow-hidden shadow-2xl">
              <VideoPlayer 
                videoId={selectedVideo.id} 
                isShort={false} 
                isMuted={false} 
                autoplay={true} 
              />
            </div>
            <div className="mt-4 text-white">
              <h2 className="text-xl font-semibold text-white">{selectedVideo.title}</h2>
              <div className="flex items-center justify-between mt-2 text-sm text-slate-300">
                <span className="text-teal-400">{selectedVideo.channelTitle}</span>
                <span>{selectedVideo.publishedAt}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {longVideos.map((video) => (
          <Card 
            key={video.id} 
            className="overflow-hidden bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:shadow-lg hover:shadow-teal-500/10 dark:hover:shadow-teal-500/20 transition-all duration-300 cursor-pointer group"
            onClick={() => setSelectedVideo(video)}
          >
            <div className="aspect-video relative">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-teal-600/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button className="bg-teal-600 hover:bg-teal-700 text-white border-0" size="sm">Play Video</Button>
              </div>
            </div>
            <CardContent className="p-4 bg-white dark:bg-slate-800/50">
              <h3 className="font-semibold line-clamp-2 mb-2 text-slate-800 dark:text-white">{video.title}</h3>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span className="text-teal-600 dark:text-teal-400">{video.channelTitle}</span>
                <span>{video.publishedAt}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );

  if (error) {
    return (
      <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>
          <Button 
            variant="outline" 
            onClick={fetchHealthVideos}
            className="border-teal-500 text-teal-600 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-900/20"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500 dark:text-teal-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container py-6 space-y-6 bg-slate-50 dark:bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Doctor's Health Feed</h1>
        <Button 
          variant="outline" 
          size="sm"
          onClick={fetchHealthVideos}
          disabled={loading}
          className="border-teal-500 text-teal-600 hover:bg-teal-50 dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-900/20 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Refresh Feed
        </Button>
      </div>

      <Tabs defaultValue="videos" className="space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1">
          <TabsTrigger 
            value="videos" 
            className="data-[state=active]:bg-teal-500 data-[state=active]:text-white dark:data-[state=active]:bg-teal-600 text-slate-600 dark:text-slate-300"
          >
            Doctor's Videos
          </TabsTrigger>
          <TabsTrigger 
            value="shorts" 
            className="data-[state=active]:bg-teal-500 data-[state=active]:text-white dark:data-[state=active]:bg-teal-600 text-slate-600 dark:text-slate-300"
          >
            Quick Tips
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="videos" className="space-y-4">
          <RegularVideoGrid />
        </TabsContent>
        
        <TabsContent value="shorts">
          <ShortsView />
        </TabsContent>
      </Tabs>
    </div>
  );
} 