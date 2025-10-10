// src/services/apiCore.ts

// Define API Response interface with proper generic constraints
export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  message?: string;
  error?: string;
  status: number;
}

export const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Normalize API URLs so callers can pass relative paths.
export const buildApiUrl = (url: string): string => {
  if (/^https?:/i.test(url)) {
    return url;
  }
  if (url.startsWith('/')) {
    return `${BASE_URL}${url}`;
  }
  return `${BASE_URL}/${url}`;
};

// Helper function to get auth headers for JSON requests
export const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Helper function to get auth headers for file uploads (no Content-Type)
export const getAuthHeadersForFiles = () => {
  const token = localStorage.getItem('auth_token');
  return {
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Low-level fetch wrapper that always injects the bearer token when present.
export const authorizedFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return fetch(buildApiUrl(url), {
    ...options,
    headers
  });
};

// Generic API call function for JSON APIs
export const apiCall = async <T = any>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
  try {
    const fullUrl = buildApiUrl(url);

    // Debug logging
    if (process.env.REACT_APP_DEBUG) {
      console.log('🔍 API Call:', { 
        url: fullUrl, 
        method: options.method || 'GET',
        hasBody: !!options.body,
        headers: options.headers
      });
    }

    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        ...getAuthHeaders(), // Default headers for JSON
        ...options.headers, // Allow overriding headers
      },
    });

    // Debug response
    if (process.env.REACT_APP_DEBUG) {
      console.log('📡 API Response:', { 
        status: response.status, 
        ok: response.ok,
        statusText: response.statusText
      });
    }

    // Parse response
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      data = { error: 'Invalid JSON response' };
    }

    // Debug data
    if (process.env.REACT_APP_DEBUG) {
      console.log('📄 API Data:', data);
    }

    // Handle authentication errors
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }

    if (!response.ok) {
      return {
        success: false,
        data: null,
        message: data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        error: data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status
      };
    }

    return {
      success: true,
      data: data as T,
      message: data.message,
      status: response.status
    };
  } catch (error) {
    console.error('❌ API Call Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
    return {
      success: false,
      data: null,
      message: errorMessage,
      error: errorMessage,
      status: 0
    };
  }
};

// Special API call for file uploads
export const apiCallFile = async <T = any>(url: string, formData: FormData): Promise<ApiResponse<T>> => {
  try {
    const fullUrl = buildApiUrl(url);
    
    if (process.env.REACT_APP_DEBUG) {
      console.log('📁 File Upload API Call:', { url: fullUrl });
    }

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: getAuthHeadersForFiles(), // No Content-Type for FormData
      body: formData
    });

    if (process.env.REACT_APP_DEBUG) {
      console.log('📡 File Upload Response:', { 
        status: response.status, 
        ok: response.ok 
      });
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      data = { error: 'Invalid JSON response' };
    }

    if (process.env.REACT_APP_DEBUG) {
      console.log('📄 File Upload Data:', data);
    }

    // Handle authentication errors
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Session expired');
    }

    if (!response.ok) {
      return {
        success: false,
        data: null,
        message: data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        error: data.error || data.message || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status
      };
    }

    return {
      success: true,
      data: data as T,
      message: data.message,
      status: response.status
    };
  } catch (error) {
    console.error('❌ File Upload API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
    return {
      success: false,
      data: null,
      message: errorMessage,
      error: errorMessage,
      status: 0
    };
  }
};

