
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public';
    `;
    console.log('Tables:', tables);

    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Game';
    `;
    console.log('Game Columns:', columns);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
