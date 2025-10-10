// webSocket.js
const EventEmitter = require('events');

class WebSocketManager extends EventEmitter {
    constructor(io, logger, lineHandler, aiAssistant, chatHistory) {
        super();
        this.io = io;
        this.logger = logger;
        this.lineHandler = lineHandler;
        this.aiAssistant = aiAssistant;
        this.chatHistory = chatHistory;
        
        // การจัดการสถานะ Admin
        this.adminSessions = new Map();
        this.adminTypingTimers = new Map();
        
        // การจัดการ AI Processing
        this.aiProcessingQueue = new Map();
        this.pendingAIResponses = new Map();
        
        // เก็บ active connections
        this.activeConnections = new Map();
        
        // การตั้งค่า
        this.config = {
            adminReviewDelay: 0,
            adminTypingTimeout: 0,
            aiProcessingTimeout: 0,
            autoSendDelay: 0,
            enableAdminReview: true,
            enableAutoSend: true
        };
        
        this.setupCleanupInterval();
    }

    handleSocketConnection(socket) {
        try {
            this.activeConnections.set(socket.id, {
                socket: socket,
                connectedAt: Date.now(),
                authenticated: false,
                user: null
            });

            this.logger.info('WebSocket client connected via manager', { 
                socketId: socket.id,
                totalConnections: this.activeConnections.size
            });

            this.setupSocketEventHandlers(socket);

            socket.on('disconnect', (reason) => {
                this.handleSocketDisconnection(socket, reason);
            });

            this.io.emit('client_connected', {
                socketId: socket.id,
                timestamp: Date.now(),
                totalConnections: this.activeConnections.size
            });

        } catch (error) {
            this.logger.error('Error handling socket connection:', error);
        }
    }

    notifyNewMessage(userId, message) {
    try {
        this.io.emit('new_message', {
            userId: userId,
            message: {
                ...message,
                isNew: true
            },
            timestamp: Date.now()
        });

        if (message.role === 'user') {
            let userDisplayName = 'ไม่ทราบ User';
            
            // พยายามดึง displayName จากหลายแหล่ง
            if (message.senderProfile?.displayName) {
                userDisplayName = message.senderProfile.displayName;
            } else if (message.displayName) {
                userDisplayName = message.displayName;
            } else {
                userDisplayName = `User ${userId.substring(1, 9)}`;
            }

            // ส่ง admin notification ทันที
            this.io.emit('admin_new_user_message', {
                type: 'new_user_message',
                userId: userId,
                displayName: userDisplayName, 
                messageContent: message.content, 
                messageTimestamp: message.timestamp,
                messageId: message.messageId,
                timestamp: Date.now()
            });

            this.io.emit('unread_status_update', {
                userId: userId,
                hasUnread: true, 
                timestamp: Date.now()
            });
        }

        this.logger.info('New message notification sent via manager', { 
            userId, 
            messageRole: message.role,
            messageId: message.messageId,
            displayName: message.senderProfile?.displayName || 'unknown'
        });

    } catch (error) {
        this.logger.error('Error sending new message notification via manager:', error);
    }
}

    setupSocketEventHandlers(socket) {
        socket.on('authenticate', (data) => {
            this.handleAuthentication(socket, data);
        });
        
        socket.on('admin_typing_start', (data) => {
            this.handleAdminTypingStart(socket, data);
        });
        
        socket.on('admin_typing_stop', (data) => {
            this.handleAdminTypingStop(socket, data);
        });
        
        socket.on('cancel_ai_processing', (data) => {
            this.handleCancelAIProcessing(socket, data);
        });
        
        socket.on('approve_ai_response', (data) => {
            this.handleApproveAIResponse(socket, data);
        });
        
        socket.on('reject_ai_response', (data) => {
            this.handleRejectAIResponse(socket, data);
        });
        
        socket.on('update_websocket_config', (data) => {
            this.handleUpdateConfig(socket, data);
        });
        
        socket.on('get_websocket_status', () => {
            this.handleGetStatus(socket);
        });

        socket.on('mark_messages_read', (data) => {
            this.handleMarkMessagesRead(socket, data);
        });

        socket.on('subscribe_user_notifications', (data) => {
            this.handleSubscribeNotifications(socket, data);
        });
    }