// Utility functions for API
export const apiUtils = {
  // Helper to build query strings
  buildQueryString: (params: Record<string, any>): string => {
    const filtered = Object.entries(params).filter(([_, value]) => value !== undefined && value !== null);
    return new URLSearchParams(filtered.map(([key, value]) => [key, String(value)])).toString();
  },

  // Helper to handle file downloads
  downloadFile: async (url: string, filename?: string): Promise<void> => {
    try {
      const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
      const response = await fetch(fullUrl, {
        headers: getAuthHeadersForFiles()
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      if (filename) {
        link.download = filename;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  },

  // Helper to format file size
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Helper to validate file type
  validateFileType: (file: File, allowedTypes: string[]): boolean => {
    return allowedTypes.includes(file.type);
  },

  // Helper to validate file size
  validateFileSize: (file: File, maxSizeInMB: number): boolean => {
    return file.size <= maxSizeInMB * 1024 * 1024;
  },

  // Helper to format currency
  formatCurrency: (amount: number, currency: string = 'THB'): string => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: currency
    }).format(amount);
  },

  // Helper to format date
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return dateObj.toLocaleDateString('th-TH', { ...defaultOptions, ...options });
  },

  // Helper to debounce API calls
  debounce: <T extends (...args: any[]) => any>(func: T, wait: number): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(null, args), wait);
    };
  },

  // Helper to retry API calls
  retryApiCall: async <T>(
    apiFunction: () => Promise<ApiResponse<T>>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<ApiResponse<T>> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await apiFunction();
        if (result.success || attempt === maxRetries) {
          return result;
        }
      } catch (error) {
        if (attempt === maxRetries) {
           if (error instanceof Error) {
             return { success: false, data: null, message: error.message, error: error.message, status: 0 };
           }
           return { success: false, data: null, message: 'An unknown error occurred during retry', error: String(error), status: 0 };
        }
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
    throw new Error('Max retries exceeded');
  },

  // Helper to handle pagination
  handlePagination: (currentPage: number, totalPages: number, delta: number = 2) => {
    const range: (string | number)[] = [];
    if (totalPages <= 0) return range;

    // Always show the first page
    range.push(1);

    let left = Math.max(2, currentPage - delta);
    let right = Math.min(totalPages - 1, currentPage + delta);

    if (left > 2) {
        range.push('...');
    }

    for (let i = left; i <= right; i++) {
        range.push(i);
    }

    if (right < totalPages - 1) {
        range.push('...');
    }

    // Always show the last page if it's not the first page
    if (totalPages > 1) {
        range.push(totalPages);
    }
    
    // Deduplicate and ensure logical consistency
    const finalRange: (string | number)[] = [];
    if (range.length > 0) {
        finalRange.push(range[0]);
        for (let i = 1; i < range.length; i++) {
            // Skip consecutive '...'
            if (range[i] === '...' && finalRange[finalRange.length-1] === '...') {
                continue;
            }
            // Skip if current number is not greater than last added number (for sorted numbers)
            if (typeof range[i] === 'number' && typeof finalRange[finalRange.length-1] === 'number' && (range[i] as number) <= (finalRange[finalRange.length-1] as number)) {
                 continue;
            }
            finalRange.push(range[i]);
        }
    }
    
    // Further clean up for cases like [1, "...", 2] or [N-1, "...", N]
    if (finalRange.includes('...') && finalRange.length > 2) {
        for(let i = 0; i < finalRange.length - 2; i++) {
            if(typeof finalRange[i] === 'number' && finalRange[i+1] === '...' && typeof finalRange[i+2] === 'number') {
                if((finalRange[i+2] as number) - (finalRange[i] as number) < 2 ) {
                     finalRange.splice(i+1, 1);
                } else if ((finalRange[i+2] as number) - (finalRange[i] as number) === 2) {
                    finalRange[i+1] = (finalRange[i] as number) + 1;
                }
            }
        }
    }
    return finalRange;
  },

  // Helper to validate API response
  validateResponse: <T>(response: ApiResponse<T>): T => {
    if (!response.success) {
      throw new Error(response.error || response.message || 'API call failed');
    }
    if (response.data === null || response.data === undefined) {
      throw new Error('No data received from API');
    }
    return response.data;
  },

  // Helper to create abort controller with timeout
  createTimeoutController: (timeoutMs: number = 30000): AbortController => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeoutMs);
    return controller;
  },

  // Helper to convert File to base64
  fileToBase64: (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  },

  // Helper to convert base64 to blob
  base64ToBlob: (base64: string, mimeType: string = 'application/octet-stream'): Blob => {
    const byteCharacters = atob(base64.split(',')[1] || base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
};

// Constants for API configuration
export const API_CONFIG = {
  DEFAULT_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  SUPPORTED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  PAGINATION_LIMITS: {
    MIN: 1,
    MAX: 100,
    DEFAULT: 20
  }
} as const;

// Error classes for better error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network error occurred') {
    super(message);
    this.name = 'NetworkError';
  }
}

// Type guards for API responses
export const isApiError = (error: any): error is ApiError => {
  return error instanceof ApiError;
};

export const isValidationError = (error: any): error is ValidationError => {
  return error instanceof ValidationError;
};

export const isNetworkError = (error: any): error is NetworkError => {
  return error instanceof NetworkError;
};
