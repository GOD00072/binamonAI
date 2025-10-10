import React, { useState, useEffect, useMemo } from 'react';
import { getUsers, getRoles, deleteUser } from '../services/adminService';
import { AuthUser, Role } from '../models/auth';
import UserTable from '../components/UserTable';
import UserForm from '../components/UserForm';
import { Button, Modal, Spin, Alert, Input, Row, Col, Select } from 'antd';
import { PlusOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

const { Search } = Input;
const { Option } = Select;

const UserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [usersData, rolesData] = await Promise.all([getUsers(), getRoles()]);
            setUsers(usersData);
            setRoles(rolesData);
            setError(null);
        } catch (err) {
            setError('Failed to fetch data. You may not have the required permissions.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedUser(null);
        setIsModalOpen(true);
    };

    const handleEdit = (user: AuthUser) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleDelete = (user: AuthUser) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this user?',
            icon: <ExclamationCircleOutlined />,
            content: `User: ${user.username}`,
            okText: 'Yes, delete it',
            okType: 'danger',
            cancelText: 'No, cancel',
            onOk: async () => {
                try {
                    await deleteUser(user.id);
                    setUsers(users.filter(u => u.id !== user.id));
                } catch (err) {
                    setError('Failed to delete user.');
                    console.error(err);
                }
            },
        });
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedUser(null);
    };

    const handleSuccess = (updatedUser: AuthUser) => {
        if (selectedUser) {
            setUsers(users.map(u => (u.id === updatedUser.id ? updatedUser : u)));
        } else {
            setUsers([...users, updatedUser]);
        }
        handleCloseModal();
    };

    const filteredUsers = useMemo(() => {
        return users
            .filter(user =>
                user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .filter(user =>
                roleFilter ? user.roleId === roleFilter : true
            );
    }, [users, searchTerm, roleFilter]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return <Alert message={error} type="error" showIcon />;
    }

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-6">User Management</h1>

            <Row gutter={[16, 16]} className="mb-6">
                <Col xs={24} sm={12} md={8}>
                    <Search
                        placeholder="Search by username or employee ID"
                        onSearch={setSearchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        allowClear
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        placeholder="Filter by role"
                        onChange={setRoleFilter}
                        allowClear
                        style={{ width: '100%' }}
                    >
                        {roles.map(role => (
                            <Option key={role.id} value={role.id}>{role.name}</Option>
                        ))}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={10} className="text-right">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleCreate}
                    >
                        Create User
                    </Button>
                </Col>
            </Row>

            <UserTable users={filteredUsers} onEdit={handleEdit} onDelete={handleDelete} />

            <Modal
                title={selectedUser ? 'Edit User' : 'Create User'}
                visible={isModalOpen}
                onCancel={handleCloseModal}
                footer={null}
                destroyOnClose
            >
                <UserForm
                    user={selectedUser}
                    roles={roles}
                    onSuccess={handleSuccess}
                    onCancel={handleCloseModal}
                />
            </Modal>
        </div>
    );
};

export default UserManagementPage;