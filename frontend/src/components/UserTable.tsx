import React from 'react';
import { AuthUser } from '../models/auth';
import { Button, Space, Tag, Table } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface UserTableProps {
    users: AuthUser[];
    onEdit: (user: AuthUser) => void;
    onDelete: (user: AuthUser) => void;
    hasPermission: (permission: string) => boolean;
}

const UserTable: React.FC<UserTableProps> = ({ users, onEdit, onDelete, hasPermission }) => {
    const columns = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
            sorter: (a: AuthUser, b: AuthUser) => a.username.localeCompare(b.username),
        },
        {
            title: 'Employee ID',
            dataIndex: 'employeeId',
            key: 'employeeId',
            sorter: (a: AuthUser, b: AuthUser) => a.employeeId.localeCompare(b.employeeId),
        },
        {
            title: 'Role',
            dataIndex: ['role', 'name'],
            key: 'role',
            render: (roleName: string) => <Tag>{roleName}</Tag>,
            sorter: (a: AuthUser, b: AuthUser) => a.role.name.localeCompare(b.role.name),
        },
        {
            title: 'Status',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                <Tag color={isActive ? 'success' : 'error'}>
                    {isActive ? 'Active' : 'Inactive'}
                </Tag>
            ),
            sorter: (a: AuthUser, b: AuthUser) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (text: any, record: AuthUser) => (
                <Space>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => onEdit(record)}
                        disabled={!hasPermission('users:manage')}
                    >
                        Edit
                    </Button>
                    <Button
                        type="primary"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => onDelete(record)}
                        disabled={!hasPermission('users:manage')}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <Table
            columns={columns}
            dataSource={users}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 'max-content' }}
            size="small"
            bordered
        />
    );
};

export default UserTable;
