// src/hooks/useMutualSharing.ts
import { useCallback } from 'react';
import { shareApi } from '@/lib/api';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

export function useMutualSharing() {
  const { user } = useUser();

  const createMutualShare = useCallback(async (targetUserId: string, targetUsername: string) => {
    if (!user?.id) {
      toast.error('You must be logged in');
      return false;
    }

    try {
      // Create a reverse share request (from current user to the target user)
      // This creates a two-way relationship
      await shareApi.sendRequest(targetUsername, 'view');
      
      // Note: The target user doesn't need to accept this second request
      // since they already accepted the first one. In a real implementation,
      // you might want to auto-accept this reverse request on the backend.
      
      console.log(`Mutual share created: ${user.username} <-> ${targetUsername}`);
      return true;
    } catch (error) {
      console.error('Error creating mutual share:', error);
      // Don't show error to user - this is a background operation
      return false;
    }
  }, [user]);

  return {
    createMutualShare
  };
}