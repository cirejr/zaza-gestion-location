# Feature Specification: Prospects & Accounting

## Context

We are building a property-management SaaS for Senegalese property owners and real estate agencies.

Add two major features to the owner/manager interface:

1. **Prospects & Lettings** — Manage people searching for apartments, track their requests and follow up when suitable properties become available.
2. **Accounting & Financial Management** — Track income, expenses, payment accounts, property profitability, and financial distributions between owners and managing agencies.

Before implementing either module, inspect the existing codebase, database schema, authorization rules, property/apartment/tenant models, rental contracts, invoices and payment records. Reuse existing entities and relationships wherever possible. Do not create duplicate representations of existing data.

Build these features incrementally, following the existing architecture and UI conventions.

# Module 1: Prospects & Lettings

## 1.1. Prospect management

Add a Prospects section to the owner/manager dashboard.

A prospect represents a person who contacted the agency looking for accommodation but has not yet become a tenant.

Each prospect should have the following information:

### Contact information
- Full name (required).
- Phone number (required).
- WhatsApp number (optional; can default to the phone number).
- Email (optional).
- Preferred contact method.
- Notes and additional contact details.

### Accommodation requirements
- Desired property type: studio, chambre, apartment, house, commercial premises, or other.
- Preferred location or neighborhood.
- Minimum and maximum monthly rent budget in XOF.
- Number of bedrooms or rooms.
- Furnished or unfurnished preference.
- Desired move-in date.
- Additional requirements, such as parking, air conditioning, water availability, electricity arrangements or other amenities.
- Free-text description of the prospect's needs.

Use configurable or predefined options for commonly requested criteria, while allowing managers to enter custom requirements.

### Prospect list and details

Provide:
- A searchable and filterable prospect list.
- Filters by status, desired location, budget, property type and move-in date.
- A detailed prospect page or panel.
- Creation and editing of prospects.
- An activity history recording status changes, visits, contact attempts and important notes.
- Duplicate detection using normalized phone numbers, with the option to review an existing prospect before creating another.

Do not require every optional field to be filled in when creating a prospect.

## 1.2. Prospect lifecycle

Provide a configurable status workflow with these initial statuses:

- New: prospect has been registered.
- Contacted: the agency has contacted the prospect.
- Notified: the prospect has been informed about a potentially suitable apartment.
- Visit scheduled: an apartment visit has been arranged.
- Visited: the prospect has visited an apartment.
- Negotiation: the prospect is considering or negotiating a rental.
- Converted: the prospect has become a tenant.
- Lost: the prospect is no longer interested or has found another property.

Allow managers to change a prospect's status manually.

Record the date, responsible user and relevant notes for important transitions. Support visit dates, reminders and follow-up notes.

A status change must not automatically create a tenant or allocate an apartment.

## 1.3. Contacting prospects

Provide practical actions directly from the prospect's details:

- Call the prospect using a `tel:` link.
- Open a WhatsApp conversation using a `wa.me` link when a valid WhatsApp number exists.
- Copy the prospect's phone number or contact details.
- Copy a formatted summary of their accommodation requirements.
- Record a contact attempt and its outcome.
- Record when the prospect has been notified about a suitable apartment.

Do not build a full messaging integration for the initial version. Use device/browser links and clipboard actions.

## 1.4. Matching prospects to available apartments

Allow a manager to find prospects whose requirements match an available apartment.

Provide a matching view based on:
- Location.
- Monthly rent and budget.
- Property/apartment type.
- Number of rooms.
- Required amenities.
- Desired move-in date.

Show why an apartment matches or does not match. Treat preferences as matching criteria, not rigid constraints unless explicitly marked as required.

When an apartment becomes available, make it possible to identify relevant prospects and initiate contact directly.

Do not automatically send messages or promise availability without manager confirmation.

## 1.5. Apartment visits and follow-ups

Managers should be able to associate a prospect with an apartment they have been offered or visited.

A visit record should include:
- Prospect.
- Apartment.
- Scheduled date and time.
- Visit status: scheduled, completed, cancelled or missed.
- Notes and outcome.

Keep a history of visits. A prospect may visit multiple apartments, and an apartment may be visited by multiple prospects.

## 1.6. Convert a prospect into a tenant

Provide an explicit "Convert to tenant" action.

The conversion flow should:

1. Show the prospect's contact details and allow the manager to complete missing tenant information.
2. Let the manager select the property/building and the specific apartment.
3. Show the apartment's current occupancy and availability.
4. Collect the rental start date, lease details and agreed rent where required by the existing rental workflow.
5. Validate occupancy and detect conflicting active leases or allocations.
6. Create the tenant using the existing tenant model and create or initiate the existing rental/lease workflow.
7. Mark the prospect as converted and link the prospect to the resulting tenant and rental.

