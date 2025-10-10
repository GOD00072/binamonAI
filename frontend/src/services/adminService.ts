import axios from 'axios';
import { AuthUser, Role, Permission } from '../models/auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };
};

// User Management
export const getUsers = async (): Promise<AuthUser[]> => {
    const response = await axios.get(`${API_URL}/auth/users`, getAuthHeaders());
    return response.data;
};

export const createUser = async (userData: any): Promise<AuthUser> => {
    const response = await axios.post(`${API_URL}/auth/users`, userData, getAuthHeaders());
    return response.data.user;
};

export const updateUser = async (id: string, userData: any): Promise<AuthUser> => {
    const response = await axios.put(`${API_URL}/auth/users/${id}`, userData, getAuthHeaders());
    return response.data.user;
};

export const deleteUser = async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/auth/users/${id}`, getAuthHeaders());
};

// Role Management
export const getRoles = async (): Promise<Role[]> => {
    const response = await axios.get(`${API_URL}/roles`, getAuthHeaders());
    return response.data;
};

export const createRole = async (roleData: any): Promise<Role> => {
    const response = await axios.post(`${API_URL}/roles`, roleData, getAuthHeaders());
    return response.data;
};

export const updateRole = async (id: string, roleData: any): Promise<Role> => {
    const response = await axios.put(`${API_URL}/roles/${id}`, roleData, getAuthHeaders());
    return response.data;
};

export const deleteRole = async (id: string): Promise<void> => {
    await axios.delete(`${API_URL}/roles/${id}`, getAuthHeaders());
};

export const assignPermissionsToRole = async (roleId: string, permissionIds: string[]): Promise<Role> => {
    const response = await axios.post(`${API_URL}/roles/${roleId}/permissions`, { permissionIds }, getAuthHeaders());
    return response.data;
};

// Permission Management
export const getPermissions = async (): Promise<Permission[]> => {
    const response = await axios.get(`${API_URL}/roles/permissions`, getAuthHeaders());
    return response.data;
};