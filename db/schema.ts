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
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded", "cancelled"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "wave", "orange_money", "mtn_momo", "bank_transfer"]);
export const buildingOwnerKind = pgEnum("building_owner_kind", ["self", "third_party"]);
export const financialAccountType = pgEnum("financial_account_type", ["wave", "orange_money", "mobile_money", "bank", "cash", "other"]);
export const financialAccountStatus = pgEnum("financial_account_status", ["active", "archived"]);
export const financialTransactionKind = pgEnum("financial_transaction_kind", ["rent", "income", "expense", "transfer", "deposit", "deposit_refund", "settlement", "adjustment", "reversal"]);
export const financialTransactionFlow = pgEnum("financial_transaction_flow", ["in", "out"]);
export const financialTransactionStatus = pgEnum("financial_transaction_status", ["posted", "reversed"]);
export const chargeableTo = pgEnum("chargeable_to", ["owner", "agency"]);
export const managementFeeBasis = pgEnum("management_fee_basis", ["percent_collected", "percent_due", "fixed", "percent_collected_plus_fixed"]);
export const ownerStatementStatus = pgEnum("owner_statement_status", ["draft", "finalized"]);
export const ownerStatementLineType = pgEnum("owner_statement_line_type", ["rent_billed", "rent_collected", "other_income", "expense_owner", "expense_agency", "management_fee", "adjustment", "net"]);
export const subscriptionStatus = pgEnum("subscription_status", ["pending", "active", "cancelled", "expired", "trialing", "pending_payment", "past_due", "suspended"]);
export const subscriptionPlan = pgEnum("subscription_plan", ["monthly", "annual"]);
export const billingInterval = pgEnum("billing_interval", ["monthly", "annual"]);
export const paymentRequestStatus = pgEnum("payment_request_status", ["pending", "notified", "confirmed", "rejected", "cancelled"]);
export const manualPayMethod = pgEnum("manual_pay_method", ["wave", "orange_money", "mtn_momo", "mobile_money", "cash"]);
export const subscriptionEventKind = pgEnum("subscription_event_kind", ["created", "notified", "confirmed", "rejected", "activated", "extended", "suspended", "reactivated", "plan_changed", "adjustment", "expired", "cancelled"]);
export const utilityType = pgEnum("utility_type", ["water", "electricity", "security", "other"]);
export const splitStatus = pgEnum("split_status", ["pending", "split", "notified"]);
export const ticketStatus = pgEnum("ticket_status", ["pending", "in_progress", "resolved"]);
export const ticketPriority = pgEnum("ticket_priority", ["low", "normal", "urgent"]);
export const propertyType = pgEnum("property_type", ["studio", "chambre", "apartment", "house", "commercial", "other"]);
export const prospectStatus = pgEnum("prospect_status", ["new", "contacted", "notified", "visit_scheduled", "visited", "negotiation", "converted", "lost"]);
export const prospectActivityKind = pgEnum("prospect_activity_kind", ["created", "status_change", "contact", "note", "notified", "visit_scheduled", "visit_completed", "visit_cancelled", "visit_missed", "converted", "lost", "other"]);
export const prospectVisitStatus = pgEnum("prospect_visit_status", ["scheduled", "completed", "cancelled", "missed"]);
export const prospectReservationStatus = pgEnum("prospect_reservation_status", ["tentative", "confirmed"]);

/**
 * An agency (a Better Auth organization). Everything the app scopes — buildings,
 * tenants, prospects, accounts — belongs to exactly one organization, which is
 * the real isolation boundary the building/owner heuristic used to approximate.
 *
 * Better Auth owns this table (its `organization` plugin) and generates the
 * `id`, so it is a text key rather than the UUIDs the domain tables use.
 */
export const organizations = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The agency's business profile: the fields Better Auth's `organization` model
 * does not carry (the plugin has no `additionalFields` hook in 1.2.x). Kept in a
 * domain table, 1:1 with `organizations`, so the auth-owned table stays minimal
 * while the operating details stay typed and queryable. `name`/`slug`/`logo`
 * deliberately stay on `organizations` to avoid a second source of truth.
 *
 * `onboardedAt` gates the first-run configuration wizard; `default*` management
 * fee figures are the fallback used for a building with no arrangement of its
 * own.
 */
