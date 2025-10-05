// src/types/index.ts

// User interface
export interface User {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  lastActive: number;
  aiEnabled: boolean;
  stats: {
    totalMessages: number;
    aiMessages: number;
    costs: {
      total: number;
      input?: number;
      output?: number;
    };
    totalTokens: {
      ai: {
        input: number;
        output: number;
      };
    };
  };
  // Optional: to hold last message snippet for user list UI
  lastMessageSnippet?: string;
  
  // *** เพิ่ม property สำหรับผู้ใช้ใหม่ ***
  isNew?: boolean; // flag สำหรับแสดงว่าเป็น user ใหม่
}

// UserProfile interface (for senderProfile)
export interface UserProfile {
  displayName?: string;
  pictureUrl?: string;
  // Add any other profile fields you might want to attach to a message sender
}

// Price Tier interface
export interface PriceTier {
  id: string;
  product_id: string;
  min_quantity: number;
  max_quantity?: number | null;
  price: number;
  created_at?: string;
  last_updated?: string;
}

// Product interface
export interface Product {
  id: string;
  product_name: string;
  name?: string; // Keep both for compatibility
  description?: string;
  price?: number;
  category?: string;
  imageUrl?: string;
  sku?: string;
  stock_quantity?: number;
  unit?: string; // หน่วย (ชิ้น, กล่อง, แพ็ค, ฯลฯ)
  production_links?: boolean;
  url?: string;
  last_updated?: string;
  createdAt?: number;
  updatedAt?: number;
  priceTiers?: PriceTier[];
}

// Message interface - รองรับ role ทั้งหมด
export interface Message {
  messageId: string;
  content: string;
  timestamp: number;
  role: 'user' | 'admin' | 'ai' | 'model'; // เพิ่ม 'model' support
  type?: 'text' | 'image' | 'file';
  userId?: string; // userId ของผู้ส่งหรือผู้รับหลัก
  source?: string; // แหล่งที่มาของข้อความ เช่น 'line', 'admin-ui', 'ai'
  senderProfile?: UserProfile; // Added to resolve ChatPage.tsx error
}

// AI Configuration interfaces
export interface ModelConfig {
  modelName: string;
  apiVersion: string;
  modelUrl?: string;
  useDirectUrl: boolean;
}

export interface GenerationConfig {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  topK: number;
}

export interface ConversationConfig {
  personality: string;
  greeting: string;
  closing: string;
  guidelines: string[];
}

export interface TemplateConfig {
  conversation: ConversationConfig;
}

export interface MessageConfig {
  maxLength: number;
  delayTime: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ResizeConfig {
  width: number;
  height: number;
  quality: number;
}

export interface ImageConfig {
  maxSize: number;
  maxDimension: number;
  resizeConfig: ResizeConfig;
}

export interface CacheConfig {
  messageCacheTTL: number;
  messageLockTTL: number;
}

export interface AIConfig { // This seems like a broader config type
  templateConfig: TemplateConfig;
  messageConfig: MessageConfig;
  imageConfig: ImageConfig;
  cacheConfig: CacheConfig;
}

// --- System Health and related types ---
export interface SystemServiceDetail {
    status: 'running' | 'stopped' | 'degraded' | 'error' | 'unknown';
    connections?: number; // For WebSocket
    aiEnabled?: boolean; // For LineHandler
    model?: string; // For AIAssistant
    lastUpdate?: number; // Timestamp of last status update
    version?: string; // Service version
    [key: string]: any; // Allow other properties
}

export interface SystemServices {
    webSocket: SystemServiceDetail;
    lineHandler: SystemServiceDetail;
    aiAssistant: SystemServiceDetail;
    chatHistory: SystemServiceDetail;
    productManager?: SystemServiceDetail;
    messageHandler?: SystemServiceDetail;
    imageHandler?: SystemServiceDetail;
    keywordDetector?: SystemServiceDetail;
    schedulerService?: SystemServiceDetail;
}

export interface SystemProcessMemoryUsage {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers?: number;
}

export interface SystemProcessCpuUsage {
    user: number;
    system: number;
}

export interface SystemPlatformInfo {
    uptime: number;
    memory: SystemProcessMemoryUsage;
    cpu: SystemProcessCpuUsage;
    platform: string;
    nodeVersion: string;
    loadAverage?: number[];
    freeMemory?: number;
    totalMemory?: number;
}

export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'error' | 'unknown';
    timestamp: number;
    system: SystemPlatformInfo;
    services: SystemServices;
    activeConnections?: number;
    processingQueue?: number;
    errorCount?: number;
    warningCount?: number;
}

