
import { prisma } from '../lib/db';

async function checkData() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysFuture = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    console.log(`Current Date: ${now.toISOString()}`);
    console.log(`Start of Year: ${startOfYear.toISOString()}`);

    const count2025 = await prisma.game.count({
        where: {
            releaseDate: {
                gte: startOfYear
            }
        }
    });
    console.log(`Games released in ${currentYear} or later: ${count2025}`);

    const countRecent = await prisma.game.count({
        where: {
            releaseDate: {
                gte: thirtyDaysAgo,
                lte: now
            }
        }
    });
    console.log(`Recent games (last 30 days): ${countRecent}`);

    const countUpcoming = await prisma.game.count({
        where: {
            releaseDate: {
                gt: now,
                lte: sixtyDaysFuture
            }
        }
    });
    console.log(`Upcoming games (next 60 days): ${countUpcoming}`);
}

checkData().catch(console.error);
