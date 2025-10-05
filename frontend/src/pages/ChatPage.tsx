
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { userApi, messageApi, aiTestApi, websocketApi, aiModelApi } from '../services/api';
import { socketService } from '../services/socket';
import {
    User,
    Message,
    AiProcessingStatus,
    AdminTypingStatus,
    AiResponsePendingReview,
    AiResponseUpdate
} from '../types';
import { 
  formatDate, 
  debounce,
  createUserFromMessage,
  updateUserActivity,
  getUserDisplayInfo,
  getUserBadgeInfo,
  sortUsersByActivity,
  filterUsersBySearch,
  hasUnreadMessages,
  createDefaultUser
} from '../utils/helpers';
import UserAvatar from '../components/UserAvatar';
import { LoadingSpinner } from '../pages/DashboardModels/UIComponents';
import '../styles/theme.css';
import './ChatPage.css';
import {
  ChatIcon,
  UserIcon,
  SuccessIcon,
  CloseIcon,
  SearchIcon
} from '../components/Icons';

const showToastNotification = (title: string, body: string, type: 'info' | 'success' | 'error' = 'info') => {
  console.log(`[${type.toUpperCase()} TOAST]: ${title} - ${body}`);
};

export type UserAiActivityType = 'processing' | 'paused' | 'pending_review' | 'thinking' | 'searching' | 'error' | 'idle';
export interface UserAiActivity {
  type: UserAiActivityType;
  details?: {
    messageId?: string;
    responseId?: string;
    content?: string;
    reason?: string;
    message?: string;
    productsFound?: number;
    error?: string;
  };
  timestamp: number;
}

interface AdminTypingInfo {
  visible: boolean;
  elapsedTime: number;
}

