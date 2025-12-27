
import SteamProvider from "next-auth-steam"
import { NextRequest } from "next/server"

const req = new NextRequest("http://localhost:3000")
try {
    // @ts-ignore
    const provider = SteamProvider(req, {
        clientSecret: 'secret',
        callbackUrl: 'http://localhost:3000/callback'
    })
    console.log("Provider created successfully")
} catch (err: any) {
    console.error("SteamProvider failed:", err.message)
    console.error("Stack:", err.stack)
}
