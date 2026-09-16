import { sql } from "drizzle-orm";
import { foreignKey, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const apps = sqliteTable(
  "apps",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    name: text(),
    user: text(),
    settings: text({ mode: "json" }).default({}),
    theme: text({ mode: "json" }).default({}),
    fallbackLang: text().default("en"),
    languages: text({ mode: "json" }).default([]),
    changes: text({ mode: "json" }),
    deletedAt: text(),
    client: text(),
    designTokens: text({ mode: "json" }).default({}),
    ai: text({ mode: "json" }).default({}),
    configData: text({ mode: "json" }).default({}),
    consentConfig: text({ mode: "json" }).default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.client],
      foreignColumns: [clients.id],
      name: "apps_client_fkey",
    }),
  ],
);

export const appsOnline = sqliteTable(
  "apps_online",
  {
    id: text().primaryKey().notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    name: text(),
    user: text(),
    settings: text({ mode: "json" }).default({}),
    theme: text({ mode: "json" }).default({}),
    fallbackLang: text().default("en"),
    languages: text({ mode: "json" }).default([]),
    changes: text({ mode: "json" }),
    apiKey: text(),
    deletedAt: text(),
    client: text(),
    designTokens: text({ mode: "json" }).default({}),
    ai: text({ mode: "json" }).default({}),
    configData: text({ mode: "json" }).default({}),
    consentConfig: text({ mode: "json" }).default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.client],
      foreignColumns: [clients.id],
      name: "apps_online_client_fkey",
    }),
  ],
);

export const libraries = sqliteTable(
  "libraries",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    name: text(),
    app: text(),
    type: text(),
    status: text().default("active").notNull(),
    client: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "libraries_app_fkey",
    }),
  ],
);

export const clients = sqliteTable("clients", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
    .notNull(),
  createdAt: text()
    .default(sql`(datetime('now'))`)
    .notNull(),
  name: text(),
  status: text().default("active"),
  billingStartDate: text(),
  startDate: text(),
  settings: text({ mode: "json" }).default({}),
  loginHtml: text(),
  features: text({ mode: "json" }).default({}),
  paymentConfig: text({ mode: "json" }).default({}),
  theme: text(),
  helpHtml: text(),
  madeWithBadge: text(),
  superAdmins: text({ mode: "json" }).default([]),
  ai: text({ mode: "json" }).default({ models: [] }),
  plansAndAddOns: text({ mode: "json" }).default({ plans: [], addOns: [], provider: "DODO", paymentEnv: "sandbox" }),
  rolesAndPermissions: text({ mode: "json" }).default({
    admin: { permissions: { "*": true } },
    editor: { permissions: { "*": false } },
    designer: { permissions: { "*": false } },
  }),
  coreFeatures: text({ mode: "json" }).default({
    ai: true,
    email: false,
    api_access: false,
    multi_user: false,
    export_code: true,
    import_html: true,
    multilingual: false,
    revision_and_restore: false,
  }),
  envs: text({ mode: "json" }).default({
    payment: { live: { client: "", server: "" }, sandbox: { client: "", server: "" } },
  }),
});

export const appUsers = sqliteTable(
  "app_users",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    user: text(),
    app: text(),
    role: text(),
    permissions: text({ mode: "json" }),
    status: text().default("active").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "app_users_app_fkey",
    }),
  ],
);


export const appPages = sqliteTable(
  "app_pages",
  {
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    slug: text().notNull(),
    lang: text().default("").notNull(),
    seo: text({ mode: "json" }).default({}),
    app: text().notNull(),
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    name: text().notNull(),
    primaryPage: text(),
    blocks: text({ mode: "json" }).default([]),
    currentEditor: text(),
    changes: text({ mode: "json" }),
    online: integer({ mode: "boolean" }).default(false),
    parent: text(),
    pageType: text(),
    lastSaved: text(),
    dynamic: integer({ mode: "boolean" }).default(false),
    libRefId: text(),
    dynamicSlugCustom: text().default(""),
    metadata: text({ mode: "json" }).default({}),
    jsonld: text({ mode: "json" }).default({}),
    globalJsonLds: text({ mode: "json" }).default([]),
    links: text(),
    partialBlocks: text(),
    designTokens: text({ mode: "json" }),
    ai: text({ mode: "json" }).default({}),
    deletedAt: text(),
    deletedBy: text(),
    createdBy: text(),
    tracking: text({ mode: "json" }).default({}),
  },
  (table) => [
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "app_pages_app_fkey",
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: "app_pages_parent_fkey",
    }),
    index("idx_app_pages_app_slug").on(table.app, table.slug),
  ],
);

