
import { PrismaClient } from '@prisma/client';

// Use the direct connection string (non-pooling) if available to ensure we have permissions for DDL operations
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL_NON_POOLING || process.env.DATABASE_POSTGRES_PRISMA_URL;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: connectionString,
    },
  },
});

async function main() {
  console.log('Running DB Patch: Ensure platforms column exists...');
  console.log('Using connection string:', connectionString ? 'Defined' : 'Undefined');

  try {
    // Attempt to add the column if it doesn't exist.
    // We use raw SQL because Prisma Schema sync (db push) might have failed or drifted.
    // Postgres specific syntax.
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Game" ADD COLUMN IF NOT EXISTS "platforms" TEXT;
    `);
    console.log('Successfully patched "Game" table (ensure "platforms" exists).');
  } catch (error) {
    console.error('Failed to patch DB:', error);
    // Don't exit with error, as this is a "best effort" patch.
    // If it fails (e.g. permission), let the app try to run anyway.
  } finally {
    await prisma.$disconnect();
  }
}

main();
