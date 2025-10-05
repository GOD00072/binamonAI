import React, { useState, useRef, useEffect } from 'react';
import { Button, Modal, Input, List, Avatar, Typography } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import styled from 'styled-components';

const { TextArea } = Input;
const { Text } = Typography;

const ChatContainer = styled.div`
  height: 400px;
  overflow-y: auto;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 20px;
`;

const MessageItemBase = styled.div<{ $isAI: boolean }>`
  display: flex;
  margin-bottom: 16px;
  flex-direction: ${props => props.$isAI ? 'row' : 'row-reverse'};
`;

const MessageContentBase = styled.div<{ $isAI: boolean }>`
  max-width: 70%;
  padding: 12px;
  border-radius: 8px;
  background-color: ${props => props.$isAI ? '#e6f7ff' : '#f0f2f5'};
  margin: ${props => props.$isAI ? '0 12px 0 0' : '0 0 0 12px'};
`;

// Wrapper components that convert isAI to $isAI
const MessageItem: React.FC<{ isAI: boolean } & React.HTMLAttributes<HTMLDivElement>> = ({ isAI, ...props }) => (
  <MessageItemBase $isAI={isAI} {...props} />
);

const MessageContent: React.FC<{ isAI: boolean } & React.HTMLAttributes<HTMLDivElement>> = ({ isAI, ...props }) => (
  <MessageContentBase $isAI={isAI} {...props} />
);

interface Message {
  content: string;
  isAI: boolean;
  timestamp: Date;
}

interface AIChatPopupProps {
  visible: boolean;
  onClose: () => void;
}

const AIChatPopup: React.FC<AIChatPopupProps> = ({ visible, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && messages.length === 0) {
      // Add initial greeting
      setMessages([
        {
          content: 'สวัสดีค่ะ! มีอะไรให้ช่วยเหลือไหมคะ?',
          isAI: true,
          timestamp: new Date(),
        },
      ]);
    }
  }, [visible]);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      content: inputMessage,
      isAI: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // TODO: Replace with your actual API call
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: inputMessage }),
      });

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        content: data.response || 'ขออภัยค่ะ ฉันไม่เข้าใจคำถาม กรุณาลองใหม่อีกครั้ง',
        isAI: true,
        timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        content: 'ขออภัยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
        isAI: true,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Modal
      title="AI Chat Assistant"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <ChatContainer ref={chatContainerRef}>
        {messages.map((message, index) => (
          <div key={index} style={{ 
            display: 'flex',
            marginBottom: '16px',
            flexDirection: message.isAI ? 'row' : 'row-reverse'
          }}>
            <Avatar icon={message.isAI ? <RobotOutlined /> : <UserOutlined />} />
            <div style={{
              maxWidth: '70%',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: message.isAI ? '#e6f7ff' : '#f0f2f5',
              margin: message.isAI ? '0 12px 0 0' : '0 0 0 12px'
            }}>
              <Text>{message.content}</Text>
            </div>
          </div>
        ))}
      </ChatContainer>

      <div style={{ display: 'flex', gap: '8px' }}>
        <TextArea
          value={inputMessage}
          onChange={e => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="พิมพ์ข้อความของคุณที่นี่..."
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={isLoading}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={isLoading}
        />
      </div>
    </Modal>
  );
};

export default AIChatPopup;