    handleSocketDisconnection(socket, reason) {
        try {
            const connection = this.activeConnections.get(socket.id);
            
            if (connection) {
                for (const [adminId, session] of this.adminSessions.entries()) {
                    if (session.socketId === socket.id) {
                        this.adminSessions.delete(adminId);
                        
                        this.io.emit('admin_disconnected', {
                            adminId: adminId,
                            userId: session.userId,
                            timestamp: Date.now()
                        });
                        
                        if (session.userId) {
                           this.resumeAIProcessing(session.userId, adminId);
                        }
                        break;
                    }
                }
                
                this.activeConnections.delete(socket.id);
            }
            
            this.logger.info('WebSocket client disconnected via manager', { 
                socketId: socket.id,
                reason: reason,
                totalConnections: this.activeConnections.size
            });

            this.io.emit('client_disconnected', {
                socketId: socket.id,
                reason: reason,
                timestamp: Date.now(),
                totalConnections: this.activeConnections.size
            });
            
        } catch (error) {
            this.logger.error('Error handling socket disconnection:', error);
        }
    }

    handleAuthentication(socket, data) {
        try {
            const { token, role, userId, username } = data;
            
            if (!token) {
                socket.emit('auth_error', { message: 'Token required' });
                return;
            }
            
            const user = {
                id: userId || socket.id,
                username: username || 'AuthenticatedUser',
                role: role || 'user'
            };
            
            const connection = this.activeConnections.get(socket.id);
            if (connection) {
                connection.authenticated = true;
                connection.user = user;
            }
            
            socket.authenticated = true;
            socket.userRole = user.role;
            socket.userId = user.id;
            socket.user = user;
            
            socket.emit('authenticated', {
                status: true,
                user: user,
                timestamp: Date.now()
            });
            
            this.logger.info('Socket authenticated via manager', {
                socketId: socket.id,
                user: user
            });

            this.io.emit('user_authenticated', {
                socketId: socket.id,
                user: user,
                timestamp: Date.now()
            });
            
        } catch (error) {
            this.logger.error('Authentication error in manager:', error);
            socket.emit('auth_error', { message: 'Authentication failed' });
        }
    }

    handleAdminTypingStart(socket, data) {
        try {
            const { userId, adminId } = data;
            
            if (!socket.authenticated || socket.userRole !== 'admin') {
                socket.emit('websocket_error', { event: 'admin_typing_start', message: 'Unauthorized' });
                return;
            }
            
            this.adminSessions.set(adminId, {
                userId: userId,
                isTyping: true,
                lastActivity: Date.now(),
                socketId: socket.id
            });
            
            if (this.adminTypingTimers.has(adminId)) {
                clearTimeout(this.adminTypingTimers.get(adminId));
                this.adminTypingTimers.delete(adminId);
            }
            
            this.pauseAIProcessing(userId, 'admin_typing');
            
            this.io.emit('admin_typing_status', {
                userId: userId,
                adminId: adminId,
                isTyping: true,
                timestamp: Date.now()
            });
            
            this.logger.info('Admin started typing', { adminId, userId });
            
        } catch (error) {
            this.logger.error('Error handling admin typing start:', error);
            socket.emit('websocket_error', { event: 'admin_typing_start', message: 'Error updating typing status' });
        }
    }

    handleAdminTypingStop(socket, data) {
        try {
            const { userId, adminId } = data;
            
            if (!socket.authenticated || socket.userRole !== 'admin') {
                socket.emit('websocket_error', { event: 'admin_typing_stop', message: 'Unauthorized' });
                return;
            }
            
            const adminSession = this.adminSessions.get(adminId);
            if (adminSession && adminSession.userId === userId) {
                adminSession.isTyping = false;
                adminSession.lastActivity = Date.now();

                const timer = setTimeout(() => {
                    const currentSession = this.adminSessions.get(adminId);
                    if (currentSession && !currentSession.isTyping && currentSession.userId === userId) {
                        this.resumeAIProcessing(userId, adminId);
                    }
                    this.adminTypingTimers.delete(adminId);
                }, this.config.autoSendDelay);
            
                this.adminTypingTimers.set(adminId, timer);
            }
            
            this.io.emit('admin_typing_status', {
                userId: userId,
                adminId: adminId,
                isTyping: false,
                timestamp: Date.now()
            });
            
            this.logger.info('Admin stopped typing', { adminId, userId });
            
        } catch (error) {
            this.logger.error('Error handling admin typing stop:', error);
            socket.emit('websocket_error', { event: 'admin_typing_stop', message: 'Error updating typing status' });
        }
    }

