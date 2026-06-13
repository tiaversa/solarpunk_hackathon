import { PrismaClient } from "@prisma/client";

// In dev, Next.js hot-reloads modules and would otherwise spawn a new
// PrismaClient per reload, exhausting Postgres connections. The globalThis
// pattern keeps a single instance across reloads.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
