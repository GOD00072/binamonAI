// src/components/UserAvatar.tsx
import React from 'react';
import { getInitials, generateAvatarColor } from '../utils/helpers';

interface UserAvatarProps {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  size?: number;
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  displayName,
  pictureUrl,
  size = 40,
  className = ''
}) => {
  const avatarStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${size * 0.4}px`,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: generateAvatarColor(userId),
    flexShrink: 0
  };

  if (pictureUrl) {
    return (
      <img
        src={pictureUrl}
        alt={displayName}
        style={{
          ...avatarStyle,
          objectFit: 'cover'
        }}
        className={`user-avatar ${className}`}
        onError={(e) => {
          // If image fails to load, show initials instead
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.removeAttribute('style');
        }}
      />
    );
  }

  return (
    <div
      style={avatarStyle}
      className={`user-avatar ${className}`}
      title={displayName}
    >
      {getInitials(displayName)}
    </div>
  );
};

export default UserAvatar;