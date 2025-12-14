import NextAuth, { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import SteamProvider from "next-auth-steam"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { z } from "zod"

const prisma = new PrismaClient()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAuthOptions(req: any): NextAuthOptions {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: PrismaAdapter(prisma) as any,
    providers: [
        SteamProvider(req, {
            clientSecret: process.env.STEAM_SECRET!,
            callbackUrl: `${process.env.NEXTAUTH_URL}/api/auth/callback/steam`
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
            // @ts-expect-error adding custom property to session user
            session.user.id = token.id as string
            // @ts-expect-error adding custom property to session user
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

// Keep a static version for getServerSession in server components where req might not be needed for non-steam
// Or better, handle the req requirement.
// Actually, getServerSession(authOptions) works if we don't rely on `req` for Steam.
// But `next-auth-steam` relies on `req` for OpenID 2.0 discovery.
// So `authOptions` must be dynamic.

// But `getServerSession` takes `...args`.
// We can pass `req, res, authOptions`.
