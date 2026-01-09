## 2025-02-18 - Middleware Matcher Mismatch
**Vulnerability:** Protected routes (`/library`, `/settings`, etc.) were listed in middleware logic but missing from the `matcher` config, allowing unauthenticated requests to bypass the middleware entirely.
**Learning:** Next.js middleware `matcher` acts as a gatekeeper. If a path isn't matched, the code never executes, rendering any internal logic useless for those paths.
**Prevention:** Ensure `matcher` configuration is always synchronized with the path logic inside the middleware, or use a negative lookahead matcher (e.g. `!/api...`) to cover all routes by default.