export interface AISettings {
  modelConfig: ModelConfig;
  generationConfig: GenerationConfig;
  templateConfig: TemplateConfig;
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  message?: string;
  error?: string;
  status?: number; // status from http response, can be optional
  timestamp?: number; // When the response was generated
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

// Changed: ApiListResponse now uses ApiResponse structure for consistency
export interface ApiListResponse<T> extends ApiResponse<{
  results: T[];
  pagination: PaginationInfo;
}> {}

// Chat related interfaces
export interface ChatHistoryData { // Renamed from ChatHistory to avoid conflict if ChatHistory is a class name elsewhere
  userId: string;
  messages: Message[];
  lastUpdated?: number; // Changed from lastActivity for clarity, make optional
  messageCount?: number; // Make optional as it can be derived
  totalTokens?: { input: number; output: number };
  userProfile?: UserProfile; // User's profile information
}

export interface UserStats { // This seems to be part of the User interface, consider merging or ensuring consistency
  totalMessages: number;
  aiMessages: number;
  costs: {
    total: number;
    input?: number;
    output?: number;
  };
  totalTokens: {
    ai: { // This nesting 'ai' under 'totalTokens' is specific, ensure User interface matches
      input: number;
      output: number;
    };
  };
}

// Socket event interfaces
export interface SocketMessage { // For message_sent, new_message
  userId: string;
  message: Message;
  timestamp: number; // This timestamp is for the socket event itself
}

export interface SocketError {
  event?: string; // Optional: the event that caused the error
  message: string; // Renamed from 'error' to 'message' for clarity
  details?: any;
  timestamp?: number;
}

// --- AI Interaction Types ---
export interface AiProcessingStatus {
  userId: string;
  messageId?: string;
  status: 'processing' | 'paused' | 'resumed' | 'error' | 'cancelled' | 'timeout' | string;
  message?: string;
  timestamp: number;
  reason?: string;
  progress?: number; // Processing progress (0-100)
}

export interface AdminTypingStatus {
  userId: string;
  adminId: string;
  isTyping: boolean;
  timestamp: number;
  elapsedTime?: number; // How long admin has been typing
}

export interface AiResponsePendingReview {
  userId: string;
  responseId: string;
  messageId: string; // User's original messageId
  response: string; // AI's response content (was 'content' in ChatPage, ensuring consistency)
  autoSendIn?: number;
  timestamp: number;
  productsFound?: number; // Number of products found in search
  tokens?: { input: number; output: number }; // Token usage for this response
}

export interface AiResponseUpdate {
  userId: string;
  responseId: string;
  messageId?: string;
  timestamp: number;
  reason?: string;
  content?: string; // The actual content that was sent/rejected
  approvedBy?: string; // For logging who approved/rejected
  rejectedBy?: string;
  action?: 'approved' | 'rejected' | 'sent' | 'cancelled'; // What action was taken
}

// New User related interfaces
export interface NewUserEvent {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  isFirstMessage: boolean;
  timestamp: number;
  messageContent?: string; // First message content if any
}

export interface UserProfileUpdateEvent {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  lastActive?: number;
  timestamp: number;
}

// --- End of AI Interaction Types ---

// Product import/scraping interfaces
export interface ScrapingProgress {
  current: number;
  total: number;
  success: number;
  failed: number;
  fileName?: string; // Optional: name of the file being processed
  percentage?: number; // Progress percentage
  estimatedTimeRemaining?: number; // In milliseconds
}

export interface ScrapingLog {
  id: string;
  timestamp: string; // Consider number (Date.now()) for easier sorting
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  details?: any; // Additional log details
}

export interface ScrapeEvent { // This is likely for WebSocket events from scraping
  type: string; // e.g., 'scrape_progress', 'scrape_log', 'scrape_complete'
  data: any;
  timestamp: number;
}

export interface ProductSearchResult {
  results: Product[];
  total: number;
  query: string;
  searchTime: number; // Time taken to search in milliseconds
  filters?: SearchFilters;
}

// Form interfaces
export interface LoginForm {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface ProductForm {
  product_name: string;
  description?: string;
  price?: number;
  category?: string;
  sku?: string;
  stock_quantity?: number;
  production_links?: boolean;
  url?: string;
}

export interface UserForm {
  userId?: string;
  displayName: string;
  pictureUrl?: string;
  aiEnabled?: boolean;
}

export interface MessageForm {
  userId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
}

// Error interfaces
export interface AppError {
  message: string;
  code?: string | number; // Allow numeric codes too
  details?: any;
  timestamp?: number;
  stack?: string; // Stack trace for debugging
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface FormErrors {
  [key: string]: string | ValidationError[];
}

// Navigation interfaces
export interface NavItem {
  path: string;
  label: string;
  icon: string; // Typically a class name for an icon font or an SVG component
  badge?: string | number;
  children?: NavItem[]; // For nested menus
  permission?: string; // Required permission to access
  external?: boolean; // Whether this is an external link
}

// Theme and UI interfaces
export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  fontSize: string;
  fontFamily: string;
}

export interface UISettings {
  theme: ThemeConfig;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
}

// Application state interfaces (Example for a Redux/Context store)
export interface AuthState {
  isLoading: boolean;
  error: string | null;
  user: User | null; // Authenticated User object
  isAuthenticated: boolean;
  token?: string; // JWT or session token
  permissions?: string[]; // User permissions
}

export interface ChatState {
  users: User[];
  currentUser: User | null;
  messages: Message[];
  unreadUsers: Set<string>;
  isLoading: boolean;
  error: string | null;
}

export interface AppState { // Root state example
  auth: AuthState;
  chat: ChatState;
  theme: ThemeConfig;
  ui: UISettings;
  // ... other state slices
}

// WebSocket specific interfaces
export interface WebSocketConfig {
  adminReviewDelay: number;
  adminTypingTimeout: number;
  aiProcessingTimeout: number;
  autoSendDelay: number;
  enableAdminReview: boolean;
  enableAutoSend: boolean;
  reconnectAttempts: number;
  reconnectDelay: number;
}

export interface WebSocketConnection {
  socketId: string;
  connectedAt: number;
  authenticated: boolean;
  user: User | null;
  userAgent?: string;
  ipAddress?: string;
  lastActivity?: number;
}

export interface WebSocketStatus {
  adminSessions: Array<{
    adminId: string;
    userId: string;
    isTyping: boolean;
    lastActivity: number;
    socketId: string;
  }>;
  aiProcessingQueue: Array<{
    userId: string;
    messageId: string;
    status: string;
    timestamp: number;
    durationMs: number;
  }>;
  pendingAIResponses: Array<{
    userId: string;
    responseId: string;
    messageId: string;
    adminReview: string;
    timestamp: number;
    waitingMs: number;
  }>;
  activeConnections: WebSocketConnection[];
  totalActiveConnections: number;
  config: WebSocketConfig;
  timestamp: number;
}

// File upload interfaces
export interface FileUpload {
  id: string; // Add an ID for tracking
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  url?: string; // URL after successful upload
  uploadedAt?: number; // Timestamp when upload completed
  size?: number; // File size in bytes
  type?: string; // MIME type
}

export interface ImageAnalysis {
  id: string;
  imageUrl: string;
  analysis: string;
  confidence?: number;
  objects?: Array<{
    name: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  timestamp: number;
  processingTime: number; // Time taken to analyze in milliseconds
}

// Notification interfaces
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string; // Content of the notification
  timestamp: number;
  read?: boolean; // Optional
  duration?: number; // How long to display, 0 for sticky
  action?: {
    label: string;
    callback: () => void;
  };
  userId?: string; // User this notification is for
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  email: boolean;
  types: {
    newMessage: boolean;
    newUser: boolean;
    aiResponse: boolean;
    systemAlert: boolean;
  };
}

// Search interfaces
export interface SearchFilters {
  query?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  dateFrom?: string; // ISO date string
  dateTo?: string;   // ISO date string
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: string; // Filter by specific user
  role?: MessageRole; // Filter by message role
  hasImage?: boolean; // Filter messages with images
  limit?: number; // Limit number of results
  offset?: number; // Offset for pagination
}

// Modified: SearchResults structure to align with ApiListResponse for consistency
export interface SearchResults<T> { // This might be the 'data' part of an ApiListResponse
  items: T[];
  total: number;
  page: number; // Current page
  limit: number; // Items per page
  query?: string; // Original search query
  filters?: SearchFilters; // Filters applied for this result
  searchTime?: number; // Time taken to search in milliseconds
}

// Dashboard interfaces
export interface DashboardStats {
  totalUsers: number;
  totalProducts: number;
  totalMessages: number;
  newUsersToday: number;
  messagesThisWeek: number;
  aiUsage: {
    totalCalls: number; // Renamed for clarity
    todayCalls: number;
    thisWeekCalls: number;
    averageResponseTime: number; // In milliseconds
    successRate: number; // Percentage of successful AI calls
  };
  costs: {
    total: number;
    today: number;
    thisWeek: number;
    thisMonth: number;
    inputTokens: number;
    outputTokens: number;
  };
  performance: {
    averageResponseTime: number;
    uptime: number; // Server uptime in seconds
    memoryUsage: number; // Memory usage percentage
    cpuUsage: number; // CPU usage percentage
  };
  // ... other dashboard specific stats
}

export interface ChartDataPoint {
  x: string | number | Date; // Label for X-axis
  y: number;                 // Value for Y-axis
  label?: string;            // Optional label for the point
}

export interface ChartDataset {
  label: string;
  data: ChartDataPoint[] | number[]; // Allow simple number array or object array
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number; // For line charts
  // ... other chart.js dataset options
}

export interface ChartConfig { // Renamed from ChartData for clarity
  labels?: string[]; // Optional if data points have their own x labels
  datasets: ChartDataset[];
  options?: {
    responsive?: boolean;
    plugins?: {
      legend?: {
        display?: boolean;
        position?: string;
      };
      title?: {
        display?: boolean;
        text?: string;
      };
    };
    scales?: {
      x?: any;
      y?: any;
    };
  };
}

// Email and Communication interfaces
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[]; // Template variables like {{userName}}
  type: 'welcome' | 'notification' | 'alert' | 'report';
  createdAt: number;
  updatedAt: number;
}

export interface EmailSettings {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}




// Export AI test types  


// Scheduler interfaces
export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  schedule: string; // Cron expression
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  type: 'backup' | 'cleanup' | 'report' | 'scraping' | 'custom';
  config?: any; // Job-specific configuration
  createdAt: number;
  updatedAt: number;
}

