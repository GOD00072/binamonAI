// src/models/DashboardModels.ts
export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalMessages: number;
  totalProducts: number;
  totalRevenue: number;
  aiStatus: any;
  systemStatus: {
    webSocket: boolean;
    aiAssistant: boolean;
    lineHandler: boolean;
    chatHistory: boolean;
    ragSystem: boolean;
    productService: boolean;
  };
}

export interface ProductAnalysis {
  totalProducts: number;
  hotProducts: any[];
  qualityInteractions: any[];
  slowMoveCategories: {
    normal: any[];
    slowMove: any[];
    verySlowMove1: any[];
    verySlowMove2: any[];
    verySlowMove3: any[];
    deadStock: any[];
    noData: any[];
  };
  stockLevels: {
    low: any[];
    medium: any[];
    high: any[];
  };
  categories: Record<string, number>;
  summary: {
    totalProducts: number;
    totalInteractions: number;
    criticalSlowMoveCount: number;
    alertSlowMoveCount: number;
  };
}

export interface UserAnalytics {
  topUsers: any[];
  recentUsers: any[];
  userGrowth: number[];
  messageStats: {
    daily: number[];
    weekly: number[];
    monthly: number[];
  };
  revenueStats: {
    daily: number;
    weekly: number;
    monthly: number;
    total: number;
  };
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
  }[];
}