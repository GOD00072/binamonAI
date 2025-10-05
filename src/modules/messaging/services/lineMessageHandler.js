'use strict';

const axios = require('axios');
const MessageContentCleaner = require('../../../core/utils/messageContentCleaner');

class LineMessageHandler {
  constructor(logger, aiAssistant, productManager, chatHistory, messageHandler) {
      this.logger = logger;
      this.aiAssistant = aiAssistant;
      this.productManager = productManager;
      this.chatHistory = chatHistory;
      this.messageHandler = messageHandler;
      this.lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      
      // Service connections
      this.imageHandler = null;
      this.keywordDetector = null;
      this.webSocketManager = null;
      this.productImageSender = null;
      this.keywordImageSender = null;
      
      // Message handling configuration
      this.messageCache = new Map();
      this.messageLocks = new Map();
      this.MESSAGE_CACHE_TTL = 120000; // 2 minutes
      this.MESSAGE_LOCK_TTL = 120000; // 2 minutes
      this.maxRetries = 3;
      this.retryDelay = 120000; // 2 minutes
      this.MESSAGE_PENDING_TTL = 120000; // 2 minutes
      this.IMAGE_TEXT_WAIT_DELAY = 120000; // 2 minutes

      // Pending message system for text-image integration
      this.pendingMessages = new Map();
      this.pendingImages = new Map();
      this.pendingCleanupInterval = setInterval(() => this.cleanupPendingMessages(), 60000);

      // Message aggregation configuration
      this.SHORT_MESSAGE_THRESHOLD = 20; 
      this.MSG_AGGREGATION_MODE = 'smart'; 
      this.MAX_TIME_BETWEEN_FRAGMENTS = 5000; 

      // AI state management
      this.aiState = {
          globalEnabled: true,
          userSettings: new Map()
      };

      // WebSocket status tracking
      this.processingStatus = new Map();

      // Set up message handler events
      if (this.messageHandler) {
          this.messageHandler.on('messageReceived', async ({ messageId, message }) => {
              if (message.originalMessages) {
                  await this.processUserMessage(
                      message.userId,
                      message.content,
                      message.originalMessages[0].replyToken,
                      messageId
                  );
              }
          });

          this.messageHandler.on('messageFailure', async (messageId, message) => {
              this.logger.error('Message failure event triggered', {
                  messageId,
                  userId: message.userId || 'unknown'
              });
              
              if (this.webSocketManager) {
                  this.webSocketManager.notifyMessageUpdate(
                      message.userId, 
                      messageId, 
                      'failed'
                  );
              }
          });
      }

      // Cache cleanup interval
      setInterval(() => this.cleanupCache(), 30000);

      // Log initialization
      this.logger.info('LineMessageHandler initialized', {
          hasLineToken: !!this.lineToken,
          messageCacheTtl: this.MESSAGE_CACHE_TTL,
          pendingTtl: this.MESSAGE_PENDING_TTL,
          imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY
      });
 }

 // *** Service Connection Methods ***
 setImageHandler(imageHandler) {
     this.imageHandler = imageHandler;
     this.logger.info('Image handler connected to LineMessageHandler');
 }
 
 setKeywordDetector(keywordDetector) {
     this.keywordDetector = keywordDetector;
     this.logger.info('Keyword detector connected to LineMessageHandler');
 }

 setWebSocketManager(webSocketManager) {
     this.webSocketManager = webSocketManager;
     this.logger.info('WebSocket manager connected to LineMessageHandler');
 }

 setProductImageSender(productImageSender) {
   this.productImageSender = productImageSender;
   this.logger.info('ProductImageSender connected to LineMessageHandler', {
       enabled: this.productImageSender?.config?.enabled,
       autoSend: this.productImageSender?.config?.autoSendOnUrlDetection
   });
}

setKeywordImageSender(keywordImageSender) {
  this.keywordImageSender = keywordImageSender;
  this.logger.info('KeywordImageSender connected to LineMessageHandler', {
      enabled: this.keywordImageSender?.config?.enabled,
      autoSend: this.keywordImageSender?.config?.autoSendOnKeywordDetection
  });
}

 // *** Cleanup Methods ***
 cleanupPendingMessages() {
     const now = Date.now();
     let cleanedPendingMessages = 0;
     let cleanedPendingImages = 0;
     
     // Cleanup pending messages
     for (const [userId, pendingMsgs] of this.pendingMessages.entries()) {
         if (now - pendingMsgs.lastUpdateTime > this.MESSAGE_PENDING_TTL) {
             if (pendingMsgs.timeoutId) {
                 clearTimeout(pendingMsgs.timeoutId);
             }
             this.pendingMessages.delete(userId);
             cleanedPendingMessages++;
         }
     }
     
     // Cleanup pending images
     for (const [userId, pendingImg] of this.pendingImages.entries()) {
         if (now - pendingImg.timestamp > this.MESSAGE_PENDING_TTL) {
             this.pendingImages.delete(userId);
             cleanedPendingImages++;
         }
     }
     
     if (cleanedPendingMessages > 0 || cleanedPendingImages > 0) {
         this.logger.info('Cleaned up pending messages and images', {
             cleanedPendingMessages,
             cleanedPendingImages,
             remainingPendingMessages: this.pendingMessages.size,
             remainingPendingImages: this.pendingImages.size
         });
     }
 }

 cleanupCache() {
     const now = Date.now();
     let cleanedCache = 0;
     let cleanedLocks = 0;

     // Cleanup message cache
     for (const [key, timestamp] of this.messageCache.entries()) {
         if (now - timestamp > this.MESSAGE_CACHE_TTL) {
             this.messageCache.delete(key);
             cleanedCache++;
         }
     }

     // Cleanup message locks
     for (const [key, timestamp] of this.messageLocks.entries()) {
         if (now - timestamp > this.MESSAGE_LOCK_TTL) {
             this.messageLocks.delete(key);
             cleanedLocks++;
         }
     }

     if (cleanedCache > 0 || cleanedLocks > 0) {
         this.logger.debug('Cache cleanup completed', {
             cleanedCache,
             cleanedLocks,
             remainingCache: this.messageCache.size,
             remainingLocks: this.messageLocks.size
         });
     }
 }

 // *** Main Message Handling ***
 async handleMessage(event) {
     try {
         const { message, source, replyToken } = event;
         const userId = source.userId;
 
         this.logger.info('Received LINE message:', {
             userId,
             messageType: message.type,
             messageId: message.id
         });
 
         switch (message.type) {
             case 'text':
                 await this.handleTextMessage(userId, message.text, replyToken);
                 break;
             case 'image':
                 await this.handleImageMessage(message.id, message.contentProvider, userId, replyToken);
                 break;
             case 'sticker':
                 await this.handleSticker(replyToken);
                 break;
             default:
                 this.logger.info('Unsupported message type', { 
                     userId, 
                     messageType: message.type 
                 });
         }
     } catch (error) {
         this.logger.error('Error handling LINE message:', {
             error: error.message,
             stack: error.stack,
             eventData: JSON.stringify(event, null, 2)
         });
     }
 }

 // *** Message Aggregation Logic ***
 isLikelyFragment(text) {
     if (!text || text.length <= this.SHORT_MESSAGE_THRESHOLD) {
         return true;
     }
     
     const endsWithPunctuation = /[.!?;:,]$/.test(text.trim());
     if (!endsWithPunctuation && text.length < 30) {
         return true;
     }
     
     return false;
 }

 combineMessageFragments(existingFragments, newFragment) {
     if (existingFragments.length === 0) {
         return [newFragment];
     }
     
     const lastFragment = existingFragments[existingFragments.length - 1];
     const updatedFragments = [...existingFragments];
     
     if (this.MSG_AGGREGATION_MODE === 'newline') {
         updatedFragments.push(newFragment);
     } else if (this.MSG_AGGREGATION_MODE === 'join') {
         updatedFragments[updatedFragments.length - 1] = lastFragment + newFragment;
     } else {
         // Smart mode
         const lastFragmentTrimmed = lastFragment.trim();
         const newFragmentTrimmed = newFragment.trim();
         
         const joinWithoutSpace = (
             /[\u0E00-\u0E7F]$/.test(lastFragmentTrimmed) && 
             /^[\u0E00-\u0E7F]/.test(newFragmentTrimmed)
         ) || (
             /[a-zA-Z0-9\-]$/.test(lastFragmentTrimmed) && 
             /^[a-zA-Z0-9]/.test(newFragmentTrimmed)
         );
         
         if (joinWithoutSpace) {
             updatedFragments[updatedFragments.length - 1] = lastFragmentTrimmed + newFragmentTrimmed;
         } else {
             updatedFragments[updatedFragments.length - 1] = lastFragmentTrimmed + ' ' + newFragmentTrimmed;
         }
     }
     
     return updatedFragments;
 }

