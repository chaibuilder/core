import { sql } from "drizzle-orm";
import { foreignKey, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm/relations";
import { CORE_TABLE_NAMES, resolveChaiDbNaming, type ChaiDbNaming } from "./naming";

/**
 * The core tables, declared through the naming so a host can rename tables and relationship
 * columns (see `./naming.ts`). `schema.sqlite.ts` exports the default-named instance; the
 * factories exist for hosts and tests that build a schema from an explicit naming.
 */
export function createCoreSqliteSchema(naming?: ChaiDbNaming) {
  const n = resolveChaiDbNaming(naming, CORE_TABLE_NAMES);
  const apps = sqliteTable(
    n.table("apps"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      name: text(),
      user: text(n.column("apps", "user")),
      settings: text({ mode: "json" }).default({}),
      theme: text({ mode: "json" }).default({}),
      fallbackLang: text().default("en"),
      languages: text({ mode: "json" }).default([]),
      changes: text({ mode: "json" }),
      deletedAt: text(),
      client: text(n.column("apps", "client")),
      designTokens: text({ mode: "json" }).default({}),
      ai: text({ mode: "json" }).default({}),
      configData: text({ mode: "json" }).default({}),
      consentConfig: text({ mode: "json" }).default({}),
    },
    (table) => [
      foreignKey({
        columns: [table.client],
        foreignColumns: [clients.id],
        name: n.ident("apps", "apps_client_fkey", (t) => `${t}_client_fkey`),
      }),
    ],
  );

  const appsOnline = sqliteTable(
    n.table("appsOnline"),
    {
      id: text().primaryKey().notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      name: text(),
      user: text(n.column("appsOnline", "user")),
      settings: text({ mode: "json" }).default({}),
      theme: text({ mode: "json" }).default({}),
      fallbackLang: text().default("en"),
      languages: text({ mode: "json" }).default([]),
      changes: text({ mode: "json" }),
      apiKey: text(),
      deletedAt: text(),
      client: text(n.column("appsOnline", "client")),
      designTokens: text({ mode: "json" }).default({}),
      ai: text({ mode: "json" }).default({}),
      configData: text({ mode: "json" }).default({}),
      consentConfig: text({ mode: "json" }).default({}),
    },
    (table) => [
      foreignKey({
        columns: [table.client],
        foreignColumns: [clients.id],
        name: n.ident("appsOnline", "apps_online_client_fkey", (t) => `${t}_client_fkey`),
      }),
    ],
  );

  const libraries = sqliteTable(
    n.table("libraries"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      name: text(),
      app: text(n.column("libraries", "app")),
      type: text(),
      status: text().default("active").notNull(),
      client: text(n.column("libraries", "client")),
    },
    (table) => [
      foreignKey({
        columns: [table.app],
        foreignColumns: [apps.id],
        name: n.ident("libraries", "libraries_app_fkey", (t) => `${t}_app_fkey`),
      }),
    ],
  );

  const clients = sqliteTable(n.table("clients"), {
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

  const appUsers = sqliteTable(
    n.table("appUsers"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      user: text(n.column("appUsers", "user")),
      app: text(n.column("appUsers", "app")),
      role: text(),
      permissions: text({ mode: "json" }),
      status: text().default("active").notNull(),
    },
    (table) => [
      foreignKey({
        columns: [table.app],
        foreignColumns: [apps.id],
        name: n.ident("appUsers", "app_users_app_fkey", (t) => `${t}_app_fkey`),
      }),
    ],
  );

  const appPages = sqliteTable(
    n.table("appPages"),
    {
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      slug: text().notNull(),
      lang: text().default("").notNull(),
      seo: text({ mode: "json" }).default({}),
      app: text(n.column("appPages", "app")).notNull(),
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
      parent: text(n.column("appPages", "parent")),
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
      /** The host's upstream page, rendered while `useUpstream` is on. No FK: the host owns it. */
      upstream: text(),
      useUpstream: integer({ mode: "boolean" }).default(false).notNull(),
    },
    (table) => [
      foreignKey({
        columns: [table.app],
        foreignColumns: [apps.id],
        name: n.ident("appPages", "app_pages_app_fkey", (t) => `${t}_app_fkey`),
      }),
      foreignKey({
        columns: [table.parent],
        foreignColumns: [table.id],
        name: n.ident("appPages", "app_pages_parent_fkey", (t) => `${t}_parent_fkey`),
      }),
      index(n.ident("appPages", "idx_app_pages_app_slug", (t) => `idx_${t}_app_slug`)).on(table.app, table.slug),
      index(n.ident("appPages", "idx_app_pages_upstream", (t) => `idx_${t}_upstream`))
        .on(table.upstream)
        .where(sql`${table.upstream} is not null`),
    ],
  );

  const appAssets = sqliteTable(
    n.table("appAssets"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      app: text(n.column("appAssets", "app")),
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
        name: n.ident("appAssets", "app_assets_app_fkey", (t) => `${t}_app_fkey`),
      }),
    ],
  );

  const libraryTemplates = sqliteTable(
    n.table("libraryTemplates"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      user: text(n.column("libraryTemplates", "user")),
      name: text(),
      description: text(),
      pageId: text(n.column("libraryTemplates", "pageId")),
      pageType: text(),
      library: text(n.column("libraryTemplates", "library")),
      preview: text(),
      deletedAt: text(),
      createdBy: text(),
      deletedBy: text(),
    },
    (table) => [
      foreignKey({
        columns: [table.library],
        foreignColumns: [libraries.id],
        name: n.ident("libraryTemplates", "library_templates_library_fkey", (t) => `${t}_library_fkey`),
      }),
    ],
  );

  const appPagesOnline = sqliteTable(
    n.table("appPagesOnline"),
    {
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      slug: text().notNull(),
      lang: text().default("").notNull(),
      seo: text({ mode: "json" }).default({}),
      app: text(n.column("appPagesOnline", "app")).notNull(),
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
      parent: text(n.column("appPagesOnline", "parent")),
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
      upstream: text(),
      useUpstream: integer({ mode: "boolean" }).default(false).notNull(),
    },
    (table) => [
      foreignKey({
        columns: [table.app],
        foreignColumns: [apps.id],
        name: n.ident("appPagesOnline", "app_pages_online_app_fkey", (t) => `${t}_app_fkey`),
      }),
      index(n.ident("appPagesOnline", "idx_app_pages_online_app_slug", (t) => `idx_${t}_app_slug`)).on(
        table.app,
        table.slug,
      ),
      index(n.ident("appPagesOnline", "idx_app_pages_online_upstream", (t) => `idx_${t}_upstream`))
        .on(table.upstream)
        .where(sql`${table.upstream} is not null`),
    ],
  );

  const libraryItems = sqliteTable(
    n.table("libraryItems"),
    {
      id: text()
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID())
        .notNull(),
      createdAt: text()
        .default(sql`(datetime('now'))`)
        .notNull(),
      library: text(n.column("libraryItems", "library")),
      name: text(),
      description: text(),
      blocks: text({ mode: "json" }).default([]),
      preview: text(),
      group: text().default("general"),
      user: text(n.column("libraryItems", "user")),
      html: text(),
      deletedAt: text(),
      deletedBy: text(),
      createdBy: text(),
    },
    (table) => [
      foreignKey({
        columns: [table.library],
        foreignColumns: [libraries.id],
        name: n.ident("libraryItems", "library_items_library_fkey", (t) => `${t}_library_fkey`),
      }),
    ],
  );

  const aiLogs = sqliteTable(
    n.table("aiLogs"),
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
      user: text(n.column("aiLogs", "user")),
      client: text(n.column("aiLogs", "client")),
      cost: real().default(0),
      prompt: text(),
      app: text(n.column("aiLogs", "app")),
      creditSource: text().default("monthly"),
      addonId: text(),
    },
    (table) => [
      index(n.ident("aiLogs", "ai_logs_addon_id_idx", (t) => `${t}_addon_id_idx`)).on(table.addonId),
      index(n.ident("aiLogs", "ai_logs_credit_source_idx", (t) => `${t}_credit_source_idx`)).on(table.creditSource),
    ],
  );

  return {
    apps,
    appsOnline,
    libraries,
    clients,
    appUsers,
    appPages,
    appAssets,
    libraryTemplates,
    appPagesOnline,
    libraryItems,
    aiLogs,
  };
}

