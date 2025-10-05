import { Badge } from 'react-bootstrap';
import React from 'react';

export const formatStockStatus = (product: any) => {
  if (!product || typeof product !== 'object') {
    return <Badge bg="secondary">ไม่มีข้อมูล</Badge>;
  }
  if (!product.hasStoredStock) {
    return <Badge bg="danger">Not Synced</Badge>;
  }
  if (product.stockSyncTimestamp) {
    const lastUpdated = new Date(product.stockSyncTimestamp);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (lastUpdated < oneWeekAgo) {
      return <Badge bg="warning" text="dark">Outdated</Badge>;
    }
  }
  return <Badge bg="success">Synced</Badge>;
};

export const formatInterestLevel = (relevance: number | string) => {
  const relevanceNum = Number(relevance) || 0;
  if (relevanceNum > 0.7) {
    return <Badge bg="success">สูง</Badge>;
  } else if (relevanceNum > 0.5) {
    return <Badge bg="info">ปานกลาง</Badge>;
  } else if (relevanceNum > 0.25) {
    return <Badge bg="warning" text="dark">ต่ำ</Badge>;
  } else {
    return <Badge bg="secondary">ไม่มี</Badge>;
  }
};

export const formatSlowMoveCategory = (movementAnalysis: any) => {
  if (!movementAnalysis || !movementAnalysis.ageAnalysis) {
    return <Badge bg="success">Normal</Badge>;
  }
  const { slowMoveLevel } = movementAnalysis.ageAnalysis;
  const daysSince = movementAnalysis.daysSinceLastMovement || 0;
  
  const levels: Record<string, { bg: string, text: string, label: string }> = {
    'normal': { bg: 'success', text: 'white', label: 'Normal' },
    'slow-move': { bg: 'warning', text: 'dark', label: 'Slow' },
    'very-slow-move-1': { bg: 'danger', text: 'white', label: 'Very Slow #1' },
    'very-slow-move-2': { bg: 'danger', text: 'white', label: 'Very Slow #2' },
    'very-slow-move-3': { bg: 'danger', text: 'white', label: 'Very Slow #3' },
    'dead-stock': { bg: 'dark', text: 'white', label: 'Dead Stock' }
  };

  const level = levels[slowMoveLevel];
  return level ? <Badge bg={level.bg} text={level.text}>{`${level.label} (${daysSince} วัน)`}</Badge> : <Badge bg="secondary">No Data</Badge>;
};

export const formatHotScore = (score: number | string) => {
  const scoreNum = Number(score) || 0;
  return scoreNum > 0 ? <Badge bg="danger">🔥 {scoreNum}/100</Badge> : null;
};

export const formatMovementHistory = (product: any) => {
  if (!product.stock_data?.movement_history?.length) {
    return null;
  }

  return (
    <div className="movement-history small text-muted mt-1">
      <div>Last movement: {new Date(product.stock_data.movement_history[0].created_at).toLocaleDateString('th-TH')}</div>
    </div>
  );
};
