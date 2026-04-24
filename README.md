# StickyFlow — Notes & To-Do

Clean, colorful sticky-notes web app with **Clerk auth** and **Convex** as the realtime database. Pastel notes with pushpins, 2-row horizontal dashboard, mouse-wheel zoom.

> **Deploy**: See [`DEPLOY.md`](./DEPLOY.md) for one-click Cloudflare Pages setup.

## Architecture

- **Frontend:** static HTML/CSS/JS (no bundler). `auth.js` is an ES module that imports Convex from `esm.sh`.
- **Auth:** Clerk — mounted sign-in widget, user button, JWT template `convex` used to authenticate Convex mutations/queries.
- **Database:** Convex — single `notes` table, indexed by `(userId, clientId)` for idempotent upserts. Reactive subscription pushes updates to every signed-in device instantly.
- **Offline:** localStorage keyed per user (`stickyflow.notes.<userId>`) keeps a cache; Convex is source of truth when online.

## Setup

### 1. Clerk

1. <https://dashboard.clerk.com/> → create an application.
2. Copy the **Publishable key** (`pk_test_...`) into `config.js`.
3. Go to **JWT Templates** → **New template** → choose **Convex** (or **Blank** named exactly `convex`). The default claims are fine.
4. Copy the **Issuer** URL shown in the template — you'll set it as `CLERK_JWT_ISSUER_DOMAIN` on Convex.

> ⚠️ **Consistency:** your `CLERK_PUBLISHABLE_KEY` and `CLERK_JWT_ISSUER_DOMAIN` **must come from the same Clerk application**. Different apps will cause silent auth failures.

### 2. Convex

```powershell
npm install
npx convex dev
```

`convex dev` will:

- prompt you to log in / pick a deployment
- generate `convex/_generated/*` (TS errors in `convex/notes.ts` disappear after this)
- watch & push your schema + functions

Then set the Clerk issuer on the deployment:

```powershell
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
```

Grab the Convex deployment URL (shown by `npx convex dev`, e.g. `https://quiet-octopus-611.convex.cloud`) and paste it into `config.js` as `CONVEX_URL`.

### 3. Run the web app

```powershell
# terminal 1
npx convex dev

# terminal 2
python -m http.server 5173
# open http://localhost:5173
```

Or use the combined script:

```powershell
npm run dev
```

## Files

```
convex/
  schema.ts         # notes table + indexes
  auth.config.ts    # Clerk JWT provider
  notes.ts          # list / upsert / remove / migrateFromLocal
index.html          # auth gate + dashboard
styles.css          # sticky-note aesthetic
config.js           # YOUR Clerk publishable key + Convex URL
auth.js             # Clerk + Convex bootstrap (ES module)
app.js              # UI state, rendering, zoom, sync-via-stickyflowDB
.env.example        # reference
package.json        # convex dep + scripts
eslint.config.js    # @convex-dev/eslint-plugin
```

## Data model

```ts
notes: {
  userId: string,      // Clerk subject
  clientId: string,    // per-note UUID from the client
  type: "note" | "todo",
  color: string,       // one of 12 pastel colors
  title: string,
  content?: string,
  tasks?: { text: string, done: boolean }[],
  createdAt: number,
  order: number,
}
// indexes: by_user, by_user_and_client
```

## Best-practice highlights (from the convex-best-practices skill)

- **Indexed queries**: `withIndex("by_user", ...)` — no `filter()`.
- **Argument + return validators** on every function.
- **ConvexError** for `UNAUTHENTICATED`.
- **Idempotent mutations**: `upsert` is keyed by `(userId, clientId)`; `remove` is a no-op when already gone.
- **Explicit table IDs** in `ctx.db.get/patch/delete/insert`.
- **Parallel updates** via `Promise.all` in `migrateFromLocal`.

## Security

- Only the **publishable** key (`pk_`) and **Convex URL** are in client code. Both are safe to expose.
- `CLERK_SECRET_KEY` is server-only — never put it in `config.js` or commit it.
- `.env` is gitignored.