 aggregatePendingMessages(messages) {
     if (!messages || messages.length === 0) {
         return '';
     }
     
     if (messages.length === 1) {
         return messages[0];
     }
     
     let result = messages[0];
     
     for (let i = 1; i < messages.length; i++) {
         const current = messages[i];
         
         const prevEndsWithPunctuation = /[.!?;:]$/.test(result.trim());
         const prevIsThai = /[\u0E00-\u0E7F]$/.test(result.trim());
         const currentStartsThai = /^[\u0E00-\u0E7F]/.test(current.trim());
         const prevEndsWithWordChar = /[a-zA-Z0-9\-]$/.test(result.trim());
         const currentStartsWithWordChar = /^[a-zA-Z0-9]/.test(current.trim());
         
         if (prevEndsWithPunctuation) {
             result += ' ' + current;
         } else if ((prevIsThai && currentStartsThai) || 
                   (prevEndsWithWordChar && currentStartsWithWordChar)) {
             result += current;
         } else {
             result += ' ' + current;
         }
     }
     
     return result;
 }

 // *** Text Message Handling ***
 async handleTextMessage(userId, text, replyToken) {
  try {
      const timestamp = Date.now();
      
      this.logger.debug('Handling text message', {
          userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
          textLength: text ? text.length : 0,
          textPreview: text ? text.substring(0, 50) + '...' : 'undefined',
          hasPendingImages: this.pendingImages.has(userId),
          hasPendingMessages: this.pendingMessages.has(userId)
      });
      
      // *** Enhanced handling when pending images exist ***
      if (this.pendingImages.has(userId)) {
          const pendingImage = this.pendingImages.get(userId);
          
          // Check if image is still within waiting period
          const timeSinceImage = timestamp - pendingImage.timestamp;
          if (timeSinceImage <= this.IMAGE_TEXT_WAIT_DELAY) {
              this.logger.info('Adding text to pending image', {
                  userId: userId.substring(0, 10) + '...',
                  timeSinceImage,
                  textMessage: text,
                  hasExistingComment: !!pendingImage.existingComment
              });

              // Add or update text for the pending image
              if (this.pendingMessages.has(userId)) {
                  const pendingMsgs = this.pendingMessages.get(userId);
                  pendingMsgs.texts.push(text);
                  pendingMsgs.lastUpdateTime = timestamp;
                  
                  if (pendingMsgs.timeoutId) {
                      clearTimeout(pendingMsgs.timeoutId);
                      pendingMsgs.timeoutId = null;
                  }
                  
                  this.pendingMessages.set(userId, pendingMsgs);
                  
                  this.logger.info('Added text to existing pending messages for image', {
                      userId: userId.substring(0, 10) + '...',
                      pendingCount: pendingMsgs.texts.length,
                      allTexts: pendingMsgs.texts.join(' '),
                      newMessage: text,
                      timeSinceImage: timeSinceImage
                  });
              } else {
                  this.pendingMessages.set(userId, {
                      texts: [text],
                      timestamp: timestamp,
                      lastUpdateTime: timestamp,
                      replyToken: replyToken,
                      timeoutId: null
                  });
                  
                  this.logger.info('Started new text collection for pending image', {
                      userId: userId.substring(0, 10) + '...',
                      firstMessage: text,
                      timeSinceImage: timeSinceImage
                  });
              }
              
              return; // Don't process as standalone message
          } else {
              // Image expired, remove from pending
              this.pendingImages.delete(userId);
              this.logger.info('Removed expired pending image', {
                  userId: userId.substring(0, 10) + '...',
                  timeSinceImage: timeSinceImage,
                  imageTimeout: this.IMAGE_TEXT_WAIT_DELAY
              });
          }
      }
      
      // *** Regular text message handling with aggregation ***
      if (this.pendingMessages.has(userId)) {
          const pendingMsgs = this.pendingMessages.get(userId);
          
          // Add to existing pending messages
          pendingMsgs.texts.push(text);
          pendingMsgs.lastUpdateTime = timestamp;
          
          if (pendingMsgs.timeoutId) {
              clearTimeout(pendingMsgs.timeoutId);
          }
          
          // Set new timeout for processing
          const timeoutId = setTimeout(async () => {
              if (this.pendingMessages.has(userId) && 
                  this.pendingMessages.get(userId).lastUpdateTime === timestamp) {
                  
                  this.logger.info('Processing accumulated pending text messages', {
                      userId: userId.substring(0, 10) + '...',
                      messageCount: pendingMsgs.texts.length,
                      fragments: pendingMsgs.texts
                  });

                  if (this.webSocketManager) {
                      this.webSocketManager.io.emit('processing_accumulated_messages', {
                          userId: userId,
                          messageCount: pendingMsgs.texts.length,
                          status: 'Processing accumulated pending text messages',
                          timestamp: Date.now()
                      });
                  }
                  
                  const allTexts = this.pendingMessages.get(userId).texts;
                  const combinedText = this.aggregatePendingMessages(allTexts);
                  const originalReplyToken = this.pendingMessages.get(userId).replyToken;
                  
                  this.pendingMessages.delete(userId);
                  await this.processUserMessage(userId, combinedText, originalReplyToken);
              }
          }, this.MESSAGE_PENDING_TTL / 2);
          
          this.pendingMessages.set(userId, {
              ...pendingMsgs,
              lastUpdateTime: timestamp,
              timeoutId: timeoutId
          });
          
          this.logger.info('Added message to pending texts', {
              userId: userId.substring(0, 10) + '...',
              pendingCount: pendingMsgs.texts.length,
              newMessage: text,
              allPendingTexts: pendingMsgs.texts
          });
          
      } else {
          // Start new pending message collection
          const timeoutId = setTimeout(async () => {
              if (this.pendingMessages.has(userId) && 
                  this.pendingMessages.get(userId).lastUpdateTime === timestamp) {
                  
                  this.logger.info('Processing pending text message normally', {
                      userId: userId.substring(0, 10) + '...',
                      messageAge: Date.now() - timestamp,
                      pendingTexts: this.pendingMessages.get(userId).texts
                  });
                  
                  const pendingMsgs = this.pendingMessages.get(userId);
                  
                  const combinedText = pendingMsgs.texts.length === 1 
                      ? pendingMsgs.texts[0] 
                      : this.aggregatePendingMessages(pendingMsgs.texts);
                  
                  this.pendingMessages.delete(userId);
                  await this.processUserMessage(userId, combinedText, pendingMsgs.replyToken);
              }
          }, this.MESSAGE_PENDING_TTL / 2);
          
          this.pendingMessages.set(userId, {
              texts: [text],
              timestamp: timestamp,
              lastUpdateTime: timestamp,
              replyToken: replyToken,
              timeoutId: timeoutId
          });
          
          this.logger.info('Started new pending text collection', {
              userId: userId.substring(0, 10) + '...',
              firstMessage: text
          });
      }
  } catch (error) {
      this.logger.error('Error in handleTextMessage:', {
          error: error.message,
          stack: error.stack,
          userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
          text: text ? text.substring(0, 100) + '...' : 'undefined'
      });
      
      // Fallback: process message directly
      await this.processUserMessage(userId, text || '', replyToken);
  }
}

// *** Image Message Handling ***
async handleImageMessage(messageId, contentProvider, userId, replyToken) {
  try {
      this.logger.info('Image message received', { 
          userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
          messageId,
          contentProvider: contentProvider ? contentProvider.type : 'undefined'
      });
      
      if (!this.imageHandler) {
          this.logger.error('No image handler available', { userId });
          return;
      }
      
      const timestamp = Date.now();
      
      // *** Check for existing pending messages ***
      let existingComment = null;
      if (this.pendingMessages.has(userId)) {
          const pendingMsgs = this.pendingMessages.get(userId);
          
          // Check if pending messages are within appropriate timeframe
          const timeSinceLastMessage = timestamp - pendingMsgs.lastUpdateTime;
          if (timeSinceLastMessage <= this.IMAGE_TEXT_WAIT_DELAY) {
              existingComment = this.aggregatePendingMessages(pendingMsgs.texts);
              
              // Clear existing timeout
              if (pendingMsgs.timeoutId) {
                  clearTimeout(pendingMsgs.timeoutId);
              }
              
              // Remove pending messages as they will be used with image
              this.pendingMessages.delete(userId);
              
              this.logger.info('Found existing pending text for image comment', {
                  userId: userId.substring(0, 10) + '...',
                  messageId,
                  existingComment: existingComment.substring(0, 100) + '...',
                  timeSinceLastMessage: timeSinceLastMessage
              });
          }
      }
      
      // Store pending image with any existing comment
      this.pendingImages.set(userId, {
          messageId,
          contentProvider, 
          replyToken,
          timestamp,
          existingComment: existingComment
      });

      if (this.webSocketManager) {
          this.webSocketManager.io.emit('image_waiting_for_text', {
              userId: userId,
              messageId: messageId,
              status: existingComment ? 
                  'Image received with existing comment, waiting for additional text' : 
                  'Waiting for text comment with image',
              hasExistingComment: !!existingComment,
              existingComment: existingComment ? existingComment.substring(0, 100) + '...' : null,
              waitDelay: this.IMAGE_TEXT_WAIT_DELAY,
              timestamp: Date.now()
          });
      }
      
      // Set timeout to process image
      setTimeout(async () => {
          if (this.pendingImages.has(userId)) {
              const pendingImg = this.pendingImages.get(userId);
              
              let finalUserComment = pendingImg.existingComment || null;
              
              // *** Check for new pending messages after image arrival ***
              if (this.pendingMessages.has(userId)) {
                  const pendingMsgs = this.pendingMessages.get(userId);
                  const newComment = this.aggregatePendingMessages(pendingMsgs.texts);
                  
                  if (pendingImg.existingComment && newComment) {
                      // Combine existing and new comments
                      finalUserComment = pendingImg.existingComment + ' ' + newComment;
                  } else if (newComment) {
                      // Use only new comment
                      finalUserComment = newComment;
                  }
                  
                  if (pendingMsgs.timeoutId) {
                      clearTimeout(pendingMsgs.timeoutId);
                  }
                  
                  this.pendingMessages.delete(userId);
                  
                  this.logger.info('Combined existing and new text for image comment', {
                      userId: userId.substring(0, 10) + '...',
                      messageId,
                      existingComment: pendingImg.existingComment ? pendingImg.existingComment.substring(0, 50) + '...' : null,
                      newComment: newComment ? newComment.substring(0, 50) + '...' : null,
                      finalComment: finalUserComment ? finalUserComment.substring(0, 100) + '...' : null
                  });
              }

              if (this.webSocketManager) {
                  this.webSocketManager.io.emit('image_processing_started', {
                      userId: userId,
                      messageId: messageId,
                      hasComment: !!finalUserComment,
                      comment: finalUserComment ? finalUserComment.substring(0, 100) + '...' : null,
                      hasExistingComment: !!pendingImg.existingComment,
                      status: 'Processing image with AI',
                      timestamp: Date.now()
                  });
              }
              
              // Process image with final comment
              await this.imageHandler.processLineImage(
                  pendingImg.messageId,
                  pendingImg.contentProvider,
                  userId,
                  pendingImg.replyToken,
                  finalUserComment
              );
              
              this.pendingImages.delete(userId);
          }
      }, this.IMAGE_TEXT_WAIT_DELAY);
      
      this.logger.info('Image pending for text comment', { 
          userId: userId.substring(0, 10) + '...',
          messageId,
          hasExistingComment: !!existingComment,
          existingComment: existingComment ? existingComment.substring(0, 50) + '...' : null,
          waitDelay: this.IMAGE_TEXT_WAIT_DELAY
      });
      
      return { success: true };
  } catch (error) {
      this.logger.error('Error handling image message:', {
          error: error.message,
          stack: error.stack,
          userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
          messageId
      });
  }
}