    startAIProcessing(userId, messageId, userMessage) {
        try {
            const adminTypingAdminId = this.isAdminTyping(userId);
            if (adminTypingAdminId) {
                this.logger.info('AI processing paused - admin is typing', { userId, adminId: adminTypingAdminId });
                return false;
            }
            
            const processingData = {
                messageId: messageId,
                status: 'processing',
                timestamp: Date.now(),
                userMessage: userMessage,
                timer: null
            };
            
            processingData.timer = setTimeout(() => {
                this.handleAIProcessingTimeout(userId, messageId);
            }, this.config.aiProcessingTimeout);
            
            this.aiProcessingQueue.set(userId, processingData);
            
            this.io.emit('ai_processing_started', {
                userId: userId,
                messageId: messageId,
                status: 'processing',
                message: 'AI กำลังประมวลผลคำตอบ...',
                timestamp: Date.now()
            });
            
            this.logger.info('AI processing started', { userId, messageId });
            return true;
            
        } catch (error) {
            this.logger.error('Error starting AI processing:', error);
            return false;
        }
    }

    pauseAIProcessing(userId, reason) {
        const processingData = this.aiProcessingQueue.get(userId);
        if (processingData && processingData.status === 'processing') {
            processingData.status = 'paused';
            processingData.pauseReason = reason;
            
            if (processingData.timer) {
                clearTimeout(processingData.timer);
                processingData.timer = null;
            }
            
            this.aiProcessingQueue.set(userId, processingData);

            this.io.emit('ai_processing_paused', {
                userId: userId,
                messageId: processingData.messageId,
                reason: reason,
                message: 'หยุด AI ชั่วคราว',
                timestamp: Date.now()
            });
            
            this.logger.info('AI processing paused', { userId, messageId: processingData.messageId, reason });
        }
    }

    resumeAIProcessing(userId, adminIdContext) {
        const processingData = this.aiProcessingQueue.get(userId);
        if (processingData && processingData.status === 'paused') {
            const currentAdminTypingId = this.isAdminTyping(userId);
            if (currentAdminTypingId) {
                this.logger.info(`AI processing remains paused for user ${userId} - another admin (${currentAdminTypingId}) is typing.`);
                return;
            }

            processingData.status = 'processing';
            const originalUserMessage = processingData.userMessage;
            
            if (processingData.timer) clearTimeout(processingData.timer);
            processingData.timer = setTimeout(() => {
                this.handleAIProcessingTimeout(userId, processingData.messageId);
            }, this.config.aiProcessingTimeout);
            
            this.aiProcessingQueue.set(userId, processingData);

            this.io.emit('ai_processing_resumed', {
                userId: userId,
                messageId: processingData.messageId,
                adminId: adminIdContext,
                message: 'AI กลับมาประมวลผลต่อ',
                timestamp: Date.now()
            });
            
            this.logger.info('AI processing resumed', { userId, messageId: processingData.messageId, resumedByAdmin: adminIdContext });
            
            if (originalUserMessage && this.aiAssistant) {
                this.continueAIProcessing(userId, processingData);
            } else {
                this.logger.warn('Cannot continue AI processing: Missing original user message or AI assistant.', { userId });
                this.handleAIProcessingError(userId, processingData.messageId, new Error("Missing context to continue AI processing"));
            }
        }
    }

    async continueAIProcessing(userId, processingData) {
        try {
            if (!this.aiAssistant || typeof this.aiAssistant.generateResponse !== 'function') {
                throw new Error('AI Assistant is not available or not properly configured.');
            }

            const response = await this.aiAssistant.generateResponse(
                processingData.userMessage.content,
                processingData.userMessage.products || [],
                userId
            );
            
            if (response && response.response) {
                await this.handleAIResponseReceived(userId, processingData.messageId, response);
            } else {
                this.logger.warn('AI Assistant generated an empty or invalid response.', { userId, messageId: processingData.messageId });
                throw new Error('Invalid AI response received during continuation.');
            }
            
        } catch (error) {
            this.logger.error('Error continuing AI processing:', { error: error.message, userId, messageId: processingData.messageId });
            this.handleAIProcessingError(userId, processingData.messageId, error);
        }
    }

    cancelAIProcessing(userId, messageId) {
        const processingData = this.aiProcessingQueue.get(userId);
        if (processingData && (processingData.messageId === messageId || !messageId) ) {
            if (processingData.timer) {
                clearTimeout(processingData.timer);
            }
            
            this.aiProcessingQueue.delete(userId);
            
            this.io.emit('ai_processing_cancelled', {
                userId: userId,
                messageId: processingData.messageId,
                message: 'ยกเลิกการประมวลผล AI โดยแอดมิน',
                timestamp: Date.now()
            });
            this.logger.info('AI processing cancelled by admin', { userId, messageId: processingData.messageId });
            return true;
        }
        this.logger.warn('No active AI processing found to cancel', { userId, messageId });
        return false;
    }

