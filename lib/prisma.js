// lib/prisma.js - Prisma Client singleton
const { PrismaClient } = require('@prisma/client');

// สร้าง Prisma Client instance เดียวในทั้งแอพ
const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

module.exports = prisma;
