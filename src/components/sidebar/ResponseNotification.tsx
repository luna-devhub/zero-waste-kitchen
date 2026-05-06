// src/components/sidebar/ResponseNotification.tsx
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ResponseNotificationProps {
  id: string;
  to_username: string;
  status: 'accepted' | 'rejected';
  time_ago: string;
  onDismiss: (id: string) => void;
}

export function ResponseNotification({
  id,
  to_username,
  status,
  time_ago,
  onDismiss
}: ResponseNotificationProps) {
  const isAccepted = status === 'accepted';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "p-3 rounded-lg border relative group mb-2",
        isAccepted 
          ? "bg-green-500/5 border-green-500/20" 
          : "bg-red-500/5 border-red-500/20"
      )}
    >
      <div className="flex items-start gap-2">
        {isAccepted ? (
          <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            <span className="font-semibold">{to_username}</span>{' '}
            {isAccepted ? 'accepted' : 'declined'} your request
          </p>
          <p className="text-xs text-muted-foreground">
            {time_ago}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          onClick={() => onDismiss(id)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </motion.div>
  );
}