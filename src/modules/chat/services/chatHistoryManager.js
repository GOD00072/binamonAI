const path = require('path');
const fs = require('fs').promises;
const PrismaService = require('../../../infrastructure/database/prismaService');
const { DATA_DIR } = require('../../../app/paths');

class ChatHistoryManager {
   constructor(logger) {
       this.logger = logger;
       this.prismaService = new PrismaService(logger);
       this.aiHistoriesPath = path.join(DATA_DIR, 'chat_histories_ai');
       this.apiHistoriesPath = path.join(DATA_DIR, 'chat_histories_api');
       this.productsPath = path.join(DATA_DIR, 'product_histories');
       
       // *** ปรับปรุง Cache System ***
       this.userProfilesCache = new Map();
       this.PROFILE_CACHE_TTL = 1800000000; // 30 นาที
       
       // *** เพิ่ม: File metadata cache ***
       this.fileMetadataCache = new Map();
       this.FILE_METADATA_TTL = 30000000; // 5 นาที
       
       // *** เพิ่ม: Quick user list cache ***
       this.userListCache = null;
       this.userListCacheTimestamp = 0;
       this.USER_LIST_CACHE_TTL = 300000000; // 5 นาที
       
       // *** เพิ่ม: Light history cache (เฉพาะ metadata) ***
       this.lightHistoryCache = new Map();
       this.LIGHT_HISTORY_TTL = 180000000; // 3 นาที
       
       this.processedMessages = new Map();
       this.MESSAGE_TRACKING_TTL = 30000000000; // 5 minutes
       this.TIMESTAMP_THRESHOLD = 2000; // 2 seconds
       this.RELEVANCE_THRESHOLD = 0.2;

       this.ensureDirectoryExists();
       setInterval(() => this.cleanupOldHistories(), 7 * 24 * 60 * 60 * 1000);
       setInterval(() => this.cleanupProcessedMessages(), 60 * 60 * 1000);
       
       // Create cleanup interval
       this.cleanupInterval = setInterval(() => this.cleanupProcessedMessages(), 60 * 60 * 1000);
       
       // *** Cache cleanup intervals ***
       this.cacheCleanupInterval = setInterval(() => {
           this.cleanupProfileCache();
           this.cleanupFileMetadataCache();
           this.cleanupLightHistoryCache();
       }, 60 * 60 * 1000);
   }

   getChatModel(type = 'api') {
       return type === 'ai'
           ? this.prismaService.prisma.chatHistoryAI
           : this.prismaService.prisma.chatHistoryAPI;
   }

   formatDBMessage(record) {
       if (!record) {
           return null;
       }

       let products = [];
       let senderProfile = null;

       try {
           if (record.products) {
               products = JSON.parse(record.products);
           }
       } catch (error) {
           this.logger.error('Error parsing products from DB record:', error);
       }

       try {
           if (record.senderProfile) {
               senderProfile = JSON.parse(record.senderProfile);
           }
       } catch (error) {
           this.logger.error('Error parsing senderProfile from DB record:', error);
       }

       return {
           role: record.role,
           content: record.content,
           timestamp: Number(record.timestamp) || Date.now(),
           messageId: record.messageId || record.id,
           products,
           senderProfile,
           source: record.source || null,
           inputTokens: record.inputTokens || 0,
           outputTokens: record.outputTokens || 0,
           totalTokens: record.totalTokens || ((record.inputTokens || 0) + (record.outputTokens || 0))
       };
   }

   async getConversationState(userId) {
       if (!userId) return null;
       try {
           return await this.prismaService.getChatUserState(userId);
       } catch (error) {
           this.logger.error(`Error fetching chat user state for ${userId}:`, error);
           return null;
       }
   }

   extractTokensFromState(state, type) {
       if (!state) {
           return { input: 0, output: 0 };
       }

       if (type === 'ai') {
           return {
               input: state.aiInputTokens || 0,
               output: state.aiOutputTokens || 0
           };
       }

       return {
           input: state.apiInputTokens || 0,
           output: state.apiOutputTokens || 0
       };
   }

   async loadChatHistoryFromDatabase(userId, type = 'api') {
       const history = this.createDefaultHistory();
       history.userId = userId;

       if (!userId) {
           return history;
       }

       try {
           const chatModel = this.getChatModel(type);
           const records = await chatModel.findMany({
               where: { userId },
               orderBy: { timestamp: 'asc' }
           });

           const messages = records
               .map(record => this.formatDBMessage(record))
               .filter(Boolean);

           history.messages = messages;
           history.lastUpdated = messages.length > 0
               ? messages[messages.length - 1].timestamp
               : history.lastUpdated;

           const state = await this.getConversationState(userId);
           history.totalTokens = this.extractTokensFromState(state, type);

           if (type === 'api' && state?.apiLastRead) {
               history.lastRead = Number(state.apiLastRead) || 0;
           }

           history.context = this.updateHistoryContext(history);
           history.stats = this.calculateMessageStats(history.messages);

           return history;
       } catch (error) {
           this.logger.error(`Error loading chat history from DB for ${userId}:`, error);
           return history;
       }
   }

   async updateConversationTokens(userId, type, totalTokens = { input: 0, output: 0 }) {
       if (!totalTokens || (!totalTokens.input && !totalTokens.output)) {
           return;
       }

       try {
           await this.prismaService.incrementChatTokens(
               userId,
               type,
               totalTokens.input || 0,
               totalTokens.output || 0
           );
       } catch (error) {
           this.logger.error(`Error updating token usage for ${userId}:`, error);
       }
   }

   // *** ปรับปรุง: ฟังก์ชันดึง User Profile แบบเร็ว ***
   async getUserProfile(userId) {
       try {
           // ตรวจสอบ cache ก่อน
           const cacheKey = `profile_${userId}`;
           const cachedProfile = this.userProfilesCache.get(cacheKey);
           
           if (cachedProfile && (Date.now() - cachedProfile.timestamp) < this.PROFILE_CACHE_TTL) {
               return cachedProfile.profile;
           }

           // โหลด profile แบบเร็ว
           const profile = await this.loadUserProfileFast(userId);
           
           if (profile) {
               // Cache profile
               this.userProfilesCache.set(cacheKey, {
                   profile: profile,
                   timestamp: Date.now()
               });
               
               return profile;
           }
           
           // Fallback: สร้าง profile เปล่า
           const fallbackProfile = {
               displayName: `User ${userId.substring(1, 9)}`,
               pictureUrl: null
           };
           
           // Cache fallback profile แต่ด้วยเวลา TTL ที่สั้นกว่า
           this.userProfilesCache.set(cacheKey, {
               profile: fallbackProfile,
               timestamp: Date.now(),
               ttl: 60000 // 1 minute สำหรับ fallback
           });
           
           return fallbackProfile;
           
       } catch (error) {
           this.logger.error('Error getting user profile:', error);
           return {
               displayName: `User ${userId.substring(1, 9)}`,
               pictureUrl: null
           };
       }
   }

   // *** เพิ่ม: Fast profile loading ***
   async loadUserProfileFast(userId) {
       try {
           // ลองจาก light cache ก่อน
           const lightCacheKey = `light_${userId}`;
           const cached = this.lightHistoryCache.get(lightCacheKey);
           
           if (cached && (Date.now() - cached.timestamp) < this.LIGHT_HISTORY_TTL) {
               return cached.profile;
           }

           // ลองจาก API history ก่อน (ใหม่กว่า)
           let profile = await this.extractProfileFromHistory(userId, 'api');
           if (profile) {
               // Cache light data
               this.lightHistoryCache.set(lightCacheKey, {
                   profile: profile,
                   timestamp: Date.now()
               });
               return profile;
           }

           // ถ้าไม่มีลองจาก AI history
           profile = await this.extractProfileFromHistory(userId, 'ai');
           if (profile) {
               this.lightHistoryCache.set(lightCacheKey, {
                   profile: profile,
                   timestamp: Date.now()
               });
               return profile;
           }

           return null;

       } catch (error) {
           this.logger.error(`Error loading fast profile for ${userId}:`, error);
           return null;
       }
   }

