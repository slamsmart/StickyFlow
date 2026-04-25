import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * StickyFlow schema.
 *
 * `userId` is the Clerk `subject` claim (stable per user). We store it as a
 * string instead of `v.id("users")` because users are managed by Clerk, not
 * by a Convex `users` table.
 *
 * `clientId` is a per-note UUID generated on the client. It lets us do
 * idempotent upserts without reading first (good for OCC / offline sync).
 */
export default defineSchema({
  notes: defineTable({
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
  })
    .index("by_user", ["userId"])
    .index("by_user_and_client", ["userId", "clientId"]),
});
