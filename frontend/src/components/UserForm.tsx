import React, { useState, useEffect } from 'react';
import { AuthUser, Role } from '../models/auth';
import { createUser, updateUser } from '../services/adminService';
import { Form, Input, Select, Button, Switch, Alert } from 'antd';

const { Option } = Select;

interface UserFormProps {
    user: AuthUser | null;
    roles: Role[];
    onSuccess: (user: AuthUser) => void;
    onCancel: () => void;
}

const UserForm: React.FC<UserFormProps> = ({ user, roles, onSuccess, onCancel }) => {
    const [form] = Form.useForm();
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    useEffect(() => {
        if (user) {
            form.setFieldsValue({
                username: user.username,
                employeeId: user.employeeId,
                roleId: user.roleId,
                isActive: user.isActive,
            });
        } else {
            form.resetFields();
            form.setFieldsValue({ isActive: true });
        }
    }, [user, form]);

    const handleSubmit = async (values: any) => {
        setIsSubmitting(true);
        setError(null);

        try {
            if (user) {
                const updatedData = { ...values };
                if (!updatedData.password) {
                    delete updatedData.password;
                }
                const updatedUser = await updateUser(user.id, updatedData);
                onSuccess(updatedUser);
            } else {
                const newUser = await createUser(values);
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
        <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{
                isActive: true,
                roleId: roles[0]?.id,
            }}
        >
            <h2 className="text-2xl font-bold mb-4">{user ? 'Edit User' : 'Create User'}</h2>

            {error && <Alert message={error} type="error" showIcon className="mb-4" />}

            <Form.Item
                name="username"
                label="Username"
                rules={[{ required: true, message: 'Please input the username!' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item
                name="employeeId"
                label="Employee ID"
                rules={[{ required: true, message: 'Please input the employee ID!' }]}
            >
                <Input />
            </Form.Item>

            <Form.Item
                name="password"
                label="Password"
                rules={[{ required: !user, message: 'Password is required for new users!' }]}
            >
                <Input.Password placeholder={user ? 'Leave blank to keep current password' : ''} />
            </Form.Item>

            <Form.Item
                name="roleId"
                label="Role"
                rules={[{ required: true, message: 'Please select a role!' }]}
            >
                <Select>
                    {roles.map(role => (
                        <Option key={role.id} value={role.id}>{role.name}</Option>
                    ))}
                </Select>
            </Form.Item>

            <Form.Item name="isActive" label="Status" valuePropName="checked">
                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
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

export default UserForm;