# Deploying StickyFlow to Cloudflare Pages

StickyFlow has two parts:
- **Frontend** (static HTML/CSS/JS) → Cloudflare Pages
- **Backend** (Convex cloud functions) → already hosted on Convex (`quiet-octopus-611.convex.cloud`)

You only deploy the frontend; Convex is already live.

## 1. Push to GitHub

Already done — repo: <https://github.com/slamsmart/StickyFlow>

## 2. Create Cloudflare Pages project

1. Go to <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the GitHub repo **slamsmart/StickyFlow**.
3. Configure build settings:

   | Setting                 | Value                   |
   | ----------------------- | ----------------------- |
   | Production branch       | `main`                  |
   | Framework preset        | **None**                |
   | Build command           | *(leave empty)*         |
   | Build output directory  | `/` *(project root)*    |
   | Root directory          | *(leave empty)*         |

4. Click **Save and Deploy**.

First deploy takes ~30 seconds. You'll get a URL like `https://stickyflow.pages.dev`.

## 3. Production-readiness checklist

Before sharing the URL publicly, do these in Clerk:

1. **Clerk Dashboard** → your app → **Domains** → add your production URL (`https://stickyflow.pages.dev` and/or your custom domain).
2. **Clerk** → **JWT Templates** → `convex` → verify **Allowed Origins** includes the Cloudflare URL (if the setting exists for your plan).
3. For a real custom domain (e.g. `stickyflow.app`):
   - Cloudflare Pages → your project → **Custom domains** → add domain.
   - Clerk → **Domains** → add the same custom domain.
   - Clerk → create a **production instance** (`pk_live_...`) and swap the key in `config.js` for production builds.

## 4. Connect Convex production deployment (optional, recommended)

Right now `config.js` points at your **dev** Convex deployment. For production:

```powershell
npx convex deploy          # pushes current functions to prod deployment
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://lenient-anteater-56.clerk.accounts.dev --prod
```

Grab the prod URL (`https://...prod.convex.cloud`) and put it in `config.js` for the main branch. Keep dev URL for a `dev` branch / Pages preview deploys.

## 5. Environment variables (for future server-side needs)

If you later add server functions that need secrets, set them in **Pages → Settings → Environment variables**. For now the app is client-only and reads everything from `config.js`.

> **Never** put `CLERK_SECRET_KEY` in `config.js` — client code is public.
> `CLERK_SECRET_KEY` is server-only and lives in Convex env (`npx convex env set ...`) or Pages env if you add backend routes.

## 6. Post-deploy verification

Open the deployed URL and confirm:
- [ ] Favicon loads (sticky-note icon in browser tab)
- [ ] Clerk sign-in widget appears
- [ ] After sign-in, dashboard loads
- [ ] Creating a note shows "✓ synced to cloud" in the hint row
- [ ] Note appears in Convex Dashboard → Data → `notes` table
- [ ] Sign in from another device with the same account → same notes load

## Files involved in deploy

```
index.html       # entry point
app.js
auth.js
styles.css
config.js        # Clerk pk + Convex URL (public values)
favicon.svg
_headers         # CF Pages: security headers + cache control
_redirects       # CF Pages: SPA fallback
```

Everything else (`.agents/`, `convex/`, `node_modules/`, etc.) is not referenced by `index.html` and won't affect the runtime, but to keep deploys lean you can move static assets into a `public/` folder and set that as the build output directory — not required for now.
