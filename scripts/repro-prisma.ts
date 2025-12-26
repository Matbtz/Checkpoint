import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Attempting to connect to Prisma...");
    try {
        const count = await prisma.game.count();
        console.log(`Successfully connected! Game count: ${count}`);
    } catch (e) {
        console.error("Connection failed:");
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