    async handleAIResponseReceived(userId, messageId, aiResponse, channelAccessToken) {
        try {
            const processingData = this.aiProcessingQueue.get(userId);
            if (processingData && processingData.timer) {
                 clearTimeout(processingData.timer);
            }
            this.aiProcessingQueue.delete(userId);
            
            if (this.config.enableAdminReview) {
                await this.requestAdminReview(userId, messageId, aiResponse, channelAccessToken);
            } else {
                await this.sendAIResponse(userId, aiResponse, messageId, channelAccessToken);
            }
            
        } catch (error) {
            this.logger.error('Error handling AI response received:', { error: error.message, userId, messageId });
            this.handleAIProcessingError(userId, messageId, error);
        }
    }

    async requestAdminReview(userId, originalMessageId, aiResponse, channelAccessToken) {
        const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const reviewData = {
            responseId: responseId,
            messageId: originalMessageId,
            response: aiResponse, // *** แก้ไข: เก็บ object เต็ม ***
            adminReview: 'pending',
            timestamp: Date.now(),
            timer: null,
            channelAccessToken: channelAccessToken // Store the token
        };
        
        if (this.config.enableAutoSend && this.config.adminReviewDelay > 0) {
            reviewData.timer = setTimeout(async () => {
                const currentReviewData = this.pendingAIResponses.get(userId);
                if (currentReviewData && currentReviewData.responseId === responseId && currentReviewData.adminReview === 'pending') {
                    this.logger.info('Auto-sending AI response after review timeout', { userId, responseId, originalMessageId });
                    await this.approveAndSendAIResponse(userId, responseId, 'auto_approved');
                }
            }, this.config.adminReviewDelay);
        }
        
        this.pendingAIResponses.set(userId, reviewData);
        
        // *** แก้ไข: ส่งข้อมูลให้ถูกต้อง ***
        const responseContent = aiResponse?.response || aiResponse || 'ไม่สามารถแสดงเนื้อหาได้';
        
        this.io.emit('ai_response_pending_review', {
            userId: userId,
            responseId: responseId,
            messageId: originalMessageId,
            response: responseContent, // *** แก้ไข: ใช้ 'response' แทน 'responseContent' ***
            autoSendIn: (this.config.enableAutoSend && this.config.adminReviewDelay > 0) ? this.config.adminReviewDelay : null,
            message: 'AI ประมวลผลเสร็จแล้ว - รอการตรวจสอบจากแอดมิน',
            timestamp: Date.now()
        });
        
        this.logger.info('AI response pending admin review', { 
            userId, 
            responseId, 
            originalMessageId,
            responseLength: responseContent.length
        });
    }

    async approveAndSendAIResponse(userId, responseId, approvedBy = 'admin') {
        const reviewData = this.pendingAIResponses.get(userId);
        if (reviewData && reviewData.responseId === responseId) {
            if (reviewData.timer) {
                clearTimeout(reviewData.timer);
            }
            
            await this.sendAIResponse(userId, reviewData.response, reviewData.messageId, reviewData.channelAccessToken);
            this.pendingAIResponses.delete(userId);
            
            this.io.emit('ai_response_approved_and_sent', {
                userId: userId,
                responseId: responseId,
                originalMessageId: reviewData.messageId,
                approvedBy: approvedBy,
                message: approvedBy === 'auto_approved' ? 'คำตอบ AI ถูกส่งอัตโนมัติ' : 'คำตอบ AI ได้รับการอนุมัติและส่งแล้ว',
                timestamp: Date.now()
            });
            this.logger.info(`AI response approved and sent (by ${approvedBy})`, { userId, responseId, originalMessageId: reviewData.messageId });
        } else {
            this.logger.warn('Could not find pending AI response to approve or already handled', { userId, responseId });
        }
    }

    rejectAIResponse(userId, responseId, reason, rejectedBy = 'admin') {
        const reviewData = this.pendingAIResponses.get(userId);
        if (reviewData && reviewData.responseId === responseId) {
            if (reviewData.timer) {
                clearTimeout(reviewData.timer);
            }
            
            this.pendingAIResponses.delete(userId);
            
            this.io.emit('ai_response_rejected', {
                userId: userId,
                responseId: responseId,
                originalMessageId: reviewData.messageId,
                reason: reason,
                rejectedBy: rejectedBy,
                message: 'ปฏิเสธคำตอบ AI โดยแอดมิน',
                timestamp: Date.now()
            });
            
            this.logger.info('AI response rejected', { userId, responseId, originalMessageId: reviewData.messageId, reason, rejectedBy });
        } else {
            this.logger.warn('Could not find pending AI response to reject or already handled', { userId, responseId });
        }
    }

