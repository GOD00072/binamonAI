// src/components/ChatMessage.tsx
import React from 'react';
import { Message } from '../types';
import { formatDate } from '../utils/helpers';
import UserAvatar from './UserAvatar';

interface ChatMessageProps {
  message: Message;
  isOwn: boolean;
  displayName: string;
  pictureUrl?: string;
  showAvatar?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isOwn,
  displayName,
  pictureUrl,
  showAvatar = true
}) => {
  return (
    <div className={`chat-message ${isOwn ? 'own' : 'other'}`}>
      <div className="message-content">
        {showAvatar && !isOwn && (
          <UserAvatar
            userId={message.userId || 'unknown'}
            displayName={displayName}
            pictureUrl={pictureUrl}
            size={40}
          />
        )}
        
        <div className="message-bubble">
          <div className="message-text">
            {message.content}
          </div>
          
          <div className="message-time">
            {formatDate(message.timestamp)}
          </div>
          
          {message.role === 'ai' && (
            <div className="message-badge">
              <i className="fas fa-robot"></i> AI
            </div>
          )}
        </div>
        
        {showAvatar && isOwn && (
          <UserAvatar
            userId="admin"
            displayName={displayName}
            pictureUrl={pictureUrl}
            size={40}
          />
        )}
      </div>
    </div>
  );
};

export default ChatMessage;