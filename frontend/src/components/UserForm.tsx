import React, { useState, useEffect } from 'react';
import { AuthUser, Role } from '../models/auth';
import { createUser, updateUser } from '../services/adminService';
import { Form, Button, Alert, Row, Col } from 'react-bootstrap';

interface UserFormProps {
    user: AuthUser | null;
    roles: Role[];
    onSuccess: (user: AuthUser) => void;
    onCancel: () => void;
    hasPermission: (permission: string) => boolean; // Add hasPermission prop
}

const UserForm: React.FC<UserFormProps> = ({ user, roles, onSuccess, onCancel, hasPermission }) => {
    const [username, setUsername] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [roleId, setRoleId] = useState<string | undefined>(undefined);
    const [isActive, setIsActive] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    useEffect(() => {
        if (user) {
            setUsername(user.username || '');
            setEmployeeId(user.employeeId || '');
            setRoleId(user.roleId);
            setIsActive(Boolean(user.isActive));
            setPassword('');
        } else {
            setUsername('');
            setEmployeeId('');
            setRoleId(roles.length > 0 ? roles[0].id : undefined);
            setIsActive(true);
            setPassword('');
        }
    }, [user, roles]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (!username || !employeeId || !roleId) {
                setError('Please fill in required fields.');
                return;
            }

            if (user) {
                const payload: any = {
                    username,
                    employeeId,
                    roleId,
                    isActive,
                };
                if (password) payload.password = password;
                const updatedUser = await updateUser(user.id, payload);
                onSuccess(updatedUser);
            } else {
                const payload = { username, employeeId, password, roleId, isActive };
                const newUser = await createUser(payload as any);
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
        <Form onSubmit={handleSubmit}>
            <h2 className="section-title mb-3">{user ? 'Edit User' : 'Create User'}</h2>

            {error && (
                <Alert variant="danger" className="mb-3">
                    {error}
                </Alert>
            )}

            <Row className="g-3">
                <Col md={6}>
                    <Form.Group controlId="username" className="mb-3">
                        <Form.Label>Username</Form.Label>
                        <Form.Control
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="Enter username"
                            className="input-field"
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group controlId="employeeId" className="mb-3">
                        <Form.Label>Employee ID</Form.Label>
                        <Form.Control
                            type="text"
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            required
                            placeholder="Enter employee ID"
                            className="input-field"
                        />
                    </Form.Group>
                </Col>
            </Row>

            <Row className="g-3">
                <Col md={6}>
                    <Form.Group controlId="password" className="mb-3">
                        <Form.Label>Password {user && <small className="text-muted">(leave blank to keep)</small>}</Form.Label>
                        <Form.Control
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={user ? 'Leave blank to keep current password' : 'Enter password'}
                            className="input-field"
                            required={!user}
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group controlId="roleId" className="mb-3">
                        <Form.Label>Role</Form.Label>
                        <Form.Select
                            value={roleId}
                            onChange={(e) => setRoleId(e.target.value || undefined)}
                            required
                            className="input-field"
                        >
                            <option value="" disabled>Select role</option>
                            {roles.map((role) => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                </Col>
            </Row>

            <Form.Group controlId="isActive" className="mb-3">
                <Form.Check
                    type="switch"
                    label={isActive ? 'Active' : 'Inactive'}
                    checked={isActive}
                    onChange={(e) => setIsActive(e.currentTarget.checked)}
                />
            </Form.Group>

            <div className="d-flex justify-content-end gap-2 pt-2">
                <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    type="submit"
                    disabled={isSubmitting || !hasPermission('users:manage')}
                >
                    {isSubmitting ? 'Saving...' : 'Save'}
                </Button>
            </div>
        </Form>
    );
};

export default UserForm;
