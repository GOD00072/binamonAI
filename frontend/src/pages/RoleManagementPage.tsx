import React, { useState, useEffect, useMemo } from 'react';
import { getRoles, createRole, updateRole, deleteRole, getPermissions, assignPermissionsToRole } from '../services/adminService';
import { Role, Permission } from '../models/auth';
import { Button, Modal, Spin, Alert, Input, Row, Col, Table, Tag, Space, Checkbox } from 'antd';
import { PlusOutlined, ExclamationCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import RoleForm from '../components/RoleForm';

const { Search } = Input;

const RoleManagementPage: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [rolesData, permissionsData] = await Promise.all([getRoles(), getPermissions()]);
            setRoles(rolesData);
            setPermissions(permissionsData);
            setError(null);
        } catch (err) {
            setError('Failed to fetch data. You may not have the required permissions.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedRole(null);
        setIsModalOpen(true);
    };

    const handleEdit = (role: Role) => {
        setSelectedRole(role);
        setIsModalOpen(true);
    };

    const handleDelete = (role: Role) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this role?',
            icon: <ExclamationCircleOutlined />,
            content: `Role: ${role.name}`,
            okText: 'Yes, delete it',
            okType: 'danger',
            cancelText: 'No, cancel',
            onOk: async () => {
                try {
                    await deleteRole(role.id);
                    setRoles(roles.filter(r => r.id !== role.id));
                } catch (err) {
                    setError('Failed to delete role.');
                    console.error(err);
                }
            },
        });
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedRole(null);
    };

    const handleSuccess = (updatedRole: Role) => {
        if (selectedRole) {
            setRoles(roles.map(r => (r.id === updatedRole.id ? updatedRole : r)));
        } else {
            setRoles([...roles, updatedRole]);
        }
        handleCloseModal();
    };

    const filteredRoles = useMemo(() => {
        return roles.filter(role =>
            role.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [roles, searchTerm]);

    const columns = [
        {
            title: 'Role Name',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'Permissions',
            key: 'permissions',
            render: (text: any, record: Role) => (
                <>
                    {record.permissions.slice(0, 3).map(p => (
                        <Tag color="blue" key={p.permission.id}>{p.permission.name}</Tag>
                    ))}
                    {record.permissions.length > 3 && <Tag>...</Tag>}
                </>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (text: any, record: Role) => (
                <Space>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Edit
                    </Button>
                    <Button
                        type="primary"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

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
            <h1 className="text-3xl font-bold mb-6">Role Management</h1>

            <Row gutter={[16, 16]} className="mb-6">
                <Col xs={24} sm={12} md={8}>
                    <Search
                        placeholder="Search by role name"
                        onSearch={setSearchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        allowClear
                    />
                </Col>
                <Col xs={24} sm={12} md={16} className="text-right">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleCreate}
                    >
                        Create Role
                    </Button>
                </Col>
            </Row>

            <Table columns={columns} dataSource={filteredRoles} rowKey="id" />

            <Modal
                title={selectedRole ? 'Edit Role' : 'Create Role'}
                visible={isModalOpen}
                onCancel={handleCloseModal}
                footer={null}
                destroyOnClose
            >
                <RoleForm
                    role={selectedRole}
                    permissions={permissions}
                    onSuccess={handleSuccess}
                    onCancel={handleCloseModal}
                />
            </Modal>
        </div>
    );
};

export default RoleManagementPage;