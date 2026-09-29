import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["owner", "manager", "tenant"]);
export const apartmentStatus = pgEnum("apartment_status", ["occupied", "vacant", "maintenance"]);
export const leaseStatus = pgEnum("lease_status", ["draft", "active", "expired", "terminated"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "wave", "orange_money", "mtn_momo", "bank_transfer"]);
export const utilityType = pgEnum("utility_type", ["water", "electricity", "security", "other"]);
export const splitStatus = pgEnum("split_status", ["pending", "split", "notified"]);
export const ticketStatus = pgEnum("ticket_status", ["pending", "in_progress", "resolved"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "urgent"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  image: text("image"),
  role: userRole("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Better Auth owns these four tables. They are kept separate from the
// application `users` table so the domain model can evolve independently.
export const authUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number"),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => ({ userIdx: index("session_user_idx").on(table.userId) }));

export const authAccounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ userIdx: index("account_user_idx").on(table.userId) }));

export const authVerifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ identifierIdx: index("verification_identifier_idx").on(table.identifier) }));

export const buildings = pgTable("buildings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 80 }).notNull().default("Sénégal"),
  photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
  unitCount: integer("unit_count").notNull().default(0),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerIdx: index("buildings_owner_idx").on(table.ownerId),
  managerIdx: index("buildings_manager_idx").on(table.managerId),
}));

export const apartments = pgTable("apartments", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  unitNumber: varchar("unit_number", { length: 32 }).notNull(),
  floor: integer("floor"),
  bedrooms: integer("bedrooms").notNull().default(1),
  areaSqm: integer("area_sqm"),
  rentAmount: numeric("rent_amount", { precision: 14, scale: 2 }).notNull(),
  status: apartmentStatus("status").notNull().default("vacant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingUnitUnique: uniqueIndex("apartments_building_unit_unique").on(table.buildingId, table.unitNumber),
  buildingIdx: index("apartments_building_idx").on(table.buildingId),
}));

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  identityDocUrl: text("identity_doc_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leases = pgTable("leases", {
  id: uuid("id").defaultRandom().primaryKey(),
  apartmentId: uuid("apartment_id").notNull().references(() => apartments.id, { onDelete: "restrict" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  rentAmount: numeric("rent_amount", { precision: 14, scale: 2 }).notNull(),
  depositAmount: numeric("deposit_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status: leaseStatus("status").notNull().default("draft"),
  contractUrl: text("contract_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  apartmentIdx: index("leases_apartment_idx").on(table.apartmentId),
  tenantIdx: index("leases_tenant_idx").on(table.tenantId),
  statusIdx: index("leases_status_idx").on(table.status),
}));

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  leaseId: uuid("lease_id").notNull().references(() => leases.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: paymentMethod("payment_method").notNull(),
  transactionRef: varchar("transaction_ref", { length: 180 }),
  status: paymentStatus("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  receiptUrl: text("receipt_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leaseIdx: index("payments_lease_idx").on(table.leaseId),
  statusIdx: index("payments_status_idx").on(table.status),
  paidAtIdx: index("payments_paid_at_idx").on(table.paidAt),
}));

export const commonUtilities = pgTable("common_utilities", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  type: utilityType("type").notNull(),
  supplier: varchar("supplier", { length: 160 }),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  period: varchar("period", { length: 32 }).notNull(),
  splitStatus: splitStatus("split_status").notNull().default("pending"),
  invoiceUrl: text("invoice_url"),
  splitAt: timestamp("split_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingIdx: index("common_utilities_building_idx").on(table.buildingId),
  periodIdx: index("common_utilities_period_idx").on(table.period),
}));

export const utilitySplits = pgTable("utility_splits", {
  id: uuid("id").defaultRandom().primaryKey(),
  utilityId: uuid("utility_id").notNull().references(() => commonUtilities.id, { onDelete: "cascade" }),
  apartmentId: uuid("apartment_id").notNull().references(() => apartments.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  utilityApartmentUnique: uniqueIndex("utility_splits_utility_apartment_unique").on(table.utilityId, table.apartmentId),
}));

export const maintenanceTickets = pgTable("maintenance_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  photoUrl: text("photo_url"),
  cost: numeric("cost", { precision: 14, scale: 2 }),
  status: ticketStatus("status").notNull().default("pending"),
  priority: ticketPriority("priority").notNull().default("normal"),
  deductFromRent: boolean("deduct_from_rent").notNull().default(false),
  reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingIdx: index("maintenance_tickets_building_idx").on(table.buildingId),
  statusIdx: index("maintenance_tickets_status_idx").on(table.status),
}));

export const usersRelations = relations(users, ({ many }) => ({
  ownedBuildings: many(buildings, { relationName: "buildingOwner" }),
  managedBuildings: many(buildings, { relationName: "buildingManager" }),
  reportedTickets: many(maintenanceTickets, { relationName: "ticketReporter" }),
  assignedTickets: many(maintenanceTickets, { relationName: "ticketAssignee" }),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  owner: one(users, { fields: [buildings.ownerId], references: [users.id], relationName: "buildingOwner" }),
  manager: one(users, { fields: [buildings.managerId], references: [users.id], relationName: "buildingManager" }),
  apartments: many(apartments),
  utilities: many(commonUtilities),
  tickets: many(maintenanceTickets),
}));

export const apartmentsRelations = relations(apartments, ({ one, many }) => ({
  building: one(buildings, { fields: [apartments.buildingId], references: [buildings.id] }),
  leases: many(leases),
  utilitySplits: many(utilitySplits),
  tickets: many(maintenanceTickets),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({ leases: many(leases) }));

export const leasesRelations = relations(leases, ({ one, many }) => ({
  apartment: one(apartments, { fields: [leases.apartmentId], references: [apartments.id] }),
  tenant: one(tenants, { fields: [leases.tenantId], references: [tenants.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, { fields: [payments.leaseId], references: [leases.id] }),
}));

export const commonUtilitiesRelations = relations(commonUtilities, ({ one, many }) => ({
  building: one(buildings, { fields: [commonUtilities.buildingId], references: [buildings.id] }),
  splits: many(utilitySplits),
}));

export const utilitySplitsRelations = relations(utilitySplits, ({ one }) => ({
  utility: one(commonUtilities, { fields: [utilitySplits.utilityId], references: [commonUtilities.id] }),
  apartment: one(apartments, { fields: [utilitySplits.apartmentId], references: [apartments.id] }),
}));

export const maintenanceTicketsRelations = relations(maintenanceTickets, ({ one }) => ({
  building: one(buildings, { fields: [maintenanceTickets.buildingId], references: [buildings.id] }),
  apartment: one(apartments, { fields: [maintenanceTickets.apartmentId], references: [apartments.id] }),
  reporter: one(users, { fields: [maintenanceTickets.reportedBy], references: [users.id], relationName: "ticketReporter" }),
  assignee: one(users, { fields: [maintenanceTickets.assignedTo], references: [users.id], relationName: "ticketAssignee" }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Building = typeof buildings.$inferSelect;
export type NewBuilding = typeof buildings.$inferInsert;
export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type CommonUtility = typeof commonUtilities.$inferSelect;
export type NewCommonUtility = typeof commonUtilities.$inferInsert;
export type MaintenanceTicket = typeof maintenanceTickets.$inferSelect;
export type NewMaintenanceTicket = typeof maintenanceTickets.$inferInsert;