export const organizationProfiles = pgTable("organization_profiles", {
  organizationId: text("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 32 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 80 }).notNull().default("Sénégal"),
  website: text("website"),
  description: text("description"),
  legalName: varchar("legal_name", { length: 160 }),
  registrationNumber: varchar("registration_number", { length: 60 }),
  taxId: varchar("tax_id", { length: 60 }),
  defaultManagementFeeBasis: managementFeeBasis("default_management_fee_basis"),
  defaultFeePercent: numeric("default_fee_percent", { precision: 5, scale: 2 }),
  defaultFeeAmount: numeric("default_fee_amount", { precision: 14, scale: 2 }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  image: text("image"),
  role: userRole("role").notNull().default("owner"),
  // Home agency. `member` stays authoritative for membership; `requireActor`
  // keeps this mirror in sync so domain reads can scope on a single column
  // instead of joining membership on every query.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index("users_organization_idx").on(table.organizationId),
}));


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
  // Better Auth admin plugin (platform owner, not agency role). `role` is
  // "user" by default, "admin" for the SaaS owner dashboard. Kept on the
  // auth-owned table exactly as the plugin expects.
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
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
  // Better Auth admin plugin: who impersonated this session, if anyone.
  impersonatedBy: text("impersonated_by"),
  // Set by the Better Auth organization plugin's `setActive`. Kept as plain
  // text (no FK), exactly as Better Auth generates it, so an organization can
  // be removed without invalidating live sessions.
  activeOrganizationId: text("active_organization_id"),
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

/**
 * Better Auth organization membership. This is the authoritative answer to
 * "who is in which agency, with which role"; the domain `users.role` /
 * `users.organizationId` columns are projections kept in sync by the API layer.
 *
 * `user_id` references the Better Auth `user` table, not the domain `users`
 * table — the two are bridged by email in `requireActor`.
 */
export const organizationMembers = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index("member_organization_idx").on(table.organizationId),
  userIdx: index("member_user_idx").on(table.userId),
}));

/**
 * Better Auth organization invitations (pending email links to join an agency).
 * Distinct from the removed app-level `invitations` table: acceptance, expiry
 * and permission checks are owned by the plugin.
 */
export const organizationInvitations = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
}, (table) => ({
  organizationIdx: index("invitation_organization_idx").on(table.organizationId),
  emailIdx: index("invitation_email_idx").on(table.email),
}));

export const buildings = pgTable("buildings", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 80 }).notNull().default("Sénégal"),
  photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
  unitCount: integer("unit_count").notNull().default(0),
  // The agency that manages this building. This is now the isolation boundary:
  // every building a staff member can read belongs to their organization.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
  // Ownership declaration: `self` means `ownerId` is the user behind the
  // portfolio, `third_party` means the agency manages it for an external
  // owner who has no login (their identity is recorded below). Owner
  // statements and settlements key off the building, so an external owner
  // still gets their figure without an account.
  ownerKind: buildingOwnerKind("owner_kind").notNull().default("self"),
  externalOwnerName: varchar("external_owner_name", { length: 160 }),
  externalOwnerPhone: varchar("external_owner_phone", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerIdx: index("buildings_owner_idx").on(table.ownerId),
  managerIdx: index("buildings_manager_idx").on(table.managerId),
  organizationIdx: index("buildings_organization_idx").on(table.organizationId),
}));

export const apartments = pgTable("apartments", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  unitNumber: varchar("unit_number", { length: 32 }).notNull(),
  floor: integer("floor"),
  bedrooms: integer("bedrooms").notNull().default(1),
  areaSqm: integer("area_sqm"),
  rentAmount: numeric("rent_amount", { precision: 14, scale: 2 }).notNull(),
  // Property kind, furnishing and amenities, used by prospect/apartment matching.
  type: propertyType("type").notNull().default("apartment"),
  furnished: boolean("furnished").notNull().default(false),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
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
  // Linked to the Better Auth account used to log into the tenant portal.
  // Self-linked on first portal access via phone match.
  userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }).unique(),
  // The manager who registered this tenant. Without it there was no way to tell
  // whose directory a tenant belonged to: `tenants` is not reachable from
  // `buildings`, so the lease chain alone leaves a lease-less tenant orphaned and
  // invisible to the person who just created them. Null for rows that predate
  // this column, which stay visible through their leases.
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  // Agency the tenant belongs to. Set at registration and used as the primary
  // visibility rule; the lease chain below remains as a fallback for rows that
  // predate organizations.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdByIdx: index("tenants_created_by_idx").on(table.createdBy),
  organizationIdx: index("tenants_organization_idx").on(table.organizationId),
}));

