import React, { useState } from 'react';
import { Role, Permission } from '../models/auth';
import { createRole, updateRole, assignPermissionsToRole } from '../services/adminService';

interface RoleFormProps {
    role: Role | null;
    allPermissions: Permission[];
    onSuccess: (role: Role) => void;
    onCancel: () => void;
}

const RoleForm: React.FC<RoleFormProps> = ({ role, allPermissions, onSuccess, onCancel }) => {
    const [formData, setFormData] = useState({
        name: role?.name || '',
        description: role?.description || '',
    });
    const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>(
        role?.permissions.map(p => p.permission.id) || []
    );
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handlePermissionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedIds = Array.from(e.target.selectedOptions, option => option.value);
        setSelectedPermissionIds(selectedIds);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            let targetRole = role;

            if (role) {
                // Update existing role
                targetRole = await updateRole(role.id, formData);
            } else {
                // Create new role
                targetRole = await createRole(formData);
            }

            // Assign permissions
            const finalRole = await assignPermissionsToRole(targetRole.id, selectedPermissionIds);
            onSuccess(finalRole);

        } catch (err) {
            setError('Failed to save role. Please check the details and try again.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">{role ? 'Edit Role' : 'Create Role'}</h2>

            {error && <div className="text-red-500 bg-red-100 p-3 rounded">{error}</div>}

            <div>
                <label className="block text-sm font-medium text-gray-700">Role Name</label>
                <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Permissions</label>
                <select
                    multiple
                    value={selectedPermissionIds}
                    onChange={handlePermissionChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm h-60"
                >
                    {allPermissions.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
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

export default RoleForm;