export interface JobExecution {
  id: string;
  jobId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
  logs: string[];
}

// Backup and Export interfaces
export interface BackupConfig {
  enabled: boolean;
  schedule: string; // Cron expression
  retentionDays: number;
  includeImages: boolean;
  includeMessages: boolean;
  includeUsers: boolean;
  includeProducts: boolean;
  compressionLevel: number; // 0-9
  encryptionEnabled: boolean;
}

export interface BackupFile {
  id: string;
  filename: string;
  size: number; // Size in bytes
  createdAt: number;
  type: 'full' | 'incremental' | 'manual';
  status: 'created' | 'verified' | 'corrupted';
  checksum: string;
  description?: string;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  dateRange?: {
    start: string;
    end: string;
  };
  filters?: SearchFilters;
  includeImages: boolean;
  includeMetadata: boolean;
}

// Utility type helpers
export type MessageRole = Message['role'];
export type ProductStatus = 'active' | 'inactive' | 'discontinued' | 'out_of_stock';
export type UserRole = 'admin' | 'user' | 'editor' | 'viewer' | 'moderator'; // Expanded example
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error' | 'reconnecting';
export type NotificationType = Notification['type'];
export type JobStatus = ScheduledJob['status'];
export type BackupType = BackupFile['type'];

// Utility types for common patterns
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequireOnly<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
export type WithTimestamp<T> = T & { timestamp: number };
export type WithId<T> = T & { id: string };