export const leases = pgTable("leases", {
  id: uuid("id").defaultRandom().primaryKey(),
  apartmentId: uuid("apartment_id").notNull().references(() => apartments.id, { onDelete: "restrict" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  // Confirms the tenant's agreed move-out date. Only a confirmed endDate lets a
  // future rental be scheduled right after it (the conversion flow checks this
  // before allocating an occupied apartment).
  moveOutConfirmed: boolean("move_out_confirmed").notNull().default(false),
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
  // Billing period (YYYY-MM) the payment covers. Bills without one fall back
  // to the paid/created month for reporting.
  period: varchar("period", { length: 7 }),
  // Where the money landed. Filled by the agency when reconciling the online
  // payment; cash payments are recorded against an account right away.
  accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leaseIdx: index("payments_lease_idx").on(table.leaseId),
  statusIdx: index("payments_status_idx").on(table.status),
  paidAtIdx: index("payments_paid_at_idx").on(table.paidAt),
  periodIdx: index("payments_period_idx").on(table.period),
  accountIdx: index("payments_account_idx").on(table.accountId),
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
  // Tenant-facing nature of the request: a repair to do, a degradation being
  // reported, or something else. Kept as free text so the vocabulary can grow
  // without an enum migration.
  category: varchar("category", { length: 32 }).notNull().default("reparation"),
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

/**
 * In-app notification inbox for owners/managers. Written on domain events that
 * need attention (portal payment, new ticket, tenant requesting a payment link)
 * and read from the header bell.
 */
export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  photoUrl: text("photo_url"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  type: varchar("type", { length: 32 }).notNull().default("autre"),
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A person looking for accommodation who has not become a tenant yet. Only the
 * contact fields are mandatory; requirements are criteria used by apartment
 * matching.
 */
export const prospects = pgTable("prospects", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: varchar("full_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }),
  email: varchar("email", { length: 255 }),
  preferredContact: varchar("preferred_contact", { length: 32 }),
  notes: text("notes"),
  // Accommodation requirements
  propertyType: propertyType("property_type"),
  location: varchar("location", { length: 160 }),
  budgetMin: numeric("budget_min", { precision: 14, scale: 2 }),
  budgetMax: numeric("budget_max", { precision: 14, scale: 2 }),
  bedrooms: integer("bedrooms"),
  furnished: boolean("furnished"),
  moveInDate: date("move_in_date"),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  requirements: text("requirements"),
  // Lifecycle
  status: prospectStatus("status").notNull().default("new"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  // Agency that owns this prospect. Replaces the previous "team member"
  // inference, which could only ever be as precise as building ownership.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  // Set exactly once by the conversion flow, which prevents a prospect from
  // being converted into a tenant twice.
  convertedTenantId: uuid("converted_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  convertedLeaseId: uuid("converted_lease_id").references(() => leases.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdByIdx: index("prospects_created_by_idx").on(table.createdBy),
  statusIdx: index("prospects_status_idx").on(table.status),
  organizationIdx: index("prospects_organization_idx").on(table.organizationId),
}));

/** Audit trail for a prospect: status changes, contact attempts, notes. */
export const prospectActivities = pgTable("prospect_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  prospectId: uuid("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  kind: prospectActivityKind("kind").notNull(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  fromStatus: prospectStatus("from_status"),
  toStatus: prospectStatus("to_status"),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  prospectIdx: index("prospect_activities_prospect_idx").on(table.prospectId),
}));

/** Scheduled or past visits between a prospect and an apartment. */
export const prospectVisits = pgTable("prospect_visits", {
  id: uuid("id").defaultRandom().primaryKey(),
  prospectId: uuid("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: prospectVisitStatus("status").notNull().default("scheduled"),
  notes: text("notes"),
  outcome: text("outcome"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  prospectIdx: index("prospect_visits_prospect_idx").on(table.prospectId),
  apartmentIdx: index("prospect_visits_apartment_idx").on(table.apartmentId),
}));

/**
 * A prospect's claim on an apartment over a date range, used to prevent
 * conflicting allocations. Tentative reservations are advisory; confirmed ones
 * block an overlapping conversion unless an authorized manager resolves them.
 */
export const prospectReservations = pgTable("prospect_reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  prospectId: uuid("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: prospectReservationStatus("status").notNull().default("tentative"),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  prospectIdx: index("prospect_reservations_prospect_idx").on(table.prospectId),
  apartmentIdx: index("prospect_reservations_apartment_idx").on(table.apartmentId),
}));

/**
 * Payment destinations and cash boxes. An account tied to a building holds
 * money for that building's owner (fed by owner settlements); an untied one is
 * the agency's own operating account. Accounts are bookkeeping records: their
 * balance is derived from ledger movements, never hand-edited.
 */
export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  type: financialAccountType("type").notNull(),
  provider: varchar("provider", { length: 120 }),
  holder: varchar("holder", { length: 120 }),
  maskedReference: varchar("masked_reference", { length: 120 }),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  openingDate: date("opening_date"),
  buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
  // Agency that owns the account. Agency-level accounts leave `buildingId` null
  // but still belong to exactly one organization.
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  status: financialAccountStatus("status").notNull().default("active"),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingIdx: index("financial_accounts_building_idx").on(table.buildingId),
  organizationIdx: index("financial_accounts_organization_idx").on(table.organizationId),
}));

/**
 * The single ledger. Confirmed rent payments are mirrored here exactly once
 * (unique `paymentId` makes duplicate webhooks no-ops). Every cash movement is
 * a row with a signed `kind`/`flow`. A transfer posts two opposite rows sharing
 * a `transferBatchId`; a reversal marks the source row `reversed` and posts an
 * opposite row, so balances are computed from `status = 'posted'` rows only and
 * history is never destroyed. Deposits, transfers and settlements carry their
 * own kind and never count as operating income or expense.
 */
export const financialTransactions = pgTable("financial_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").references(() => buildings.id, { onDelete: "set null" }),
  apartmentId: uuid("apartment_id").references(() => apartments.id, { onDelete: "set null" }),
  leaseId: uuid("lease_id").references(() => leases.id, { onDelete: "set null" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "restrict" }),
  counterpartAccountId: uuid("counterpart_account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
  transferBatchId: uuid("transfer_batch_id"),
  kind: financialTransactionKind("kind").notNull(),
  flow: financialTransactionFlow("flow").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  period: varchar("period", { length: 7 }),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  category: varchar("category", { length: 64 }),
  description: text("description"),
  reference: varchar("reference", { length: 180 }),
  // Optional counterparty for a movement when it is not a tenant (e.g. a
  // supplier paid for a repair, or an external owner). Free text on purpose:
  // suppliers are not a managed entity in this module.
  supplier: varchar("supplier", { length: 180 }),
  // Optional receipt / supporting document, stored as a key served by the
  // uploads proxy (never a public URL).
  attachmentUrl: text("attachment_url"),
  // Which side bears an expense (or records other income): the owner or the
  // agency. Drives owner statements.
  chargeableTo: chargeableTo("chargeable_to"),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  // When this row is the cash movement of an owner settlement, deleting the
  // settlement removes the movement with it so no orphan payout stays in the
  // ledger.
  settlementId: uuid("settlement_id").references(() => ownerSettlements.id, { onDelete: "cascade" }),
  // Link to the ledger row this row reverses. Kept as a plain uuid (no FK) so
  // the table can reference itself without a type-level cycle; the reversal
  // route enforces that the target exists and has not been reversed already.
  reversesTransactionId: uuid("reverses_transaction_id"),
  status: financialTransactionStatus("status").notNull().default("posted"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paymentUnique: uniqueIndex("financial_transactions_payment_unique").on(table.paymentId),
  buildingIdx: index("financial_transactions_building_idx").on(table.buildingId),
  accountIdx: index("financial_transactions_account_idx").on(table.accountId),
  periodIdx: index("financial_transactions_period_idx").on(table.period),
  kindIdx: index("financial_transactions_kind_idx").on(table.kind),
}));

