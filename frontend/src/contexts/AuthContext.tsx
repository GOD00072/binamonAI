// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, systemApi } from '../services/api'; // ใช้ import ใหม่
import type { User, SystemHealth, ApiResponse } from '../types';

// Helper to create a default/error SystemHealth object
const createDefaultErrorSystemHealthForAuth = (statusValue: SystemHealth['status'] = 'unknown'): SystemHealth => ({
    status: statusValue,
    timestamp: Date.now(),
    system: {
        uptime: 0,
        memory: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 },
        cpu: { user: 0, system: 0 },
        platform: 'N/A',
        nodeVersion: 'N/A'
    },
    services: {
        webSocket: { status: 'unknown', connections: 0 },
        lineHandler: { status: 'unknown', aiEnabled: false },
        aiAssistant: { status: 'unknown', model: 'N/A' },
        chatHistory: { status: 'unknown' }
    }
});

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    systemHealth: SystemHealth | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    fetchProfile: () => Promise<void>;
    fetchSystemHealth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

    const fetchProfile = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await authApi.getProfile();
            if (response.success && response.data) {
                setUser(response.data);
                setIsAuthenticated(true);
                localStorage.setItem('user_data', JSON.stringify(response.data));
            } else {
                setUser(null);
                setIsAuthenticated(false);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            setUser(null);
            setIsAuthenticated(false);
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchSystemHealth = useCallback(async () => {
        try {
            const response: ApiResponse<SystemHealth> = await systemApi.getSystemHealth();
            if (response.success && response.data) {
                setSystemHealth(response.data);
            } else {
                console.warn('Failed to fetch system health for AuthContext:', response.message || response.error);
                setSystemHealth(createDefaultErrorSystemHealthForAuth('degraded'));
            }
        } catch (error) {
            console.error('Error fetching system health for AuthContext:', error);
            setSystemHealth(createDefaultErrorSystemHealthForAuth('error'));
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            fetchProfile();
            fetchSystemHealth();
        } else {
            setIsLoading(false);
        }
    }, [fetchProfile, fetchSystemHealth]);

    const login = async (username: string, password: string) => {
        setIsLoading(true);
        try {
            const data = await authApi.login(username, password);
            if (data.token) {
                localStorage.setItem('auth_token', data.token);
                await fetchProfile();
                await fetchSystemHealth();
            } else {
                throw new Error('Login failed: No token received');
            }
        } catch (error: any) {
            console.error('Login error:', error);
            setIsAuthenticated(false);
            throw new Error(error.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setUser(null);
            setIsAuthenticated(false);
            setSystemHealth(null);
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            if (typeof window !== 'undefined') {
                window.location.href = '/login';
            }
        }
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            isAuthenticated, 
            isLoading, 
            systemHealth, 
            login, 
            logout, 
            fetchProfile, 
            fetchSystemHealth 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};