// Constants
export const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file'
} as const; // Make it a const assertion for stricter type checking

export const MESSAGE_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  AI: 'ai',
  MODEL: 'model'
} as const;

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
} as const;

export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  MODERATOR: 'moderator'
} as const;

export const CONNECTION_STATUSES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  ERROR: 'error',
  RECONNECTING: 'reconnecting'
} as const;

export const SYSTEM_STATUSES = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  ERROR: 'error',
  UNKNOWN: 'unknown'
} as const;

// Type guards
export const isUser = (obj: any): obj is User => {
  return obj && typeof obj.userId === 'string' && typeof obj.displayName === 'string';
};

export const isMessage = (obj: any): obj is Message => {
  return obj && typeof obj.messageId === 'string' && typeof obj.content === 'string' && typeof obj.role === 'string';
};

export const isProduct = (obj: any): obj is Product => {
  return obj && typeof obj.id === 'string' && (typeof obj.product_name === 'string' || typeof obj.name === 'string');
};

export const isApiResponse = <T>(obj: any): obj is ApiResponse<T> => {
  return obj && typeof obj.success === 'boolean';
};

export const isValidMessageRole = (role: string): role is MessageRole => {
  return Object.values(MESSAGE_ROLES).includes(role as MessageRole);
};

export const isValidNotificationType = (type: string): type is NotificationType => {
  return Object.values(NOTIFICATION_TYPES).includes(type as NotificationType);
};

// Default values
export const DEFAULT_USER_STATS: User['stats'] = { // More specific default for stats
  totalMessages: 0,
  aiMessages: 0,
  costs: { total: 0 },
  totalTokens: { ai: { input: 0, output: 0 } }
};