const ChatPage: React.FC = () => {
  const { userId: selectedUserIdFromUrl } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const adminTypingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [pendingReviewMessage, setPendingReviewMessage] = useState<{ responseId: string, messageId: string, content: string, userId: string } | null>(null);
  
  const [usersAiActivities, setUsersAiActivities] = useState<Map<string, UserAiActivity>>(new Map());
  const [adminTypingInfo, setAdminTypingInfo] = useState<AdminTypingInfo>({ visible: false, elapsedTime: 0 });
  const [unreadUsers, setUnreadUsers] = useState<Set<string>>(new Set());

  const currentAdminId = localStorage.getItem('adminUserId') || 'admin_chatpage_user';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const loadUsersAndSelect = async () => {
      setLoading(true);
      try {
        const response = await userApi.getAllUsers();
        if (response.success && response.data) {
          const fetchedUsers = response.data.users || [];
          const sortedUsers = sortUsersByActivity(fetchedUsers);
          setUsers(sortedUsers);
          
          if (selectedUserIdFromUrl) {
            const userToSelect = sortedUsers.find((u: User) => u.userId === selectedUserIdFromUrl);
            if (userToSelect) {
              setCurrentUser(userToSelect);
            }
          }
        } else {
          setError(response.message || 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้');
        }
      } catch (err: any) {
        setError(err.message || 'เกิดข้อผิดพลาดในการโหลดผู้ใช้');
      } finally {
        setLoading(false);
      }
    };
    loadUsersAndSelect();
  }, [selectedUserIdFromUrl, navigate]);

  const loadMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const response = await messageApi.getUserMessages(userId, 'api');
      if (response.success && response.data) {
        setMessages(response.data.history?.messages || []);
        await messageApi.markAsRead(userId);
        setUnreadUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(userId);
            return newSet;
        });
      } else {
        setError(response.message || 'ไม่สามารถโหลดประวัติการแชทได้');
        setMessages([]);
      }
    } catch (err: any) {
      console.error('Error loading messages:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อความ');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadMessages(currentUser.userId);
      setPendingReviewMessage(null);
      setAdminTypingInfo({ visible: false, elapsedTime: 0 });
      if (adminTypingTimerRef.current) {
          clearInterval(adminTypingTimerRef.current);
          adminTypingTimerRef.current = null;
      }
    } else {
      setMessages([]);
    }
  }, [currentUser, loadMessages]);

  useEffect(() => {
    const handleNewMessage = (data: { userId: string, message: Message }) => {
      if (currentUser && data.userId === currentUser.userId) {
        setMessages(prev => {
          if (prev.some(m => m.messageId === data.message.messageId)) {
            return prev;
          }
          return [...prev, data.message];
        });
        messageApi.markAsRead(data.userId).catch(err => console.error("Failed to auto-mark as read:", err));
         setUnreadUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(data.userId);
            return newSet;
        });
      }
      
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(u => u.userId === data.userId ? 
          updateUserActivity(u, data.message.content) : u
        );
        return sortUsersByActivity(updatedUsers);
      });
    };

    const handleAdminNewUserMessage = (data: { userId: string, displayName: string, messageContent: string, messageId: string}) => {
      showToastNotification(
        `ข้อความใหม่จาก ${data.displayName || data.userId.substring(0,8)}`,
        data.messageContent.substring(0, 50) + (data.messageContent.length > 50 ? '...' : ''),
        'info'
      );

      setUsers(prevUsers => {
        const existingUser = prevUsers.find(u => u.userId === data.userId);
        if (!existingUser) {
          const newUser = createUserFromMessage(
            data.userId,
            data.displayName,
            data.messageContent
          );
          
          showToastNotification(
            'ผู้ใช้งานใหม่!',
            `${data.displayName} เข้าร่วมแชทครั้งแรก`,
            'success'
          );
          
          return sortUsersByActivity([newUser, ...prevUsers]);
        } else {
          const updatedUsers = prevUsers.map(u => u.userId === data.userId ? 
            updateUserActivity(u, data.messageContent, data.displayName) : u
          );
          return sortUsersByActivity(updatedUsers);
        }
      });

      if (!currentUser || currentUser.userId !== data.userId) {
        setUnreadUsers(prev => new Set(prev).add(data.userId));
      }
    };

    const handleNewUserJoined = (data: { userId: string, displayName: string, pictureUrl?: string }) => {
      setUsers(prevUsers => {
        const existingUser = prevUsers.find(u => u.userId === data.userId);
        if (!existingUser) {
          const newUser = createDefaultUser(
            data.userId,
            data.displayName || `User ${data.userId.substring(1, 9)}`,
            {
              pictureUrl: data.pictureUrl || '',
              isNew: true,
              aiEnabled: true
            }
          );
          
          showToastNotification(
            'ผู้ใช้งานใหม่เข้าร่วม!',
            `${data.displayName} เข้าใช้ระบบครั้งแรก`,
            'success'
          );
          
          return sortUsersByActivity([newUser, ...prevUsers]);
        }
        return prevUsers;
      });
    };

    const handleUserProfileUpdate = (data: { userId: string, displayName?: string, pictureUrl?: string }) => {
      setUsers(prevUsers => prevUsers.map(u => u.userId === data.userId ? {
        ...u,
        displayName: data.displayName || u.displayName,
        pictureUrl: data.pictureUrl || u.pictureUrl,
        lastActive: Date.now()
      } : u));

      if (currentUser && currentUser.userId === data.userId) {
        setCurrentUser(prev => prev ? {
          ...prev,
          displayName: data.displayName || prev.displayName,
          pictureUrl: data.pictureUrl || prev.pictureUrl
        } : null);
      }
    };

    const handleUnreadStatusUpdate = (data: { userId: string, hasUnread: boolean }) => {
      setUnreadUsers(prev => {
        const newSet = new Set(prev);
        if (data.hasUnread) {
          if (!currentUser || currentUser.userId !== data.userId) {
            newSet.add(data.userId);
          }
        } else {
          newSet.delete(data.userId);
        }
        return newSet;
      });
    };
    
    const handleAiEvent = (userId: string, activityType: UserAiActivityType, details?: any, statusMsg?: string) => {
      setUsersAiActivities(prev => new Map(prev).set(userId, { type: activityType, details, timestamp: Date.now() }));
      if (currentUser && userId === currentUser.userId) setAiStatusMessage(statusMsg || `${activityType}`);
    };

    const clearAiActivityForUser = (userId: string) => {
        setUsersAiActivities(prev => { const newMap = new Map(prev); newMap.delete(userId); return newMap; });
        if (currentUser && userId === currentUser.userId) setAiStatusMessage(null);
    };

    const handleAiProcessingStarted = (data: AiProcessingStatus) => {
      handleAiEvent(data.userId, 'processing', { messageId: data.messageId, message: data.message }, `AI กำลังประมวลผล...`);
      if (currentUser && data.userId === currentUser.userId) setPendingReviewMessage(null);
    };

    const handleAiThinking = (data: {userId: string}) => handleAiEvent(data.userId, 'thinking', {}, 'AI กำลังคิด...');
    const handleAiSearching = (data: {userId: string, productsFound?: number}) => handleAiEvent(data.userId, 'searching', {productsFound: data.productsFound}, 'AI กำลังค้นหาสินค้า...');
    
    const handleAiProcessingPaused = (data: { userId: string, reason: string, messageId?: string }) => {
      handleAiEvent(data.userId, 'paused', { reason: data.reason, messageId: data.messageId }, `AI หยุดชั่วคราว: ${data.reason === 'admin_typing' ? 'คุณกำลังพิมพ์' : data.reason }`);
    };

    const handleAiProcessingResumed = (data: { userId: string, messageId?: string }) => {
      const activity = usersAiActivities.get(data.userId);
      if (!(activity?.type === 'paused' && activity.details?.reason === 'admin_typing' && data.userId === currentUser?.userId)) {
        handleAiEvent(data.userId, 'processing', { message: 'Resumed', messageId: data.messageId }, 'AI กลับมาประมวลผลต่อ...');
      }
    };

    const handleAiResponsePendingReview = (data: AiResponsePendingReview) => {
      handleAiEvent(data.userId, 'pending_review', { responseId: data.responseId, content: data.response, messageId: data.messageId }, 'AI สร้างคำตอบแล้ว รออนุมัติ');
      if (currentUser && data.userId === currentUser.userId) {
        setPendingReviewMessage({ 
          responseId: data.responseId, 
          messageId: data.messageId, 
          content: data.response, 
          userId: data.userId 
        });
      }
    };

    const handleAiResponseUpdate = (data: AiResponseUpdate, approved: boolean) => {
        clearAiActivityForUser(data.userId);
        if (currentUser && data.userId === currentUser.userId) {
            if (pendingReviewMessage && data.responseId === pendingReviewMessage.responseId) {
                setPendingReviewMessage(null);
            }
            setAiStatusMessage(approved ? 'คำตอบ AI ถูกส่งแล้ว' : `คำตอบ AI (ID: ${data.responseId?.substring(0,8)}) ถูกปฏิเสธ`);
            setTimeout(() => {
              if (currentUser && data.userId === currentUser.userId) {
                setAiStatusMessage(null);
              }
            }, 3000);
        }
    };

    const handleAiProcessingError = (data: { userId: string, messageId?: string, error: string }) => {
        handleAiEvent(data.userId, 'error', { error: data.error, messageId: data.messageId }, `เกิดข้อผิดพลาดกับ AI: ${data.error}`);
        if (currentUser && data.userId === currentUser.userId) setPendingReviewMessage(null);
    };

    const handleAiProcessingCancelled = (data: {userId: string, messageId: string}) => {
      clearAiActivityForUser(data.userId);
      if (currentUser && data.userId === currentUser.userId) {
        setAiStatusMessage(`AI processing ถูกยกเลิก`);
        setPendingReviewMessage(null);
        setTimeout(() => {
          if (currentUser && data.userId === currentUser.userId) {
            setAiStatusMessage(null);
          }
        }, 3000);
      }
    };

    const handleAdminTypingUpdate = (data: AdminTypingStatus) => {
      if (data.userId === currentUser?.userId && data.adminId !== currentAdminId) {
        setAiStatusMessage(data.isTyping ? `แอดมิน ${data.adminId.substring(0,6)} กำลังพิมพ์...` : null);
      }
    };

    socketService.on('new_message', handleNewMessage);
    socketService.on('admin_new_user_message', handleAdminNewUserMessage);
    socketService.on('new_user_joined', handleNewUserJoined);
    socketService.on('user_profile_update', handleUserProfileUpdate);
    socketService.on('unread_status_update', handleUnreadStatusUpdate);
    socketService.on('ai_processing_started', handleAiProcessingStarted);
    socketService.on('ai_thinking', handleAiThinking);
    socketService.on('ai_searching_products', handleAiSearching);
    socketService.on('ai_processing_paused', handleAiProcessingPaused);
    socketService.on('ai_processing_resumed', handleAiProcessingResumed);
    socketService.on('ai_response_pending_review', handleAiResponsePendingReview);
    socketService.on('ai_response_sent', (data: AiResponseUpdate) => handleAiResponseUpdate(data, true));
    socketService.on('ai_response_approved_and_sent', (data: AiResponseUpdate) => handleAiResponseUpdate(data, true));
    socketService.on('ai_response_approved', (data: AiResponseUpdate) => handleAiResponseUpdate(data, true));
    socketService.on('ai_response_rejected', (data: AiResponseUpdate) => handleAiResponseUpdate(data, false));
    socketService.on('ai_processing_error', handleAiProcessingError);
    socketService.on('ai_processing_cancelled', handleAiProcessingCancelled);
    socketService.on('admin_typing_status', handleAdminTypingUpdate);

    return () => {
      socketService.off('new_message', handleNewMessage);
      socketService.off('admin_new_user_message', handleAdminNewUserMessage);
      socketService.off('new_user_joined', handleNewUserJoined);
      socketService.off('user_profile_update', handleUserProfileUpdate);
      socketService.off('unread_status_update', handleUnreadStatusUpdate);
      socketService.off('ai_processing_started');
      socketService.off('ai_thinking');
      socketService.off('ai_searching_products');
      socketService.off('ai_processing_paused');
      socketService.off('ai_processing_resumed');
      socketService.off('ai_response_pending_review');
      socketService.off('ai_response_sent');
      socketService.off('ai_response_approved_and_sent');
      socketService.off('ai_response_approved');
      socketService.off('ai_response_rejected');
      socketService.off('ai_processing_error');
      socketService.off('ai_processing_cancelled');
      socketService.off('admin_typing_status');
    };
  }, [currentUser, pendingReviewMessage, currentAdminId, usersAiActivities]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setUsers(prevUsers => prevUsers.map(u => ({ ...u, isNew: false })));
    }, 10000);

    return () => clearTimeout(timer);
  }, [users]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingReviewMessage, adminTypingInfo.visible, scrollToBottom]);

  const handleInputFocus = () => {
    if (currentUser) {
      socketService.emit('admin_typing_start', { userId: currentUser.userId, adminId: currentAdminId });
      setAdminTypingInfo({ visible: true, elapsedTime: 0 });
      if (adminTypingTimerRef.current) clearInterval(adminTypingTimerRef.current);
      adminTypingTimerRef.current = setInterval(() => {
        setAdminTypingInfo(prev => ({ ...prev, elapsedTime: prev.elapsedTime + 1 }));
      }, 1000);
      setUsersAiActivities(prev => new Map(prev).set(currentUser!.userId, { type: 'paused', details: { reason: 'admin_typing', messageId: usersAiActivities.get(currentUser!.userId)?.details?.messageId }, timestamp: Date.now() }));
    }
  };

  const stopAdminTypingEffects = useCallback((forUserId: string) => {
    setAdminTypingInfo({ visible: false, elapsedTime: 0 });
    if (adminTypingTimerRef.current) {
      clearInterval(adminTypingTimerRef.current);
      adminTypingTimerRef.current = null;
    }
    const currentActivity = usersAiActivities.get(forUserId);
    if (currentActivity?.type === 'paused' && currentActivity.details?.reason === 'admin_typing') {
        setUsersAiActivities(prev => {
            const newMap = new Map(prev);
            newMap.delete(forUserId);
            return newMap;
        });
        if (currentUser?.userId === forUserId) setAiStatusMessage(null);
    }
  }, [usersAiActivities, currentUser]);

  const handleInputBlur = () => {
    if (currentUser && adminTypingInfo.visible) {
      socketService.emit('admin_typing_stop', { userId: currentUser.userId, adminId: currentAdminId });
      stopAdminTypingEffects(currentUser.userId);
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !currentUser || sending) return;

    const content = messageInput.trim();
    const tempMessageId = `temp_${Date.now()}`;
    const adminMessage: Message = {
      messageId: tempMessageId, userId: currentUser.userId, role: 'admin',
      content: content, timestamp: Date.now(), source: 'admin-ui'
    };

    setMessages(prev => [...prev, adminMessage]);
    setMessageInput('');
    setSending(true);

    if (adminTypingInfo.visible) {
        socketService.emit('admin_typing_stop', { userId: currentUser.userId, adminId: currentAdminId });
        stopAdminTypingEffects(currentUser.userId);
    }

    try {
      const response = await messageApi.sendMessage(currentUser.userId, content);
      if (response.success && response.data?.messageId) {
        setMessages(prev => prev.map(m => m.messageId === tempMessageId ? { ...m, messageId: response.data!.messageId, timestamp: response.data!.timestamp || m.timestamp } : m));
      } else {
        setError(response.message || 'เกิดข้อผิดพลาดในการส่งข้อความ');
        setMessages(prev => prev.filter(m => m.messageId !== tempMessageId));
        setMessageInput(content);
      }
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการส่งข้อความ');
      setMessages(prev => prev.filter(m => m.messageId !== tempMessageId));
      setMessageInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleUserSelect = (user: User) => {
    if (currentUser?.userId !== user.userId) {
      if (currentUser && adminTypingInfo.visible) {
        socketService.emit('admin_typing_stop', { userId: currentUser.userId, adminId: currentAdminId });
        stopAdminTypingEffects(currentUser.userId);
      }
      navigate(`/chat/${user.userId}`);
    }
  };

  const toggleUserAI = async (userId: string, enabled: boolean) => {
    try {
      await aiModelApi.toggleUser(userId, enabled);
      setUsers(prev => prev.map(user => user.userId === userId ? { ...user, aiEnabled: enabled } : user));
      if (currentUser?.userId === userId) setCurrentUser(prev => prev ? { ...prev, aiEnabled: enabled } : null);
    } catch (err: any) {
      setError('เกิดข้อผิดพลาดในการเปลี่ยนสธานะ AI');
    }
  };

  const debouncedSetSearchTerm = useCallback(
    (term: string) => {
      const debouncedFn = debounce((searchTerm: string) => {
        setSearchTerm(searchTerm);
      }, 300);
      debouncedFn(term);
    },
    []
  );

  const filteredUsers = filterUsersBySearch(users, searchTerm);

  const getMessageDisplayInfo = (message: Message) => {
    const userProfile = message.senderProfile;
    
    switch (message.role) {
      case 'user': 
        const userDisplayName = userProfile?.displayName || 
                               currentUser?.displayName || 
                               users.find(u => u.userId === message.userId)?.displayName || 
                               'ผู้ใช้';
        return { 
          isOwn: false, 
          alignment: 'left' as const, 
          displayName: userDisplayName, 
          pictureUrl: userProfile?.pictureUrl || currentUser?.pictureUrl, 
        };
      case 'model': 
      case 'ai': 
        return { 
          isOwn: true, 
          alignment: 'right' as const, 
          displayName: 'เจ๊งส์ AI', 
          pictureUrl: undefined, 
        };
      case 'admin': 
        return { 
          isOwn: true, 
          alignment: 'right' as const, 
          displayName: 'คุณ (Admin)', 
          pictureUrl: undefined, 
        };
      default: 
        return { 
          isOwn: false, 
          alignment: 'left' as const, 
          displayName: 'ไม่ทราบ', 
          pictureUrl: undefined, 
        };
    }
  };

  const getRoleDisplay = (role: Message['role']) => {
    switch (role) {
      case 'admin': return { label: 'Admin', className: 'badge-primary' };
      case 'model': case 'ai': return { label: 'AI', className: 'badge-secondary' };
      case 'user': default: return { label: 'User', className: 'badge-ghost' };
    }
  };

  const getAvatarContent = (role: Message['role'], displayName?: string) => {
    const initial = displayName?.charAt(0).toUpperCase() || (role === 'user' ? 'U' : '?');
    switch (role) {
      case 'admin': return { text: 'A', className: 'bg-primary' };
      case 'model': case 'ai': return { text: 'AI', className: 'bg-secondary' };
      case 'user': default: return { text: initial, className: 'bg-ghost' };
    }
  };

  const handleApproveAiResponse = async () => {
    if (!pendingReviewMessage) {
        console.warn("handleApproveAiResponse called without pendingReviewMessage");
        showToastNotification('ข้อผิดพลาด', 'ไม่พบข้อความที่รออนุมัติ', 'error');
        return;
    }

    try {
        const response = await websocketApi.approveAIResponse(
            pendingReviewMessage.userId, 
            pendingReviewMessage.responseId
        );

        if (response.success) {
            setAiStatusMessage(`กำลังส่งคำตอบ AI (ID: ${pendingReviewMessage.responseId.substring(0,8)})...`);
            showToastNotification('สำเร็จ', 'อนุมัติคำตอบ AI แล้ว', 'success');
            
            setTimeout(() => {
                if (pendingReviewMessage) {
                    setPendingReviewMessage(null);
                }
            }, 1000);
        } else {
            setError(response.message || 'ไม่สามารถอนุมัติคำตอบ AI ได้');
            showToastNotification('ข้อผิดพลาด', response.message || 'ไม่สามารถอนุมัติคำตอบ AI ได้', 'error');
        }
    } catch (error: any) {
        console.error('Error approving AI response:', error);
        setError('เกิดข้อผิดพลาดในการอนุมัติคำตอบ AI');
        showToastNotification('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการอนุมัติคำตอบ AI', 'error');
        
        if (socketService.isConnected()) {
            socketService.emit('approve_ai_response', {
                userId: pendingReviewMessage.userId,
                responseId: pendingReviewMessage.responseId,
            });
            setAiStatusMessage(`กำลังส่งคำตอบ AI (ID: ${pendingReviewMessage.responseId.substring(0,8)}) [Fallback]...`);
        }
    }
  };

  const handleRejectAiResponse = async () => {
    if (!pendingReviewMessage) {
        console.warn("handleRejectAiResponse called without pendingReviewMessage");
        showToastNotification('ข้อผิดพลาด', 'ไม่พบข้อความที่รออนุมัติ', 'error');
       return;
   }

   const reason = prompt("กรุณาใส่เหตุผลที่ปฏิเสธ (ถ้ามี):") || 'ถูกปฏิเสธโดยแอดมิน';

   try {
       const response = await websocketApi.rejectAIResponse(
           pendingReviewMessage.userId, 
           pendingReviewMessage.responseId, 
           reason
       );

       if (response.success) {
           setAiStatusMessage(`คำตอบ AI (ID: ${pendingReviewMessage.responseId.substring(0,8)}) ถูกปฏิเสธ`);
           showToastNotification('สำเร็จ', 'ปฏิเสธคำตอบ AI แล้ว', 'success');
           
           setTimeout(() => {
               if (pendingReviewMessage) {
                   setPendingReviewMessage(null);
               }
           }, 1000);
       } else {
           setError(response.message || 'ไม่สามารถปฏิเสธคำตอบ AI ได้');
           showToastNotification('ข้อผิดพลาด', response.message || 'ไม่สามารถปฏิเสธคำตอบ AI ได้', 'error');
       }
   } catch (error: any) {
       console.error('Error rejecting AI response:', error);
       setError('เกิดข้อผิดพลาดในการปฏิเสธคำตอบ AI');
       showToastNotification('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการปฏิเสธคำตอบ AI', 'error');
       
       if (socketService.isConnected()) {
           socketService.emit('reject_ai_response', {
               userId: pendingReviewMessage.userId,
               responseId: pendingReviewMessage.responseId,
               reason: reason,
           });
       }
   }
 };

 const handleCancelAiProcessing = async () => {
   if (!currentUser) {
       showToastNotification('ข้อผิดพลาด', 'ไม่พบผู้ใช้ที่เลือก', 'error');
       return;
   }

   const activity = usersAiActivities.get(currentUser.userId);
   let messageIdToCancel: string | undefined = (activity?.type === 'processing' || activity?.type === 'thinking' || activity?.type === 'searching') ? activity.details?.messageId : undefined;

   if (!messageIdToCancel) {
       const lastUserMsg = [...messages].filter(m => m.role === 'user' && m.userId === currentUser.userId).pop();
       messageIdToCancel = lastUserMsg?.messageId;
   }

   if (!messageIdToCancel) {
       setAiStatusMessage('ไม่สามารถยกเลิก AI: ไม่พบ Message ID ที่เกี่ยวข้อง');
       showToastNotification('การดำเนินการล้มเหลว', 'ไม่พบ Message ID สำหรับการยกเลิก AI', 'error');
       return;
   }

   try {
       const response = await websocketApi.cancelAIProcessing(currentUser.userId, messageIdToCancel);

       if (response.success) {
          setAiStatusMessage('กำลังยกเลิกการประมวลผล AI...');
          showToastNotification('สำเร็จ', 'ยกเลิกการประมวลผล AI แล้ว', 'success');
      } else {
          setError(response.message || 'ไม่สามารถยกเลิกการประมวลผล AI ได้');
          showToastNotification('ข้อผิดพลาด', response.message || 'ไม่สามารถยกเลิกการประมวลผล AI ได้', 'error');
      }
  } catch (error: any) {
      console.error('Error cancelling AI processing:', error);
      setError('เกิดข้อผิดพลาดในการยกเลิกการประมวลผล AI');
      showToastNotification('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการยกเลิกการประมวลผล AI', 'error');
      
      if (socketService.isConnected()) {
          socketService.emit('cancel_ai_processing', { userId: currentUser.userId, messageId: messageIdToCancel });
          setAiStatusMessage('กำลังยกเลิกการประมวลผล AI... [Fallback]');
      }
  }
};

const getUserAiActivityDisplay = (userId: string): string | null => {
  const activity = usersAiActivities.get(userId);
  if (!activity) return null;
  switch (activity.type) {
      case 'processing': return `AI ประมวลผล...`;
      case 'thinking': return `AI คิด...`;
      case 'searching': return `AI ค้นหา...`;
      case 'paused': return `AI หยุด (${activity.details?.reason === 'admin_typing' && userId === currentUser?.userId ? 'คุณกำลังพิมพ์' : activity.details?.reason || 'ไม่ทราบสาเหตุ'})`;
      case 'pending_review': return `AI ตอบกลับรออนุมัติ`;
      case 'error': return `AI ผิดพลาด`;
      default: return null;
  }
};

if (loading && !users.length) {
  return <div className="d-flex justify-content-center align-items-center vh-100"><LoadingSpinner /></div>;
}

return (
  <div className="page-container">
    <div className="d-flex justify-content-between align-items-center mb-4">
      <div className="d-flex align-center gap-3">
        <ChatIcon size="lg" color="var(--primary-blue)" />
        <h1 className="mb-0">แชท</h1>
      </div>
      {currentUser && (
        <div className="d-flex align-items-center gap-2">
          <span className="small text-muted">AI สำหรับ {currentUser.displayName}:</span>
          <label className="toggle"><input type="checkbox" id={`ai-toggle-${currentUser.userId}`} checked={!!currentUser.aiEnabled} onChange={(e) => toggleUserAI(currentUser.userId, e.target.checked)} /><span className="toggle-slider"></span></label>
        </div>
      )}
    </div>

    {error && <div className="alert alert-danger">{error}</div>}

    <div className="grid grid-2">
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h2 className="section-title mb-0 d-flex align-center gap-2">
            <UserIcon size="md" color="var(--primary-blue)" />
            ผู้ใช้งาน ({filteredUsers.length})
          </h2>
          {loading && users.length > 0 && <LoadingSpinner />}
        </div>
        <div className="card-body p-0">
          <div className="p-3 border-bottom">
            <div className="input-group">
              <SearchIcon size="sm" className="position-absolute" style={{ left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 10 }} />
              <input type="text" className="input-field" placeholder="ค้นหาผู้ใช้..." onChange={(e) => debouncedSetSearchTerm(e.target.value)} style={{ paddingLeft: '35px' }} />
            </div>
          </div>
          <div className="users-list-container">
            {filteredUsers.length === 0 && !loading && <div className="text-center p-3 text-muted"><p>ไม่พบผู้ใช้งานที่ตรงกัน</p></div>}
            <div>
              {filteredUsers.map((user) => {
                const userSpecificAiStatus = getUserAiActivityDisplay(user.userId);
                const hasUnread = hasUnreadMessages(user.userId, unreadUsers);
                const displayInfo = getUserDisplayInfo(user);
                const badges = getUserBadgeInfo(user);
                
                return (
                  <div 
                    key={user.userId} 
                    className={`user-item d-flex align-items-center p-3 ${currentUser?.userId === user.userId ? 'active' : ''} ${user.isNew ? 'new-user-highlight' : ''}`}
                    onClick={() => handleUserSelect(user)}
                  >
                    <UserAvatar userId={user.userId} displayName={user.displayName} pictureUrl={user.pictureUrl} size={40}/>
                    <div className="flex-grow-1 ms-3 overflow-hidden">
                      <div className="d-flex justify-content-between align-items-start">
                        <h6 className={`mb-0 text-truncate ${hasUnread ? 'fw-bold' : ''}`} title={user.displayName}>
                          {user.displayName}
                          {badges.filter(badge => badge.text === 'ใหม่!').map((badge, index) => (
                              <span key={`new-${index}`} className={`badge badge-success ms-2 ${badge.pulse ? 'pulse' : ''}`}>{badge.text}</span>
                            ))
                          }
                        </h6>
                        <div className="d-flex align-items-center">
                            {hasUnread && <span className="badge badge-danger me-2">ใหม่</span>}
                            {badges.filter(badge => badge.text !== 'ใหม่!' && badge.text !== 'ออนไลน์').map((badge, index) => (
                                <span key={`badge-${index}`} className={`badge ${badge.text === 'AI เปิด' ? 'badge-success' : 'badge-secondary'}`}>{badge.text}</span>
                              ))
                            }
                        </div>
                      </div>
                      <p className="mb-0 text-muted small text-truncate" title={user.userId}>ID: {displayInfo.shortId}...</p>
                      <small className="text-muted d-block">{displayInfo.isOnline ? <span className="text-success">ออนไลน์</span> : <span className="text-secondary">{displayInfo.statusText}</span>}</small>
                      {userSpecificAiStatus && <span className="badge badge-info mt-1">{userSpecificAiStatus}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        {currentUser ? (
          <>
            <div className="card-header d-flex align-items-center p-3">
              <UserAvatar userId={currentUser.userId} displayName={currentUser.displayName} pictureUrl={currentUser.pictureUrl} size={38}/>
              <div className="ms-3">
                <h5 className="mb-0">{currentUser.displayName}{currentUser.isNew && <span className="badge badge-success ms-2">ผู้ใช้ใหม่</span>}</h5>
                <small className="text-muted">{getUserDisplayInfo(currentUser).isOnline ? 'ออนไลน์' : `ออฟไลน์ (${getUserDisplayInfo(currentUser).statusText})`}</small>
              </div>
            </div>
            <div className="card-body p-0 d-flex flex-column chat-card-body">
              <div className="chat-messages">
                {loadingMessages && messages.length === 0 && <div className="text-center text-muted py-5"><LoadingSpinner /></div>}
                {!loadingMessages && messages.length === 0 && !adminTypingInfo.visible && (
                  <div className="text-center text-muted py-5"><p>{currentUser.isNew ? `ยินดีต้อนรับ ${currentUser.displayName}! นี่คือการสนทนาครั้งแรก` : 'ยังไม่มีข้อความในการสนทนานี้'}</p></div>
                )}
                {messages.map((message, index) => {
                  const uniqueKey = `${message.messageId}-${message.timestamp}-${index}`;
                  const displayInfo = getMessageDisplayInfo(message);
                  const roleDisplay = getRoleDisplay(message.role);
                  const avatarContent = getAvatarContent(message.role, displayInfo.displayName);
                  
                  return (
                    <div key={uniqueKey} className={`d-flex mb-3 message-wrapper ${displayInfo.alignment === 'right' ? 'justify-content-end' : 'justify-content-start'}`}>
                      <div className={`d-flex message-inner ${displayInfo.alignment === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`avatar-container ${displayInfo.alignment === 'right' ? 'ms-2' : 'me-2'}`}>
                          {displayInfo.pictureUrl ? <img src={displayInfo.pictureUrl} alt={displayInfo.displayName} className="rounded-circle message-avatar"/> : <div className={`rounded-circle d-flex align-items-center justify-content-center text-white fw-bold message-avatar-text ${avatarContent.className}`}>{avatarContent.text}</div>}
                        </div>
                        <div className={`message-content-wrapper ${displayInfo.alignment === 'right' ? 'text-end' : 'text-start'}`}>
                          <div className="small text-muted mb-1 sender-info"><strong>{displayInfo.displayName}</strong><span className={`badge ${roleDisplay.className} ms-1`}>{roleDisplay.label}</span></div>
                          <div className={`p-3 rounded-3 message-bubble ${displayInfo.alignment === 'right' ? 'bg-primary text-white' : 'bg-light text-dark'}`}><div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div><div className="small mt-2 text-muted">{formatDate(message.timestamp)}</div></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {adminTypingInfo.visible && (
                  <div className="d-flex justify-content-start mb-3 message-wrapper">
                      <div className="d-flex message-inner flex-row">
                          <div className="avatar-container me-2"><div className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold message-avatar-text bg-info">A</div></div>
                          <div className="message-content-wrapper text-start">
                              <div className="small text-muted mb-1 sender-info"><strong>คุณ (Admin)</strong><span className="badge badge-info ms-1">Typing</span></div>
                              <div className="p-3 rounded-3 message-bubble bg-light text-dark"><div style={{ whiteSpace: 'pre-wrap' }} className="fst-italic">คุณกำลังพิมพ์... (AI หยุดชั่วคราว) ({adminTypingInfo.elapsedTime} วินาที)</div></div>
                          </div>
                      </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
                {pendingReviewMessage && (
                  <div className="pending-review-message">
                    <div className="d-flex justify-content-between align-items-center mb-2"><strong>คำตอบจาก AI (รออนุมัติ)</strong><span className="badge badge-warning">ID: {pendingReviewMessage.responseId.substring(0,8)}</span></div>
                    <div className="pending-review-content mb-3">{pendingReviewMessage.content}</div>
                    <div className="d-flex justify-content-end gap-2">
                      <button className="btn btn-danger btn-sm" onClick={handleRejectAiResponse} disabled={sending}>
                        <CloseIcon size="sm" /> ปฏิเสธ
                      </button>
                      <button className="btn btn-success btn-sm" onClick={handleApproveAiResponse} disabled={sending}>
                        <SuccessIcon size="sm" /> อนุมัติและส่ง
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {(aiStatusMessage && currentUser && !(usersAiActivities.get(currentUser.userId)?.type === 'paused' && usersAiActivities.get(currentUser.userId)?.details?.reason === 'admin_typing')) && (
                <div className="ai-status-bar">
                  {aiStatusMessage}
                  {(usersAiActivities.get(currentUser.userId)?.type === 'processing' || (aiStatusMessage && aiStatusMessage.includes("ประมวลผล"))) && (
                      <button className="btn btn-warning btn-sm ms-2" onClick={handleCancelAiProcessing} disabled={sending}>ยกเลิก AI</button>
                  )}
                </div>
              )}
              <div className="chat-input-container">
                <div className="d-flex align-items-end gap-2">
                  <textarea ref={messageInputRef} rows={1} placeholder="พิมพ์ข้อความ..." value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyPress={handleKeyPress} onFocus={handleInputFocus} onBlur={handleInputBlur} className="input-field" disabled={sending || !currentUser}/>
                  <button className="btn btn-primary btn-icon" onClick={handleSendMessage} disabled={!messageInput.trim() || sending || !currentUser}>
                    {sending ? <LoadingSpinner /> : <ChatIcon size="sm" />}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="card-body text-center d-flex flex-column justify-content-center align-items-center"><h5 className="text-muted">เลือกผู้ใช้เพื่อเริ่มการสนทนา</h5><p className="text-muted small">เลือกผู้ใช้จากรายการด้านซ้ายเพื่อดูการสนทนาและตอบกลับ</p></div>
        )}
      </div>
    </div>
  </div>
);
};

export default ChatPage;
