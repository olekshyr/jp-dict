import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware` file convention to `proxy`.
//
// No route protection happens here. Clerk's guidance (and the Next.js proxy
// docs) is that the proxy must not be the authorization boundary — it can be
// deployed to a CDN and bypassed. Protection lives in `app/(app)/layout.tsx`
// and, independently, inside every function in `lib/user-words/`.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|webmanifest)).*)",
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path, which must come after the API/tRPC matcher.
    "/__clerk/:path*",
  ],
};
