import { pgTable, uuid, varchar, timestamp, integer, boolean, text } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  public_token: varchar('public_token', { length: 64 }).notNull().unique(),
  bg_image_path: varchar('bg_image_path', { length: 500 }),
  ticker_text: text('ticker_text'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  role: varchar('role', { length: 20 }).notNull().default('owner'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});

export const magic_tokens = pgTable('magic_tokens', {
  token: varchar('token', { length: 64 }).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires_at: timestamp('expires_at').notNull(),
  used_at: timestamp('used_at'),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sort_order: integer('sort_order').notNull().default(0),
});

export const menu_items = pgTable('menu_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  category_id: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price_cents: integer('price_cents').notNull(),
  image_path: varchar('image_path', { length: 500 }),
  is_available: boolean('is_available').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
});
