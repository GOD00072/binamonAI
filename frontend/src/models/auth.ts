export interface Permission {
    id: string;
    name: string;
    description?: string;
}

export interface RolePermission {
    permission: Permission;
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    permissions: RolePermission[];
}

export interface AuthUser {
    id: string;
    username: string;
    employeeId: string;
    roleId: string;
    role: Role;
    createdAt: string;
    updatedAt: string;
}