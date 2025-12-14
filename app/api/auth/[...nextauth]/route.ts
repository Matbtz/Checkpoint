import NextAuth from "next-auth"
import { getAuthOptions } from "@/lib/auth"
import { NextRequest } from "next/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = async (req: NextRequest, res: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return NextAuth(req as any, res, getAuthOptions(req));
}

export { handler as GET, handler as POST };
