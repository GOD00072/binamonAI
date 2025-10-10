import React from 'react';
import { AuthUser } from '../models/auth';
import { Button, Space, Tag } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface UserTableProps {
    users: AuthUser[];
    onEdit: (user: AuthUser) => void;
    onDelete: (user: AuthUser) => void;
}

const UserTable: React.FC<UserTableProps> = ({ users, onEdit, onDelete }) => {
    return (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {users.map(user => (
                        <tr key={user.id}>
                            <td className="px-6 py-4 whitespace-nowrap">{user.username}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{user.employeeId}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{user.role.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <Tag color={user.isActive ? 'success' : 'error'}>
                                    {user.isActive ? 'Active' : 'Inactive'}
                                </Tag>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                <Space>
                                    <Button
                                        type="primary"
                                        icon={<EditOutlined />}
                                        onClick={() => onEdit(user)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        type="primary"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => onDelete(user)}
                                    >
                                        Delete
                                    </Button>
                                </Space>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default UserTable;