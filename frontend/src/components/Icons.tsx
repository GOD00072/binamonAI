import React from 'react';

interface IconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  style?: React.CSSProperties;
}

const getIconSize = (size: string = 'md') => {
  switch (size) {
    case 'sm': return '16';
    case 'lg': return '24';
    case 'xl': return '32';
    default: return '20';
  }
};

export const DashboardIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" fill={color}/>
    </svg>
  );
};

export const ChatIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" fill={color}/>
    </svg>
  );
};

export const ProductIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4V6zm8 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h4v1a1 1 0 0 0 2 0V9h2v10z" fill={color}/>
    </svg>
  );
};

export const SettingsIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill={color}/>
    </svg>
  );
};

export const UserIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill={color}/>
    </svg>
  );
};

export const EmailIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill={color}/>
    </svg>
  );
};

export const SearchIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill={color}/>
    </svg>
  );
};

export const AddIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill={color}/>
    </svg>
  );
};

export const EditIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill={color}/>
    </svg>
  );
};

export const DeleteIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill={color}/>
    </svg>
  );
};

export const RefreshIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill={color}/>
    </svg>
  );
};

export const SaveIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" fill={color}/>
    </svg>
  );
};

export const UploadIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill={color}/>
    </svg>
  );
};

export const DownloadIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" fill={color}/>
    </svg>
  );
};

export const FilterIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M10,18H14V16H10V18M3,6V8H21V6H3M6,13H18V11H6V13Z" fill={color}/>
    </svg>
  );
};

export const SortIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M3,13H15V11H3M3,6V8H21V6M3,18H9V16H3V18Z" fill={color}/>
    </svg>
  );
};

export const InfoIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M13,17H11V11H13M13,9H11V7H13" fill={color}/>
    </svg>
  );
};

export const WarningIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill={color}/>
    </svg>
  );
};

export const SuccessIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill={color}/>
    </svg>
  );
};

export const ErrorIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={color}/>
    </svg>
  );
};

export const MenuIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill={color}/>
    </svg>
  );
};

export const CloseIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill={color}/>
    </svg>
  );
};

export const ArrowLeftIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill={color}/>
    </svg>
  );
};

export const ArrowRightIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M4 11v2h12.17l-5.59 5.59L12 20l8-8-8-8-1.41 1.41L16.17 11H4z" fill={color}/>
    </svg>
  );
};

export const ArrowUpIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" fill={color}/>
    </svg>
  );
};

export const ArrowDownIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill={color}/>
    </svg>
  );
};

export const CalendarIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill={color}/>
    </svg>
  );
};

export const ClockIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.7L16.2,16.2Z" fill={color}/>
    </svg>
  );
};

export const ImageIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill={color}/>
    </svg>
  );
};

export const FileIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill={color}/>
    </svg>
  );
};

export const FolderIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z" fill={color}/>
    </svg>
  );
};

export const HeartIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5 2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z" fill={color}/>
    </svg>
  );
};

export const StarIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.46,13.97L5.82,21L12,17.27Z" fill={color}/>
    </svg>
  );
};

export const ChartIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" fill={color}/>
    </svg>
  );
};

export const BellIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill={color}/>
    </svg>
  );
};

export const LinkIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" fill={color}/>
    </svg>
  );
};

export const CopyIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill={color}/>
    </svg>
  );
};

export const SendIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="m2 21 21-9L2 3v7l15 2-15 2v7z" fill={color}/>
    </svg>
  );
};

export const BarChartIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z" fill={color}/>
    </svg>
  );
};

export const PeopleIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8H17.5c-.83 0-1.54.5-1.84 1.22L14.5 12.5h1.5l.5-1.5h1.5V18h2zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zm1.5 1h-3C9.57 12.5 8.5 13.57 8.5 15v.5h8V15c0-1.43-1.07-2.5-2.5-2.5zM5.5 6c1.11 0 2-.89 2-2s-.89-2-2-2-2 .89-2 2 .89 2 2 2zm2 16v-7H9V9.5c0-.83-.67-1.5-1.5-1.5H4c-.83 0-1.5.67-1.5 1.5V15H4v7h3.5z" fill={color}/>
    </svg>
  );
};

export const AddBusinessIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M15 17h3v2h-3zm0-4h3v2h-3zm0-4h3v2h-3zM3 13h3v2H3zm0-4h3v2H3zm0-4h3v2H3zm12 0h-2v2h2v2h-2v2h2v2h-2v2h2v2h-2v2h4V5z" fill={color}/>
    </svg>
  );
};

