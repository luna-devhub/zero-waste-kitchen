// src/components/sidebar/NotificationsPopover.tsx
import { useState, useEffect, useCallback } from "react";
import { Bell, Check, X, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { shareApi } from "@/lib/api";
import { ResponseNotification } from "./ResponseNotification";
import { useMutualSharing } from "@/hooks/useMutualSharing";
import { useUser } from "@/contexts/UserContext";

interface ShareRequest {
  id: string;
  from_user_id: string;
  from_username: string;
  from_email: string;
  time_ago: string;
  status: string;
  permission: string;
}

interface ResponseNotificationType {
  id: string;
  to_username: string;
  to_email: string;
  status: 'accepted' | 'rejected';
  message: string;
  time_ago: string;
  created_at: string;
  request_id: string;
}

interface NotificationsPopoverProps {
  isCollapsed: boolean;
}

export function NotificationsPopover({ isCollapsed }: NotificationsPopoverProps) {
  const [pendingRequests, setPendingRequests] = useState<ShareRequest[]>([]);
  const [responseNotifications, setResponseNotifications] = useState<ResponseNotificationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const { user } = useUser();
  const { createMutualShare } = useMutualSharing();

  // Load dismissed notifications from localStorage
  const getDismissedNotifications = useCallback((): string[] => {
    const dismissed = localStorage.getItem('dismissedResponseNotifications');
    return dismissed ? JSON.parse(dismissed) : [];
  }, []);

  const saveDismissedNotification = useCallback((id: string) => {
    const dismissed = getDismissedNotifications();
    dismissed.push(id);
    localStorage.setItem('dismissedResponseNotifications', JSON.stringify(dismissed));
  }, [getDismissedNotifications]);

  const fetchAllData = useCallback(async () => {
    if (!isOpen) return;
    
    try {
      setLoading(true);
      
      // Fetch pending requests (incoming)
      const pending = await shareApi.getReceivedRequests();
      setPendingRequests(pending || []);
      
      // Fetch response notifications (outgoing request statuses)
      const sentRequests = await shareApi.getSentRequests();
      const dismissedIds = getDismissedNotifications();
      
      // Filter sent requests that are not pending and not dismissed
      const responses: ResponseNotificationType[] = sentRequests
        .filter((req: any) => req.status !== 'pending' && !dismissedIds.includes(req.id))
        .map((req: any) => ({
          id: req.id,
          to_username: req.to_username,
          to_email: req.to_email,
          status: req.status,
          message: `${req.to_username} ${req.status === 'accepted' ? 'accepted' : 'declined'} your request`,
          time_ago: req.time_ago || calculateTimeAgo(req.created_at),
          created_at: req.created_at,
          request_id: req.id
        }));
      
      setResponseNotifications(responses);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, getDismissedNotifications]);

  // Fetch when popover opens
  useEffect(() => {
    if (isOpen) {
      fetchAllData();
    }
  }, [isOpen, fetchAllData]);

  // Poll every 30 seconds if open
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [isOpen, fetchAllData]);

  const calculateTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'just now';
  };

  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      // Find the request details before accepting
      const request = pendingRequests.find(r => r.id === requestId);
      
      // Accept the request
      await shareApi.acceptRequest(requestId);
      
      // If acceptance was successful and we have the request details
      if (request && user) {
        // Create a mutual share (reverse share) so current user can also see the other user's pantry
        await createMutualShare(request.from_user_id, request.from_username);
        toast.success(`You can now view ${request.from_username}'s pantry, and they can view yours!`);
      } else {
        toast.success("Share request accepted");
      }
      
      // Remove from pending
      setPendingRequests(prev => prev.filter(req => req.id !== requestId));
      
      // Refresh data
      fetchAllData();
    } catch (error: any) {
      console.error("Accept error:", error);
      toast.error(error.response?.data?.detail || "Failed to accept request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      await shareApi.rejectRequest(requestId);
      toast.info("Share request declined");
      setPendingRequests(prev => prev.filter(req => req.id !== requestId));
      fetchAllData();
    } catch (error: any) {
      console.error("Decline error:", error);
      toast.error(error.response?.data?.detail || "Failed to decline request");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismissResponse = (notificationId: string) => {
    saveDismissedNotification(notificationId);
    setResponseNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const totalNotifications = pendingRequests.length + responseNotifications.length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all duration-200",
            "hover:bg-sidebar-accent text-sidebar-foreground",
            !isCollapsed && "justify-start"
          )}
        >
          <div className="relative">
            <Bell className="h-5 w-5 flex-shrink-0" />
            {totalNotifications > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
              >
                {totalNotifications}
              </Badge>
            )}
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="font-medium"
              >
                Notifications
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start" side="right">
        <div className="p-4 border-b border-border">
          <h3 className="font-serif font-semibold text-foreground">Share Requests</h3>
          <p className="text-sm text-muted-foreground">
            {totalNotifications > 0
              ? `You have ${pendingRequests.length} pending and ${responseNotifications.length} response${responseNotifications.length !== 1 ? 's' : ''}`
              : "No notifications"}
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <>
              {/* Response Notifications Section (Top) */}
              {responseNotifications.length > 0 && (
                <div className="p-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    Responses
                  </h4>
                  <AnimatePresence>
                    {responseNotifications.map((notification) => (
                      <ResponseNotification
                        key={notification.id}
                        id={notification.id}
                        to_username={notification.to_username}
                        status={notification.status}
                        time_ago={notification.time_ago}
                        onDismiss={handleDismissResponse}
                      />
                    ))}
                  </AnimatePresence>
                  {pendingRequests.length > 0 && (
                    <Separator className="my-3" />
                  )}
                </div>
              )}

              {/* Pending Requests Section (Bottom) */}
              {pendingRequests.length > 0 && (
                <div className="p-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    Pending Requests ({pendingRequests.length})
                  </h4>
                  <AnimatePresence>
                    {pendingRequests.map((request) => (
                      <motion.div
                        key={request.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-lg border border-border hover:bg-secondary/20 transition-colors mb-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {request.from_username}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {request.time_ago}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="hero"
                            className="flex-1 h-8"
                            onClick={() => handleAccept(request.id)}
                            disabled={processingId === request.id}
                          >
                            {processingId === request.id ? (
                              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                            ) : (
                              <Check className="h-3 w-3 mr-1" />
                            )}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-8"
                            onClick={() => handleDecline(request.id)}
                            disabled={processingId === request.id}
                          >
                            {processingId === request.id ? (
                              <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin mr-1" />
                            ) : (
                              <X className="h-3 w-3 mr-1" />
                            )}
                            Decline
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {totalNotifications === 0 && !loading && (
                <div className="p-8 text-center">
                  <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications</p>
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}