/* ============================================================
 * StickyFlow — Client Configuration
 * ------------------------------------------------------------
 * Only PUBLISHABLE keys go here. NEVER put secret keys
 * (CLERK_SECRET_KEY etc.) in client-side code.
 *
 * NOTE: Clerk publishable key and the Clerk instance backing
 * Convex auth MUST come from the SAME Clerk app. Check that
 * CLERK_JWT_ISSUER_DOMAIN in your Convex env matches the
 * domain encoded in this publishable key.
 * ============================================================ */
window.STICKYFLOW_CONFIG = {
  /* Clerk publishable key (pk_test_... or pk_live_...) */
  CLERK_PUBLISHABLE_KEY: "pk_test_bGVuaWVudC1hbnRlYXRlci01Ni5jbGVyay5hY2NvdW50cy5kZXYk",

  /* Convex deployment URL (from .env VITE_CONVEX_URL) */
  CONVEX_URL: "https://quiet-octopus-611.convex.cloud",

  /* Name of the Clerk JWT template used by Convex.
   * Must match `applicationID` in convex/auth.config.ts. */
  CLERK_JWT_TEMPLATE: "convex",
};
