-- DropIndex
DROP INDEX "ChatHistoryAPI_messageId_idx";

-- DropIndex
DROP INDEX "Keyword_keyword_idx";

-- DropIndex
DROP INDEX "MessageTemplate_name_idx";

-- DropIndex
DROP INDEX "Product_sku_idx";

-- DropIndex
DROP INDEX "Setting_key_idx";

-- DropIndex
DROP INDEX "User_userId_idx";

-- DropIndex
DROP INDEX "UserLanguage_userId_idx";

-- AlterTable
ALTER TABLE "ChatHistoryAI" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "ChatHistoryAI" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "ChatHistoryAI" ADD COLUMN "totalTokens" INTEGER;

-- AlterTable
ALTER TABLE "ChatHistoryAPI" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "ChatHistoryAPI" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "ChatHistoryAPI" ADD COLUMN "totalTokens" INTEGER;

-- CreateTable
CREATE TABLE "ChatUserState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "apiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "apiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "apiLastRead" BIGINT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VectorDBConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dbPath" TEXT NOT NULL DEFAULT 'data/lancedb',
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    "embeddingDimension" INTEGER NOT NULL DEFAULT 3072,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 30000,
    "apiKey" TEXT,
    "productVectorEnabled" BOOLEAN NOT NULL DEFAULT true,
    "knowledgeVectorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "productMaxResults" INTEGER NOT NULL DEFAULT 5,
    "productSimilarityThreshold" REAL NOT NULL DEFAULT 0.7,
    "knowledgeMaxResults" INTEGER NOT NULL DEFAULT 5,
    "knowledgeSimilarityThreshold" REAL NOT NULL DEFAULT 0.7,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductSearchConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL DEFAULT 'default',
    "topResults" INTEGER NOT NULL DEFAULT 7,
    "contextWindow" INTEGER NOT NULL DEFAULT 15,
    "relevanceThreshold" REAL NOT NULL DEFAULT 0.03,
    "embeddingBoostFactor" REAL NOT NULL DEFAULT 2.0,
    "scoreThresholds" TEXT NOT NULL DEFAULT '{"minimum":15,"followup":20,"dimension":15,"material":12,"type":15,"sharedNumbers":15,"stockAvailable":10,"stockUnavailable":-10,"historicalInterest":50}',
    "searchMethods" TEXT NOT NULL DEFAULT '{"vectorSearchEnabled":true,"keywordSearchEnabled":true,"directoryFallbackEnabled":true,"crossLanguageSearch":false}',
    "caching" TEXT NOT NULL DEFAULT '{"contextCacheTTL":1800,"userStateCacheTTL":3600,"productCacheTTL":3600}',
    "cleanup" TEXT NOT NULL DEFAULT '{"expiredContextInterval":3600000,"contextExpirationTime":1800000}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "vectorId" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "content" TEXT,
    "indexed_to_rag" BOOLEAN NOT NULL DEFAULT false,
    "rag_entry_id" TEXT,
    "uploaded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_indexed_at" DATETIME
);

-- CreateTable
CREATE TABLE "ContextWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL DEFAULT 'default',
    "system_prompt" TEXT NOT NULL DEFAULT 'คุณคือผู้ช่วยที่ชาญฉลาดในการให้ข้อมูลเกี่ยวกับสินค้า',
    "use_product_rag" BOOLEAN NOT NULL DEFAULT true,
    "use_knowledge_rag" BOOLEAN NOT NULL DEFAULT true,
    "max_context_messages" INTEGER NOT NULL DEFAULT 10,
    "include_user_history" BOOLEAN NOT NULL DEFAULT true,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "model_name" TEXT NOT NULL DEFAULT 'gpt-4',
    "max_tokens" INTEGER NOT NULL DEFAULT 2000,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LineOaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelSecret" TEXT NOT NULL,
    "channelAccessToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatUserState_userId_key" ON "ChatUserState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VectorDBConfig_key_key" ON "VectorDBConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSearchConfig_key_key" ON "ProductSearchConfig"("key");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_enabled_idx" ON "KnowledgeEntry"("enabled");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_category_idx" ON "KnowledgeEntry"("category");

-- CreateIndex
CREATE INDEX "Document_file_type_idx" ON "Document"("file_type");

-- CreateIndex
CREATE INDEX "Document_uploaded_at_idx" ON "Document"("uploaded_at");

-- CreateIndex
CREATE INDEX "Document_indexed_to_rag_idx" ON "Document"("indexed_to_rag");

-- CreateIndex
CREATE UNIQUE INDEX "ContextWindow_key_key" ON "ContextWindow"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_username_key" ON "AuthUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AuthUser_employeeId_key" ON "AuthUser"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LineOaConfig_name_key" ON "LineOaConfig"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LineOaConfig_channelId_key" ON "LineOaConfig"("channelId");
