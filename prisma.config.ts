import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/marathon_wiki";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