 // *** Sticker Handling ***
 async handleSticker(replyToken) {
     try {
         this.logger.info('Sticker received - responding with thank you message');
         await this.replyMessage(replyToken, 'ขอบคุณสำหรับสติ๊กเกอร์น่ารักๆ นะคะ');
     } catch (error) {
         this.logger.error('Error handling sticker:', error);
     }
 }

 // *** Main User Message Processing ***
// *** Main User Message Processing ***
async processUserMessage(userId, text, replyToken, messageId) {
    try {
        if (!text) {
            this.logger.error('Received null/undefined text in processUserMessage');
            text = '';
        }
        
        const timestamp = Date.now();
        const isAiEnabled = this.isAiEnabledForUser(userId);

        this.logger.info('Processing user message', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            textLength: text.length,
            messageId: messageId || 'generated',
            isAiEnabled,
            timestamp
        });

        // *** Enhanced user profile and new user detection ***
        let userProfile = null;
        let isNewUser = false;
        try {
            if (this.chatHistory && typeof this.chatHistory.getUserProfile === 'function') {
                userProfile = await this.chatHistory.getUserProfile(userId);
                
                // Check if this is a new user (no message history)
                const userHistory = await this.chatHistory.loadHistory(userId, 'api');
                if (!userHistory || !userHistory.messages || userHistory.messages.length === 0) {
                    isNewUser = true;
                    
                    this.logger.info('New user detected', {
                        userId: userId,
                        displayName: userProfile?.displayName || `User ${userId.substring(1, 9)}`
                    });
                    
                    // Notify new user via WebSocket
                    if (this.webSocketManager) {
                        this.webSocketManager.io.emit('new_user_joined', {
                            userId: userId,
                            displayName: userProfile?.displayName || `User ${userId.substring(1, 9)}`,
                            pictureUrl: userProfile?.pictureUrl || '',
                            isFirstMessage: true,
                            timestamp: Date.now()
                        });
                        
                        this.logger.info('New user notification sent via WebSocket', {
                            userId: userId,
                            displayName: userProfile?.displayName
                        });
                    }
                }
            }
        } catch (profileError) {
            this.logger.warn('Could not fetch user profile or check user history:', {
                error: profileError.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
        }

        // Create user message for history with senderProfile
        const userMessage = {
            role: 'user',
            content: text,
            timestamp,
            messageId: messageId || `msg_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
            senderProfile: userProfile
        };

        // Notify new message via WebSocket Manager
        if (this.webSocketManager) {
            this.webSocketManager.notifyNewMessage(userId, userMessage);
        }

        // Save user message to API history
        await this.chatHistory.saveHistory(userId, {
            messages: [userMessage],
            lastUpdated: timestamp
        }, 'api');

        // Save user message to AI history as well
        await this.chatHistory.saveHistory(userId, {
            messages: [userMessage],
            lastUpdated: timestamp
        }, 'ai');

        // If AI is disabled, just complete the message processing
        if (!isAiEnabled) {
            this.logger.info('AI is disabled for user, completing message processing', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                globalEnabled: this.aiState.globalEnabled,
                userEnabled: this.aiState.userSettings.get(userId)
            });
            
            if (this.messageHandler && messageId) {
                this.messageHandler.completeMessage(messageId, true);
            }
            return;
        }

        // *** ลบการตรวจสอบแอดมินออก - เริ่ม AI processing ทันที ***
        if (this.webSocketManager) {
            const started = this.webSocketManager.startAIProcessing(userId, messageId, userMessage);
            if (!started) {
                this.logger.error('Failed to start AI processing', { 
                    userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
                });
                return;
            }
        }

        // Proceed with AI processing
        await this.sendLoadingAnimation(userId);

        // Notify that we're searching for products
        if (this.webSocketManager) {
            this.webSocketManager.io.emit('ai_searching_products', {
                userId: userId,
                status: 'Searching for relevant products',
                query: text,
                timestamp: Date.now()
            });
        }
        
        // Search for products based on user's query
        let searchResults = { results: [] };
        try {
            this.logger.info('Starting product search', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                queryLength: text.length
            });
            
            searchResults = await this.productManager.searchProducts(text, userId);
            if (!searchResults || !searchResults.results) {
                searchResults = { results: [] };
            }
            
            this.logger.info('Product search completed', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                resultsCount: searchResults.results.length,
                query: text.substring(0, 50) + (text.length > 50 ? '...' : '')
            });
            
        } catch (searchError) {
            this.logger.error('Error searching products:', {
                error: searchError.message,
                stack: searchError.stack,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                query: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            });
            searchResults = { results: [] };
        }

        // Notify that AI is thinking
        if (this.webSocketManager) {
            this.webSocketManager.io.emit('ai_thinking', {
                userId: userId,
                status: 'AI is thinking and generating response',
                productsFound: searchResults.results.length,
                processingQuery: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                timestamp: Date.now()
            });
        }
        
        // Generate AI response using the search results
        let response = null;
        let responseText = '';
        
        try {
            if (!this.aiAssistant || !this.aiAssistant.initialized) {
                throw new Error('AI Assistant not properly initialized');
            }
            
            this.logger.info('Starting AI response generation', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                queryLength: text.length,
                productsCount: searchResults.results.length,
                aiAssistantReady: !!this.aiAssistant.initialized
            });

            response = await this.aiAssistant.generateResponse(
                text || '',
                searchResults.results || [],
                userId
            );
            if (!response) {
                throw new Error('No response returned from AI assistant');
            }
            
            responseText = response.response;
            if (!responseText || typeof responseText !== 'string') {
                throw new Error('Invalid response text from AI assistant');
            }
            
            this.logger.info('AI response generated successfully', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                responseLength: responseText.length,
                hasTokens: !!(response.tokens),
                inputTokens: response.tokens?.input || 0,
                outputTokens: response.tokens?.output || 0
            });
            
        } catch (aiError) {
            this.logger.error('Error generating AI response:', {
                error: aiError.message,
                stack: aiError.stack,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                searchResultsCount: searchResults.results.length,
                aiAssistantInitialized: this.aiAssistant?.initialized,
                queryText: text.substring(0, 100) + (text.length > 100 ? '...' : '')
            });
            
            // Fallback response

            
            response = {
                response: responseText,
                tokens: { input: 0, output: 0 }
            };
        }

        // Process response via WebSocket Manager
        if (this.webSocketManager) {
            this.logger.info('Sending AI response to WebSocket Manager for processing', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageId: messageId || 'generated',
                responseLength: responseText.length
            });
            
            await this.webSocketManager.handleAIResponseReceived(userId, messageId, response);
        } else {
            // Fallback: send directly if no WebSocket Manager
            this.logger.warn('No WebSocket Manager available, sending AI response directly', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
            
            await this.sendAIResponseDirectly(userId, responseText, response, replyToken);
        }

        if (this.messageHandler && messageId) {
            this.messageHandler.completeMessage(messageId, true);
        }

        this.logger.info('User message processing completed successfully', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageId: messageId || 'generated',
            isNewUser: isNewUser,
            aiEnabled: isAiEnabled,
            responseGenerated: !!responseText
        });

    } catch (error) {
        this.logger.error('Error processing user message:', {
            error: error.message,
            stack: error.stack,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageId: messageId || 'unknown',
            textLength: text?.length || 0
        });
        
        if (this.webSocketManager) {
            this.webSocketManager.handleAIProcessingError(userId, messageId, error);
        }
        
        try {
            ;
        } catch (replyError) {
            this.logger.error('Failed to send error message to user:', {
                replyError: replyError.message,
                originalError: error.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
        }
        
        if (this.messageHandler && messageId) {
            this.messageHandler.completeMessage(messageId, false);
        }
    }
}

 // *** Product Image Processing Method ***
 // *** Product Image Processing Method ***
async processAndSendImages(userId, message, source = 'unknown') {
    if (!this.productImageSender || !message) {
        this.logger.warn('⚠️ Cannot process images', {
            hasProductImageSender: !!this.productImageSender,
            hasMessage: !!message,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
        });
        return;
    }

    try {
        this.logger.info('🔄 Starting image processing', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageLength: message.length,
            source: source,
            config: {
                enabled: this.productImageSender.config.enabled,
                autoSend: this.productImageSender.config.autoSendOnUrlDetection
            }
        });
        
        // *** รอให้ข้อความส่งเสร็จก่อน - เพิ่มเวลารอ ***
        this.logger.info('⏱️ Waiting for main message to be sent before processing images');
        await new Promise(resolve => setTimeout(resolve, 3000)); // เพิ่มจาก 1500 เป็น 3000ms
        
        const imageResult = await this.productImageSender.processOutgoingMessage(userId, message);

        // Process keyword images
        let keywordResult = { processed: false, imagesSent: 0 };
        if (this.keywordImageSender) {
            keywordResult = await this.keywordImageSender.processOutgoingMessage(userId, message);
        }

        this.logger.info('📊 Image processing result', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            productImages: {
                processed: imageResult.processed,
                imagesSent: imageResult.imagesSent || 0,
                urlsProcessed: imageResult.urlsProcessed || 0
            },
            keywordImages: {
                processed: keywordResult.processed,
                imagesSent: keywordResult.imagesSent || 0,
                keywordsProcessed: keywordResult.keywordsProcessed || 0
            },
            source: source
        });
        
        if (imageResult.processed && imageResult.imagesSent > 0) {
            this.logger.info('✅ Product images sent successfully (after main message)', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                imagesSent: imageResult.imagesSent,
                urlsProcessed: imageResult.urlsProcessed,
                results: imageResult.results,
                source: source
            });
            
            // Notify via WebSocket
            if (this.webSocketManager) {
                this.webSocketManager.io.emit('product_images_sent', {
                    userId: userId,
                    imagesSent: imageResult.imagesSent,
                    urlsProcessed: imageResult.urlsProcessed,
                    source: source,
                    timestamp: Date.now()
                });
            }
        }

        // Handle keyword images results
        if (keywordResult.processed && keywordResult.imagesSent > 0) {
            this.logger.info('✅ Keyword images sent successfully (after main message)', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                imagesSent: keywordResult.imagesSent,
                keywordsProcessed: keywordResult.keywordsProcessed,
                results: keywordResult.results,
                source: source
            });

            // Notify via WebSocket
            if (this.webSocketManager) {
                this.webSocketManager.io.emit('keyword_images_sent', {
                    userId: userId,
                    imagesSent: keywordResult.imagesSent,
                    keywordsProcessed: keywordResult.keywordsProcessed,
                    source: source,
                    timestamp: Date.now()
                });
            }
        } else if (keywordResult.processed) {
            this.logger.info('🔍 Keywords detected but no images sent', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                keywordsProcessed: keywordResult.keywordsProcessed,
                reason: keywordResult.results ?
                    keywordResult.results.map(r => r.reason).join(', ') :
                    keywordResult.reason || 'Unknown',
                source: source
            });
        }

        // Overall summary logging
        if (!imageResult.processed && !keywordResult.processed) {
            this.logger.info('ℹ️ No URLs or keywords detected in message', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messagePreview: message.substring(0, 100) + '...',
                source: source
            });
        }
    } catch (imageError) {
        this.logger.error('❌ Error processing product images', {
            error: imageError.message,
            stack: imageError.stack,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            source: source
        });
    }
}

// *** Process Outgoing Message with Delay ***
async processOutgoingMessageWithDelay(userId, message, messageId, fromAdmin = false, source = 'webSocketManager') {
    try {
        this.logger.info('🔄 Processing outgoing message with delay', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageLength: message ? message.length : 0,
            fromAdmin: fromAdmin,
            source: source
        });

        // ส่งข้อความหลักผ่าน pushMessage
        await this.pushMessage(userId, message, messageId, fromAdmin);

        // รอสักครู่แล้วประมวลผลรูปภาพและ keywords
        await this.processAndSendImages(userId, message, source);

        this.logger.info('✅ Message and images processed successfully', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            source: source
        });

    } catch (error) {
        this.logger.error('❌ Error in processOutgoingMessageWithDelay', {
            error: error.message,
            stack: error.stack,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            source: source
        });
        throw error;
    }
}

 // *** Direct AI Response Sending ***
// *** Direct AI Response Sending ***
async sendAIResponseDirectly(userId, responseText, response, replyToken) {
    try {
        let cleanedResponse;
        try {
            cleanedResponse = MessageContentCleaner.processUrls(responseText);
            if (!cleanedResponse) {
                cleanedResponse = responseText;
            }
        } catch (cleanError) {
            this.logger.error('Error cleaning response:', cleanError);
            cleanedResponse = responseText;
        }

        if (!cleanedResponse || typeof cleanedResponse !== 'string') {
            this.logger.error('Invalid cleaned response after processing');
            cleanedResponse = 'ขออภัยค่ะ ระบบไม่สามารถประมวลผลคำตอบได้ กรุณาลองใหม่อีกครั้งค่ะ';
        }

        this.logger.info('📨 Preparing to send main AI response message', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageLength: cleanedResponse.length,
            responsePreview: cleanedResponse.substring(0, 100) + '...'
        });

        const modelMessage = {
            role: 'model',
            content: cleanedResponse,
            timestamp: Date.now(),
            messageId: `${userId}_${Date.now()}_response`,
            source: 'ai'
        };

        // Save to both API and AI histories
        await this.chatHistory.saveHistory(userId, {
            messages: [modelMessage],
            lastUpdated: Date.now(),
            totalTokens: response?.tokens || { input: 0, output: 0 }
        }, 'api');

        await this.chatHistory.saveHistory(userId, {
            messages: [modelMessage],
            lastUpdated: Date.now(),
            totalTokens: response?.tokens || { input: 0, output: 0 }
        }, 'ai');

        this.logger.info('📨 Sending main AI response message NOW', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageLength: cleanedResponse.length,
            replyToken: replyToken ? replyToken.substring(0, 10) + '...' : 'none'
        });

        // *** ส่งข้อความหลักก่อน - ใช้ replyMessage แทน pushMessage ***
        if (replyToken && replyToken.trim() !== '') {
            await this.replyMessage(replyToken, cleanedResponse);
            this.logger.info('✅ Main AI response sent via replyMessage', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageLength: cleanedResponse.length
            });
        } else {
            // Fallback ถ้าไม่มี replyToken
            await this.pushMessage(userId, cleanedResponse, modelMessage.messageId, false);
            this.logger.info('✅ Main AI response sent via pushMessage (fallback)', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageLength: cleanedResponse.length
            });
        }

        // *** แจ้งให้ WebSocket Manager ทราบว่าข้อความหลักส่งแล้ว ***
        if (this.webSocketManager) {
            this.webSocketManager.io.emit('main_message_sent', {
                userId: userId,
                messageLength: cleanedResponse.length,
                timestamp: Date.now(),
                source: 'sendAIResponseDirectly'
            });
        }

        this.logger.info('✅ Main message sent, images and keywords will be processed after delay', {
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            hasProductImageSender: !!this.productImageSender,
            hasKeywordImageSender: !!this.keywordImageSender,
            hasKeywordDetector: !!this.keywordDetector
        });

        // *** รอแล้วประมวลผลรูปและ keywords ***
        try {
            await this.processAndSendImages(userId, cleanedResponse, 'sendAIResponseDirectly');
        } catch (processingError) {
            this.logger.error('Error processing images and keywords in response:', {
                error: processingError.message,
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
            });
        }

    } catch (error) {
        this.logger.error('Error sending AI response directly:', {
            error: error.message,
            stack: error.stack,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
        });
        throw error;
    }
}
 // *** Loading Animation ***
 async sendLoadingAnimation(userId, loadingSeconds = 60) {
     try {
         const lineLoadingUrl = 'https://api.line.me/v2/bot/chat/loading/start';
         const body = {
             chatId: userId,
             loadingSeconds: loadingSeconds
         };
         
         await this.makeRequest('post', lineLoadingUrl, body);
         
         this.logger.info('Loading animation started for user:', {
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             duration: loadingSeconds
         });

         if (this.webSocketManager) {
             this.webSocketManager.io.emit('loading_animation_started', {
                 userId: userId,
                 duration: loadingSeconds,
                 status: 'Loading animation started',
                 timestamp: Date.now()
             });
         }
     } catch (error) {
         this.logger.error('Error sending loading animation:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
         });
     }
 }

 // *** Push Message (Admin Messages) ***

async pushMessage(userId, text, messageId, fromAdmin = true) {
    try {
        if (!messageId) {
            messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        const cleanedText = MessageContentCleaner.processUrls(text);
        
        const messageKey = `${userId}_${cleanedText}_${messageId}`;
        if (this.messageCache.has(messageKey)) {
            this.logger.warn('Duplicate message detected:', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageId,
                content: cleanedText.substring(0, 50) + (cleanedText.length > 50 ? '...' : '')
            });
            return true;
        }
        
        this.messageCache.set(messageKey, Date.now());
        
        try {
            const linePushUrl = 'https://api.line.me/v2/bot/message/push';
            const messages = this.splitLongMessage(cleanedText);
            
            this.logger.info('📨 Sending push message', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageLength: cleanedText.length,
                fromAdmin: fromAdmin,
                messageCount: messages.length
            });
            
            const response = await axios.post(
                linePushUrl,
                {
                    to: userId,
                    messages: messages.map(msg => ({
                        type: 'text',
                        text: msg
                    }))
                },
                {
                    headers: this.getHeaders()
                }
            );

            // Always save admin messages to API history
            if (fromAdmin && response.status === 200) {
                const timestamp = Date.now();
                const adminMessage = {
                    role: 'admin',
                    content: cleanedText,
                    timestamp,
                    messageId: messageId,
                    source: 'admin'
                };
                
                await this.chatHistory.saveHistory(userId, {
                    messages: [adminMessage],
                    lastUpdated: timestamp
                }, 'api');

                if (this.webSocketManager) {
                    this.webSocketManager.notifyNewMessage(userId, adminMessage);
                }
            }

            this.logger.info('✅ Push message sent successfully', {
                userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
                messageId,
                status: response.status,
                fromAdmin: fromAdmin
            });

            // *** ไม่ส่งรูปใน pushMessage เพื่อหลีกเลี่ยงการส่งซ้ำ ***
            // การส่งรูปจะถูกจัดการโดย WebSocket Manager หลังจากส่งข้อความหลักแล้ว

            // Process keywords only
            if (this.keywordDetector) {
                await this.keywordDetector.processOutgoingMessage(userId, cleanedText);
            }

            return true;
        } finally {
            setTimeout(() => {
                this.messageCache.delete(messageKey);
            }, 300000);
        }
        
    } catch (error) {
        this.logger.error('Error in pushMessage:', {
            error: error.message,
            stack: error.stack,
            userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
            messageId
        });
        return false;
    }
}
 
 // *** Reply Message ***
 async replyMessage(replyToken, text, retryCount = 0) {
     if (!replyToken || replyToken.trim() === '') {
         this.logger.warn('Invalid replyToken, skipping message reply');
         return;
     }
     
     if (!text) {
         this.logger.error('Attempted to reply with undefined/null message');
         text = 'ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ กรุณาลองใหม่อีกครั้ง';
     }
     
     try {
         const lockSignature = await this.acquireMessageLock(replyToken, text);
         if (!lockSignature) {
             this.logger.warn('Duplicate reply detected, skipping');
             return;
         }

         try {
             const cleanedText = MessageContentCleaner.deduplicateContent(text);
             const messages = this.splitLongMessage(cleanedText);
             
             const body = {
                 replyToken,
                 messages: messages.map(msg => ({
                     type: 'text',
                     text: msg
                 }))
             };

             await this.makeRequest('post', 'https://api.line.me/v2/bot/message/reply', body);
             
             this.logger.info('Reply message sent successfully', {
                 replyToken: replyToken.substring(0, 10) + '...',
                 messageCount: messages.length,
                 totalLength: cleanedText.length
             });
             
         } finally {
             this.releaseMessageLock(lockSignature);
         }
     } catch (error) {
         const maxRetries = this.maxRetries || 3;
         const retryDelay = this.retryDelay || 1000;
         
         if (retryCount < maxRetries) {
             this.logger.warn(`Retrying reply (attempt ${retryCount + 1})`, {
                 replyToken: replyToken.substring(0, 10) + '...',
                 error: error.message
             });
             await new Promise(resolve => setTimeout(resolve, retryDelay));
             return this.replyMessage(replyToken, text, retryCount + 1);
         }
         this.logger.error('Error sending reply after all retries:', {
             error: error.message,
             replyToken: replyToken.substring(0, 10) + '...',
             retryCount
         });
     }
 }

 // *** HTTP Request Helper ***
 async makeRequest(method, url, data = null, retryCount = 0) {
     try {
         const response = await axios({
             method,
             url,
             headers: this.getHeaders(),
             data,
             timeout: 30000
         });
         return response.data;
     } catch (error) {
         if (error.response) {
             this.logger.error('LINE API Error:', {
                 status: error.response.status,
                 statusText: error.response.statusText,
                 data: error.response.data,
                 url: url
             });
         }

         if (retryCount < this.maxRetries) {
             this.logger.warn(`Retrying HTTP request (attempt ${retryCount + 1})`, {
                 method,
                 url,
                 error: error.message
             });
             await new Promise(resolve => setTimeout(resolve, this.retryDelay));
             return this.makeRequest(method, url, data, retryCount + 1);
         }

         throw error;
     }
 }

 // *** Request Headers ***
 getHeaders() {
     return {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${this.lineToken}`,
         'User-Agent': 'LineBot/1.0'
     };
 }

 // *** Message Splitting for Long Messages ***
 splitLongMessage(message) {
     if (!message) {
         this.logger.error('Attempted to split undefined/null message');
         return ['ขออภัย เกิดข้อผิดพลาดในการประมวลผลข้อความ กรุณาลองอีกครั้ง'];
     }
     
     const MAX_LENGTH = 4500;
     
     if (message.length <= MAX_LENGTH) {
         return [message];
     }
     
     this.logger.info('Splitting long message', {
         originalLength: message.length,
         maxLength: MAX_LENGTH
     });
     
     const parts = [];
     let currentIndex = 0;
     
     while (currentIndex < message.length) {
         let endIndex = currentIndex + MAX_LENGTH;
         
         if (endIndex < message.length) {
             // Try to break at newline
             const newlineIndex = message.lastIndexOf('\n', endIndex);
             if (newlineIndex > currentIndex && newlineIndex > endIndex - 200) {
                 endIndex = newlineIndex + 1;
             } else {
                 // Try to break at space
                 const spaceIndex = message.lastIndexOf(' ', endIndex);
                 if (spaceIndex > currentIndex && spaceIndex > endIndex - 100) {
                     endIndex = spaceIndex + 1;
                 }
             }
         } else {
             endIndex = message.length;
         }
         
         const part = message.substring(currentIndex, endIndex).trim();
         if (part) {
             parts.push(part);
         }
         
         currentIndex = endIndex;
     }
     
     this.logger.info('Message split completed', {
         originalLength: message.length,
         parts: parts.length,
         partLengths: parts.map(p => p.length)
     });
     
     return parts;
 }

 // *** Message Locking System ***
 generateMessageSignature(userId, content, timestamp) {
     const hash = require('crypto').createHash('md5')
         .update(`${userId}_${content}_${timestamp}`)
         .digest('hex');
     return hash;
 }

 async acquireMessageLock(userId, content) {
     const signature = this.generateMessageSignature(userId, content, Date.now());
     if (this.messageLocks.has(signature)) {
         return false;
     }
     this.messageLocks.set(signature, Date.now());
     return signature;
 }

 releaseMessageLock(signature) {
     if (signature) {
         this.messageLocks.delete(signature);
     }
 }

 // *** AI Status Management ***
 isAiEnabledForUser(userId) {
     if (!this.aiState.globalEnabled) {
         return false;
     }
     const userSetting = this.aiState.userSettings.get(userId);
     return userSetting !== false;
 }

 setGlobalAiStatus(enabled) {
     this.aiState.globalEnabled = enabled;
     this.logger.info('Global AI status changed:', { enabled });
     
     if (this.webSocketManager) {
         this.webSocketManager.io.emit('global_ai_status_changed', {
             enabled: enabled,
             timestamp: Date.now()
         });
     }
     
     return this.aiState.globalEnabled;
 }

 setUserAiStatus(userId, enabled) {
     this.aiState.userSettings.set(userId, enabled);
     this.logger.info('User AI status changed:', { 
         userId: userId ? userId.substring(0, 10) + '...' : 'unknown', 
         enabled 
     });
     
     if (this.webSocketManager) {
         this.webSocketManager.io.emit('user_ai_status_changed', {
             userId: userId,
             enabled: enabled,
             timestamp: Date.now()
         });
     }
     
     return enabled;
 }

 getAiStatus() {
     return {
         globalEnabled: this.aiState.globalEnabled,
         userSettings: Object.fromEntries(this.aiState.userSettings),
         timestamp: Date.now()
     };
 }

 // *** Rich Message Support ***
 async sendFlexMessage(userId, flexContent, altText = 'Flex Message') {
     try {
         if (!userId || !flexContent) {
             throw new Error('userId and flexContent are required');
         }

         const response = await axios.post(
             'https://api.line.me/v2/bot/message/push',
             {
                 to: userId,
                 messages: [{
                     type: 'flex',
                     altText: altText,
                     contents: flexContent
                 }]
             },
             {
                 headers: this.getHeaders()
             }
         );

         this.logger.info('Flex message sent successfully', {
             userId: userId.substring(0, 10) + '...',
             altText,
             status: response.status
         });

         return {
             success: true,
             status: response.status
         };

     } catch (error) {
         this.logger.error('Error sending flex message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             status: error.response?.status
         });

         return {
             success: false,
             error: error.message,
             status: error.response?.status
         };
     }
 }

 async sendImageMessage(userId, originalContentUrl, previewImageUrl) {
     try {
         if (!userId || !originalContentUrl || !previewImageUrl) {
             throw new Error('userId, originalContentUrl, and previewImageUrl are required');
         }

         const response = await axios.post(
             'https://api.line.me/v2/bot/message/push',
             {
                 to: userId,
                 messages: [{
                     type: 'image',
                     originalContentUrl: originalContentUrl,
                     previewImageUrl: previewImageUrl
                 }]
             },
             {
                 headers: this.getHeaders()
             }
         );

         this.logger.info('Image message sent successfully', {
             userId: userId.substring(0, 10) + '...',
             status: response.status
         });

         return {
             success: true,
             status: response.status
         };

     } catch (error) {
         this.logger.error('Error sending image message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             status: error.response?.status
         });

         return {
             success: false,
             error: error.message,
             status: error.response?.status
         };
     }
 }