/**
 * How the agency is compensated for managing a building. Effective as of
 * `startDate` until superseded by a later arrangement (overlapping periods are
 * rejected). The fee basis drives the "management fee earned" line of reports
 * and owner statements.
 */
export const managementArrangements = pgTable("management_arrangements", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  basis: managementFeeBasis("basis").notNull(),
  feePercent: numeric("fee_percent", { precision: 5, scale: 2 }),
  feeAmount: numeric("fee_amount", { precision: 14, scale: 2 }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingIdx: index("management_arrangements_building_idx").on(table.buildingId),
}));

/**
 * Line-by-line snapshot of what a building's owner is owed for a period.
 * Computed from the ledger (rent collected, income, owner-chargeable
 * expenses), not fabricated. `netPayable` = rentCollected + otherIncome −
 * expensesOwner − managementFee ± adjustments. `remaining` = netPayable −
 * remitted.
 */
export const ownerStatements = pgTable("owner_statements", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(),
  status: ownerStatementStatus("status").notNull().default("draft"),
  rentBilled: numeric("rent_billed", { precision: 14, scale: 2 }).notNull().default("0"),
  rentCollected: numeric("rent_collected", { precision: 14, scale: 2 }).notNull().default("0"),
  otherIncome: numeric("other_income", { precision: 14, scale: 2 }).notNull().default("0"),
  expensesOwner: numeric("expenses_owner", { precision: 14, scale: 2 }).notNull().default("0"),
  expensesAgency: numeric("expenses_agency", { precision: 14, scale: 2 }).notNull().default("0"),
  managementFee: numeric("management_fee", { precision: 14, scale: 2 }).notNull().default("0"),
  adjustments: numeric("adjustments", { precision: 14, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 14, scale: 2 }).notNull().default("0"),
  remitted: numeric("remitted", { precision: 14, scale: 2 }).notNull().default("0"),
  remaining: numeric("remaining", { precision: 14, scale: 2 }).notNull().default("0"),
  basis: text("basis"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingPeriodUnique: uniqueIndex("owner_statements_building_period_unique").on(table.buildingId, table.period),
}));

