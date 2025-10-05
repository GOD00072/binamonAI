// DashboardModels/formatters.tsx

import React from 'react';
import { Badge } from 'react-bootstrap';

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
  return level ? 
    <Badge bg={level.bg} text={level.text}>{`${level.label} (${daysSince} วัน)`}</Badge> : 
    <Badge bg="secondary">No Data</Badge>;
};

export const formatHotScore = (score: number | string) => {
  const scoreNum = Number(score) || 0;
  return scoreNum > 0 ? <Badge bg="danger">🔥 {scoreNum.toFixed(1)}/100</Badge> : null;
};

export const formatMovementStats = (product: any) => {
  if (!product.salesVelocity && !product.totalSold) {
    return null;
  }
  
  return (
    <div>
      {product.salesVelocity > 0 && (
        <Badge bg="info">📈 {product.salesVelocity} units/day</Badge>
      )}
      {product.totalSold > 0 && (
        <><br /><small className="text-muted">📊 Total: {product.totalSold} units</small></>
      )}
      {product.recentActivity && (
        <><br /><Badge bg="success">⚡ Recent Activity</Badge></>
      )}
    </div>
  );
};

export const formatMovementHistory = (product: any) => {
  if (!product.stock_data || !product.stock_data.movement_history || product.stock_data.movement_history.length === 0) {
    return null;
  }
  
  const movements = product.stock_data.movement_history.slice(0, 3);
  return (
    <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
      <strong>📊 Recent Movement:</strong>
      {movements.map((movement: any, index: number) => {
        const changeIcon = movement.change_type === 'increase' ? '📈' : '📉';
        const bgColor = movement.change_type === 'increase' ? '#d4edda' : '#f8d7da';
        return (
          <div key={index} style={{ backgroundColor: bgColor, padding: '2px 5px', margin: '1px 0', borderRadius: '3px' }}>
            {changeIcon} {movement.old_stock} → {movement.new_stock} ({movement.change_amount > 0 ? '+' : ''}{movement.change_amount})
          </div>
        );
      })}
    </div>
  );
};