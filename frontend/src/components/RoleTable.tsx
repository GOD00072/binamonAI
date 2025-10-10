import React from 'react';
import { Role } from '../models/auth';

interface RoleTableProps {
    roles: Role[];
    onEdit: (role: Role) => void;
}

const RoleTable: React.FC<RoleTableProps> = ({ roles, onEdit }) => {
    return (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {roles.map(role => (
                        <tr key={role.id}>
                            <td className="px-6 py-4 whitespace-nowrap">{role.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{role.description}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                <button
                                    onClick={() => onEdit(role)}
                                    className="text-indigo-600 hover:text-indigo-900"
                                >
                                    Edit
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default RoleTable;