/** The explanatory rows behind an owner statement, kept for the audit trail. */
export const ownerStatementLines = pgTable("owner_statement_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  statementId: uuid("statement_id").notNull().references(() => ownerStatements.id, { onDelete: "cascade" }),
  lineType: ownerStatementLineType("line_type").notNull(),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => ({
  statementIdx: index("owner_statement_lines_statement_idx").on(table.statementId),
}));

/**
 * A distribution/remittance recorded to a property owner (a user-owner logged
 * in, or an external owner by name+phone). Each settlement reduces the
 * building+period statement's outstanding amount; the recipient is snapshotted
 * so past records stay readable after profile changes.
 */
export const ownerSettlements = pgTable("owner_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  buildingId: uuid("building_id").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 7 }).notNull(),
  statementId: uuid("statement_id").references(() => ownerStatements.id, { onDelete: "set null" }),
  recipientName: varchar("recipient_name", { length: 160 }).notNull(),
  recipientPhone: varchar("recipient_phone", { length: 32 }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
  accountId: uuid("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
  reference: varchar("reference", { length: 180 }),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  buildingIdx: index("owner_settlements_building_idx").on(table.buildingId),
  periodIdx: index("owner_settlements_period_idx").on(table.period),
  statementIdx: index("owner_settlements_statement_idx").on(table.statementId),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body"),
  href: varchar("href", { length: 300 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("notifications_user_idx").on(table.userId),
}));

/**
 * A manual reconciliation of an account against an external provider statement
 * (Wave, Orange Money, bank…). `statementBalance` is what the provider reported
 * as of `asOf`; `recordedBalance` snapshots what the ledger said at that moment,
 * so the discrepancy stays auditable even as later movements change the balance.
 * The recorded balance is never overwritten — reconciliation only observes.
 */
export const financialAccountReconciliations = pgTable("financial_account_reconciliations", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => financialAccounts.id, { onDelete: "cascade" }),
  statementBalance: numeric("statement_balance", { precision: 14, scale: 2 }).notNull(),
  recordedBalance: numeric("recorded_balance", { precision: 14, scale: 2 }).notNull(),
  asOf: date("as_of").notNull(),
  notes: text("notes"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountIdx: index("financial_account_reconciliations_account_idx").on(table.accountId, table.asOf),
}));

export const organizationsRelations = relations(organizations, ({ one }) => ({
  profile: one(organizationProfiles, { fields: [organizations.id], references: [organizationProfiles.organizationId] }),
}));

