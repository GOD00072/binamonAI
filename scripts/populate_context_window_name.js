
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Start populating name for existing ContextWindow...');
  try {
    const existingContext = await prisma.contextWindow.findUnique({
      where: { key: 'default' },
    });

    if (existingContext && !existingContext.name) {
      await prisma.contextWindow.update({
        where: { id: existingContext.id },
        data: { name: 'Default' },
      });
      console.log('Successfully populated name for the default ContextWindow.');
    } else if (existingContext && existingContext.name) {
      console.log('Default ContextWindow already has a name.');
    } else {
      console.log('No default ContextWindow found to update.');
    }
  } catch (error) {
    console.error('Error populating ContextWindow name:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