    async sendAIResponse(userId, aiResponseObject, originalMessageId, channelAccessToken) {
        try {
            if (!this.lineHandler || typeof this.lineHandler.pushMessage !== 'function') {
                throw new Error('LineHandler is not available or not properly configured.');
            }
            
            // *** แก้ไข: จัดการ response object ให้ถูกต้อง ***
            let aiTextResponse;
           if (typeof aiResponseObject === 'string') {
               aiTextResponse = aiResponseObject;
           } else if (aiResponseObject && aiResponseObject.response) {
               aiTextResponse = aiResponseObject.response;
           } else {
               throw new Error('Invalid AI response format');
           }

           const modelMessageId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

           // ส่งข้อความผ่าน LINE - fromAdmin เป็น false
           // ใช้ processOutgoingMessageWithDelay เพื่อให้มีการตรวจจับ keyword และส่งรูป
           await this.lineHandler.processOutgoingMessageWithDelay(
               userId,
               aiTextResponse,
               modelMessageId,
               false,
               'webSocketManager',
               channelAccessToken
           );
           
           // บันทึกลงประวัติ
           const modelMessage = {
               role: 'model',
               content: aiTextResponse,
               timestamp: Date.now(),
               messageId: modelMessageId,
               originalUserMessageId: originalMessageId,
               source: 'ai',
               tokens: (typeof aiResponseObject === 'object' && aiResponseObject.tokens) ? aiResponseObject.tokens : { input: 0, output: 0 }
           };
           
           if (this.chatHistory && typeof this.chatHistory.saveHistory === 'function') {
               await this.chatHistory.saveHistory(userId, {
                   messages: [modelMessage],
                   lastUpdated: Date.now(),
                   totalTokens: modelMessage.tokens
               }, 'api');
           } else {
               this.logger.warn('ChatHistory service not available, AI response not saved to history.', { userId });
           }

           // *** แก้ไข: ไม่แจ้งเตือนข้อความใหม่สำหรับ AI response เพราะจะซ้ำกับ pushMessage ***
           // this.notifyNewMessage(userId, modelMessage); // ลบบรรทัดนี้
           
           this.logger.info('AI response sent successfully to LINE user', { userId, modelMessageId, originalMessageId });
           
       } catch (error) {
           this.logger.error('Error sending AI response via WebSocketManager:', { error: error.message, userId });
           this.io.emit('ai_send_error', { userId, originalMessageId, error: error.message, timestamp: Date.now() });
       }
   }

   handleAIProcessingTimeout(userId, messageId) {
       const processingData = this.aiProcessingQueue.get(userId);
       if (processingData && processingData.messageId === messageId) {
           this.aiProcessingQueue.delete(userId);
       
           this.io.emit('ai_processing_timeout', {
               userId: userId,
               messageId: messageId,
               message: 'AI ประมวลผลหมดเวลา (timeout)',
               timestamp: Date.now()
           });
           
           this.logger.warn('AI processing timeout', { userId, messageId });
       }
   }

   handleAIProcessingError(userId, messageId, error) {
       const processingData = this.aiProcessingQueue.get(userId);
       if (processingData && (processingData.messageId === messageId || !messageId)) {
           this.aiProcessingQueue.delete(userId);
       }
       
       this.io.emit('ai_processing_error', {
           userId: userId,
           messageId: messageId,
           error: error.message,
           message: 'เกิดข้อผิดพลาดในการประมวลผล AI',
           timestamp: Date.now()
       });
       
       this.logger.error('AI processing error occurred', { userId, messageId, errorMessage: error.message, stack: error.stack });
   }

   handleCancelAIProcessing(socket, data) {
       try {
           const { userId, messageId } = data;
           
           if (!socket.authenticated || socket.userRole !== 'admin') {
               socket.emit('websocket_error', { event: 'cancel_ai_processing', message: 'Unauthorized' });
               return;
           }
           
           const cancelled = this.cancelAIProcessing(userId, messageId);
           
           socket.emit('ai_processing_cancelled_confirm', {
               success: cancelled,
               userId: userId,
               messageId: messageId,
               timestamp: Date.now()
           });
           
       } catch (error) {
           this.logger.error('Error in handleCancelAIProcessing (socket event):', error);
           socket.emit('websocket_error', { event: 'cancel_ai_processing', message: 'Error cancelling AI processing' });
       }
   }