export const organizationProfilesRelations = relations(organizationProfiles, ({ one }) => ({
  organization: one(organizations, { fields: [organizationProfiles.organizationId], references: [organizations.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  ownedBuildings: many(buildings, { relationName: "buildingOwner" }),
  managedBuildings: many(buildings, { relationName: "buildingManager" }),
  createdTenants: many(tenants, { relationName: "tenantCreator" }),
  reportedTickets: many(maintenanceTickets, { relationName: "ticketReporter" }),
  assignedTickets: many(maintenanceTickets, { relationName: "ticketAssignee" }),
  createdProspects: many(prospects, { relationName: "prospectCreator" }),
  prospectActivityActor: many(prospectActivities, { relationName: "prospectActivityActor" }),
  createdProspectVisits: many(prospectVisits, { relationName: "prospectVisitCreator" }),
  createdProspectReservations: many(prospectReservations, { relationName: "prospectReservationCreator" }),
}));

export const buildingsRelations = relations(buildings, ({ one, many }) => ({
  owner: one(users, { fields: [buildings.ownerId], references: [users.id], relationName: "buildingOwner" }),
  manager: one(users, { fields: [buildings.managerId], references: [users.id], relationName: "buildingManager" }),
  apartments: many(apartments),
  utilities: many(commonUtilities),
  tickets: many(maintenanceTickets),
  ownerAccounts: many(financialAccounts),
  arrangements: many(managementArrangements),
  statements: many(ownerStatements),
  settlements: many(ownerSettlements),
}));

export const apartmentsRelations = relations(apartments, ({ one, many }) => ({
  building: one(buildings, { fields: [apartments.buildingId], references: [buildings.id] }),
  leases: many(leases),
  utilitySplits: many(utilitySplits),
  tickets: many(maintenanceTickets),
  visits: many(prospectVisits),
  reservations: many(prospectReservations),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  creator: one(users, { fields: [tenants.createdBy], references: [users.id], relationName: "tenantCreator" }),
  leases: many(leases),
  convertedProspects: many(prospects),
}));

export const leasesRelations = relations(leases, ({ one, many }) => ({
  apartment: one(apartments, { fields: [leases.apartmentId], references: [apartments.id] }),
  tenant: one(tenants, { fields: [leases.tenantId], references: [tenants.id] }),
  payments: many(payments),
  convertedProspect: one(prospects, { fields: [leases.id], references: [prospects.convertedLeaseId] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, { fields: [payments.leaseId], references: [leases.id] }),
}));

export const commonUtilitiesRelations = relations(commonUtilities, ({ one, many }) => ({
  building: one(buildings, { fields: [commonUtilities.buildingId], references: [buildings.id] }),
  splits: many(utilitySplits),
}));

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: text("agency_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  plan: subscriptionPlan("plan").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  net_amount: numeric("net_amount", { precision: 14, scale: 2 }), // montant qui revient au marchand après frais
  status: subscriptionStatus("status").notNull().default("pending"),
  saspay_checkout_id: varchar("saspay_checkout_id", { length: 180 }), // ID de la session checkout_sessions
  saspay_payment_id: varchar("saspay_payment_id", { length: 180 }).unique(), // ID de la transaction verify (unique par abonnement)
  paydunyaInvoiceId: varchar("paydunya_invoice_id", { length: 180 }),
  paydunyaReference: varchar("paydunya_reference", { length: 180 }),
  checkoutUrl: text("checkout_url"),
  metadata: jsonb("metadata"), // { subscription_id, agency_id, plan, expected_amount, ... }
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Manual-billing lifecycle (SasPay columns above are kept untouched for a
  // future gateway). All manual amounts are integers in XOF on the request
  // tables; these columns only carry dates/reasons.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendReason: text("suspend_reason"),
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agencyIdx: index("subscriptions_agency_idx").on(table.agencyId),
  statusIdx: index("subscriptions_status_idx").on(table.status),
  saspay_payment_idIdx: uniqueIndex("subscriptions_saspay_payment_id_uq").on(table.saspay_payment_id),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  agency: one(organizations, { fields: [subscriptions.agencyId], references: [organizations.id] }),
}));

export const subscriptionPayments = pgTable("subscription_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscription_id: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "cascade" })
    .unique(),
  saspay_payment_id: varchar("saspay_payment_id", { length: 180 }).notNull().unique(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  net_amount: numeric("net_amount", { precision: 14, scale: 2 }), // ce qui revient au marchand
  currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // PENDING, SUCCESS, FAILED
  paid_at: timestamp("paid_at", { withTimezone: true }),
  raw_event: jsonb("raw_event"), // corps du webhook stocké pour auditing
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  subscriptionIdx: index("subscription_payments_subscription_id_idx").on(table.subscription_id),
}));

export const subscriptionPaymentsRelations = relations(subscriptionPayments, ({ one }) => ({
  subscription: one(subscriptions, { fields: [subscriptionPayments.subscription_id], references: [subscriptions.id] }),
}));

/**
 * Configurable SaaS plans. Prices are integers in XOF (no floats). The
 * `code` stays stable ("monthly"/"annual" seed rows match the legacy
 * `subscriptionPlan` enum) so the API can price server-side from the DB
 * instead of trusting client amounts or hardcoded constants.
 */
export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  monthlyPriceXof: integer("monthly_price_xof").notNull(),
  annualPriceXof: integer("annual_price_xof").notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Manual payment instructions shown to agencies (Wave, Orange Money, cash…).
 * Admin-managed; agencies only read active rows. No secrets here.
 */
export const subscriptionPaymentInstructions = pgTable("subscription_payment_instructions", {
  id: uuid("id").defaultRandom().primaryKey(),
  method: manualPayMethod("method").notNull(),
  displayName: varchar("display_name", { length: 160 }),
  phoneNumber: varchar("phone_number", { length: 32 }),
  instructions: text("instructions"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A manual payment request: the agency declares intent, pays outside the app,
 * optionally notifies, and a platform admin confirms or rejects. A row can
 * only be applied once (`appliedAt` + status guard in the confirm
 * transaction). Never auto-activates a subscription.
 */
export const subscriptionPaymentRequests = pgTable("subscription_payment_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: text("agency_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  planId: uuid("plan_id").references(() => subscriptionPlans.id, { onDelete: "set null" }),
  billingInterval: billingInterval("billing_interval").notNull(),
  expectedAmountXof: integer("expected_amount_xof").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("XOF"),
  reference: varchar("reference", { length: 40 }).notNull().unique(),
  method: manualPayMethod("method").notNull().default("wave"),
  status: paymentRequestStatus("status").notNull().default("pending"),
  // Agency-supplied notification (unverified claim, never proof of payment).
  claimedRef: varchar("claimed_ref", { length: 180 }),
  claimedPaidAt: timestamp("claimed_paid_at", { withTimezone: true }),
  note: text("note"),
  receiptUrl: text("receipt_url"),
  // Admin verification (independent check, explicit decision).
  actualAmountXof: integer("actual_amount_xof"),
  actualPaidAt: timestamp("actual_paid_at", { withTimezone: true }),
  transactionRef: varchar("transaction_ref", { length: 180 }),
  adminNote: text("admin_note"),
  rejectReason: text("reject_reason"),
  amountOverride: boolean("amount_override").notNull().default(false),
  decidedBy: text("decided_by").references(() => authUsers.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agencyIdx: index("payment_requests_agency_idx").on(table.agencyId),
  statusIdx: index("payment_requests_status_idx").on(table.status),
  referenceIdx: uniqueIndex("payment_requests_reference_uq").on(table.reference),
  subscriptionIdx: index("payment_requests_subscription_idx").on(table.subscriptionId),
}));

/**
 * Immutable audit trail for every billing decision. Append-only: the API
 * never updates or deletes rows here.
 */
export const subscriptionEvents = pgTable("subscription_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  agencyId: text("agency_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  requestId: uuid("request_id").references(() => subscriptionPaymentRequests.id, { onDelete: "set null" }),
  kind: subscriptionEventKind("kind").notNull(),
  actorId: text("actor_id").references(() => authUsers.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  agencyIdx: index("subscription_events_agency_idx").on(table.agencyId),
  subscriptionIdx: index("subscription_events_subscription_idx").on(table.subscriptionId),
  requestIdx: index("subscription_events_request_idx").on(table.requestId),
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

export const claimsRelations = relations(claims, ({ one }) => ({
  tenant: one(tenants, { fields: [claims.tenantId], references: [tenants.id] }),
  apartment: one(apartments, { fields: [claims.apartmentId], references: [apartments.id] }),
  building: one(buildings, { fields: [claims.buildingId], references: [buildings.id] }),
}));

export const prospectsRelations = relations(prospects, ({ one, many }) => ({
  creator: one(users, { fields: [prospects.createdBy], references: [users.id], relationName: "prospectCreator" }),
  convertedTenant: one(tenants, { fields: [prospects.convertedTenantId], references: [tenants.id] }),
  convertedLease: one(leases, { fields: [prospects.convertedLeaseId], references: [leases.id] }),
  activities: many(prospectActivities),
  visits: many(prospectVisits),
  reservations: many(prospectReservations),
}));

export const prospectActivitiesRelations = relations(prospectActivities, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectActivities.prospectId], references: [prospects.id] }),
  actor: one(users, { fields: [prospectActivities.actorId], references: [users.id], relationName: "prospectActivityActor" }),
  apartment: one(apartments, { fields: [prospectActivities.apartmentId], references: [apartments.id] }),
}));

export const prospectVisitsRelations = relations(prospectVisits, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectVisits.prospectId], references: [prospects.id] }),
  apartment: one(apartments, { fields: [prospectVisits.apartmentId], references: [apartments.id] }),
  creator: one(users, { fields: [prospectVisits.createdById], references: [users.id], relationName: "prospectVisitCreator" }),
}));