 // *** sendMessage for ProductImageSender compatibility ***
 async sendMessage(userId, content, options = {}) {
     try {
         const response = await this.pushMessage(userId, content, options.messageId, options.fromAdmin || false);

         // Log successful send
         this.logger.info('Message successfully sent via sendMessage:', {
             userId: userId.substring(0, 10) + '...',
             messageId: options.messageId || 'unknown',
             content: content.substring(0, 50) + '...',
             timestamp: new Date().toISOString(),
             fromAdmin: options.fromAdmin || false
         });

         return response;
     } catch (error) {
         this.logger.error('Failed to send message via sendMessage:', error);
         throw error;
     }
 }

 // *** Configuration Updates ***
 updatePendingMessageConfig(config) {
     if (config.pendingTimeout && typeof config.pendingTimeout === 'number') {
         if (config.pendingTimeout >= 5000 && config.pendingTimeout <= 60000) {
             this.MESSAGE_PENDING_TTL = config.pendingTimeout;
             this.logger.info('Updated pending message timeout:', {
                 newTimeout: this.MESSAGE_PENDING_TTL
             });
         } else {
             this.logger.warn('Invalid pending timeout value, must be between 5000-60000ms');
         }
     }
     
     if (config.imageTextWaitDelay && typeof config.imageTextWaitDelay === 'number') {
         if (config.imageTextWaitDelay >= 5000 && config.imageTextWaitDelay <= 30000) {
             this.IMAGE_TEXT_WAIT_DELAY = config.imageTextWaitDelay;
             this.logger.info('Updated image text wait delay:', {
                 newDelay: this.IMAGE_TEXT_WAIT_DELAY
             });
         } else {
             this.logger.warn('Invalid image text wait delay, must be between 5000-30000ms');
         }
     }
     
     if (config.shortMessageThreshold && typeof config.shortMessageThreshold === 'number') {
         this.SHORT_MESSAGE_THRESHOLD = config.shortMessageThreshold;
         this.logger.info('Updated short message threshold:', {
             newThreshold: this.SHORT_MESSAGE_THRESHOLD
         });
     }
     
     if (config.messageAggregationMode && 
         ['newline', 'join', 'smart'].includes(config.messageAggregationMode)) {
             this.MSG_AGGREGATION_MODE = config.messageAggregationMode;
             this.logger.info('Updated message aggregation mode:', {
                 newMode: this.MSG_AGGREGATION_MODE
             });
         }
         
     if (config.maxTimeBetweenFragments && typeof config.maxTimeBetweenFragments === 'number') {
         this.MAX_TIME_BETWEEN_FRAGMENTS = config.maxTimeBetweenFragments;
         this.logger.info('Updated max time between fragments:', {
             newValue: this.MAX_TIME_BETWEEN_FRAGMENTS
         });
     }
     
     if (this.webSocketManager) {
         this.webSocketManager.io.emit('message_config_updated', {
             config: {
                 pendingTimeout: this.MESSAGE_PENDING_TTL,
                 imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
                 shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
                 messageAggregationMode: this.MSG_AGGREGATION_MODE,
                 maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
             },
             timestamp: Date.now()
         });
     }
     
     return {
         pendingTimeout: this.MESSAGE_PENDING_TTL,
         imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
         shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
         messageAggregationMode: this.MSG_AGGREGATION_MODE,
         maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
     };
 }