   handleApproveAIResponse(socket, data) {
       try {
           const { userId, responseId } = data;
           
           if (!socket.authenticated || socket.userRole !== 'admin') {
                socket.emit('websocket_error', { event: 'approve_ai_response', message: 'Unauthorized' });
               return;
           }
           
           const adminUser = socket.user || { id: 'unknown_admin', username: 'UnknownAdmin' };
           this.approveAndSendAIResponse(userId, responseId, adminUser.username);
           
           socket.emit('ai_response_approved_confirm', {
               success: true,
               userId: userId,
               responseId: responseId,
               timestamp: Date.now()
           });
           
       } catch (error) {
           this.logger.error('Error in handleApproveAIResponse (socket event):', error);
           socket.emit('websocket_error', { event: 'approve_ai_response', message: 'Error approving AI response' });
       }
   }

   handleRejectAIResponse(socket, data) {
       try {
           const { userId, responseId, reason } = data;
           
           if (!socket.authenticated || socket.userRole !== 'admin') {
               socket.emit('websocket_error', { event: 'reject_ai_response', message: 'Unauthorized' });
               return;
           }
           
           const adminUser = socket.user || { id: 'unknown_admin', username: 'UnknownAdmin' };
           this.rejectAIResponse(userId, responseId, reason || 'No reason provided', adminUser.username);
           
           socket.emit('ai_response_rejected_confirm', {
               success: true,
               userId: userId,
               responseId: responseId,
               reason: reason,
               timestamp: Date.now()
           });
           
       } catch (error) {
           this.logger.error('Error in handleRejectAIResponse (socket event):', error);
           socket.emit('websocket_error', { event: 'reject_ai_response', message: 'Error rejecting AI response' });
       }
   }

   // *** แก้ไข: ปรับปรุงการจัดการ displayName และป้องกันการซ้ำ ***
   notifyNewMessage(userId, message) {
       try {
           this.io.emit('new_message', {
               userId: userId,
               message: {
                   ...message,
                   isNew: true
               },
               timestamp: Date.now()
           });

           if (message.role === 'user') {
               let userDisplayName = 'ไม่ทราบ User';
               
               // พยายามดึง displayName จากหลายแหล่ง
               if (message.senderProfile?.displayName) {
                   userDisplayName = message.senderProfile.displayName;
               } else if (message.displayName) {
                   userDisplayName = message.displayName;
               } else {
                   // ลองดึงจาก chat history
                   if (this.chatHistory && typeof this.chatHistory.getUserDisplayName === 'function') {
                       this.chatHistory.getUserDisplayName(userId).then(name => {
                           if (name) userDisplayName = name;
                       }).catch(() => {
                           userDisplayName = `User ${userId.substring(1, 9)}`;
                       });
                   } else {
                       userDisplayName = `User ${userId.substring(1, 9)}`;
                   }
               }

               // *** แก้ไข: ใช้ setTimeout เพื่อให้ displayName โหลดเสร็จก่อน ***
               setTimeout(() => {
                   this.io.emit('admin_new_user_message', {
                       type: 'new_user_message',
                       userId: userId,
                       displayName: userDisplayName, 
                       messageContent: message.content, 
                       messageTimestamp: message.timestamp,
                       messageId: message.messageId,
                       timestamp: Date.now()
                   });

                   this.io.emit('unread_status_update', {
                       userId: userId,
                       hasUnread: true, 
                       timestamp: Date.now()
                   });
               }, 100); // รอ 100ms ให้ displayName โหลดเสร็จ
           }

           this.logger.info('New message notification sent via manager', { 
               userId, 
               messageRole: message.role,
               messageId: message.messageId,
               displayName: message.senderProfile?.displayName || 'unknown'
           });

       } catch (error) {
           this.logger.error('Error sending new message notification via manager:', error);
       }
   }

   notifyMessageUpdate(userId, messageId, status) {
       try {
           this.io.emit('message_status_update', {
               userId: userId,
               messageId: messageId,
               status: status,
               timestamp: Date.now()
           });

           this.logger.info('Message status update sent via manager', { userId, messageId, status });

       } catch (error) {
           this.logger.error('Error sending message status update via manager:', error);
       }
   }

   handleMarkMessagesRead(socket, data) {
       try {
           const { userId, lastReadTimestamp } = data;
           
           if (!socket.authenticated) {
               socket.emit('auth_error', { message: 'Authentication required for marking messages read' });
               return;
           }

           this.io.emit('messages_marked_read', {
               userId: userId,
               lastReadTimestamp: lastReadTimestamp,
               readBy: socket.user,
               timestamp: Date.now()
           });

           this.io.emit('unread_status_update', {
               userId: userId,
               hasUnread: false,
               timestamp: Date.now()
           });

           this.logger.info('Messages marked as read notification sent via manager', { 
               userId, 
               lastReadTimestamp, 
               readBy: socket.user?.username 
           });

       } catch (error) {
           this.logger.error('Error in handleMarkMessagesRead via manager:', error);
           socket.emit('websocket_error', { 
               event: 'mark_messages_read',
               message: 'Error marking messages as read on server' 
           });
       }
   }