   // *** เพิ่ม: Extract profile จากไฟล์อย่างเร็ว ***
   async extractProfileFromHistory(userId, type) {
       const metadataKey = `metadata_${type}_${userId}`;

       try {
           const cachedMetadata = this.fileMetadataCache.get(metadataKey);
           if (cachedMetadata && (Date.now() - cachedMetadata.timestamp) < this.FILE_METADATA_TTL) {
               if (!cachedMetadata.exists) {
                   return null;
               }
               if (cachedMetadata.profile) {
                   return cachedMetadata.profile;
               }
           }

           const chatModel = this.getChatModel(type);
           const record = await chatModel.findFirst({
               where: {
                   userId,
                   role: 'user',
                   senderProfile: { not: null }
               },
               orderBy: { timestamp: 'desc' },
               select: {
                   senderProfile: true,
                   timestamp: true
               }
           });

           if (!record?.senderProfile) {
               this.fileMetadataCache.set(metadataKey, {
                   exists: record ? true : false,
                   timestamp: Date.now()
               });
               return null;
           }

           let profile = null;
           try {
               profile = JSON.parse(record.senderProfile);
           } catch (parseError) {
               this.logger.error(`Error parsing senderProfile from DB for ${userId}:`, parseError);
               profile = null;
           }

           this.fileMetadataCache.set(metadataKey, {
               exists: true,
               timestamp: Date.now(),
               lastModified: Number(record.timestamp) || Date.now(),
               messageCount: null,
               profile
           });

           return profile;

       } catch (error) {
           this.logger.error(`Error extracting profile from ${type} history for ${userId}:`, error);
           return null;
       }
   }

   // *** เพิ่ม: Fast user list ***
   async getUserListFast() {
       try {
           const now = Date.now();
           
           // ตรวจสอบ cache
           if (this.userListCache && 
               (now - this.userListCacheTimestamp) < this.USER_LIST_CACHE_TTL) {
               return this.userListCache;
           }

           const [apiUsers, aiUsers] = await Promise.all([
               this.prismaService.prisma.chatHistoryAPI.findMany({
                   select: { userId: true },
                   distinct: ['userId']
               }),
               this.prismaService.prisma.chatHistoryAI.findMany({
                   select: { userId: true },
                   distinct: ['userId']
               })
           ]);

           const users = new Set([
               ...apiUsers.map(item => item.userId),
               ...aiUsers.map(item => item.userId)
           ]);

           const userList = Array.from(users);
           
           // Cache result
           this.userListCache = userList;
           this.userListCacheTimestamp = now;
           
           return userList;

       } catch (error) {
           this.logger.error('Error getting fast user list:', error);
           return [];
       }
   }

   // *** เพิ่ม: Load history metadata only ***
   async loadHistoryMetadata(userId, type) {
       const metadataKey = `metadata_${type}_${userId}`;

       try {
           const cachedMetadata = this.fileMetadataCache.get(metadataKey);

           if (cachedMetadata && (Date.now() - cachedMetadata.timestamp) < this.FILE_METADATA_TTL) {
               if (!cachedMetadata.exists) {
                   return null;
               }

               return {
                   lastUpdated: cachedMetadata.lastModified,
                   messageCount: cachedMetadata.messageCount || 0
               };
           }

           const chatModel = this.getChatModel(type);

           const [messageCount, lastMessage] = await Promise.all([
               chatModel.count({ where: { userId } }),
               chatModel.findFirst({
                   where: { userId },
                   orderBy: { timestamp: 'desc' },
                   select: { timestamp: true }
               })
           ]);

           if (!messageCount) {
               this.fileMetadataCache.set(metadataKey, {
                   exists: false,
                   timestamp: Date.now()
               });
               return null;
           }

           const metadata = {
               exists: true,
               timestamp: Date.now(),
               lastModified: Number(lastMessage?.timestamp) || Date.now(),
               messageCount
           };

           this.fileMetadataCache.set(metadataKey, metadata);

           return {
               lastUpdated: metadata.lastModified,
               messageCount: metadata.messageCount
           };
       } catch (error) {
           this.logger.error(`Error loading history metadata for ${userId}:`, error);
           return null;
       }
   }

   // *** เพิ่ม: Cache cleanup functions ***
   cleanupFileMetadataCache() {
       const now = Date.now();
       let removedCount = 0;
       
       for (const [key, data] of this.fileMetadataCache.entries()) {
           if (now - data.timestamp > this.FILE_METADATA_TTL) {
               this.fileMetadataCache.delete(key);
               removedCount++;
           }
       }
       
       if (removedCount > 0) {
           this.logger.debug(`Cleaned up ${removedCount} file metadata cache entries`);
       }
   }

   cleanupLightHistoryCache() {
       const now = Date.now();
       let removedCount = 0;
       
       for (const [key, data] of this.lightHistoryCache.entries()) {
           if (now - data.timestamp > this.LIGHT_HISTORY_TTL) {
               this.lightHistoryCache.delete(key);
               removedCount++;
           }
       }
       
       if (removedCount > 0) {
           this.logger.debug(`Cleaned up ${removedCount} light history cache entries`);
       }
   }

   cleanupProfileCache() {
       const now = Date.now();
       let removedCount = 0;
       
       for (const [key, data] of this.userProfilesCache.entries()) {
           const ttl = data.ttl || this.PROFILE_CACHE_TTL;
           if (now - data.timestamp > ttl) {
               this.userProfilesCache.delete(key);
               removedCount++;
           }
       }
       
       if (removedCount > 0) {
           this.logger.debug(`Cleaned up ${removedCount} cached user profiles`);
       }
   }

   // *** เพิ่ม: ฟังก์ชัน invalidate cache เมื่อมีการเปลี่ยนแปลงข้อมูล ***
   invalidateUserCaches(userId) {
       // Clear profile cache
       const profileCacheKey = `profile_${userId}`;
       this.userProfilesCache.delete(profileCacheKey);
       
       // Clear light history cache
       const lightCacheKey = `light_${userId}`;
       this.lightHistoryCache.delete(lightCacheKey);
       
       // Clear file metadata cache
       ['api', 'ai'].forEach(type => {
           const metadataKey = `metadata_${type}_${userId}`;
           this.fileMetadataCache.delete(metadataKey);
       });
       
       // Clear user list cache
       this.userListCache = null;
       this.userListCacheTimestamp = 0;
   }

   // *** แก้ไข: ฟังก์ชัน Update User Profile ***
   async updateUserProfile(userId, senderProfile) {
       try {
           if (!senderProfile || !senderProfile.displayName) {
               return;
           }

           // อัพเดต cache
           const cacheKey = `profile_${userId}`;
           this.userProfilesCache.set(cacheKey, {
               profile: senderProfile,
               timestamp: Date.now()
           });

           // อัพเดต light cache
           const lightCacheKey = `light_${userId}`;
           this.lightHistoryCache.set(lightCacheKey, {
               profile: senderProfile,
               timestamp: Date.now()
           });

           this.logger.debug(`Updated profile cache for user ${userId}`);

       } catch (error) {
           this.logger.error('Error updating user profile:', error);
       }
   }

