// src/lib/api.ts
import axios from "axios";

// Create axios instance
export const api = axios.create({
  baseURL: "http://localhost:8000", // Make sure this matches your backend URL
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to include auth token if needed
api.interceptors.request.use(
  (config) => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.auth_token) {
          config.headers.Authorization = `Basic ${user.auth_token}`;
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // You can handle specific error codes here
    if (error.response?.status === 401) {
      console.error("Authentication error:", error.response.data);
    }
    return Promise.reject(error);
  }
);

// Share API methods
export const shareApi = {
  // Send a share request using username
  sendRequest: async (toUsername: string, permission: string = "view") => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    console.log("Sending share request:", { from_user_id: user.id, to_username: toUsername, permission });
    
    const response = await api.post("/share/request", {
      from_user_id: user.id,
      to_username: toUsername,
      permission
    });
    return response.data;
  },

  // Get received requests (pending requests from others)
  getReceivedRequests: async () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    const response = await api.get(`/share/received/${user.id}`);
    return response.data;
  },

  // Get sent requests (requests you sent to others)
  getSentRequests: async () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user?.id) throw new Error("User ID not found");
    
    const response = await api.get(`/share/sent/${user.id}`);
    return response.data;
  },

  // Get response notifications (accepted/rejected status of your sent requests)
  getResponseNotifications: async () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user?.id) throw new Error("User ID not found");
    
    // Get sent requests that are not pending (accepted or rejected)
    const sentRequests = await shareApi.getSentRequests();
    return sentRequests.filter((req: any) => req.status !== 'pending');
  },

  // Accept a request
  acceptRequest: async (requestId: string) => {
    const response = await api.post("/share/respond", {
      request_id: requestId,
      action: "accept"
    });
    return response.data;
  },

  // Reject a request
  rejectRequest: async (requestId: string) => {
    const response = await api.post("/share/respond", {
      request_id: requestId,
      action: "reject"
    });
    return response.data;
  },

  // Get users who shared their pantry with me (incoming accepted shares)
  getSharedWith: async () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    const response = await api.get(`/share/shared-with/${user.id}`);
    return response.data;
  },

  // Get user details by username (needed for mutual sharing)
  getUserByUsername: async (username: string) => {
    const response = await api.get(`/users/${username}`);
    return response.data;
  },

  // Create a mutual share relationship (reverse share)
  createMutualShare: async (targetUserId: string, targetUsername: string) => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    console.log("Creating mutual share:", { from_user_id: user.id, to_username: targetUsername });
    
    // Send a share request to the target user
    const response = await api.post("/share/request", {
      from_user_id: user.id,
      to_username: targetUsername,
      permission: "view"
    });
    
    return response.data;
  },

  // Check if a mutual share relationship exists
  checkMutualShare: async (targetUserId: string) => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    // Get all accepted shares
    const [sharedWith, sentRequests] = await Promise.all([
      shareApi.getSharedWith(),
      shareApi.getSentRequests()
    ]);
    
    // Check if target user is in either list
    const isIncoming = sharedWith.some((share: any) => share.user_id === targetUserId);
    const isOutgoingAccepted = sentRequests.some(
      (req: any) => req.to_username && req.status === 'accepted'
    );
    
    return isIncoming || isOutgoingAccepted;
  }
};

// Recipe / Generated recipes API methods
export const recipeApi = {
  generate: async (payload: {
    user_id: string;
    pantry_owner_ids: string[];
    cuisine_style: string;
    meal_type: string;
    dietary_option: string;
    servings: number;
    main_ingredient?: string | null;
    session_id?: string | null;
  }) => {
    const res = await api.post("/recipes/generate", payload);
    return res.data;
  },

confirm: async (payload: {
  session_id: string;
  user_id: string;
  pantry_owner_ids?: string[];
}) => {
  const res = await api.post("/recipes/confirm", payload);
  return res.data;
},

  // list sessions (confirmed by default)
  listGenerated: async (params: {
    user_id: string;
    only_confirmed?: boolean;
    only_cookable?: boolean;
    limit?: number;
  }) => {
    const res = await api.get("/generated-recipes", { params });
    return res.data;
  },

  getGeneratedBySession: async (session_id: string, user_id: string) => {
    const res = await api.get(`/generated-recipes/${session_id}`, {
      params: { user_id },
    });
    return res.data;
  },
};

// Auth API methods
export const authApi = {
  changePassword: async (current_password: string, new_password: string) => {
    const response = await api.post("/change-password", {
      current_password,
      new_password
    });
    return response.data;
  }
};

// User API methods (for getting user info)
export const userApi = {
  // Get current user details
  getCurrentUser: async () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) throw new Error("User not logged in");
    
    const user = JSON.parse(userStr);
    if (!user.id) throw new Error("User ID not found");
    
    const response = await api.get(`/users/${user.id}`);
    return response.data;
  },

  // Get user by username
  getUserByUsername: async (username: string) => {
    const response = await api.get(`/users/${username}`);
    return response.data;
  },

  // Get user by ID
  getUserById: async (userId: string) => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  }
};

// Also export the api as default if needed
export default api;