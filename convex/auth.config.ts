/**
 * Clerk JWT verification config for Convex.
 *
 * `domain` must match the `iss` claim of the JWT minted by Clerk.
 * Set CLERK_JWT_ISSUER_DOMAIN in your Convex deployment env:
 *   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
 *
 * `applicationID` must match the JWT template name you create in Clerk
 * (Dashboard → JWT Templates → New template → "convex").
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
