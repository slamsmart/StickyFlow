import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";

/* ---------- Shared validators ---------- */

const noteDocValidator = v.object({
  _id: v.id("notes"),
  _creationTime: v.number(),
  userId: v.string(),
  clientId: v.string(),
  type: v.union(v.literal("note"), v.literal("todo")),
  color: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  tasks: v.optional(
    v.array(v.object({ text: v.string(), done: v.boolean() })),
  ),
  pinned: v.optional(v.boolean()),
  createdAt: v.number(),
  order: v.number(),
});

const upsertArgsValidator = {
  clientId: v.string(),
  type: v.union(v.literal("note"), v.literal("todo")),
  color: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  tasks: v.optional(
    v.array(v.object({ text: v.string(), done: v.boolean() })),
  ),
  pinned: v.optional(v.boolean()),
  createdAt: v.number(),
  order: v.number(),
};

/* ---------- Auth helper ---------- */

async function requireUser(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in required" });
  }
  return identity.subject;
}

/* ---------- Queries ---------- */

export const list = query({
  args: {},
  returns: v.array(noteDocValidator),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/* ---------- Mutations ---------- */

/**
 * Idempotent upsert keyed by (userId, clientId).
 * - If no doc exists for this (user, clientId), insert.
 * - Otherwise patch the existing doc.
 */
export const upsert = mutation({
  args: upsertArgsValidator,
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user_and_client", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("notes", existing._id, {
        type: args.type,
        color: args.color,
        title: args.title,
        content: args.content,
        tasks: args.tasks,
        pinned: args.pinned,
        order: args.order,
      });
      return existing._id;
    }

    return await ctx.db.insert("notes", {
      userId,
      clientId: args.clientId,
      type: args.type,
      color: args.color,
      title: args.title,
      content: args.content,
      tasks: args.tasks,
      pinned: args.pinned,
      createdAt: args.createdAt,
      order: args.order,
    });
  },
});

/**
 * Idempotent remove by clientId. No-op if already gone.
 */
export const remove = mutation({
  args: { clientId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user_and_client", (q) =>
        q.eq("userId", userId).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete("notes", existing._id);
    }
    return null;
  },
});

/**
 * Bulk replace — used once on first sign-in to migrate localStorage → Convex.
 * Inserts only notes whose clientId isn't already in Convex (idempotent).
 */
export const migrateFromLocal = mutation({
  args: {
    notes: v.array(
      v.object({
        ...upsertArgsValidator,
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);

    const existing = await ctx.db
      .query("notes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingIds = new Set(existing.map((n) => n.clientId));

    let inserted = 0;
    let skipped = 0;
    await Promise.all(
      args.notes.map(async (n) => {
        if (existingIds.has(n.clientId)) {
          skipped++;
          return;
        }
        await ctx.db.insert("notes", { userId, ...n });
        inserted++;
      }),
    );

    return { inserted, skipped };
  },
});
