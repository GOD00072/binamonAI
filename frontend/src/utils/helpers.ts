// src/utils/helpers.ts

// *** ย้าย import ไปไว้ด้านบน ***
import type { User } from '../types';

// Format date function
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'เมื่อสักครู่';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} นาทีที่แล้ว`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} ชั่วโมงที่แล้ว`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} วันที่แล้ว`;
  } else {
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

// Format currency function
export const formatCurrency = (amount: number): string => {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '฿0.00';
  }
  
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Debounce function
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};

// Get initials from display name
export const getInitials = (displayName: string): string => {
  if (!displayName || typeof displayName !== 'string') {
    return '?';
  }
  
  const names = displayName.trim().split(' ');
  if (names.length === 1) {
    return names[0].charAt(0).toUpperCase();
  }
  
  return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

// Generate avatar color based on userId
export const generateAvatarColor = (userId: string): string => {
  if (!userId || typeof userId !== 'string') {
    return '#6c757d'; // Default gray color
  }
  
  // Generate a consistent color based on userId hash
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Convert hash to HSL color for better visual variety
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash) % 30); // 60-90%
  const lightness = 45 + (Math.abs(hash) % 15); // 45-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Truncate text function
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + '...';
};

// Format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Validate email
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Generate random ID
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Convert timestamp to readable format
export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Generate random avatar colors array
export const avatarColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85C0E9', '#F8D7DA'
];

// Get avatar color by index
export const getAvatarColorByIndex = (index: number): string => {
  return avatarColors[index % avatarColors.length];
};

// *** ฟังก์ชัน helper สำหรับสร้าง User object ***

// Default user stats
export const DEFAULT_USER_STATS = {
  totalMessages: 0,
  aiMessages: 0,
  costs: {
    total: 0,
    input: 0,
    output: 0
  },
  totalTokens: {
    ai: {
      input: 0,
      output: 0
    }
  }
};

// Create default user helper
export const createDefaultUser = (
  userId: string,
  displayName: string,
  options?: {
    pictureUrl?: string;
    aiEnabled?: boolean;
    isNew?: boolean;
    lastMessageSnippet?: string;
  }
): User => {
  return {
    userId,
    displayName,
    pictureUrl: options?.pictureUrl || '',
    lastActive: Date.now(),
    aiEnabled: options?.aiEnabled ?? true,
    stats: DEFAULT_USER_STATS,
    isNew: options?.isNew ?? true,
    lastMessageSnippet: options?.lastMessageSnippet || ''
  };
};

// Create new user from message data
export const createUserFromMessage = (
  userId: string,
  displayName: string,
  messageContent: string,
  pictureUrl?: string
): User => {
  return createDefaultUser(userId, displayName || `User ${userId.substring(1, 9)}`, {
    pictureUrl: pictureUrl || '',
    lastMessageSnippet: truncateText(messageContent, 30),
    isNew: true,
    aiEnabled: true
  });
};

// Update user activity
export const updateUserActivity = (
  user: User,
  messageContent?: string,
  displayName?: string
): User => {
  return {
    ...user,
    lastActive: Date.now(),
    displayName: displayName || user.displayName,
    lastMessageSnippet: messageContent ? truncateText(messageContent, 30) : user.lastMessageSnippet,
    isNew: false // Reset new flag when user is active
  };
};

// Check if user is online (active within last 5 minutes)
export const isUserOnline = (user: User): boolean => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  return user.lastActive > fiveMinutesAgo;
};

// Get user status text
export const getUserStatusText = (user: User): string => {
  if (isUserOnline(user)) {
    return 'ออนไลน์';
  }
  return formatDate(user.lastActive);
};

// Get user display info for UI
export const getUserDisplayInfo = (user: User) => {
  return {
    initials: getInitials(user.displayName),
    avatarColor: generateAvatarColor(user.userId),
    statusText: getUserStatusText(user),
    isOnline: isUserOnline(user),
    shortId: user.userId.substring(1, 9)
  };
};

// Validate user data
export const validateUserData = (userData: Partial<User>): string[] => {
  const errors: string[] = [];
  
  if (!userData.userId) {
    errors.push('User ID is required');
  }
  
  if (!userData.displayName) {
    errors.push('Display name is required');
  }
  
  if (userData.displayName && userData.displayName.length > 100) {
    errors.push('Display name must be less than 100 characters');
  }
  
  return errors;
};

// Sort users by activity
export const sortUsersByActivity = (users: User[]): User[] => {
  return [...users].sort((a, b) => {
    // New users first
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;
    
    // Then by last activity
    return b.lastActive - a.lastActive;
  });
};

// Filter users by search term
export const filterUsersBySearch = (users: User[], searchTerm: string): User[] => {
  if (!searchTerm.trim()) return users;
  
  const term = searchTerm.toLowerCase();
  return users.filter(user => 
    user.displayName.toLowerCase().includes(term) ||
    user.userId.toLowerCase().includes(term)
  );
};

// Get unread users count
export const getUnreadUsersCount = (unreadUsers: Set<string>): number => {
  return unreadUsers.size;
};

// Check if user has unread messages
export const hasUnreadMessages = (userId: string, unreadUsers: Set<string>): boolean => {
  return unreadUsers.has(userId);
};

// Generate user summary for notifications
export const getUserSummary = (user: User): string => {
  const displayInfo = getUserDisplayInfo(user);
  return `${user.displayName} (${displayInfo.shortId}) - ${displayInfo.statusText}`;
};

// Format user stats for display
export const formatUserStats = (stats: User['stats']) => {
  return {
    totalMessages: stats.totalMessages.toLocaleString(),
    aiMessages: stats.aiMessages.toLocaleString(),
    totalCost: formatCurrency(stats.costs.total),
    inputTokens: stats.totalTokens.ai.input.toLocaleString(),
    outputTokens: stats.totalTokens.ai.output.toLocaleString(),
    totalTokens: (stats.totalTokens.ai.input + stats.totalTokens.ai.output).toLocaleString()
  };
};

// Create user badge info
export const getUserBadgeInfo = (user: User) => {
  const badges = [];
  
  if (user.isNew) {
    badges.push({ text: 'ใหม่!', variant: 'success', pulse: true });
  }
  
  if (user.aiEnabled) {
    badges.push({ text: 'AI เปิด', variant: 'success-soft', pulse: false });
  } else {
    badges.push({ text: 'AI ปิด', variant: 'secondary-soft', pulse: false });
  }
  
  if (isUserOnline(user)) {
    badges.push({ text: 'ออนไลน์', variant: 'info', pulse: false });
  }
  
  return badges;
};