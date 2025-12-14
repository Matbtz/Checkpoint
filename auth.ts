import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/lib/auth";

// Warning: this might fail for Steam if req is not passed correctly,
// but for checking session in server components it should be fine if we don't trigger sign in flow.
// However, next-auth-steam might throw if req is missing during initialization even if not used.
// Let's pass a mock req if needed, or hope it's lazy.
// Actually, for `getServerSession`, we don't usually need the `req` for the provider configuration,
// just for the session retrieval.
// But `getAuthOptions` requires `req` to configure SteamProvider.
export const auth = () => getServerSession(getAuthOptions({
    headers: { get: () => '' },
    cookies: { getAll: () => [] }
}));

export const signOut = () => {
    throw new Error("Use client side signOut");
}

export const signIn = (provider: string) => {
    throw new Error("Use client side signIn");
}