Prevent duplicate tenant creation when the same prospect is converted twice.

### Apartment availability and future occupancy

Do not use a simple occupied/unoccupied boolean as the only source of truth if the application supports rental periods.

Handle these cases:

- Apartment is currently vacant: allow allocation if no conflicting reservation or lease exists.
- Apartment is occupied: prevent immediate allocation.
- Existing tenant has a confirmed move-out date: allow the manager to schedule a future rental after that date, subject to lease and reservation conflict checks.
- Move-out date is unknown or tentative: show a warning and require the manager to resolve the uncertainty before confirming the future allocation.
- Another prospect has already reserved the apartment for an overlapping period: prevent conflicting allocations unless an authorized manager resolves the conflict.
- Apartment is not expected to be available by the prospect's desired date: explain the conflict and offer alternative apartments.

Use date-range conflict detection and database-level safeguards where practical. Perform validation and conversion in a transaction to avoid two managers assigning the same apartment concurrently.

A future allocation must not mark the apartment as currently vacant or create an active tenancy before its agreed start date.

# Module 2: Accounting & Financial Management

## 2.1. Purpose and terminology

Add an Accounting section to the owner/manager dashboard.

This module should provide operational financial tracking for rental properties. It is not intended to be a full statutory accounting or tax-filing system.

The manager should be able to answer:

- How much rent was billed and actually collected?
- Which properties generate the most income?
- What expenses were incurred for each property?
- What is the property's net operating result?
- How much belongs to the property owner?
- How much does the managing agency earn?
- Where did each payment arrive: Wave, Orange Money, bank account, cash or another account?
- What amounts remain outstanding?
- How much has been paid out, and what remains to be distributed?

Use FCFA (XOF) as the default currency.

## 2.2. Financial overview

Create an accounting dashboard with a selectable period and filters by property, building, owner, agency and transaction category.

Show:

- Rent billed.
- Rent collected.
- Outstanding rent.
- Other income.
- Total expenses.
- Net operating income.
- Agency management fees earned.
- Owner amounts payable.
- Amounts actually paid to owners.
- Cash movements by account.
- Monthly income and expense trends.
- Property-level profitability comparisons.

Clearly distinguish billed amounts, actual cash received, accrued expenses and amounts payable. Do not present unpaid rent as collected cash.

Provide drill-down navigation from summary figures to the underlying invoices and transactions.

## 2.3. Financial accounts

Add an account-management page where authorized users can create and manage accounts representing where money is held.

Provide predefined account types and sensible defaults for Senegal:

- Wave.
- Orange Money.
- Other mobile-money account.
- Bank account.
- Cash.
- Other.

These are bookkeeping representations only. Do not connect to banks or mobile-money APIs for balance synchronization in this feature.

Each account should have:
- Name.
- Account type.
- Optional provider/bank name.
- Optional account holder.
- Optional masked account reference or phone number.
- Opening balance and opening date.
- Current recorded balance.
- Active/archived status.
- Optional notes.

Allow users to record transfers between their accounts.

Transfers must reduce the source account and increase the destination account without being counted as new income or expenses.

Keep a transaction history for each account and support manual reconciliation against external statements.

For agency-managed properties, clearly distinguish agency-owned accounts from owner-owned accounts. Do not imply that money held by an agency belongs to the agency merely because it is recorded in its account.

## 2.4. Record income and expenses

Provide a transaction form for manually recording financial movements.

### Income
Examples include:
- Rent received.
- Advance rent.
- Security deposits received.
- Late fees or other rental income.
- Other income associated with a property.

### Expenses
Examples include:
- Repairs and maintenance.
- Water and electricity.
- Cleaning.
- Security.
- Building management expenses.
- Taxes and fees.
- Insurance.
- Agency expenses charged to a property.
- Other operating costs.

Each transaction should support:
- Amount in XOF.
- Date.
- Income or expense type.
- Category.
- Payment account.
- Related property/building/apartment, when applicable.
- Related tenant, invoice, owner or supplier, when applicable.
- Description and reference.
- Optional receipt or supporting document.
- Recording user and creation timestamp.

Allow managers to edit or reverse transactions according to permissions. Preserve an audit trail instead of silently deleting financial history.

## 2.5. Connect financial records to existing rent payments

Integrate with the existing invoice and payment models.

When a rent payment is confirmed:
- Record the amount actually received.
- Associate it with the correct rent invoice, property and tenant.
- Record the receiving account if known.
- Update the collected-rent figures.
- Avoid generating a duplicate financial transaction if a webhook is delivered more than once.