export const DEFAULT_USER: Partial<User> = {
  displayName: "Unknown User",
  aiEnabled: false,
  stats: DEFAULT_USER_STATS,
  lastActive: 0,
  isNew: false // *** เพิ่ม default value สำหรับ isNew ***
};

export const DEFAULT_PAGINATION: PaginationInfo = {
  page: 1,
  limit: 20,
  total: 0,
  pages: 0,
  hasNext: false,
  hasPrev: false
};

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  category: '',
  priceMin: undefined,
  priceMax: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  limit: 20,
  offset: 0
};

export const DEFAULT_WEBSOCKET_CONFIG: WebSocketConfig = {
  adminReviewDelay: 30000,
  adminTypingTimeout: 10000,
  aiProcessingTimeout: 60000,
  autoSendDelay: 5000,
  enableAdminReview: true,
  enableAutoSend: true,
  reconnectAttempts: 5,
  reconnectDelay: 1000
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  desktop: true,
  email: false,
  types: {
    newMessage: true,
    newUser: true,
    aiResponse: true,
    systemAlert: true
  }
};

export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: true,
  schedule: '0 2 * * *', // Daily at 2 AM
  retentionDays: 30,
  includeImages: true,
  includeMessages: true,
  includeUsers: true,
  includeProducts: true,
  compressionLevel: 6,
  encryptionEnabled: false
};

// Export all types for easy importing (already done by using 'export interface/type')

// Helper functions for working with types
export const createDefaultUser = (userId: string, displayName: string): User => ({
  userId,
  displayName,
  lastActive: Date.now(),
  aiEnabled: true,
  stats: DEFAULT_USER_STATS,
  isNew: true
});

export const createMessage = (
  messageId: string,
  content: string,
  role: MessageRole,
  userId?: string,
  senderProfile?: UserProfile
): Message => ({
  messageId,
  content,
  timestamp: Date.now(),
  role,
  userId,
  senderProfile,
  source: role === 'admin' ? 'admin-ui' : role === 'ai' ? 'ai' : 'line'
});

export const createApiResponse = <T>(
  success: boolean,
  data: T | null,
  message?: string,
  error?: string
): ApiResponse<T> => ({
  success,
  data,
  message,
  error,
  timestamp: Date.now()
});

export interface ImageData {
  filename: string;
  url: string;
  localPath?: string;
  size?: number;
  selected?: boolean;
  selectionOrder?: number;
  isPrimary?: boolean;
  alt?: string;
  title?: string;
  status?: 'downloaded' | 'failed' | 'skipped';
  downloadedAt?: string;
  source?: string;
}

export interface ImageConfig {
  enabled: boolean;
  maxImagesPerProduct: number;
  preventDuplicateSends: boolean;
  autoSendOnUrlDetection: boolean;
  imageSelectionMode: 'manual' | 'primary_first' | 'all' | 'random';
  sendDelay: number;
  imageDisplayMode: 'individual' | 'carousel' | 'flex';
  useOriginalImages: boolean;
}

export interface ImageStatistics {
  totalUsers: number;
  totalProducts: number;
  totalImages: number;
  totalImagesSent: number;
  averageImagesPerProduct: number;
  topProducts: Array<{
    productUrl: string;
    imagesSent: number;
    lastSent: string;
  }>;
}

export interface CustomImageConfiguration {
  productUrl: string;
  selectedImages: string[];
  imageOrder: { [key: string]: number };
  maxImages: number;
  selectionMode: string;
  lastUpdated: string;
  quickSelection?: boolean;
}

export interface Alert {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}

export const createNotification = (
  type: NotificationType,
  title: string,
  message: string,
  duration?: number
): Notification => ({
  id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  title,
  message,
  timestamp: Date.now(),
  read: false,
  duration: duration || (type === 'error' ? 0 : 5000)
});

// Validation helpers
export const validateUser = (user: Partial<User>): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!user.userId) {
    errors.push({ field: 'userId', message: 'User ID is required' });
  }
  
  if (!user.displayName) {
    errors.push({ field: 'displayName', message: 'Display name is required' });
  }
  
  return errors;
};

export const validateMessage = (message: Partial<Message>): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!message.content) {
    errors.push({ field: 'content', message: 'Message content is required' });
  }
  
  if (!message.role || !isValidMessageRole(message.role)) {
    errors.push({ field: 'role', message: 'Valid message role is required' });
  }
  
  return errors;
};

// Export type utilities
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

export type NonNullable<T> = T extends null | undefined ? never : T;