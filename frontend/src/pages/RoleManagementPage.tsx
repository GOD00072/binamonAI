import React, { useState, useEffect } from 'react';
import { getRoles, getPermissions } from '../services/adminService';
import { Role, Permission } from '../models/auth';
import RoleTable from '../components/RoleTable';
import Modal from '../components/Modal';
import RoleForm from '../components/RoleForm';

const RoleManagementPage: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedRole, setSelectedRole] = useState<Role | null>(null);

    useEffect(() => {
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

        fetchData();
    }, []);

    const handleCreate = () => {
        setSelectedRole(null);
        setIsModalOpen(true);
    };

    const handleEdit = (role: Role) => {
        setSelectedRole(role);
        setIsModalOpen(true);
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

    if (loading) {
        return <div className="text-center p-8">Loading...</div>;
    }

    if (error) {
        return <div className="text-center p-8 text-red-500">{error}</div>;
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Role Management</h1>
                <button
                    onClick={handleCreate}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                    Create Role
                </button>
            </div>

            <RoleTable roles={roles} onEdit={handleEdit} />

            {isModalOpen && (
                <Modal onClose={handleCloseModal}>
                    <RoleForm
                        role={selectedRole}
                        allPermissions={permissions}
                        onSuccess={handleSuccess}
                        onCancel={handleCloseModal}
                    />
                </Modal>
            )}
        </div>
    );
};

export default RoleManagementPage;