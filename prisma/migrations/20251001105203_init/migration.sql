-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_name" TEXT NOT NULL,
    "sku" TEXT,
    "url" TEXT,
    "category" TEXT,
    "price" TEXT,
    "stock_quantity" INTEGER,
    "short_description" TEXT,
    "description" TEXT,
    "details" TEXT,
    "specifications" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "localPath" TEXT,
    "filename" TEXT,
    "alt" TEXT,
    "title" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "size" INTEGER,
    "contentType" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductImage_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KeywordImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword_id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeywordImage_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "Keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Knowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_product_name_idx" ON "Product"("product_name");

-- CreateIndex
CREATE INDEX "ProductImage_product_id_idx" ON "ProductImage"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_userId_key" ON "User"("userId");

-- CreateIndex
CREATE INDEX "User_userId_idx" ON "User"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_timestamp_idx" ON "ChatMessage"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_keyword_key" ON "Keyword"("keyword");

-- CreateIndex
CREATE INDEX "Keyword_keyword_idx" ON "Keyword"("keyword");

-- CreateIndex
CREATE INDEX "KeywordImage_keyword_id_idx" ON "KeywordImage"("keyword_id");

-- CreateIndex
CREATE INDEX "Knowledge_category_idx" ON "Knowledge"("category");

-- CreateIndex
CREATE INDEX "Knowledge_title_idx" ON "Knowledge"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "Setting_key_idx" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_name_key" ON "MessageTemplate"("name");

-- CreateIndex
CREATE INDEX "MessageTemplate_name_idx" ON "MessageTemplate"("name");

-- CreateIndex
CREATE INDEX "MessageTemplate_category_idx" ON "MessageTemplate"("category");
