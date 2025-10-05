-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "product_id" TEXT NOT NULL,
    "min_quantity" INTEGER NOT NULL,
    "max_quantity" INTEGER,
    "price" REAL NOT NULL,
    "unit" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" DATETIME NOT NULL,
    CONSTRAINT "PriceTier_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PriceTier_product_id_idx" ON "PriceTier"("product_id");

-- CreateIndex
CREATE INDEX "PriceTier_min_quantity_idx" ON "PriceTier"("min_quantity");