export const appAssets = sqliteTable(
  "app_assets",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    app: text(),
    name: text(),
    url: text(),
    size: text(),
    folderId: text(),
    thumbnailUrl: text(),
    duration: real(),
    format: text(),
    width: real(),
    height: real(),
    createdBy: text(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    type: text(),
    updatedAt: text(),
    description: text({ mode: "json" }).default({}),
    deletedAt: text(),
    deletedBy: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "app_assets_app_fkey",
    }),
  ],
);

export const libraryTemplates = sqliteTable(
  "library_templates",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    user: text(),
    name: text(),
    description: text(),
    pageId: text(),
    pageType: text(),
    library: text(),
    preview: text(),
    deletedAt: text(),
    createdBy: text(),
    deletedBy: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.library],
      foreignColumns: [libraries.id],
      name: "library_templates_library_fkey",
    }),
  ],
);

export const appPagesOnline = sqliteTable(
  "app_pages_online",
  {
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    slug: text().notNull(),
    lang: text().default("").notNull(),
    seo: text({ mode: "json" }).default({}),
    app: text().notNull(),
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    primaryPage: text(),
    blocks: text({ mode: "json" }).default([]),
    currentEditor: text(),
    changes: text({ mode: "json" }),
    partialBlocks: text(),
    links: text(),
    online: integer({ mode: "boolean" }).default(true),
    pageType: text(),
    parent: text(),
    lastSaved: text(),
    dynamic: integer({ mode: "boolean" }).default(false),
    libRefId: text(),
    dynamicSlugCustom: text().default(""),
    metadata: text({ mode: "json" }).default({}),
    jsonld: text({ mode: "json" }).default({}),
    globalJsonLds: text({ mode: "json" }).default([]),
    designTokens: text({ mode: "json" }),
    ai: text({ mode: "json" }).default({}),
    createdBy: text().default(""),
    deletedAt: text(),
    deletedBy: text(),
    tracking: text({ mode: "json" }).default({}),
    /** How this publish was produced: "builder" or "mcp". Null on rows predating the column. */
    source: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "app_pages_online_app_fkey",
    }),
    index("idx_app_pages_online_app_slug").on(table.app, table.slug),
  ],
);

export const libraryItems = sqliteTable(
  "library_items",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID())
      .notNull(),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    library: text(),
    name: text(),
    description: text(),
    blocks: text({ mode: "json" }).default([]),
    preview: text(),
    group: text().default("general"),
    user: text(),
    html: text(),
    deletedAt: text(),
    deletedBy: text(),
    createdBy: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.library],
      foreignColumns: [libraries.id],
      name: "library_items_library_fkey",
    }),
  ],
);

export const aiLogs = sqliteTable(
  "ai_logs",
  {
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
    createdAt: text()
      .default(sql`(datetime('now'))`)
      .notNull(),
    model: text(),
    totalDuration: real(),
    error: text(),
    totalTokens: real(),
    tokenUsage: text({ mode: "json" }),
    user: text(),
    client: text(),
    cost: real().default(0),
    prompt: text(),
    app: text(),
    creditSource: text().default("monthly"),
    addonId: text(),
  },
  (table) => [
    index("ai_logs_addon_id_idx").on(table.addonId),
    index("ai_logs_credit_source_idx").on(table.creditSource),
    foreignKey({
      columns: [table.app],
      foreignColumns: [apps.id],
      name: "ai_logs_app_fkey",
    }),
    foreignKey({
      columns: [table.client],
      foreignColumns: [clients.id],
      name: "ai_logs_client_fkey",
    }),
  ],
);

