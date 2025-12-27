
import { GET } from './app/api/auth/[...nextauth]/route'
import { NextRequest } from 'next/server'

// Mock environment
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.NEXTAUTH_SECRET = 'secret'
process.env.STEAM_SECRET = 'steam_secret'

// Mock request
const req = new NextRequest('http://localhost:3000/api/auth/session', {
    headers: {
        host: 'localhost:3000'
    }
})

// Mock context
// In App Router, the second argument to route handler is { params }
const ctx = { params: { nextauth: ['session'] } }

console.log("Calling handler...")

// Wrapper to catch async errors
async function run() {
    try {
        // @ts-ignore
        const res = await GET(req, ctx)
        console.log("Status:", res.status)
        const text = await res.text()
        console.log("Body:", text)
    } catch (err: any) {
        console.error("Caught error name:", err.name)
        console.error("Caught error message:", err.message)
        console.error("Caught error stack:", err.stack)
    }
}

run()
