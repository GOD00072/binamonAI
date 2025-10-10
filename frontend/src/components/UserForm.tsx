import React, { useState } from 'react';
import { AuthUser, Role } from '../models/auth';
import { createUser, updateUser } from '../services/adminService';

interface UserFormProps {
    user: AuthUser | null;
    roles: Role[];
    onSuccess: (user: AuthUser) => void;
    onCancel: () => void;
}

const UserForm: React.FC<UserFormProps> = ({ user, roles, onSuccess, onCancel }) => {
    const [formData, setFormData] = useState({
        username: user?.username || '',
        employeeId: user?.employeeId || '',
        password: '',
        roleId: user?.roleId || roles[0]?.id || '',
    });
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (user) {
                // Update user
                const updatedData: any = {
                    username: formData.username,
                    employeeId: formData.employeeId,
                    roleId: formData.roleId,
                };
                if (formData.password) {
                    updatedData.password = formData.password;
                }
                const updatedUser = await updateUser(user.id, updatedData);
                onSuccess(updatedUser);
            } else {
                // Create user
                const newUser = await createUser(formData);
                onSuccess(newUser);
            }
        } catch (err) {
            setError('Failed to save user. Please check the details and try again.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">{user ? 'Edit User' : 'Create User'}</h2>

            {error && <div className="text-red-500 bg-red-100 p-3 rounded">{error}</div>}

            <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                <input
                    type="text"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder={user ? 'Leave blank to keep current password' : ''}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                    name="roleId"
                    value={formData.roleId}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                    {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="bg-gray-200 hover:bg-gray-300 text-black font-bold py-2 px-4 rounded"
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
};

export default UserForm;