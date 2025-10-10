import React, { useState, useEffect } from 'react';
import { getUsers, getRoles } from '../services/adminService';
import { AuthUser, Role } from '../models/auth';
import UserTable from '../components/UserTable';
import Modal from '../components/Modal';
import UserForm from '../components/UserForm';

const UserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedUser, setSelectedUser] = useState<AuthUser | null>(null);

    useEffect(() => {
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

        fetchData();
    }, []);

    const handleCreate = () => {
        setSelectedUser(null);
        setIsModalOpen(true);
    };

    const handleEdit = (user: AuthUser) => {
        setSelectedUser(user);
        setIsModalOpen(true);
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

    if (loading) {
        return <div className="text-center p-8">Loading...</div>;
    }

    if (error) {
        return <div className="text-center p-8 text-red-500">{error}</div>;
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">User Management</h1>
                <button
                    onClick={handleCreate}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                >
                    Create User
                </button>
            </div>

            <UserTable users={users} onEdit={handleEdit} />

            {isModalOpen && (
                <Modal onClose={handleCloseModal}>
                    <UserForm
                        user={selectedUser}
                        roles={roles}
                        onSuccess={handleSuccess}
                        onCancel={handleCloseModal}
                    />
                </Modal>
            )}
        </div>
    );
};

export default UserManagementPage;