/** The core tables plugin schemas declare foreign keys against. */
export type CoreSqliteRefs = Pick<CoreSqliteTables, "apps" | "clients" | "appPages">;

export type CoreSqliteTables = ReturnType<typeof createCoreSqliteSchema>;

/** Relational-query metadata for `tables`, keyed as the relations module exports it. */
export function createCoreSqliteRelations(tables: CoreSqliteTables) {
  const {
    apps,
    appsOnline,
    libraries,
    clients,
    appUsers,
    appPages,
    appAssets,
    libraryTemplates,
    appPagesOnline,
    libraryItems,
  } = tables;
  const appsRelations = relations(apps, ({ one, many }) => ({
    client: one(clients, {
      fields: [apps.client],
      references: [clients.id],
    }),
    libraries: many(libraries),
    appUsers: many(appUsers),
    appPages: many(appPages),
    appAssets: many(appAssets),
    appPagesOnlines: many(appPagesOnline),
  }));

  const clientsRelations = relations(clients, ({ many }) => ({
    apps: many(apps),
    appsOnlines: many(appsOnline),
  }));

  const appsOnlineRelations = relations(appsOnline, ({ one }) => ({
    client: one(clients, {
      fields: [appsOnline.client],
      references: [clients.id],
    }),
  }));

  const librariesRelations = relations(libraries, ({ one, many }) => ({
    app: one(apps, {
      fields: [libraries.app],
      references: [apps.id],
    }),
    libraryTemplates: many(libraryTemplates),
    libraryItems: many(libraryItems),
  }));

  const appUsersRelations = relations(appUsers, ({ one }) => ({
    app: one(apps, {
      fields: [appUsers.app],
      references: [apps.id],
    }),
  }));

  const appPagesRelations = relations(appPages, ({ one, many }) => ({
    app: one(apps, {
      fields: [appPages.app],
      references: [apps.id],
    }),
    appPage: one(appPages, {
      fields: [appPages.parent],
      references: [appPages.id],
      relationName: "appPages_parent_appPages_id",
    }),
    appPages: many(appPages, {
      relationName: "appPages_parent_appPages_id",
    }),
  }));

  const appAssetsRelations = relations(appAssets, ({ one }) => ({
    app: one(apps, {
      fields: [appAssets.app],
      references: [apps.id],
    }),
  }));

  const libraryTemplatesRelations = relations(libraryTemplates, ({ one }) => ({
    library: one(libraries, {
      fields: [libraryTemplates.library],
      references: [libraries.id],
    }),
  }));

  const appPagesOnlineRelations = relations(appPagesOnline, ({ one }) => ({
    app: one(apps, {
      fields: [appPagesOnline.app],
      references: [apps.id],
    }),
  }));

  const libraryItemsRelations = relations(libraryItems, ({ one }) => ({
    library: one(libraries, {
      fields: [libraryItems.library],
      references: [libraries.id],
    }),
  }));

  return {
    appsRelations,
    clientsRelations,
    appsOnlineRelations,
    librariesRelations,
    appUsersRelations,
    appPagesRelations,
    appAssetsRelations,
    libraryTemplatesRelations,
    appPagesOnlineRelations,
    libraryItemsRelations,
  };
}
