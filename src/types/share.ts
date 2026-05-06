// src/types/share.ts
export interface ShareRequest {
  id: string;
  from_user_id: string;
  from_username: string;
  from_email: string;
  to_username: string;
  status: 'pending' | 'accepted' | 'rejected';
  permission: 'view' | 'edit';
  time_ago: string;
  created_at: string;
}

export interface SharedUser {
  user_id: string;
  username: string;
  email: string;
  permission: 'view' | 'edit';
  shared_at: string;
}

export interface SentRequestResponse {
  id: string;
  to_username: string;
  to_email: string;
  status: 'pending' | 'accepted' | 'rejected';
  permission: 'view' | 'edit';
  created_at: string;
}

export interface ResponseNotification {
  id: string;
  to_username: string;
  to_email: string;
  status: 'accepted' | 'rejected';
  message: string;
  time_ago: string;
  created_at: string;
  request_id: string;
}