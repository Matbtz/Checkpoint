import { prisma } from '../lib/db';

async function main() {
    console.log('Checking prisma...');
    console.log('Attempting to query User with `platforms` select...');

    try {
        // Find any user just to test validity of the select object
        // We don't need a real ID, checking if it throws on query construction/validation
        const user = await prisma.user.findFirst({
            select: {
                id: true,
                platforms: true
            }
        });
        console.log('Success! Prisma accepted the query.');
        console.log('User platforms:', user?.platforms);
    } catch (e: any) {
        console.error('FAILED. Prisma threw an error.');
        console.error(e.message);
    }
}

main();
