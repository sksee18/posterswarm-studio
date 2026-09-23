import { ne, type AnyColumn } from "drizzle-orm";

/** App icons can be used in item templates, but never as photo backgrounds. */
export const photosOnly = (source: AnyColumn) => ne(source, "appicon");
