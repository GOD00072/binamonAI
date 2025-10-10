-- AlterTable
ALTER TABLE "ContextWindow" ADD COLUMN "image_model_name" TEXT DEFAULT 'gemini-pro-vision';
ALTER TABLE "ContextWindow" ADD COLUMN "image_prompt" TEXT DEFAULT 'ช่วยอธิบายรูปภาพนี้อย่างละเอียด';
