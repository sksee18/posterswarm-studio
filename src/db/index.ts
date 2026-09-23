import path from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

export * from "./schema";

const makeDb = () => drizzle(new PGlite(path.resolve(process.cwd(), ".data", "pglite")), { schema });
type Db = ReturnType<typeof makeDb>;

// Open PGlite on first use, not when Next imports route modules during a build.
// Next dev hot reload must not open the same PGlite directory twice.
const g = globalThis as unknown as { __posterswarmStudioDb?: Db };
const getDb = () => g.__posterswarmStudioDb ?? (g.__posterswarmStudioDb = makeDb());

export const db = new Proxy({} as Db, {
  get(_target, property) {
    const value = Reflect.get(getDb(), property);
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});
