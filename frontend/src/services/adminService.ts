import { apiCall, ApiResponse, BASE_URL } from './apiCore';
import { Role, Permission, AuthUser } from '../models/auth';

// Role Management
export const getRoles = async (): Promise<Role[]> => {
  try {
    const response = await apiCall<Role[]>(`${BASE_URL}/api/roles`);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch roles');
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching roles:', error);
    throw error;
  }
};

export const createRole = async (roleData: { name: string; description?: string }): Promise<Role> => {
  try {
    const response = await apiCall<Role>(`${BASE_URL}/api/roles`, { method: 'POST', body: JSON.stringify(roleData) });
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to create role');
    }
    return response.data;
  } catch (error) {
    console.error('Error creating role:', error);
    throw error;
  }
};

export const updateRole = async (id: string, roleData: { name?: string; description?: string }): Promise<Role> => {
  try {
    const response = await apiCall<Role>(`${BASE_URL}/api/roles/${id}`, { method: 'PUT', body: JSON.stringify(roleData) });
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to update role');
    }
    return response.data;
  } catch (error) {
    console.error('Error updating role:', error);
    throw error;
  }
};

export const deleteRole = async (id: string): Promise<void> => {
  try {
    const response = await apiCall<void>(`${BASE_URL}/api/roles/${id}`, { method: 'DELETE' });
    if (!response.success) {
      throw new Error(response.message || 'Failed to delete role');
    }
  } catch (error) {
    console.error('Error deleting role:', error);
    throw error;
  }
};

export const getPermissions = async (): Promise<Permission[]> => {
  try {
    const response = await apiCall<Permission[]>(`${BASE_URL}/api/roles/permissions`);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch permissions');
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching permissions:', error);
    throw error;
  }
};

export const assignPermissionsToRole = async (roleId: string, permissionIds: string[]): Promise<Role> => {
  try {
    const response = await apiCall<Role>(`${BASE_URL}/api/roles/${roleId}/permissions`, { method: 'POST', body: JSON.stringify({ permissionIds }) });
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to assign permissions to role');
    }
    return response.data;
  } catch (error) {
    console.error('Error assigning permissions to role:', error);
    throw error;
  }
};

// Permission Management
export const createPermission = async (permissionData: { name: string; description?: string }): Promise<Permission> => {
  try {
    const response = await apiCall<Permission>(`${BASE_URL}/api/permissions`, { method: 'POST', body: JSON.stringify(permissionData) });
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to create permission');
    }
    return response.data;
  } catch (error) {
    console.error('Error creating permission:', error);
    throw error;
  }
};

export const updatePermission = async (id: string, permissionData: { name?: string; description?: string }): Promise<Permission> => {
  try {
    const response = await apiCall<Permission>(`${BASE_URL}/api/permissions/${id}`, { method: 'PUT', body: JSON.stringify(permissionData) });
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to update permission');
    }
    return response.data;
  } catch (error) {
    console.error('Error updating permission:', error);
    throw error;
  }
};

export const deletePermission = async (id: string): Promise<void> => {
  try {
    const response = await apiCall<void>(`${BASE_URL}/api/permissions/${id}`, { method: 'DELETE' });
    if (!response.success) {
      throw new Error(response.message || 'Failed to delete permission');
    }
  } catch (error) {
    console.error('Error deleting permission:', error);
    throw error;
  }
};

// User Management
export const getUsers = async (): Promise<AuthUser[]> => {
  try {
    const response = await apiCall<AuthUser[]>(`${BASE_URL}/api/auth/users`);
    if (!response.success || !response.data) {
      throw new Error(response.message || 'Failed to fetch users');
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

export const createUser = async (userData: { username: string; password: string; employeeId: string; roleId?: string; isActive?: boolean }): Promise<AuthUser> => {
  try {
    const response = await apiCall<{ success: boolean; user: AuthUser; message?: string }>(`${BASE_URL}/api/auth/users`, { method: 'POST', body: JSON.stringify(userData) });
    if (!response.success || !response.data?.success || !response.data.user) {
      throw new Error(response.data?.message || response.message || 'Failed to create user');
    }
    return response.data.user;
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const updateUser = async (id: string, userData: { username?: string; password?: string; employeeId?: string; roleId?: string; isActive?: boolean }): Promise<AuthUser> => {
  try {
    const response = await apiCall<{ success: boolean; user: AuthUser; message?: string }>(`${BASE_URL}/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(userData) });
    if (!response.success || !response.data?.success || !response.data.user) {
      throw new Error(response.data?.message || response.message || 'Failed to update user');
    }
    return response.data.user;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  try {
    const response = await apiCall<{ success: boolean; message?: string }>(`${BASE_URL}/api/auth/users/${id}`, { method: 'DELETE' });
    if (!response.success || !response.data?.success) {
      throw new Error(response.data?.message || response.message || 'Failed to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
};
