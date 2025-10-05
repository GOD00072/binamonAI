// src/utils/env.ts
import React from 'react';

export const isDevelopment = (): boolean => {
  return (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '' ||
    window.location.port === '3000' ||
    window.location.port === '3'
  );
};

export const getVersion = (): string => {
  return '1.0.0';
};

export const getBrowserInfo = (): string => {
  return navigator.userAgent;
};

export const getReactVersion = (): string => {
  return React.version || 'Unknown';
};

export const getEnvironmentInfo = () => {
  return {
    isDev: isDevelopment(),
    version: getVersion(),
    reactVersion: getReactVersion(),
    userAgent: getBrowserInfo(),
    hostname: window.location.hostname,
    port: window.location.port
  };
};