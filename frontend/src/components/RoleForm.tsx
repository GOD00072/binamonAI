import React, { useState, useEffect } from 'react';
import { Role, Permission } from '../models/auth';
import { createRole, updateRole, assignPermissionsToRole } from '../services/adminService';
import { Form, Input, Button, Checkbox, Alert } from 'antd';

const { TextArea } = Input;

interface RoleFormProps {
    role: Role | null;
    permissions: Permission[];
    onSuccess: (role: Role) => void;
    onCancel: () => void;
}

const RoleForm: React.FC<RoleFormProps> = ({ role, permissions, onSuccess, onCancel }) => {
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    useEffect(() => {
        if (role) {
            form.setFieldsValue({
                name: role.name,
                description: role.description,
                permissionIds: role.permissions.map(p => p.permission.id),
            });
        } else {
            form.resetFields();
        }
    }, [role, form]);

    const handleSubmit = async (values: any) => {
        setIsSubmitting(true);
        setError(null);

        try {
            let savedRole;
            if (role) {
                const updatedData = { name: values.name, description: values.description };
                savedRole = await updateRole(role.id, updatedData);
            } else {
                savedRole = await createRole(values);
            }
            await assignPermissionsToRole(savedRole.id, values.permissionIds || []);
            const finalRole = { ...savedRole, permissions: permissions.filter(p => values.permissionIds.includes(p.id)).map(p => ({ permission: p })) };
            onSuccess(finalRole);

        } catch (err) {
            setError('Failed to save role. Please check the details and try again.');
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
        >
            <h2 className="text-2xl font-bold mb-4">{role ? 'Edit Role' : 'Create Role'}</h2>

            {error && <Alert message={error} type="error" showIcon className="mb-4" />}

            <Form.Item
                name="name"
                label="Role Name"
                rules={[{ required: true, message: 'Please input the role name!' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item
                name="description"
                label="Description"
            >
                <TextArea rows={4} />
            </Form.Item>

            <Form.Item name="permissionIds" label="Permissions">
                <Checkbox.Group className="w-full">
                    <div className="grid grid-cols-2 gap-2">
                        {permissions.map(permission => (
                            <Checkbox key={permission.id} value={permission.id}>
                                {permission.name}
                            </Checkbox>
                        ))}
                    </div>
                </Checkbox.Group>
            </Form.Item>

            <div className="flex justify-end space-x-2 pt-4">
                <Button onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                </Button>
            </div>
        </Form>
    );
};

export default RoleForm;