If the actual receiving account is not known, record the payment without inventing an account assignment and allow the authorized manager to reconcile it later.

Support partial payments and multiple payments against one invoice if the existing billing model allows them.

Keep the following distinct:
- Rent invoiced.
- Rent collected.
- Outstanding rent.
- Security deposits.
- Expenses.
- Transfers.
- Owner distributions.
- Agency fees.

Security deposits must not automatically be treated as rental income. Owner distributions and internal transfers must not be counted as operating expenses a second time.

## 2.6. Property-level profitability

Every property/building should have a financial overview.

Show:
- Rent billed and collected over the selected period.
- Outstanding tenant balances.
- Other property income.
- Operating expenses.
- Net operating income.
- Agency management fees.
- Owner share and amounts payable.
- Amounts actually remitted to the owner.
- Transaction and expense history.

Where appropriate, allow drilling down to individual apartments.

Define net operating income as property operating income minus property operating expenses, before owner distributions and other financing or accounting adjustments. Make the calculation rules explicit and consistent across reports.

Support comparisons across properties and monthly or annual trends.

## 2.7. Owner and agency revenue sharing

Some agencies manage properties on behalf of owners. The system must distinguish rental income collected on behalf of an owner from the agency's own revenue.

Support configurable management arrangements, including:

- Percentage of rent collected.
- Percentage of rent due, if the agreement specifies this basis.
- Fixed management fee.
- Other explicitly configured arrangements where needed.

Store the agreement's effective dates and calculation basis.

For each property and accounting period, show:
- Rent collected.
- Expenses chargeable to the owner.
- Expenses chargeable to the agency.
- Management fee calculated.
- Other agreed deductions or adjustments.
- Net amount payable to the owner.
- Amount already remitted.
- Remaining amount payable.

Do not assume all expenses are deducted from the owner's share. Their allocation must follow the configured agreement.

A management statement should explain the calculation line by line and allow the manager to review it before finalizing the period.

## 2.8. Owner distributions and settlement records

Allow the manager to record a distribution/remittance to a property owner.

Each settlement should include:
- Owner.
- Relevant property or properties.
- Accounting period.
- Amount.
- Date.
- Source payment account.
- Reference and notes.
- Related owner statement.

A settlement reduces the outstanding amount payable to the owner. It must not reduce property operating income a second time.

Do not allow the same settlement to be applied twice.

## 2.9. Financial reports and exports

Provide:
- Monthly income/expense report.
- Property profitability report.
- Account balance and transaction report.
- Outstanding rent report.
- Owner settlement statement.
- Agency management-fee report.
- CSV export for relevant transaction tables.

Make report periods and filters explicit. Financial figures should be traceable to their source transactions.

# Cross-cutting requirements

## Permissions and data isolation

Inspect the existing organization, owner and manager permission model.

Ensure that users can only access financial accounts, properties, tenants, prospects and transactions authorized for their organization and role.

An agency must not see another agency's prospects, owner statements or financial accounts. Where a property belongs to an owner managed by an agency, enforce the existing ownership and management permissions.

## Data integrity

- Use database transactions for multi-step conversions and financial operations.
- Use unique references and idempotency controls for payment-derived records.
- Prevent overlapping confirmed rental allocations.
- Validate amounts, dates, relationships and permissions server-side.
- Preserve financial audit history.
- Avoid storing payment credentials or unnecessary sensitive account details.
- Never fabricate account balances or payment confirmations.

## User interface

Keep the interface practical for property managers, not accountants.

Use clear French terminology where the application is localized, including:
- Prospects.
- Biens immobiliers.
- Immeubles.
- Appartements.
- Loyers encaissés.
- Charges et dépenses.
- Honoraires de gestion.
- Solde à reverser au propriétaire.
- Règlements propriétaires.
- Comptes financiers.

Use progressive disclosure: a concise overview first, with detailed transactions, allocation calculations and reconciliation available when needed.

## Implementation sequence

Implement in manageable stages:

1. Audit the existing data model and report proposed schema changes.
2. Build prospect CRUD, search, statuses and contact actions.
3. Add apartment matching, visits and safe prospect-to-tenant conversion.
4. Build financial accounts and manual income/expense recording.
5. Connect existing rent invoices and confirmed payments to financial records.
6. Add property profitability, agency fees and owner settlement statements.
7. Add reports, exports, permissions and automated tests.

Before implementing the accounting module, propose a clear financial data model and calculation rules. Do not begin by creating dashboard cards with hardcoded or incomplete calculations.

At each stage, preserve existing functionality and run the relevant tests.