export const prospectReservationsRelations = relations(prospectReservations, ({ one }) => ({
  prospect: one(prospects, { fields: [prospectReservations.prospectId], references: [prospects.id] }),
  apartment: one(apartments, { fields: [prospectReservations.apartmentId], references: [apartments.id] }),
  creator: one(users, { fields: [prospectReservations.createdById], references: [users.id], relationName: "prospectReservationCreator" }),
}));

export const financialAccountsRelations = relations(financialAccounts, ({ one, many }) => ({
  building: one(buildings, { fields: [financialAccounts.buildingId], references: [buildings.id] }),
  movements: many(financialTransactions, { relationName: "transactionAccount" }),
  counterpartMovements: many(financialTransactions, { relationName: "transactionCounterpart" }),
  settlements: many(ownerSettlements, { relationName: "settlementAccount" }),
}));

export const financialTransactionsRelations = relations(financialTransactions, ({ one, many }) => ({
  building: one(buildings, { fields: [financialTransactions.buildingId], references: [buildings.id] }),
  apartment: one(apartments, { fields: [financialTransactions.apartmentId], references: [apartments.id] }),
  lease: one(leases, { fields: [financialTransactions.leaseId], references: [leases.id] }),
  tenant: one(tenants, { fields: [financialTransactions.tenantId], references: [tenants.id] }),
  account: one(financialAccounts, { fields: [financialTransactions.accountId], references: [financialAccounts.id], relationName: "transactionAccount" }),
  counterpartAccount: one(financialAccounts, { fields: [financialTransactions.counterpartAccountId], references: [financialAccounts.id], relationName: "transactionCounterpart" }),
  payment: one(payments, { fields: [financialTransactions.paymentId], references: [payments.id] }),
  settlement: one(ownerSettlements, { fields: [financialTransactions.settlementId], references: [ownerSettlements.id], relationName: "settlementMovements" }),
  reverses: one(financialTransactions, { fields: [financialTransactions.reversesTransactionId], references: [financialTransactions.id], relationName: "reversalPairs" }),
  reversedBy: many(financialTransactions, { relationName: "reversalPairs" }),
}));

