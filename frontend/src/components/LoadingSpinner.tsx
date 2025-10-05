import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
  variant?: 'default' | 'dots' | 'pulse' | 'gradient';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  message,
  className = '',
  variant = 'default'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12'
  };

  const renderSpinner = () => {
    switch (variant) {
      case 'dots':
        return (
          <div className="flex space-x-1 justify-center items-center">
            <div className={`${sizeClasses[size]} bg-blue-500 rounded-full animate-bounce`} style={{ animationDelay: '0ms' }}></div>
            <div className={`${sizeClasses[size]} bg-blue-500 rounded-full animate-bounce`} style={{ animationDelay: '150ms' }}></div>
            <div className={`${sizeClasses[size]} bg-blue-500 rounded-full animate-bounce`} style={{ animationDelay: '300ms' }}></div>
          </div>
        );
        
      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} bg-blue-500 rounded-full animate-pulse mx-auto`}></div>
        );
        
      case 'gradient':
        return (
          <div className={`${sizeClasses[size]} mx-auto animate-spin`}>
            <div className="h-full w-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-75"></div>
            <div className="absolute top-1 left-1 h-6 w-6 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
          </div>
        );
        
      default:
        return (
          <div className={`${sizeClasses[size]} mx-auto`}>
            <div className="h-full w-full rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin"></div>
          </div>
        );
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center p-4 ${className}`}>
      <div className="relative">
        {renderSpinner()}
      </div>
      
      {message && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600 font-medium animate-pulse">
            {message}
          </p>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;