 // *** Statistics and Monitoring ***
 getStatistics() {
     try {
         const stats = {
             messaging: {
                 pendingTextMessages: this.pendingMessages.size,
                 pendingImageMessages: this.pendingImages.size,
                 activeProcessing: this.processingStatus.size,
                 cacheSize: this.messageCache.size,
                 activeLocks: this.messageLocks.size
             },
             ai: {
                 globalEnabled: this.aiState.globalEnabled,
                 usersWithCustomSettings: this.aiState.userSettings.size,
                 usersWithAiDisabled: Array.from(this.aiState.userSettings.values()).filter(v => v === false).length
             },
             connections: {
                 imageHandler: !!this.imageHandler,
                 keywordDetector: !!this.keywordDetector,
                 webSocketManager: !!this.webSocketManager,
                 productImageSender: !!this.productImageSender,
                 lineToken: !!this.lineToken
             },
             configuration: {
                 pendingTimeout: this.MESSAGE_PENDING_TTL,
                 imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
                 messageCacheTtl: this.MESSAGE_CACHE_TTL,
                 messageLockTtl: this.MESSAGE_LOCK_TTL,
                 shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
                 aggregationMode: this.MSG_AGGREGATION_MODE,
                 maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS,
                 maxRetries: this.maxRetries,
                 retryDelay: this.retryDelay
             },
             performance: {
                 memoryUsage: process.memoryUsage(),
                 uptime: process.uptime()
             },
             timestamp: Date.now()
         };

         return stats;
     } catch (error) {
         this.logger.error('Error generating statistics:', {
             error: error.message,
             stack: error.stack
         });
         return {
             error: 'Failed to generate statistics',
             timestamp: Date.now()
         };
     }
 }