export const managementArrangementsRelations = relations(managementArrangements, ({ one }) => ({
  building: one(buildings, { fields: [managementArrangements.buildingId], references: [buildings.id] }),
}));

export const ownerStatementsRelations = relations(ownerStatements, ({ one, many }) => ({
  building: one(buildings, { fields: [ownerStatements.buildingId], references: [buildings.id] }),
  lines: many(ownerStatementLines),
  settlements: many(ownerSettlements, { relationName: "statementSettlements" }),
}));

export const ownerStatementLinesRelations = relations(ownerStatementLines, ({ one }) => ({
  statement: one(ownerStatements, { fields: [ownerStatementLines.statementId], references: [ownerStatements.id] }),
}));

export const ownerSettlementsRelations = relations(ownerSettlements, ({ one }) => ({
  building: one(buildings, { fields: [ownerSettlements.buildingId], references: [buildings.id] }),
  statement: one(ownerStatements, { fields: [ownerSettlements.statementId], references: [ownerStatements.id], relationName: "statementSettlements" }),
  account: one(financialAccounts, { fields: [ownerSettlements.accountId], references: [financialAccounts.id], relationName: "settlementAccount" }),
  movement: one(financialTransactions, { fields: [ownerSettlements.id], references: [financialTransactions.settlementId], relationName: "settlementMovements" }),
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
export type NewClaim = typeof claims.$inferInsert;
export type Prospect = typeof prospects.$inferSelect;
export type NewProspect = typeof prospects.$inferInsert;
export type ProspectActivity = typeof prospectActivities.$inferSelect;
export type NewProspectActivity = typeof prospectActivities.$inferInsert;
export type ProspectVisit = typeof prospectVisits.$inferSelect;
export type NewProspectVisit = typeof prospectVisits.$inferInsert;
export type ProspectReservation = typeof prospectReservations.$inferSelect;
export type NewProspectReservation = typeof prospectReservations.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationProfile = typeof organizationProfiles.$inferSelect;
export type NewOrganizationProfile = typeof organizationProfiles.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizationInvitation = typeof organizationInvitations.$inferSelect;
export type FinancialAccount = typeof financialAccounts.$inferSelect;
export type NewFinancialAccount = typeof financialAccounts.$inferInsert;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type NewFinancialTransaction = typeof financialTransactions.$inferInsert;
export type ManagementArrangement = typeof managementArrangements.$inferSelect;
export type NewManagementArrangement = typeof managementArrangements.$inferInsert;
export type OwnerStatement = typeof ownerStatements.$inferSelect;
export type NewOwnerStatement = typeof ownerStatements.$inferInsert;
export type OwnerStatementLine = typeof ownerStatementLines.$inferSelect;
export type NewOwnerStatementLine = typeof ownerStatementLines.$inferInsert;
export type OwnerSettlement = typeof ownerSettlements.$inferSelect;
export type NewOwnerSettlement = typeof ownerSettlements.$inferInsert;
