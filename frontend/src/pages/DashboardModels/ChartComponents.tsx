// DashboardModels/ChartComponents.tsx

import React, { useState, useCallback } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Sector
} from 'recharts';

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} fontSize={16} fontWeight="bold">
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">{`${value} รายการ`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`(${(percent * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

// NEW: Interest Level Chart - กราฟแสดงระดับความสนใจ
export const InterestChart: React.FC<{ data: any }> = ({ data }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, []);

  if (!data) {
    return <div className="text-center p-4">ไม่มีข้อมูลความสนใจ</div>;
  }

  const chartData = [
    { name: 'ความสนใจสูง', value: data.highInterestCount || 0, color: '#28a745' },
    { name: 'ความสนใจปานกลาง', value: data.mediumInterestCount || 0, color: '#17a2b8' },
    { name: 'ความสนใจต่ำ', value: data.lowInterestCount || 0, color: '#ffc107' },
    { name: 'ไม่มีความสนใจ', value: data.noInterestCount || 0, color: '#6c757d' },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <div className="text-center p-4">ไม่มีข้อมูลความสนใจ</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          activeShape={renderActiveShape}
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          dataKey="value"
          onMouseEnter={onPieEnter}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color}
              stroke={index === activeIndex ? '#000' : 'none'}
              strokeWidth={index === activeIndex ? 2 : 0}
            />
          ))}
        </Pie>
        <Legend iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
};

// NEW: Movement Status Chart - กราฟแสดงสถานะการเคลื่อนไหว
export const MovementStatusChart: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="text-center p-4">ไม่มีข้อมูลการเคลื่อนไหว</div>;
  }

  const clean = (val: any) => Number(val) || 0;

  const chartData = [
    { name: 'เคลื่อนไหวสูง', value: clean(data.highMovementCount), color: '#198754' },
    { name: 'เคลื่อนไหวปานกลาง', value: clean(data.mediumMovementCount), color: '#20c997' },
    { name: 'เคลื่อนไหวต่ำ', value: clean(data.lowMovementCount), color: '#ffc107' },
    { name: 'ไม่มีการเคลื่อนไหว', value: clean(data.noMovementCount), color: '#dc3545' },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <div className="text-center p-4">ไม่มีข้อมูลการเคลื่อนไหว</div>;
  }
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" name="จำนวนสินค้า" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const StockLevelChart: React.FC<{ data: any }> = ({ data }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const onPieEnter = useCallback((_: any, index: number) => {
    setActiveIndex(index);
  }, []);

  if (!data) {
    return <div className="text-center p-4">ไม่มีข้อมูลสินค้า</div>;
  }

  const chartData = [
    { name: 'ปกติ', value: Math.max(0, (data.normalCount || 0)), color: '#28a745' },
    { name: 'สต็อกต่ำ', value: data.lowStockCount || 0, color: '#ffc107' },
    { name: 'Dead Stock', value: data.deadStockCount || 0, color: '#6c757d' },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <div className="text-center p-4">ไม่มีข้อมูลสต็อกสินค้า</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          activeShape={renderActiveShape}
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          dataKey="value"
          onMouseEnter={onPieEnter}
        >
          {chartData.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color}
              stroke={index === activeIndex ? '#000' : 'none'}
              strokeWidth={index === activeIndex ? 2 : 0}
            />
          ))}
        </Pie>
        <Legend iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const StockMovementChart: React.FC<{ data: any }> = ({ data }) => {
  if (!data) {
    return <div className="text-center p-4">ไม่มีข้อมูลการเคลื่อนไหว</div>;
  }

  const clean = (val: any) => Number(val) || 0;

  const chartData = [
    { name: 'ปกติ', value: clean(data.normalCount), color: '#198754' },
    { name: 'ช้า', value: clean(data.slowMoveCount), color: '#ffc107' },
    { name: 'ช้ามาก', value: clean(data.verySlowMove1Count) + clean(data.verySlowMove2Count) + clean(data.verySlowMove3Count), color: '#fd7e14' },
    { name: 'ไม่เคลื่อนไหว', value: clean(data.deadStockCount), color: '#dc3545' },
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <div className="text-center p-4">ไม่มีข้อมูลการเคลื่อนไหว</div>;
  }
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" name="จำนวนสินค้า" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};