 // *** Health Check ***
 healthCheck() {
     return {
         status: 'healthy',
         pendingMessages: this.pendingMessages.size,
         pendingImages: this.pendingImages.size,
         processingQueue: this.processingStatus.size,
         cacheSize: this.messageCache.size,
         locks: this.messageLocks.size,
         aiState: {
             globalEnabled: this.aiState.globalEnabled,
             userCount: this.aiState.userSettings.size
         },
         connections: {
             webSocketConnected: !!this.webSocketManager,
             imageHandlerConnected: !!this.imageHandler,
             keywordDetectorConnected: !!this.keywordDetector,
             productImageSenderConnected: !!this.productImageSender,
             lineTokenConfigured: !!this.lineToken
         },
         configuration: {
             pendingTimeout: this.MESSAGE_PENDING_TTL,
             imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
             messageCacheTtl: this.MESSAGE_CACHE_TTL,
             shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
             aggregationMode: this.MSG_AGGREGATION_MODE
         },
         timestamp: Date.now()
     };
 }

 // *** Processing Status Management ***
 getProcessingStatus(userId) {
     return this.processingStatus.get(userId) || null;
 }

 setProcessingStatus(userId, status, messageId = null) {
     this.processingStatus.set(userId, {
         status: status,
         timestamp: Date.now(),
         messageId: messageId
     });

     if (this.webSocketManager) {
         this.webSocketManager.io.emit('processing_status_update', {
             userId: userId,
             status: status,
             messageId: messageId,
             timestamp: Date.now()
         });
     }
 }