   // *** ปรับปรุง saveHistory ให้ invalidate cache ***
   async saveHistory(userId, history, type = 'api') {
       if (!userId) throw new Error('User ID is required for saving history');

       try {
           const existingHistory = await this.loadChatHistoryFromDatabase(userId, type);
           const existingMessages = existingHistory.messages || [];

           const messagesToPersist = Array.isArray(history?.messages)
               ? history.messages
               : [];

           let tokensApplied = false;

           const newMessages = messagesToPersist.filter(message => {
               if (!message?.content) return false;

               if (message.role === 'user' && message.senderProfile) {
                   this.updateUserProfile(userId, message.senderProfile);
               }

               if (this.isMessageProcessed(message)) {
                   this.logger.debug(`Skipping duplicate message: "${message.content.substring(0, 30)}..."`);
                   return false;
               }

               const isDuplicate = existingMessages.some(existing => {
                   if (!existing || !existing.content) return false;

                   const contentMatch = existing.content === message.content;
                   const timeMatch = Math.abs((existing.timestamp || 0) - (message.timestamp || 0)) < this.TIMESTAMP_THRESHOLD;
                   const roleMatch = existing.role === message.role;

                   return contentMatch && roleMatch && (timeMatch || message.messageId === existing.messageId);
               });

               if (isDuplicate) {
                   this.logger.debug('Detected duplicate message by content/time comparison');
                   return false;
               }

               this.markMessageAsProcessed(message);
               return true;
           });

           if (newMessages.length === 0) {
               this.logger.debug(`No new messages to save for user ${userId}`, { type });
               return { success: true, history: existingHistory };
           }

           const processedMessages = newMessages.map(message => {
               const timestamp = message.timestamp || Date.now();
               const generatedId = `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

               let messageTokens = message.tokens;
               if (!messageTokens && history?.totalTokens && !tokensApplied) {
                   messageTokens = history.totalTokens;
                   tokensApplied = true;
               }

               return {
                   role: message.role,
                   content: message.content,
                   timestamp,
                   messageId: message.messageId || generatedId,
                   products: Array.isArray(message.products) ? message.products : [],
                   senderProfile: message.senderProfile || null,
                   source: message.source || null,
                   inputTokens: messageTokens?.input || 0,
                   outputTokens: messageTokens?.output || 0,
                   totalTokens: (messageTokens?.total ?? ((messageTokens?.input || 0) + (messageTokens?.output || 0))) || 0
               };
           });

           const dbMessages = processedMessages.map(msg => {
               const timestampValue = Number(msg.timestamp || Date.now());
               return {
                   userId,
                   role: msg.role,
                   content: msg.content,
                   messageId: msg.messageId,
                   products: msg.products.length > 0 ? JSON.stringify(msg.products) : null,
                   senderProfile: msg.senderProfile ? JSON.stringify(msg.senderProfile) : null,
                   source: msg.source || (type === 'ai' ? 'ai' : 'line'),
                   inputTokens: msg.inputTokens || null,
                   outputTokens: msg.outputTokens || null,
                   totalTokens: msg.totalTokens || null,
                   timestamp: BigInt(Math.floor(timestampValue)),
                   saved_at: BigInt(Date.now())
               };
           });

           const chatModel = this.getChatModel(type);
           for (const payload of dbMessages) {
               try {
                   await chatModel.create({ data: payload });
               } catch (dbError) {
                   if (dbError?.code === 'P2002') {
                       this.logger.debug('Duplicate message detected during DB insert, skipping', {
                           userId,
                           type,
                           messageId: payload.messageId
                       });
                       continue;
                   }
                   throw dbError;
               }
           }

           const aggregatedTokens = processedMessages.reduce((acc, msg) => {
               acc.input += msg.inputTokens || 0;
               acc.output += msg.outputTokens || 0;
               return acc;
           }, { input: 0, output: 0 });

           await this.updateConversationTokens(userId, type, aggregatedTokens);

           existingHistory.messages.push(...processedMessages);
           existingHistory.lastUpdated = existingHistory.messages.length > 0
               ? existingHistory.messages[existingHistory.messages.length - 1].timestamp
               : Date.now();

           const updatedState = await this.getConversationState(userId);
           existingHistory.totalTokens = this.extractTokensFromState(updatedState, type);

           existingHistory.context = this.updateHistoryContext(existingHistory);
           existingHistory.stats = this.calculateMessageStats(existingHistory.messages);

           this.invalidateUserCaches(userId);

           const allProducts = processedMessages.flatMap(msg => msg.products || []);
           if (allProducts.length > 0) {
               try {
                   await this.saveProductHistory(userId, allProducts);
                   this.logger.info(`✅ Successfully saved product history for user ${userId}`, {
                       productsCount: allProducts.length
                   });
               } catch (productHistoryError) {
                   this.logger.error(`❌ Error saving product history for user ${userId}:`, productHistoryError);
               }
           }

           this.logger.info(`Successfully saved ${processedMessages.length} new messages for user ${userId}`, {
               type,
               roles: processedMessages.map(m => m.role).join(',')
           });

           return { success: true, history: existingHistory };

       } catch (error) {
           this.logger.error(`Error saving history for user ${userId}:`, error);
           throw error;
       }
   }

   async clearHistory(userId, type = 'all') {
       if (!userId) throw new Error('User ID is required for clearing history');

       const types = type === 'all' ? ['api', 'ai'] : [type];

       try {
           for (const historyType of types) {
               const chatModel = this.getChatModel(historyType);
               await chatModel.deleteMany({ where: { userId } });
           }

           await this.prismaService.resetChatUserState(userId, type);

           this.invalidateUserCaches(userId);

           this.logger.info(`Cleared chat history for user ${userId}`, { type });
           return true;
       } catch (error) {
           this.logger.error(`Error clearing chat history for ${userId}:`, error);
           throw error;
       }
   }

   // *** เพิ่ม: Fast display name getter ***
   async getUserDisplayName(userId) {
       try {
           const profile = await this.getUserProfile(userId);
           return profile.displayName;
       } catch (error) {
           this.logger.error('Error getting user display name:', error);
           return `User ${userId.substring(1, 9)}`;
       }
   }

   // *** เพิ่ม: Clear cache สำหรับ user ***
   clearUserProfileCache(userId) {
       const cacheKey = `profile_${userId}`;
       this.userProfilesCache.delete(cacheKey);
       this.logger.debug(`Cleared profile cache for user ${userId}`);
   }

   // *** Existing methods - keep them all ***
   async loadHistory(userId, type = 'api') {
       return await this.loadOrCreateChatHistory(userId, type);
   }

   async ensureDirectoryExists() {
       try {
           await fs.mkdir(this.aiHistoriesPath, { recursive: true });
           await fs.mkdir(this.apiHistoriesPath, { recursive: true });
           await fs.mkdir(this.productsPath, { recursive: true });
           this.logger.info('Created necessary directories', {
               aiHistoriesPath: this.aiHistoriesPath,
               apiHistoriesPath: this.apiHistoriesPath,
               productsPath: this.productsPath
           });
           
           await this.checkFilePermissions();
       } catch (error) {
           this.logger.error('Error creating directories:', error);
       }
   }
   
   async checkFilePermissions() {
       try {
           const testFile = path.join(this.productsPath, '_permission_test.tmp');
           await fs.writeFile(testFile, 'test');
           await fs.unlink(testFile);
           this.logger.info('File permissions check passed for product histories directory');
           return true;
       } catch (error) {
           this.logger.error('File permissions check failed for product histories directory:', error);
           return false;
       }
   }

   cleanupProcessedMessages() {
       const now = Date.now();
       let removedCount = 0;
       for (const [key, data] of this.processedMessages.entries()) {
           if (now - data.timestamp > this.MESSAGE_TRACKING_TTL) {
               this.processedMessages.delete(key);
               removedCount++;
           }
       }
       
       if (removedCount > 0) {
           this.logger.debug(`Cleaned up ${removedCount} processed message records`);
       }
   }

   generateMessageKey(message) {
       if (!message?.content) return null;
       
       const contentHash = this.simpleHash(message.content);
       const timestampBucket = Math.floor((message.timestamp || Date.now()) / this.TIMESTAMP_THRESHOLD);
       
       return `${message.role || 'unknown'}_${contentHash}_${timestampBucket}`;
   }
   
   simpleHash(str) {
       let hash = 0;
       for (let i = 0; i < str.length; i++) {
           const char = str.charCodeAt(i);
           hash = ((hash << 5) - hash) + char;
           hash = hash & hash;
       }
       return hash.toString(36);
   }

   isMessageProcessed(message) {
       if (!message?.content) return false;
       
       const messageKey = this.generateMessageKey(message);
       if (!messageKey) return false;
     
       return this.processedMessages.has(messageKey);
   }

   markMessageAsProcessed(message) {
       const messageKey = this.generateMessageKey(message);
       if (messageKey) {
           this.processedMessages.set(messageKey, {
               timestamp: Date.now(),
               messageData: {
                   role: message.role,
                   content: message.content,
                   timestamp: message.timestamp || Date.now()
               }
           });
       }
   }

   async loadChatHistoryFromFile(filePath) {
       if (!filePath) throw new Error('File path is required');
       
       try {
           const fileContent = await fs.readFile(filePath, 'utf8');
           return JSON.parse(fileContent);
       } catch (error) {
           if (error.code === 'ENOENT') {
               return null;
           }
           this.logger.error('Error loading chat history:', error);
           return null;
       }
   }

   async loadOrCreateChatHistory(userId, type = 'api') {
       return await this.loadChatHistoryFromDatabase(userId, type);
   }

   async loadAIChatHistory(userId) {
       return await this.loadOrCreateChatHistory(userId, 'ai');
   }

   async loadAPIChatHistory(userId) {
       return await this.loadOrCreateChatHistory(userId, 'api');
   }

   createDefaultHistory() {
       return {
           messages: [],
           lastUpdated: Date.now(),
           totalTokens: { input: 0, output: 0 },
           context: {
               recentInteractions: [],
               productPreferences: {
                   categories: [],
                   types: [],
                   frequentProducts: []
               },
               timePatterns: {
                   hourly: Array(24).fill(0),
                   daily: Array(7).fill(0)
               }
           }
       };
   }

   async saveProductHistory(userId, products) {
       try {
           this.logger.info(`🔄 Attempting to save product history for ${userId}`, {
               productCount: products.length,
               firstProductId: products[0]?.id || 'none'
           });
           
           const historyPath = path.join(this.productsPath, `${userId}_products.json`);
           const timestamp = Date.now();

           let history = await this.loadProductHistory(userId) || {
               userId,
               products: {},
               lastUpdated: timestamp
           };

           products.forEach(product => {
               if (!product.id) {
                   this.logger.warn(`⚠️ Product without ID found for user ${userId}`);
                   return;
               }

               const relevance_score = product.relevance_score || 
                                   product.contextual_relevance || 
                                   product.score || 
                                   this.RELEVANCE_THRESHOLD;

               if (!history.products[product.id]) {
                   history.products[product.id] = {
                       id: product.id,
                       product_name: product.product_name || 'Unknown Product',
                       category: product.category || 'Uncategorized',
                       interactions: [],
                       first_seen: timestamp
                   };
                   
                   this.logger.info(`➕ Created new product entry for ${product.id}`, {
                       productName: product.product_name || 'Unknown Product'
                   });
               }

               history.products[product.id].interactions.push({
                   timestamp,
                   relevance_score,
                   context: {
                       url: product.url || '',
                       category: product.category || 'Uncategorized',
                       price: product.price || ''
                   }
               });

               history.products[product.id].last_seen = timestamp;
               history.products[product.id].total_interactions = 
                   history.products[product.id].interactions.length;
               history.products[product.id].average_relevance = 
                   this.calculateAverageRelevance(history.products[product.id].interactions);
           });

           history.lastUpdated = timestamp;
           history.totalProducts = Object.keys(history.products).length;
           history.stats = this.generateProductStats(history.products);

           await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
           
           this.logger.info(`✅ Product history successfully saved to: ${historyPath}`, {
               historyPath,
               totalProducts: Object.keys(history.products).length,
               totalInteractions: Object.values(history.products).reduce((sum, p) => sum + p.interactions.length, 0)
           });
           
           return history;
       } catch (error) {
           this.logger.error(`❌ Error saving product history for ${userId}:`, {
               error: error.message,
               stack: error.stack
           });
           throw error;
       }
   }

   async loadProductHistory(userId) {
       const historyPath = path.join(this.productsPath, `${userId}_products.json`);
       
       try {
           const content = await fs.readFile(historyPath, 'utf8');
           const history = JSON.parse(content);
           this.logger.info(`✅ Successfully loaded product history for ${userId}`, {
               productCount: Object.keys(history.products || {}).length
           });
           return history;
       } catch (error) {
           if (error.code === 'ENOENT') {
               this.logger.info(`Product history file not found for ${userId}`, {
                   path: historyPath
               });
               return null;
           }
           this.logger.error(`Error loading product history for ${userId}:`, error);
           throw error;
       }
   }

   generateProductStats(products) {
       const stats = {
           categories: {},
           relevanceDistribution: {
               '0.21-0.3': 0,
               '0.31-0.4': 0,
               '0.41-0.5': 0,
               '0.51-0.6': 0,
               '0.61-0.7': 0,
               '0.71-0.8': 0,
               '0.81-0.9': 0,
               '0.91-1.0': 0
           },
           totalInteractions: 0,
           activeProducts: 0,
           averageRelevance: 0
       };

       Object.values(products).forEach(product => {
           if (product.category) {
               stats.categories[product.category] = 
                   (stats.categories[product.category] || 0) + 1;
           }

           stats.totalInteractions += product.total_interactions || 0;

           if (product.last_seen > Date.now() - (30 * 24 * 60 * 60 * 1000)) {
               stats.activeProducts++;
           }

           const avgRelevance = product.average_relevance || 0;
           if (avgRelevance >= 0.21 && avgRelevance <= 0.3) stats.relevanceDistribution['0.21-0.3']++;
           else if (avgRelevance <= 0.4) stats.relevanceDistribution['0.31-0.4']++;
           else if (avgRelevance <= 0.5) stats.relevanceDistribution['0.41-0.5']++;
           else if (avgRelevance <= 0.6) stats.relevanceDistribution['0.51-0.6']++;
           else if (avgRelevance <= 0.7) stats.relevanceDistribution['0.61-0.7']++;
           else if (avgRelevance <= 0.8) stats.relevanceDistribution['0.71-0.8']++;
           else if (avgRelevance <= 0.9) stats.relevanceDistribution['0.81-0.9']++;
           else if (avgRelevance <= 1.0) stats.relevanceDistribution['0.91-1.0']++;
       });

       const productCount = Object.keys(products).length;
       if (productCount > 0) {
           const totalRelevance = Object.values(products)
               .reduce((sum, product) => sum + (product.average_relevance || 0), 0);
           stats.averageRelevance = totalRelevance / productCount;
       }

       return stats;
   }

   updateHistoryContext(history) {
       if (!history?.messages) {
           return this.createDefaultHistory().context;
       }

       try {
           const context = {
               recentInteractions: [],
               productPreferences: {
                   categories: new Map(),
                   types: new Map(),
                   products: new Map()
               },
               timePatterns: {
                   hourly: Array(24).fill(0),
                   daily: Array(7).fill(0)
               }
           };

           const recentMessages = history.messages.slice(-30);
           
           recentMessages.forEach(msg => {
               const msgDate = new Date(msg.timestamp);
               context.timePatterns.hourly[msgDate.getHours()]++;
               context.timePatterns.daily[msgDate.getDay()]++;

               if (msg.products?.length > 0) {
                   msg.products.forEach(product => {
                       if (!context.productPreferences.products.has(product.id)) {
                           context.productPreferences.products.set(product.id, {
                               name: product.product_name,
                               count: 0,
                               lastInteraction: null,
                               relevanceScores: [],
                               category: product.category,
                               timestamps: [],
                               interactionTrend: 'stable',
                               firstSeen: msg.timestamp
                           });
                       }

                       const productData = context.productPreferences.products.get(product.id);
                       productData.count++;
                       productData.lastInteraction = msg.timestamp;
                       productData.timestamps.push(msg.timestamp);
                       
                       if (product.relevance_score) {
                           productData.relevanceScores.push(product.relevance_score);
                           productData.averageRelevance = productData.relevanceScores.reduce((a, b) => a + b, 0) / 
                               productData.relevanceScores.length;
                       }
                       
                       if (productData.timestamps.length >= 3) {
                           const recentInteractions = productData.timestamps.slice(-3);
                           const oldestTime = recentInteractions[0];
                           const latestTime = recentInteractions[recentInteractions.length - 1];
                           const timeSpan = latestTime - oldestTime;
                           const averageInterval = timeSpan / (recentInteractions.length - 1);
                           
                           const prevIntervals = [];
                           for (let i = 1; i < recentInteractions.length; i++) {
                               prevIntervals.push(recentInteractions[i] - recentInteractions[i-1]);
                           }
                           
                           if (prevIntervals[prevIntervals.length - 1] < averageInterval * 0.7) {
                               productData.interactionTrend = 'increasing';
                           } else if (prevIntervals[prevIntervals.length - 1] > averageInterval * 1.3) {
                               productData.interactionTrend = 'decreasing';
                           } else {
                               productData.interactionTrend = 'stable';
                           }
                       }

                       if (product.category) {
                           if (!context.productPreferences.categories.has(product.category)) {
                               context.productPreferences.categories.set(product.category, {
                                   count: 0,
                                   products: new Set(),
                                   lastInteraction: null,
                                   firstSeen: msg.timestamp,
                                   interactionDates: []
                               });
                           }

                           const categoryData = context.productPreferences.categories.get(product.category);
                           categoryData.count++;
                           categoryData.products.add(product.id);
                           categoryData.lastInteraction = msg.timestamp;
                           
                           const interactionDate = new Date(msg.timestamp).toDateString();
                           if (!categoryData.interactionDates.includes(interactionDate)) {
                               categoryData.interactionDates.push(interactionDate);
                           }
                       }
                       
                       if (product.type || (product.details && product.details.type)) {
                           const productType = product.type || product.details.type;
                           if (!context.productPreferences.types.has(productType)) {
                               context.productPreferences.types.set(productType, {
                                   count: 0,
                                   products: new Set(),
                                   lastInteraction: null
                               });
                           }
                           
                           const typeData = context.productPreferences.types.get(productType);
                           typeData.count++;
                           typeData.products.add(product.id);
                           typeData.lastInteraction = msg.timestamp;
                       }
                   });

                   context.recentInteractions.push({
                       timestamp: msg.timestamp,
                       products: msg.products.map(p => ({
                           id: p.id,
                           name: p.product_name,
                           category: p.category,
                           relevance_score: p.relevance_score
                       }))
                   });
               }
           });

           return {
               recentInteractions: context.recentInteractions,
               productPreferences: {
                   categories: Array.from(context.productPreferences.categories.entries())
                       .map(([category, data]) => ({
                           category,
                           count: data.count,
                           products: Array.from(data.products),
                           lastInteraction: data.lastInteraction,
                           firstSeen: data.firstSeen,
                           interactionDates: data.interactionDates,
                           uniqueDaysCount: data.interactionDates?.length || 0,
                           interactionsPerDay: data.count / Math.max(1, data.interactionDates?.length || 1)
                       }))
                       .sort((a, b) => b.count - a.count),
                   types: Array.from(context.productPreferences.types.entries())
                       .map(([type, data]) => ({
                           type,
                           count: data.count,
                           products: Array.from(data.products),
                           lastInteraction: data.lastInteraction
                       }))
                       .sort((a, b) => b.count - a.count),
                   frequentProducts: Array.from(context.productPreferences.products.entries())
                       .map(([id, data]) => ({
                           id,
                           name: data.name,
                           count: data.count,
                           category: data.category,
                           lastInteraction: data.lastInteraction,
                           firstSeen: data.firstSeen,
                           interactionTrend: data.interactionTrend,
                          daysSinceFirstSeen: Math.ceil((Date.now() - (data.firstSeen || Date.now())) / (1000 * 60 * 60 * 24)),
                          daysSinceLastInteraction: Math.ceil((Date.now() - (data.lastInteraction || Date.now())) / (1000 * 60 * 60 * 24)),
                          averageRelevance: data.relevanceScores.length > 0 
                              ? data.relevanceScores.reduce((a, b) => a + b, 0) / data.relevanceScores.length 
                              : 0
                      }))
                      .sort((a, b) => {
                          const recencyScore_a = Math.max(0, 7 - a.daysSinceLastInteraction) / 7;
                          const recencyScore_b = Math.max(0, 7 - b.daysSinceLastInteraction) / 7;
                          
                          const score_a = (a.count * 0.7) + (recencyScore_a * 0.3);
                          const score_b = (b.count * 0.7) + (recencyScore_b * 0.3);
                          
                          return score_b - score_a;
                      })
                      .slice(0, 10)
              },
              timePatterns: context.timePatterns,
              lastUpdated: Date.now(),
              summary: {
                  totalProductInteractions: Array.from(context.productPreferences.products.values())
                      .reduce((sum, product) => sum + product.count, 0),
                  uniqueProductsCount: context.productPreferences.products.size,
                  uniqueCategoriesCount: context.productPreferences.categories.size,
                  mostActiveHour: context.timePatterns.hourly.indexOf(Math.max(...context.timePatterns.hourly)),
                  mostActiveDay: context.timePatterns.daily.indexOf(Math.max(...context.timePatterns.daily)),
                  highestInterestCategory: Array.from(context.productPreferences.categories.entries())
                      .map(([category, data]) => ({
                          category,
                          interestScore: (data.count * 0.6) + (data.products.size * 0.4)
                      }))
                      .sort((a, b) => b.interestScore - a.interestScore)
                      .map(item => item.category)
                      [0] || null
              }
          };

      } catch (error) {
          this.logger.error('Error updating history context:', error);
          return this.createDefaultHistory().context;
      }
  }
  
  calculateMessageStats(messages) {
      const stats = {
          totalMessages: messages.length,
          messagesByRole: {},
          messagesByHour: {},
          averageResponseTime: 0,
          productInteractions: {
              total: 0,
              byCategory: {},
              relevanceDistribution: {
                  high: 0,
                  medium: 0,
                  low: 0
              }
          }
      };
  
      let lastUserMessageTime = null;
      let totalResponseTime = 0;
      let responseCount = 0;
  
      messages.forEach(message => {
          stats.messagesByRole[message.role] = (stats.messagesByRole[message.role] || 0) + 1;
  
          const hour = new Date(message.timestamp).getHours();
          stats.messagesByHour[hour] = (stats.messagesByHour[hour] || 0) + 1;
  
          if (message.role === 'user') {
              lastUserMessageTime = message.timestamp;
          } else if (lastUserMessageTime && (message.role === 'model' || message.role === 'admin')) {
              const responseTime = message.timestamp - lastUserMessageTime;
              totalResponseTime += responseTime;
              responseCount++;
              lastUserMessageTime = null;
          }

          if (message.products?.length > 0) {
              stats.productInteractions.total += message.products.length;
              message.products.forEach(product => {
                  if (product.category) {
                      stats.productInteractions.byCategory[product.category] = 
                          (stats.productInteractions.byCategory[product.category] || 0) + 1;
                  }
                  
                  const relevance = product.relevance_score || 0;
                  if (relevance >= 0.8) {
                      stats.productInteractions.relevanceDistribution.high++;
                  } else if (relevance >= 0.5) {
                      stats.productInteractions.relevanceDistribution.medium++;
                  } else {
                      stats.productInteractions.relevanceDistribution.low++;
                  }
              });
          }
      });
  
      stats.averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
      return stats;
  }

  calculateAverageRelevance(interactions) {
      if (!interactions?.length) return 0;
      return interactions.reduce((sum, interaction) => 
          sum + (interaction.relevance_score || 0), 0) / interactions.length;
  }

  async getAnalytics(userId) {
      try {
          const aiHistory = await this.loadAIChatHistory(userId);
          const apiHistory = await this.loadAPIChatHistory(userId);
          const productHistory = await this.loadProductHistory(userId);

          return {
              messageStats: {
                  total: (aiHistory?.messages?.length || 0) + (apiHistory?.messages?.length || 0),
                  ai: aiHistory?.messages?.length || 0,
                  api: apiHistory?.messages?.length || 0
              },
              tokenStats: {
                  ai: aiHistory?.totalTokens || { input: 0, output: 0 },
                  api: apiHistory?.totalTokens || { input: 0, output: 0 }
              },
              productInteractions: this.analyzeProductInteractions(aiHistory, productHistory),
              conversationPatterns: this.analyzeConversationPatterns(aiHistory, apiHistory),
              timeBasedAnalysis: this.getTimeBasedAnalysis(aiHistory?.messages || []),
              productStats: productHistory?.stats || this.generateProductStats({})
          };
      } catch (error) {
          this.logger.error(`Error getting analytics for ${userId}:`, error);
          throw error;
      }
  }

  analyzeProductInteractions(aiHistory, productHistory) {
      const interactions = {
          products: {},
          categories: {},
          relevanceScores: [],
          recentInteractions: []
      };

      try {
          if (aiHistory?.messages) {
              aiHistory.messages.forEach(msg => {
                  if (msg.products) {
                      msg.products.forEach(product => {
                          if (!interactions.products[product.id]) {
                              interactions.products[product.id] = {
                                  count: 0,
                                  relevanceScores: [],
                                  timestamps: []
                              };
                          }
                          const productStats = interactions.products[product.id];
                          productStats.count++;
                          if (product.relevance_score) {
                              productStats.relevanceScores.push(product.relevance_score);
                              interactions.relevanceScores.push(product.relevance_score);
                          }
                          productStats.timestamps.push(msg.timestamp);

                          if (product.category) {
                              if (!interactions.categories[product.category]) {
                                  interactions.categories[product.category] = {
                                      count: 0,
                                      products: new Set()
                                  };
                              }
                              interactions.categories[product.category].count++;
                              interactions.categories[product.category].products.add(product.id);
                          }
                      });
                      
                      if (msg.timestamp > Date.now() - (24 * 60 * 60 * 1000)) {
                          interactions.recentInteractions.push({
                              timestamp: msg.timestamp,
                              products: msg.products.map(p => ({
                                  id: p.id,
                                  name: p.product_name,
                                  relevance_score: p.relevance_score
                              }))
                          });
                      }
                  }
              });
          }

          if (productHistory?.products) {
              Object.entries(productHistory.products).forEach(([id, product]) => {
                  if (!interactions.products[id]) {
                      interactions.products[id] = {
                          count: product.total_interactions,
                          relevanceScores: product.interactions.map(i => i.relevance_score),
                          timestamps: product.interactions.map(i => i.timestamp)
                      };
                  }
              });
          }

          Object.values(interactions.products).forEach(product => {
              product.averageRelevance = product.relevanceScores.length > 0
                  ? product.relevanceScores.reduce((a, b) => a + b, 0) / product.relevanceScores.length
                  : 0;
          });

          Object.values(interactions.categories).forEach(category => {
              category.products = Array.from(category.products);
          });

          return interactions;
      } catch (error) {
          this.logger.error('Error analyzing product interactions:', error);
          return { products: {}, categories: {}, relevanceScores: [], recentInteractions: [] };
      }
  }

  analyzeConversationPatterns(aiHistory, apiHistory) {
      const patterns = {
          messageDistribution: {
              ai: { user: 0, model: 0 },
              api: { user: 0, admin: 0 }
          },
          responseTime: {
              ai: [],
              api: []
          },
          interactionFrequency: {
              hourly: new Array(24).fill(0),
              daily: new Array(7).fill(0)
          },
          continuityMetrics: {
              averageSessionLength: 0,
              sessionsCount: 0,
              averageMessagesPerSession: 0
          }
      };

      try {
          const SESSION_TIMEOUT = 30 * 60 * 1000;
          let currentSession = { messages: [], start: null };
          let sessions = [];

          const processMessage = (msg, type) => {
              patterns.messageDistribution[type][msg.role]++;
              
              const date = new Date(msg.timestamp);
              patterns.interactionFrequency.hourly[date.getHours()]++;
              patterns.interactionFrequency.daily[date.getDay()]++;

              if (!currentSession.start) {
                  currentSession.start = msg.timestamp;
              } else if (msg.timestamp - currentSession.messages[currentSession.messages.length - 1].timestamp > SESSION_TIMEOUT) {
                  if (currentSession.messages.length > 0) {
                      sessions.push(currentSession);
                  }
                  currentSession = { messages: [], start: msg.timestamp };
              }
              currentSession.messages.push(msg);
          };

          if (aiHistory?.messages) {
              aiHistory.messages.forEach(msg => processMessage(msg, 'ai'));
          }

          if (apiHistory?.messages) {
              apiHistory.messages.forEach(msg => processMessage(msg, 'api'));
          }

          if (currentSession.messages.length > 0) {
              sessions.push(currentSession);
          }

          if (sessions.length > 0) {
              patterns.continuityMetrics.sessionsCount = sessions.length;
              patterns.continuityMetrics.averageSessionLength = sessions.reduce((sum, session) => 
                  sum + (session.messages[session.messages.length - 1].timestamp - session.start), 0) / sessions.length;
              patterns.continuityMetrics.averageMessagesPerSession = sessions.reduce((sum, session) => 
                  sum + session.messages.length, 0) / sessions.length;
          }

          return patterns;
      } catch (error) {
          this.logger.error('Error analyzing conversation patterns:', error);
          return {
              messageDistribution: { ai: {}, api: {} },
              responseTime: { ai: [], api: [] },
              interactionFrequency: { hourly: [], daily: [] },
              continuityMetrics: { averageSessionLength: 0, sessionsCount: 0, averageMessagesPerSession: 0 }
          };
      }
  }

  getTimeBasedAnalysis(messages) {
      const analysis = {
          hourly: new Array(24).fill(0),
          daily: new Array(7).fill(0),
          monthly: new Array(12).fill(0),
          timeOfDay: {
              morning: 0,
              afternoon: 0,
              evening: 0,
              night: 0
          },
          messageVolume: {
              total: messages.length,
              averagePerDay: 0,
              peakHour: null,
              peakDay: null
          }
      };

      try {
          const dayMessages = new Map();
          messages.forEach(msg => {
              const date = new Date(msg.timestamp);
              
              analysis.hourly[date.getHours()]++;
              analysis.daily[date.getDay()]++;
              analysis.monthly[date.getMonth()]++;
              
              const hour = date.getHours();
              if (hour >= 6 && hour < 12) analysis.timeOfDay.morning++;
              else if (hour >= 12 && hour < 18) analysis.timeOfDay.afternoon++;
              else if (hour >= 18 && hour < 24) analysis.timeOfDay.evening++;
              else analysis.timeOfDay.night++;

              const dayKey = date.toISOString().split('T')[0];
              dayMessages.set(dayKey, (dayMessages.get(dayKey) || 0) + 1);
          });

          if (messages.length > 0) {
              const dayCount = dayMessages.size || 1;
              analysis.messageVolume.averagePerDay = messages.length / dayCount;

              let maxHourCount = 0;
              let maxDayCount = 0;

              analysis.hourly.forEach((count, hour) => {
                  if (count > maxHourCount) {
                      maxHourCount = count;
                      analysis.messageVolume.peakHour = hour;
                  }
              });

              analysis.daily.forEach((count, day) => {
                  if (count > maxDayCount) {
                      maxDayCount = count;
                      analysis.messageVolume.peakDay = day;
                  }
              });
          }

          return analysis;
      } catch (error) {
          this.logger.error('Error in time-based analysis:', error);
          return {
              hourly: new Array(24).fill(0),
              daily: new Array(7).fill(0),
              monthly: new Array(12).fill(0),
              timeOfDay: { morning: 0, afternoon: 0, evening: 0, night: 0 },
              messageVolume: { total: 0, averagePerDay: 0, peakHour: null, peakDay: null }
          };
      }
  }

  async cleanupOldHistories() {
      try {
          const now = Date.now();
          const expiryTime = 7 * 24 * 60 * 60 * 1000;
          await this.cleanupDirectory(this.aiHistoriesPath, now, expiryTime);
          await this.cleanupDirectory(this.apiHistoriesPath, now, expiryTime);
          await this.cleanupProductHistories();
          
          this.logger.info('Old history cleanup completed successfully');
      } catch (error) {
          this.logger.error('Error during history cleanup:', error);
      }
  }

  async cleanupDirectory(directoryPath, now, expiryTime) {
      try {
          const files = await fs.readdir(directoryPath);
          let removedCount = 0;
          
          for (const file of files) {
              const filePath = path.join(directoryPath, file);
              try {
                  const stats = await fs.stat(filePath);
                  if (now - stats.mtime.getTime() > expiryTime) {
                      await fs.unlink(filePath);
                      removedCount++;
                  }
              } catch (error) {
                  this.logger.error(`Error processing file ${file}:`, error);
              }
          }
          
          if (removedCount > 0) {
              this.logger.info(`Cleaned up ${removedCount} old history files in ${path.basename(directoryPath)}`);
          }
      } catch (error) {
          this.logger.error(`Error cleaning up directory ${directoryPath}:`, error);
      }
  }

  async cleanupProductHistories() {
      try {
          const productFiles = await fs.readdir(this.productsPath);
          const now = Date.now();
          const expiryTime = 90 * 24 * 60 * 60 * 1000;
          let modifiedCount = 0;
          let deletedCount = 0;

          for (const file of productFiles) {
              const filePath = path.join(this.productsPath, file);
              try {
                  const history = await this.loadProductHistory(file.replace('_products.json', ''));
                  
                  if (!history || now - history.lastUpdated > expiryTime) {
                      await fs.unlink(filePath);
                      deletedCount++;
                      continue;
                  }

                  let modified = false;
                  Object.keys(history.products).forEach(productId => {
                      const product = history.products[productId];
                      const oldInteractionsCount = product.interactions.length;
                      
                      product.interactions = product.interactions.filter(interaction =>
                          now - interaction.timestamp <= expiryTime
                      );

                      if (oldInteractionsCount !== product.interactions.length) {
                          modified = true;
                      }

                      if (product.interactions.length === 0) {
                          delete history.products[productId];
                          modified = true;
                      } else {
                          product.average_relevance = 
                              this.calculateAverageRelevance(product.interactions);
                          product.total_interactions = product.interactions.length;
                      }
                  });

                  if (modified) {
                      history.lastUpdated = now;
                      history.stats = this.generateProductStats(history.products);
                      await fs.writeFile(filePath, JSON.stringify(history, null, 2));
                      modifiedCount++;
                  }
              } catch (error) {
                  this.logger.error(`Error processing product history file ${file}:`, error);
              }
          }
          
          if (deletedCount > 0 || modifiedCount > 0) {
              this.logger.info(`Product histories cleanup: ${deletedCount} deleted, ${modifiedCount} modified`);
          }
      } catch (error) {
          this.logger.error('Error cleaning up product histories:', error);
      }
  }

  async getRecommendations(userId) {
      try {
          const productHistory = await this.loadProductHistory(userId);
          if (!productHistory?.products) {
              return [];
          }

          const recommendations = Object.values(productHistory.products)
              .filter(product => product.average_relevance >= this.RELEVANCE_THRESHOLD)
              .map(product => ({
                  ...product,
                  score: this.calculateRecommendationScore(product)
              }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 10);

          return recommendations.map(rec => ({
              id: rec.id,
              product_name: rec.product_name,
              category: rec.category,
              relevance_score: rec.average_relevance,
              total_interactions: rec.total_interactions,
              last_interaction: rec.last_seen,
              confidence_score: rec.score
          }));
      } catch (error) {
          this.logger.error('Error getting recommendations:', error);
          return [];
      }
  }

  calculateRecommendationScore(product) {
      const now = Date.now();
      const daysSinceLastSeen = (now - product.last_seen) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.exp(-daysSinceLastSeen / 30);
      
      const interactionScore = Math.min(product.total_interactions / 10, 1);
      const relevanceScore = product.average_relevance || 0;

      return (
          (relevanceScore * 0.4) +
          (interactionScore * 0.3) +
          (recencyScore * 0.3)
      );
  }

  async getLastRead(userId) {
      try {
          const state = await this.getConversationState(userId);
          return Number(state?.apiLastRead || 0);
      } catch (error) {
          this.logger.error(`Error getting last read for ${userId}:`, error);
          return 0;
      }
  }

  async updateLastRead(userId, timestamp) {
      try {
          await this.prismaService.updateChatLastRead(userId, timestamp);
          this.invalidateUserCaches(userId);
          this.logger.info(`Updated last read for ${userId}:`, { timestamp });
          return true;
      } catch (error) {
          this.logger.error(`Error updating last read for ${userId}:`, error);
          throw error;
      }
  }

  async getStats(userId) {
      try {
          const [aiHistory, apiHistory, productHistory] = await Promise.all([
              this.loadAIChatHistory(userId),
              this.loadAPIChatHistory(userId),
              this.loadProductHistory(userId)
          ]);

          return {
              messages: {
                  total: (aiHistory?.messages?.length || 0) + (apiHistory?.messages?.length || 0),
                  ai: {
                      count: aiHistory?.messages?.length || 0,
                      tokens: aiHistory?.totalTokens || { input: 0, output: 0 }
                  },
                  api: {
                      count: apiHistory?.messages?.length || 0,
                      tokens: apiHistory?.totalTokens || { input: 0, output: 0 }
                  }
              },
              products: {
                  total: Object.keys(productHistory?.products || {}).length,
                  activeInLast30Days: productHistory?.stats?.activeProducts || 0,
                  relevanceDistribution: productHistory?.stats?.relevanceDistribution || {},
                  categoryDistribution: productHistory?.stats?.categories || {}
              },
              lastActivity: {
                  ai: aiHistory?.lastUpdated || 0,
                  api: apiHistory?.lastUpdated || 0,
                  products: productHistory?.lastUpdated || 0
              }
          };
      } catch (error) {
          this.logger.error(`Error getting stats for ${userId}:`, error);
          throw error;
      }
  }

  async exportHistory(userId) {
      try {
          const [aiHistory, apiHistory, productHistory] = await Promise.all([
              this.loadAIChatHistory(userId),
              this.loadAPIChatHistory(userId),
              this.loadProductHistory(userId)
          ]);

          return {
              userId,
              timestamp: Date.now(),
              data: {
                  ai: aiHistory,
                  api: apiHistory,
                  products: productHistory
              },
              stats: await this.getStats(userId),
              analytics: await this.getAnalytics(userId)
          };
      } catch (error) {
          this.logger.error(`Error exporting history for ${userId}:`, error);
          throw error;
      }
  }

  async importHistory(userId, data) {
      try {
          if (!data || !userId) {
              throw new Error('Invalid import data or userId');
          }

          const timestamp = Date.now();

          if (data.ai) {
              await this.saveHistory(userId, {
                  ...data.ai,
                  lastUpdated: timestamp
              }, 'ai');
          }

          if (data.api) {
              await this.saveHistory(userId, {
                  ...data.api,
                  lastUpdated: timestamp
              }, 'api');
          }

          if (data.products) {
              const productHistoryPath = path.join(this.productsPath, `${userId}_products.json`);
              await fs.writeFile(
                  productHistoryPath,
                  JSON.stringify({
                      ...data.products,
                      lastUpdated: timestamp
                  }, null, 2)
              );
              
              this.logger.info(`✅ Successfully imported product history for ${userId}`, {
                  productCount: Object.keys(data.products.products || {}).length
              });
          }

          return {
              success: true,
              timestamp,
              userId
          };
      } catch (error) {
          this.logger.error(`Error importing history for ${userId}:`, error);
          throw error;
      }
  }

  calculateProductTrendScore(productId, userId) {
      try {
        const history = this.loadProductHistory(userId);
        if (!history || !history.products || !history.products[productId]) {
          return 0;
        }
        
        const product = history.products[productId];
        const interactions = product.interactions || [];
        
        if (interactions.length < 3) {
          return 0;
        }
        
        const recentInteractions = interactions
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);
        
        const timeIntervals = [];
        for (let i = 1; i < recentInteractions.length; i++) {
          timeIntervals.push(recentInteractions[i-1].timestamp - recentInteractions[i].timestamp);
        }
        
        if (timeIntervals.length === 0) {
          return 0;
        }
        
        const avgInterval = timeIntervals.reduce((sum, interval) => sum + interval, 0) / timeIntervals.length;
        const timeSinceLastInteraction = Date.now() - recentInteractions[0].timestamp;
        
        if (timeSinceLastInteraction < avgInterval * 2) {
          return 0.8;
        } else if (timeSinceLastInteraction < avgInterval * 5) {
          return 0.5;
        } else {
          return 0.2;
        }
      } catch (error) {
        this.logger.error('Error calculating product trend score:', error);
        return 0;
      }
  }

  calculateDynamicRelevanceThreshold(userId, query) {
      try {
        const history = this.loadAIChatHistory(userId);
        if (!history || !history.messages || history.messages.length === 0) {
          return this.RELEVANCE_THRESHOLD;
        }
        
        const isFollowUp = this.isFollowupQuery(query);
        
        if (isFollowUp) {
          return 0.03;
        }
        
        const messageCount = history.messages.length;
        if (messageCount > 20) {
          return 0.08;
        } else if (messageCount > 10) {
          return 0.12;
        } else {
          return 0.15;
        }
      } catch (error) {
        this.logger.error('Error calculating dynamic relevance threshold:', error);
        return this.RELEVANCE_THRESHOLD;
      }
  }

  isFollowupQuery(query) {
      const followupPatterns = [
          /^(และ|แล้ว|ต่อ|ด้วย|อีก)/,
          /^(อะไร|ไหน|ยัง|เพิ่ม)/,
          /(ครับ|ค่ะ|นะ|หรอ)$/,
          /^(มี|เอา|ขอ)/
      ];
      return followupPatterns.some(pattern => pattern.test(query));
  }

  // *** เพิ่ม: Performance monitoring methods ***
  getPerformanceStats() {
      return {
          caches: {
              profileCacheSize: this.userProfilesCache.size,
              metadataCacheSize: this.fileMetadataCache.size,
              lightHistoryCacheSize: this.lightHistoryCache.size,
              userListCached: !!this.userListCache,
              userListSize: this.userListCache?.length || 0,
              processedMessagesSize: this.processedMessages.size
          },
          settings: {
              profileCacheTTL: this.PROFILE_CACHE_TTL,
              metadataCacheTTL: this.FILE_METADATA_TTL,
              lightHistoryTTL: this.LIGHT_HISTORY_TTL,
              userListCacheTTL: this.USER_LIST_CACHE_TTL
          },
          memory: {
              heapUsed: process.memoryUsage().heapUsed,
              heapTotal: process.memoryUsage().heapTotal,
              external: process.memoryUsage().external
          }
      };
  }

  // *** เพิ่ม: Manual cache management ***
  async refreshAllCaches() {
      this.userProfilesCache.clear();
      this.fileMetadataCache.clear();
      this.lightHistoryCache.clear();
      this.userListCache = null;
      this.userListCacheTimestamp = 0;
      
      this.logger.info('All caches cleared and will be rebuilt on next access');
      
      return {
          success: true,
          message: 'All caches cleared',
          timestamp: Date.now()
      };
  }

  async preloadUserProfiles(userIds = null) {
      try {
          const users = userIds || await this.getUserListFast();
          let loaded = 0;
          let failed = 0;

          const startTime = Date.now();
          
          for (const userId of users) {
              try {
                  await this.getUserProfile(userId);
                  loaded++;
              } catch (error) {
                  failed++;
                  this.logger.debug(`Failed to preload profile for ${userId}:`, error.message);
              }
          }

          const duration = Date.now() - startTime;
          
          this.logger.info(`Profile preloading completed`, {
              totalUsers: users.length,
              loaded: loaded,
              failed: failed,
              duration: `${duration}ms`
          });

          return {
              success: true,
              totalUsers: users.length,
              loaded: loaded,
              failed: failed,
              duration: duration
          };
      } catch (error) {
          this.logger.error('Error preloading user profiles:', error);
          throw error;
      }
  }

  // *** เพิ่ม: Cache warming methods ***
  async warmupCaches() {
      try {
          const startTime = Date.now();
          
          // Warm up user list cache
          const userList = await this.getUserListFast();
          this.logger.debug(`Warmed up user list cache: ${userList.length} users`);

          // Warm up metadata cache for recent users (top 20)
          const recentUsers = userList.slice(0, 20);
          for (const userId of recentUsers) {
              try {
                  await this.loadHistoryMetadata(userId, 'api');
                  await this.loadHistoryMetadata(userId, 'ai');
              } catch (error) {
                  // Ignore individual failures
              }
          }

          const duration = Date.now() - startTime;
          
          this.logger.info(`Cache warmup completed in ${duration}ms`);
          
          return {
              success: true,
              userListSize: userList.length,
              metadataWarmedUp: recentUsers.length,
              duration: duration
          };
      } catch (error) {
          this.logger.error('Error warming up caches:', error);
          throw error;
      }
  }

  // *** เพิ่ม: Cache statistics ***
  getCacheHitRates() {
      // This would require implementing hit/miss counters
      // For now, just return cache sizes
      return {
          profileCache: {
              size: this.userProfilesCache.size,
              maxAge: this.PROFILE_CACHE_TTL
          },
          metadataCache: {
              size: this.fileMetadataCache.size,
              maxAge: this.FILE_METADATA_TTL
          },
          lightHistoryCache: {
              size: this.lightHistoryCache.size,
              maxAge: this.LIGHT_HISTORY_TTL
          },
          userListCache: {
              cached: !!this.userListCache,
              size: this.userListCache?.length || 0,
              age: this.userListCacheTimestamp ? Date.now() - this.userListCacheTimestamp : 0
          }
      };
  }

  // *** เพิ่ม: Configuration methods ***
  updateCacheConfiguration(config) {
      if (config.profileCacheTTL) this.PROFILE_CACHE_TTL = config.profileCacheTTL;
      if (config.metadataCacheTTL) this.FILE_METADATA_TTL = config.metadataCacheTTL;
      if (config.lightHistoryTTL) this.LIGHT_HISTORY_TTL = config.lightHistoryTTL;
      if (config.userListCacheTTL) this.USER_LIST_CACHE_TTL = config.userListCacheTTL;
      
      this.logger.info('Cache configuration updated', {
          profileCacheTTL: this.PROFILE_CACHE_TTL,
          metadataCacheTTL: this.FILE_METADATA_TTL,
          lightHistoryTTL: this.LIGHT_HISTORY_TTL,
          userListCacheTTL: this.USER_LIST_CACHE_TTL
      });
      
      return {
          success: true,
          newConfig: {
              profileCacheTTL: this.PROFILE_CACHE_TTL,
              metadataCacheTTL: this.FILE_METADATA_TTL,
              lightHistoryTTL: this.LIGHT_HISTORY_TTL,
              userListCacheTTL: this.USER_LIST_CACHE_TTL
          }
      };
  }

  // *** เพิ่ม: Health check method ***
  async healthCheck() {
      try {
          const stats = this.getPerformanceStats();
          const cacheHitRates = this.getCacheHitRates();
          
          // Test basic functionality
          const testUserId = 'health-check-test';
          const testProfile = await this.getUserProfile(testUserId);
          
          // Check directory access
          const directoriesAccessible = await Promise.all([
              fs.access(this.aiHistoriesPath).then(() => true).catch(() => false),
              fs.access(this.apiHistoriesPath).then(() => true).catch(() => false),
              fs.access(this.productsPath).then(() => true).catch(() => false)
          ]);

          return {
              status: 'healthy',
              timestamp: Date.now(),
              performance: stats,
              cacheHitRates: cacheHitRates,
              directories: {
                  aiHistories: directoriesAccessible[0],
                  apiHistories: directoriesAccessible[1],
                  products: directoriesAccessible[2]
              },
              testResults: {
                  profileLoading: !!testProfile,
                  userListLoading: Array.isArray(await this.getUserListFast())
              }
          };
      } catch (error) {
          this.logger.error('Health check failed:', error);
          return {
              status: 'unhealthy',
              timestamp: Date.now(),
              error: error.message
          };
      }
  }

  cleanup() {
      // Stop all intervals
      if (this.cleanupInterval) {
          clearInterval(this.cleanupInterval);
          this.logger.info('Chat history cleanup interval stopped');
      }
      
      if (this.cacheCleanupInterval) {
          clearInterval(this.cacheCleanupInterval);
          this.logger.info('Cache cleanup interval stopped');
      }
      
      // Clear all caches
      this.userProfilesCache.clear();
      this.fileMetadataCache.clear();
      this.lightHistoryCache.clear();
      this.processedMessages.clear();
      this.userListCache = null;
      
      this.logger.info('ChatHistoryManager cleanup completed', {
          clearedCaches: ['userProfiles', 'fileMetadata', 'lightHistory', 'processedMessages', 'userList']
      });
  }
}

module.exports = ChatHistoryManager;