   handleSubscribeNotifications(socket, data) {
       try {
           const { userId: targetUserId } = data;
           
           if (!socket.authenticated) {
                socket.emit('auth_error', { message: 'Authentication required for subscribing' });
               return;
           }

           if (!targetUserId) {
               socket.emit('websocket_error', {event: 'subscribe_user_notifications', message: 'Target UserID is required for subscription'});
               return;
           }

           const roomName = `user_${targetUserId}_notifications`;
           socket.join(roomName);

           socket.emit('notification_subscription_success', {
               subscribedToUserId: targetUserId,
               message: `Successfully subscribed to notifications for user ${targetUserId}`,
               timestamp: Date.now()
           });

           this.logger.info('Socket subscribed to user notifications', { 
               socketId: socket.id, 
               subscribedToUserId: targetUserId, 
               subscribedBy: socket.user?.username 
           });

       } catch (error) {
           this.logger.error('Error subscribing to notifications:', error);
           socket.emit('websocket_error', {event: 'subscribe_user_notifications', message: 'Error subscribing to notifications' });
       }
   }

   isAdminTyping(userId) {
       for (const [adminId, session] of this.adminSessions.entries()) {
           if (session.userId === userId && session.isTyping) {
               const adminSocket = this.io.sockets.sockets.get(session.socketId);
               if (adminSocket && adminSocket.connected) {
                   return adminId;
               } else {
                   this.adminSessions.delete(adminId);
                   this.logger.info(`Removed stale typing session for disconnected admin ${adminId}`, { userId });
               }
           }
       }
       return false;
   }

   handleUpdateConfig(socket, data) {
       try {
           if (!socket.authenticated || socket.userRole !== 'admin') {
               socket.emit('websocket_error', {event: 'update_websocket_config', message: 'Unauthorized'});
               return;
           }
           
           const newConfig = data;
           this.updateConfiguration(newConfig);
           
           socket.emit('websocket_config_updated_confirm', {
               success: true,
               config: this.getConfiguration(),
               timestamp: Date.now()
           });
           
       } catch (error) {
           this.logger.error('Error in handleUpdateConfig (socket event):', error);
           socket.emit('websocket_error', {event: 'update_websocket_config', message: 'Error updating configuration' });
       }
   }

   handleGetStatus(socket) {
       try {
           const status = {
               adminSessions: Array.from(this.adminSessions.entries()).map(([adminId, session]) => ({
                   adminId,
                   userId: session.userId,
                   isTyping: session.isTyping,
                   lastActivity: session.lastActivity,
                   socketId: session.socketId
               })),
               aiProcessingQueue: Array.from(this.aiProcessingQueue.entries()).map(([userId, data]) => ({
                   userId,
                   messageId: data.messageId,
                   status: data.status,
                   timestamp: data.timestamp,
                   durationMs: Date.now() - data.timestamp
               })),
               pendingAIResponses: Array.from(this.pendingAIResponses.entries()).map(([userId, data]) => ({
                   userId,
                   responseId: data.responseId,
                   messageId: data.messageId,
                   adminReview: data.adminReview,
                   timestamp: data.timestamp,
                   waitingMs: Date.now() - data.timestamp
               })),
               activeConnections: this.getConnectionsInfo(),
               totalActiveConnections: this.getActiveConnections(),
               config: this.config,
               timestamp: Date.now()
           };
           
           socket.emit('websocket_status_response', status);
           
       } catch (error) {
           this.logger.error('Error getting WebSocket status:', error);
           socket.emit('websocket_error', {event: 'get_websocket_status', message: 'Error getting status' });
       }
   }

   getActiveConnections() {
       return this.activeConnections.size;
   }

   getConnectionsInfo() {
       const connections = [];
       for (const [socketId, connection] of this.activeConnections.entries()) {
           connections.push({
               socketId,
               connectedAt: connection.connectedAt,
               authenticated: connection.authenticated,
               user: connection.user ? {
                   id: connection.user.id,
                  username: connection.user.username,
                  role: connection.user.role
              } : null,
              userAgent: connection.socket.handshake?.headers?.['user-agent'] || 'N/A',
              ipAddress: connection.socket.handshake?.address || 'N/A'
          });
      }
      return connections;
  }

