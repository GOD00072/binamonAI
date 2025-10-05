// src/types/alert.ts
export interface Alert {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  message: string;
}