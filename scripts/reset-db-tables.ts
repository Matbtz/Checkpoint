
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("⚠️ WARNING: This will DELETE ALL DATA from 'Game' and 'UserLibrary' tables.");
    console.log("Waiting 5 seconds... Press Ctrl+C to cancel.");
    await new Promise(r => setTimeout(r, 5000));

    console.log("🗑️ Deleting UserLibrary entries...");
    await prisma.userLibrary.deleteMany({});

    console.log("🗑️ Deleting Game entries...");
    // We must handle relations potentially.
    // dlcs/parent relations are self-relations on Game, so deleteMany might need cascade or just work if foreign keys are nullable?
    // Prisma deleteMany ignores relations usually if simple.
    // But foreign keys might complain if not CASCADE.
    // Actually, deleteMany does NOT cascade in Prisma Client, database must handle it.
    // If we use 'onDelete: Cascade' in schema (we don't for GameToDLC), we might have issues.
    // But since we are deleting ALL games, we can try.
    // If it fails, we might need to update parentId to null first.

    try {
        await prisma.game.deleteMany({});
    } catch (e) {
        console.log("Failed to delete games directly (FK constraints?). Unlinking parents first...");
        await prisma.game.updateMany({ data: { parentId: null } });
        await prisma.game.deleteMany({});
    }

    console.log("✅ Tables cleared.");
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
