// src/hooks/useSharedPantries.ts
import { useState, useEffect, useCallback } from 'react';
import { shareApi, userApi } from '@/lib/api';
import { SharedUser } from '@/types/share';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';
import axios from 'axios';

export function useSharedPantries() {
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<SharedUser[]>([]);
  const [sharedByMe, setSharedByMe] = useState<SharedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useUser();

  const fetchSharedUsers = useCallback(async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // 1. Get users who shared with me (incoming)
      const incoming = await shareApi.getSharedWith();
      setSharedWithMe(incoming || []);
      
      // 2. Get sent requests that were accepted (outgoing)
      const sentRequests = await shareApi.getSentRequests();
      const acceptedOutgoing = sentRequests.filter((req: any) => req.status === 'accepted');
      
      // For each accepted outgoing request, get user details by username
      const outgoingPromises = acceptedOutgoing.map(async (req: any) => {
        try {
          // Try to get user by username
          const userDetails = await userApi.getUserByUsername(req.to_username);
          return {
            user_id: userDetails.id,
            username: userDetails.username,
            email: userDetails.email,
            permission: req.permission || 'view',
            shared_at: req.updated_at || req.created_at
          };
        } catch (error) {
          // If 404, user might not exist or username changed
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            console.warn(`User ${req.to_username} not found, skipping...`);
            return null;
          }
          console.error(`Failed to get user details for ${req.to_username}:`, error);
          return null;
        }
      });
      
      const outgoingResults = await Promise.all(outgoingPromises);
      const outgoing = outgoingResults.filter(result => result !== null) as SharedUser[];
      
      setSharedByMe(outgoing || []);
      
      // 3. COMBINE both incoming and outgoing
      const allSharedUsers = [...(incoming || []), ...outgoing];
      
      // Remove duplicates based on user_id
      const uniqueUsers = allSharedUsers.filter((user, index, self) => 
        index === self.findIndex((u) => u.user_id === user.user_id)
      );
      
      console.log('Incoming shares (shared with me):', incoming);
      console.log('Outgoing accepted shares (I shared with them):', outgoing);
      console.log('Combined unique users:', uniqueUsers);
      
      setSharedUsers(uniqueUsers);
    } catch (error) {
      console.error('Error fetching shared users:', error);
      toast.error('Failed to load shared pantries');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchSharedUsers();
  }, [fetchSharedUsers]);

  // Also refresh periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (user?.id) {
        fetchSharedUsers();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [user?.id, fetchSharedUsers]);

  return {
    sharedUsers,
    sharedWithMe,
    sharedByMe,
    isLoading,
    refreshSharedUsers: fetchSharedUsers
  };
}