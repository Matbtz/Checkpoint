import { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import SteamProvider from "next-auth-steam"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { getServerSession } from "next-auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAuthOptions(req: any): NextAuthOptions {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: PrismaAdapter(prisma) as any,
    providers: [
        SteamProvider(req, {
            clientSecret: process.env.STEAM_SECRET!,
            callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback`
        }),
        CredentialsProvider({
        name: "Credentials",
        credentials: {
            email: { label: "Email", type: "email" },
            password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
            if (!credentials) return null

            const parsedCredentials = z
            .object({ email: z.string().email(), password: z.string().min(6) })
            .safeParse(credentials)

            if (parsedCredentials.success) {
            const { email, password } = parsedCredentials.data
            const user = await prisma.user.findUnique({ where: { email } })

            if (!user || !user.password) return null

            const passwordsMatch = await bcrypt.compare(password, user.password)
            if (passwordsMatch) return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image
            }
            }
            return null
        },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, user, account }) {
        if (user) {
            token.id = user.id
            if (account?.provider === 'steam') {
                token.steamId = account.providerAccountId;
            }
        }
        return token
        },
        async session({ session, token }) {
        if (token?.id && session.user) {
            session.user.id = token.id as string
            session.user.steamId = token.steamId as string | undefined
        }
        return session
        },
    },
    pages: {
        signIn: "/login",
    },
  }
}

// Wrapper for Server Components
export function auth() {
    // Note: This won't work well for Steam as it requires 'req'.
    // In App Router Server Actions/Components, getting 'req' is hard or impossible directly.
    // However, usually Steam is only needed for sign-in. Once session is established,
    // we can check session without steam provider specifics if we just need the user ID.
    // But getAuthOptions requires 'req' for SteamProvider init.
    // We can mock it or pass null if we just want session and not the auth flow?
    // Or we should use a separate auth options for session retrieval vs auth flow.
    return getServerSession(getAuthOptions(null));
}
