import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

/** One row, id="local". The API key is encrypted before it reaches PGlite. */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("local"),
  aiApiKey: text("ai_api_key"),
  aiKeyHint: text("ai_key_hint"),
  aiBaseUrl: text("ai_base_url").notNull().default("https://api.openai.com/v1"),
  aiModel: text("ai_model").notNull().default("gpt-5.6-luna"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const images = pgTable("images", {
  id: id(),
  url: text("url").notNull(),
  source: text("source").notNull(),
  sourceQuery: text("source_query"),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("images_created_id").on(t.createdAt, t.id)]);

export const catalogApps = pgTable("catalog_apps", {
  id: id(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("catalog_apps_url").on(t.url), index("catalog_apps_name").on(t.name)]);

export const collections = pgTable("collections", {
  id: id(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("collections_name").on(t.name)]);

export const collectionImages = pgTable("collection_images", {
  collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  imageId: text("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.collectionId, t.imageId] }), index("collection_images_image").on(t.imageId)]);

export const templates = pgTable("templates", {
  id: id(),
  name: text("name").notNull(),
  doc: jsonb("doc").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("templates_updated").on(t.updatedAt)]);

export const textTemplates = pgTable("text_templates", {
  id: id(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull().default(""),
  doc: jsonb("doc").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("text_templates_updated").on(t.updatedAt)]);

export const slideshows = pgTable("slideshows", {
  id: id(),
  title: text("title").notNull(),
  source: text("source").notNull().default("generated"),
  templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
  textTemplateId: text("text_template_id").references(() => textTemplates.id, { onDelete: "set null" }),
  collectionId: text("collection_id").references(() => collections.id, { onDelete: "set null" }),
  script: jsonb("script").notNull(),
  caption: text("caption").notNull().default(""),
  frames: jsonb("frames").notNull().default([]),
  slides: jsonb("slides").notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("slideshows_created_id").on(t.createdAt, t.id)]);

export const savedSlides = pgTable("saved_slides", {
  id: id(),
  name: text("name").notNull(),
  tags: text("tags").array().notNull().default([]),
  role: text("role").notNull().default("body"),
  templateId: text("template_id").references(() => templates.id, { onDelete: "set null" }),
  spec: jsonb("spec").notNull(),
  bgUrls: jsonb("bg_urls").notNull().default([]),
  frameUrl: text("frame_url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("saved_slides_updated_id").on(t.updatedAt, t.id)]);