export const SyncIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill={color}/>
    </svg>
  );
};

export const LinkOffIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.96l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4.01 1.41-1.41L3.41 2.86 2 4.27z" fill={color}/>
    </svg>
  );
};

export const CameraAltIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="3.2" fill={color}/>
      <path d="m9 2 1.17 1H14.83L16 2h2c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h3zm3 15c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5z" fill={color}/>
    </svg>
  );
};

export const VisibilityIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill={color}/>
    </svg>
  );
};

export const OpenInNewIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" fill={color}/>
    </svg>
  );
};

export const WarningAmberIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z" fill={color}/>
    </svg>
  );
};

export const CycloneIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill={color}/>
      <path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10zm-2 0c0-4.4-3.6-8-8-8s-8 3.6-8 8 3.6 8 8 8 8-3.6 8-8z" fill={color}/>
    </svg>
  );
};

export const SmartToyIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zM7.5 16.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3.5-4h2v2h-2v-2zm5.5 4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill={color}/>
    </svg>
  );
};

export const InventoryIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zM19 20H5V9h14v11zm1-13H4V4h16v3z" fill={color}/>
    </svg>
  );
};

export const GroupIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8H17.5c-.8 0-1.54.37-2.01 1.01L14 12l2.5-1.5v6.5h-2v6h6v-6h-1zm-12.5 0v-6h2l-2.54-7.63A1.5 1.5 0 0 0 5.54 8H4.5c-.8 0-1.54.37-2.01 1.01L1 12l2.5-1.5v6.5h-2v6h6v-6h-1.5zM12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5zm-2 8.5v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 8.54 12H7.5c-.8 0-1.54.37-2.01 1.01L4 16l2.5-1.5v6.5h-2v6h6v-6h-1.5z" fill={color}/>
    </svg>
  );
};

export const TrendingUpIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="m16 6 2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" fill={color}/>
    </svg>
  );
};

export const ReportProblemIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M15.73 3H8.27L3 8.27v7.46L8.27 21h7.46L21 15.73V8.27L15.73 3zM12 17.3c-.72 0-1.3-.58-1.3-1.3 0-.72.58-1.3 1.3-1.3.72 0 1.3.58 1.3 1.3 0 .72-.58 1.3-1.3 1.3zm1-4.3h-2V7h2v6z" fill={color}/>
    </svg>
  );
};

export const LocalFireDepartmentIcon: React.FC<IconProps> = ({ className = '', size = 'md', color = 'currentColor', style }) => {
  const iconSize = getIconSize(size);
  return (
    <svg className={`icon ${className}`} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23-.1-.1-.26-.04-.31.07-1.17 3.79-6.14 3.93-5.81 9.12-.02.14-.17.23-.3.18-.62-.23-1.22-.78-1.67-1.5-.09-.15-.26-.15-.35 0-.87 1.42-1.39 3.03-1.52 4.65C3.57 18.42 7.4 22 12 22s8.43-3.58 7.29-7.23c-.13-1.62-.65-3.23-1.52-4.65-.09-.15-.26-.15-.35 0-.45.72-1.05 1.27-1.67 1.5-.13.05-.28-.04-.3-.18zM13.5 17.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zm-3-1c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5z" fill={color}/>
    </svg>
  );
};

const IconExports = {
  DashboardIcon,
  ChatIcon,
  ProductIcon,
  SettingsIcon,
  UserIcon,
  EmailIcon,
  SearchIcon,
  AddIcon,
  EditIcon,
  DeleteIcon,
  RefreshIcon,
  SaveIcon,
  UploadIcon,
  DownloadIcon,
  FilterIcon,
  SortIcon,
  InfoIcon,
  WarningIcon,
  SuccessIcon,
  ErrorIcon,
  MenuIcon,
  CloseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CalendarIcon,
  ClockIcon,
  ImageIcon,
  FileIcon,
  FolderIcon,
  HeartIcon,
  StarIcon,
  ChartIcon,
  BellIcon,
  LinkIcon,
  CopyIcon,
  SendIcon,
  BarChartIcon,
  PeopleIcon,
  AddBusinessIcon,
  SyncIcon,
  LinkOffIcon,
  CameraAltIcon,
  VisibilityIcon,
  OpenInNewIcon,
  WarningAmberIcon,
  CycloneIcon,
  SmartToyIcon,
  InventoryIcon,
  GroupIcon,
  TrendingUpIcon,
  ReportProblemIcon,
  LocalFireDepartmentIcon
};

export default IconExports;