  getConfiguration() {
      return { 
          ...this.config,
          activeConnectionsCount: this.activeConnections.size,
          adminSessionsCount: this.adminSessions.size,
          aiProcessingQueueCount: this.aiProcessingQueue.size,
          pendingAIResponsesCount: this.pendingAIResponses.size
      };
  }

  updateConfiguration(newConfig) {
      if (typeof newConfig.adminReviewDelay === 'number') this.config.adminReviewDelay = newConfig.adminReviewDelay;
      if (typeof newConfig.adminTypingTimeout === 'number') this.config.adminTypingTimeout = newConfig.adminTypingTimeout;
      if (typeof newConfig.aiProcessingTimeout === 'number') this.config.aiProcessingTimeout = newConfig.aiProcessingTimeout;
      if (typeof newConfig.autoSendDelay === 'number') this.config.autoSendDelay = newConfig.autoSendDelay;
      if (typeof newConfig.enableAdminReview === 'boolean') this.config.enableAdminReview = newConfig.enableAdminReview;
      if (typeof newConfig.enableAutoSend === 'boolean') this.config.enableAutoSend = newConfig.enableAutoSend;
      
      this.io.emit('websocket_config_changed', {
          newConfig: this.config,
          timestamp: Date.now()
      });
      
      this.logger.info('WebSocket configuration updated system-wide', { newConfig: this.config });
  }

  setupCleanupInterval() {
      this.cleanupInterval = setInterval(() => {
          const now = Date.now();
          
          for (const [adminId, session] of this.adminSessions.entries()) {
               const adminSocket = this.io.sockets.sockets.get(session.socketId);
               if (!adminSocket || !adminSocket.connected) {
                   this.adminSessions.delete(adminId);
                   if (this.adminTypingTimers.has(adminId)) {
                       clearTimeout(this.adminTypingTimers.get(adminId));
                       this.adminTypingTimers.delete(adminId);
                   }
                   this.logger.info('Cleaned up inactive/disconnected admin session and timer', { adminId });
                   if (session.isTyping && session.userId) {
                       this.resumeAIProcessing(session.userId, `${adminId}_disconnected`);
                   }
               } else if (now - session.lastActivity > (this.config.adminTypingTimeout * 3)) {
                  this.adminSessions.delete(adminId);
                  this.logger.info('Cleaned up stale admin session (timeout)', { adminId });
               }
          }
          
          for (const [userId, data] of this.aiProcessingQueue.entries()) {
              if (now - data.timestamp > (this.config.aiProcessingTimeout + 5000)) {
                  this.logger.warn(`Fallback cleanup: AI processing for user ${userId} (msg: ${data.messageId}) seems stuck. Forcing timeout.`);
                  this.handleAIProcessingTimeout(userId, data.messageId);
              }
          }

           for (const [userId, data] of this.pendingAIResponses.entries()) {
               if (now - data.timestamp > (this.config.adminReviewDelay * 2) + 60000) {
                   this.logger.warn(`Fallback cleanup: Pending AI response for user ${userId} (resp: ${data.responseId}) is very old. Removing.`);
                   if (data.timer) clearTimeout(data.timer);
                   this.pendingAIResponses.delete(userId);
                    this.io.emit('ai_response_cleanup', { userId, responseId: data.responseId, reason: 'stale_pending_review' });
               }
           }
          
      }, 60000 * 5);
      this.logger.info('Periodic cleanup interval for WebSocketManager started.');
  }

  cleanup() {
      try {
          if (this.cleanupInterval) {
              clearInterval(this.cleanupInterval);
              this.logger.info('WebSocketManager cleanup interval stopped.');
          }

          this.logger.info(`Disconnecting ${this.activeConnections.size} active WebSocket clients...`);
          for (const [socketId, connection] of this.activeConnections.entries()) {
              try {
                  connection.socket.disconnect(true);
              } catch (error) {
                  this.logger.error(`Error disconnecting socket ${socketId} during cleanup:`, error);
              }
          }

          for (const timer of this.adminTypingTimers.values()) {
              clearTimeout(timer);
          }
          this.adminTypingTimers.clear();
          this.adminSessions.clear();

          for (const data of this.aiProcessingQueue.values()) {
              if (data.timer) clearTimeout(data.timer);
          }
          this.aiProcessingQueue.clear();

          for (const data of this.pendingAIResponses.values()) {
              if (data.timer) clearTimeout(data.timer);
          }
          this.pendingAIResponses.clear();

          this.activeConnections.clear();

          this.logger.info('WebSocket Manager cleanup completed successfully.');
      } catch (error) {
          this.logger.error('Error during WebSocket Manager cleanup:', error);
      }
  }
}

module.exports = WebSocketManager;