 clearProcessingStatus(userId) {
     this.processingStatus.delete(userId);

     if (this.webSocketManager) {
         this.webSocketManager.io.emit('processing_status_cleared', {
             userId: userId,
             timestamp: Date.now()
         });
     }
 }

 // *** Event Handling for Different Message Types ***
 async handleLocationMessage(userId, location, replyToken) {
     try {
         this.logger.info('Location message received', {
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             latitude: location.latitude,
             longitude: location.longitude,
             address: location.address
         });

         // Process location message (could integrate with maps, delivery, etc.)
         const responseText = `ขอบคุณสำหรับการแชร์ตำแหน่งค่ะ\nที่อยู่: ${location.address || 'ไม่ระบุ'}\nละติจูด: ${location.latitude}\nลองจิจูด: ${location.longitude}`;
         
         await this.replyMessage(replyToken, responseText);

     } catch (error) {
         this.logger.error('Error handling location message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
         });
     }
 }

 async handleAudioMessage(userId, messageId, replyToken) {
     try {
         this.logger.info('Audio message received', {
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             messageId
         });

         // For now, just acknowledge the audio message
         await this.replyMessage(replyToken, 'ขอบคุณสำหรับข้อความเสียงค่ะ ขณะนี้ระบบยังไม่สามารถประมวลผลเสียงได้ กรุณาพิมพ์ข้อความแทนค่ะ');

     } catch (error) {
         this.logger.error('Error handling audio message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
         });
     }
 }

 async handleVideoMessage(userId, messageId, replyToken) {
     try {
         this.logger.info('Video message received', {
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             messageId
         });

         // For now, just acknowledge the video message
         await this.replyMessage(replyToken, 'ขอบคุณสำหรับวิดีโอค่ะ ขณะนี้ระบบยังไม่สามารถประมวลผลวิดีโอได้ กรุณาพิมพ์ข้อความแทนค่ะ');

     } catch (error) {
         this.logger.error('Error handling video message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
         });
     }
 }

 async handleFileMessage(userId, messageId, replyToken) {
     try {
         this.logger.info('File message received', {
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             messageId
         });

         // For now, just acknowledge the file message
         await this.replyMessage(replyToken, 'ขอบคุณสำหรับไฟล์ค่ะ ขณะนี้ระบบยังไม่สามารถประมวลผลไฟล์ได้ กรุณาพิมพ์ข้อความแทนค่ะ');

     } catch (error) {
         this.logger.error('Error handling file message:', {
             error: error.message,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown'
         });
     }
 }

 // *** Group and Room Message Processing ***
 async processGroupMessage(event) {
     try {
         const { message, source, replyToken } = event;
         const groupId = source.groupId;
         const userId = source.userId;

         this.logger.info('Group message received', {
             groupId,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             messageType: message.type
         });

         // For now, treat group messages similar to individual messages
         // but with different handling logic if needed
         await this.handleMessage(event);

     } catch (error) {
         this.logger.error('Error processing group message:', {
             error: error.message,
             stack: error.stack
         });
     }
 }

 async processRoomMessage(event) {
     try {
         const { message, source, replyToken } = event;
         const roomId = source.roomId;
         const userId = source.userId;

         this.logger.info('Room message received', {
             roomId,
             userId: userId ? userId.substring(0, 10) + '...' : 'unknown',
             messageType: message.type
         });

         // For now, treat room messages similar to individual messages
         await this.handleMessage(event);

     } catch (error) {
         this.logger.error('Error processing room message:', {
             error: error.message,
             stack: error.stack
         });
     }
 }

 // *** Bulk Operations ***
 async sendBulkMessages(recipients, message) {
     try {
         if (!Array.isArray(recipients) || recipients.length === 0) {
             throw new Error('Recipients array is required');
         }

         if (!message || typeof message !== 'string') {
             throw new Error('Message text is required');
         }

         this.logger.info('Starting bulk message send', {
             recipientCount: recipients.length,
             messageLength: message.length
         });

         const results = {
             successful: [],
             failed: [],
             total: recipients.length
         };

         // Process in batches to avoid rate limits
         const batchSize = 10;
         for (let i = 0; i < recipients.length; i += batchSize) {
             const batch = recipients.slice(i, i + batchSize);
             
             const batchPromises = batch.map(async (userId) => {
                 try {
                     await this.pushMessage(userId, message, null, true);
                     results.successful.push(userId);
                     this.logger.debug('Bulk message sent successfully', {
                         userId: userId.substring(0, 10) + '...'
                     });
                 } catch (error) {
                     results.failed.push({
                         userId: userId,
                         error: error.message
                     });
                     this.logger.error('Bulk message failed', {
                         userId: userId.substring(0, 10) + '...',
                         error: error.message
                     });
                 }
             });

             await Promise.all(batchPromises);

             // Add delay between batches
             if (i + batchSize < recipients.length) {
                 await new Promise(resolve => setTimeout(resolve, 1000));
             }
         }

         this.logger.info('Bulk message send completed', {
             total: results.total,
             successful: results.successful.length,
             failed: results.failed.length
         });

         return results;

     } catch (error) {
         this.logger.error('Error in bulk message send:', {
             error: error.message,
             stack: error.stack
         });
         throw error;
     }
 }

 // *** Testing and Validation Methods ***
 async testConnection() {
     try {
         if (!this.lineToken) {
             throw new Error('LINE token not configured');
         }

         // Test with a simple API call
         const response = await axios.get('https://api.line.me/v2/bot/info', {
             headers: this.getHeaders(),
             timeout: 10000
         });

         this.logger.info('LINE API connection test successful', {
             status: response.status,
             data: response.data
         });

         return {
             success: true,
             status: response.status,
             botInfo: response.data,
             timestamp: Date.now()
         };
     } catch (error) {
         this.logger.error('LINE API connection test failed:', {
             error: error.message,
             status: error.response?.status,
             data: error.response?.data
         });

         return {
             success: false,
             error: error.message,
             status: error.response?.status,
             timestamp: Date.now()
         };
     }
 }

 async validateConfiguration() {
     const validation = {
         lineToken: !!this.lineToken,
         serviceConnections: {
             aiAssistant: !!this.aiAssistant,
             productManager: !!this.productManager,
             chatHistory: !!this.chatHistory,
             messageHandler: !!this.messageHandler,
             imageHandler: !!this.imageHandler,
             keywordDetector: !!this.keywordDetector,
             webSocketManager: !!this.webSocketManager,
             productImageSender: !!this.productImageSender
         },
         configuration: {
             pendingTimeoutValid: this.MESSAGE_PENDING_TTL >= 5000 && this.MESSAGE_PENDING_TTL <= 300000,
             imageWaitDelayValid: this.IMAGE_TEXT_WAIT_DELAY >= 5000 && this.IMAGE_TEXT_WAIT_DELAY <= 60000,
             cacheTtlValid: this.MESSAGE_CACHE_TTL >= 60000 && this.MESSAGE_CACHE_TTL <= 600000,
             aggregationModeValid: ['newline', 'join', 'smart'].includes(this.MSG_AGGREGATION_MODE),
             shortMessageThresholdValid: this.SHORT_MESSAGE_THRESHOLD >= 5 && this.SHORT_MESSAGE_THRESHOLD <= 100
         },
         timestamp: Date.now()
     };

     // Test LINE API connection if token exists
     if (validation.lineToken) {
         const connectionTest = await this.testConnection();
         validation.lineApiConnection = connectionTest.success;
         validation.botInfo = connectionTest.botInfo;
     }

     const allValid = validation.lineToken && 
                     Object.values(validation.serviceConnections).every(v => v) &&
                     Object.values(validation.configuration).every(v => v) &&
                     (validation.lineApiConnection !== false);

     validation.overall = allValid ? 'valid' : 'invalid';

     this.logger.info('Configuration validation completed', {
         overall: validation.overall,
         lineToken: validation.lineToken,
         lineApiConnection: validation.lineApiConnection,
         serviceConnections: validation.serviceConnections,
         configuration: validation.configuration
     });

     return validation;
 }

 // *** Debug Methods ***
 getDebugInfo() {
     const debugInfo = {
         pendingMessages: {},
         pendingImages: {},
         processingStatus: {},
         aiState: {
             globalEnabled: this.aiState.globalEnabled,
             userSettings: Object.fromEntries(this.aiState.userSettings)
         },
         caches: {
             messageCache: this.messageCache.size,
             messageLocks: this.messageLocks.size
         },
         configuration: this.getConfiguration(),
         timestamp: Date.now()
     };

     // Add pending messages details (with privacy protection)
     for (const [userId, pending] of this.pendingMessages.entries()) {
         debugInfo.pendingMessages[userId.substring(0, 10) + '...'] = {
             textCount: pending.texts ? pending.texts.length : 0,
             lastUpdateTime: pending.lastUpdateTime,
             hasTimeout: !!pending.timeoutId,
             age: Date.now() - (pending.timestamp || 0)
         };
     }

     // Add pending images details
     for (const [userId, pending] of this.pendingImages.entries()) {
         debugInfo.pendingImages[userId.substring(0, 10) + '...'] = {
             messageId: pending.messageId,
             hasExistingComment: !!pending.existingComment,
             age: Date.now() - (pending.timestamp || 0)
         };
     }

     // Add processing status details
     for (const [userId, status] of this.processingStatus.entries()) {
         debugInfo.processingStatus[userId.substring(0, 10) + '...'] = {
             status: status.status,
             messageId: status.messageId,
             age: Date.now() - (status.timestamp || 0)
         };
     }

     return debugInfo;
 }

 getConfiguration() {
     return {
         messaging: {
             pendingTimeout: this.MESSAGE_PENDING_TTL,
             imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
             messageCacheTtl: this.MESSAGE_CACHE_TTL,
             messageLockTtl: this.MESSAGE_LOCK_TTL,
             maxRetries: this.maxRetries,
             retryDelay: this.retryDelay
         },
         aggregation: {
             shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
             aggregationMode: this.MSG_AGGREGATION_MODE,
             maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
         },
         pending: {
             pendingTextMessages: this.pendingMessages.size,
             pendingImageMessages: this.pendingImages.size
         },
         aiState: {
             globalEnabled: this.aiState.globalEnabled,
             userSettingsCount: this.aiState.userSettings.size
         },
         processingStatus: {
             activeProcessing: this.processingStatus.size
         },
         connections: {
             hasImageHandler: !!this.imageHandler,
             hasKeywordDetector: !!this.keywordDetector,
             hasWebSocketManager: !!this.webSocketManager,
             hasProductImageSender: !!this.productImageSender,
             hasLineToken: !!this.lineToken
         }
     };
 }

 // *** Cleanup and Shutdown ***
 cleanup() {
     this.logger.info('Starting LineMessageHandler cleanup...');
     
     try {
         // Clear pending cleanup interval
         if (this.pendingCleanupInterval) {
             clearInterval(this.pendingCleanupInterval);
             this.logger.info('Pending messages cleanup interval stopped');
         }

         // Clear all pending message timeouts
         for (const [userId, pendingMsgs] of this.pendingMessages.entries()) {
             if (pendingMsgs.timeoutId) {
                 clearTimeout(pendingMsgs.timeoutId);
             }
         }

         // Clear all maps
         this.pendingMessages.clear();
         this.pendingImages.clear();
         this.processingStatus.clear();
         this.messageCache.clear();
         this.messageLocks.clear();
         this.aiState.userSettings.clear();

         this.logger.info('LineMessageHandler cleanup completed successfully', {
             clearedPendingMessages: true,
             clearedPendingImages: true,
             clearedProcessingStatus: true,
             clearedCaches: true,
             clearedLocks: true
         });
         
     } catch (error) {
         this.logger.error('Error during LineMessageHandler cleanup:', {
             error: error.message,
             stack: error.stack
         });
     }
 }

 // *** Final Status Methods ***
 getPendingMessagesStatus() {
     return {
         pendingTextMessages: this.pendingMessages.size,
         pendingImageMessages: this.pendingImages.size,
         pendingTimeout: this.MESSAGE_PENDING_TTL,
         imageTextWaitDelay: this.IMAGE_TEXT_WAIT_DELAY,
         timestamp: Date.now()
     };
 }

 updateMessageAggregationSettings(settings) {
     if (settings.shortMessageThreshold && typeof settings.shortMessageThreshold === 'number') {
         this.SHORT_MESSAGE_THRESHOLD = settings.shortMessageThreshold;
     }
     if (settings.aggregationMode && 
         ['newline', 'join', 'smart'].includes(settings.aggregationMode)) {
         this.MSG_AGGREGATION_MODE = settings.aggregationMode;
     }
     
     if (settings.maxTimeBetweenFragments && typeof settings.maxTimeBetweenFragments === 'number') {
         this.MAX_TIME_BETWEEN_FRAGMENTS = settings.maxTimeBetweenFragments;
     }
     
     this.logger.info('Updated message aggregation settings:', {
         shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
         aggregationMode: this.MSG_AGGREGATION_MODE,
         maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
     });
     
     if (this.webSocketManager) {
         this.webSocketManager.io.emit('aggregation_settings_updated', {
             settings: {
                 shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
                 aggregationMode: this.MSG_AGGREGATION_MODE,
                 maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
             },
             timestamp: Date.now()
         });
     }
     
     return {
         shortMessageThreshold: this.SHORT_MESSAGE_THRESHOLD,
         aggregationMode: this.MSG_AGGREGATION_MODE,
         maxTimeBetweenFragments: this.MAX_TIME_BETWEEN_FRAGMENTS
     };
 }
}

module.exports = LineMessageHandler;
