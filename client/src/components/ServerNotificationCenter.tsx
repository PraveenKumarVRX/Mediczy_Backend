import { useMemo } from "react";
import { Bell, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useServerNotifications } from "@/hooks/useServerNotifications";

const formatTime = (timestamp: Date) => {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export default function ServerNotificationCenter() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } =
    useServerNotifications({ page: 1, limit: 50 });

  const hasNotifications = (notifications?.length || 0) > 0;

  const headerRight = useMemo(() => {
    if (!hasNotifications) return null;
    return (
      <div className="flex gap-2">
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={async () => {
              try {
                await markAllAsRead();
              } catch (e: any) {
                toast({
                  title: "Failed to mark all read",
                  description: e?.response?.data?.message || "Please try again.",
                  variant: "destructive",
                });
              }
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>
    );
  }, [hasNotifications, unreadCount, markAllAsRead, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Notifications</h3>
          {headerRight}
        </div>

        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : !hasNotifications ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notifications yet</p>
              <p className="text-xs">We’ll notify you when something important happens</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {notifications.map((n) => (
                <Card
                  key={n.id}
                  className={cn(
                    "p-3 cursor-pointer hover:bg-muted/50 transition-colors border-l-4",
                    !n.read && "bg-muted/30 border-l-blue-500"
                  )}
                  onClick={async () => {
                    try {
                      if (!n.read) await markAsRead(n.id);
                    } catch {
                      // ignore
                    }
                    if (n.actionUrl) {
                      navigate(n.actionUrl);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("font-medium text-sm", !n.read && "font-semibold")}>
                          {n.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(n.timestamp)}
                          </span>
                          {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await deleteNotification(n.id);
                        } catch (err: any) {
                          toast({
                            title: "Failed to delete",
                            description: err?.response?.data?.message || "Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

