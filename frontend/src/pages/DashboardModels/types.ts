// DashboardModels/types.ts

export interface ProductData {
  id: number;
  name: string;
  product_name?: string;
  sku: string;
  category: string;
  stock: number;
  stock_quantity?: number;
  totalInteractions?: number;
  total_interactions?: number;
  averageRelevance?: number;
  average_relevance?: number;
  salesVelocity?: number;
  totalSold?: number;
  hotScore?: number;
  interestLevel?: string;
  hasStoredStock?: boolean;
  movementAnalysis?: any;
  stock_data?: any;
  url?: string;
  daysSinceLastRestock?: number;
  lastRestockDate?: string;
  userCount?: number;
  stockSyncTimestamp?: string;
  recentActivity?: boolean;
  orderCompletions?: number;
  averageOrderSize?: number;
  lastMovementDate?: string;
}

export interface SearchFilters {
  q: string;
  category: string;
  minStock: string;
  maxStock: string;
  minRelevance: string;
  maxRelevance: string;
  minSalesVelocity: string;
  maxSalesVelocity: string;
  interestLevel: string;
  movementLevel: string;
  slowMoveCategory: string;
  hasStockHistory: boolean;
  needsSync: boolean;
}

export interface SyncResult {
  message?: string;
  success?: boolean;
}