# Implement Manual SaaS Subscription Management

Implement a complete subscription and manual payment management system for the existing application.

## Context

Since we are having trouble finding a good payment solution provider to integrate, let's implement a manual subscription model.For payments happen outside the application. Users may pay through Wave, Orange Money, another mobile money service, or cash.&#x20;

An administrator must be able to verify payments manually and activate or extend subscriptions accordingly. So we will need an admin dashboard to control the current agencies/owners subscription. Not their tenants.&#x20;

**Important:** This is a manual payment system, not a simulated payment gateway. Never automatically activate a subscription merely because a user claims to have paid or uploads a screenshot.

## 1. Inspect the existing codebase first

Before implementing anything:

- Inspect the existing architecture, database schema, authentication, authorization, and organization/tenant model.
- Identify how users, organizations, and their resources are associated.
- Identify existing billing, subscription, payment, or role-management functionality.
- Reuse the existing conventions, libraries, UI components, and patterns.
- Avoid introducing new dependencies or duplicating existing functionality unnecessarily.
- Determine whether subscriptions should belong to individual users or organizations. For this SaaS, an agency or owner account should generally have one subscription covering its organization and associated users, unless the existing architecture dictates otherwise.

Do not replace existing architecture or refactor unrelated functionality.

## 2. Subscription plans

Implement configurable subscription plans with the following properties:

- Name and description.
- Monthly price in XOF (FCFA).
- Annual price in XOF (FCFA).
- Billing interval.
- Features or limits, if the application already supports feature entitlements.
- Active/inactive status.

Do not hardcode plan prices throughout the application. Store plan configuration in the database or reuse an existing configuration mechanism.

If the application already has a plan management system, extend it rather than creating a duplicate.

## 3. Subscription lifecycle

Support the following statuses where appropriate:

- `trialing`: User is within a free trial.
- `pending_payment`: The user has requested a subscription or renewal and payment is awaiting confirmation.
- `active`: A verified payment covers the current subscription period.
- `past_due`: The subscription has expired or payment is overdue.
- `suspended`: Access has been restricted by an administrator or subscription policy.
- `cancelled`: The subscription has been cancelled or is scheduled not to renew, according to the existing billing model.

Keep subscription status separate from payment status. A pending renewal must not invalidate an already-paid subscription period.

Store at least:

- Organization or account ID.
- Plan ID.
- Subscription status.
- Current period start and end dates.
- Trial end date, when applicable.
- Cancellation or suspension information, when applicable.
- Created and updated timestamps.

Use consistent date and timezone handling. The subscription period must be based on confirmed payments, not merely on when the user requested renewal.

### Subscription period rules

- A new subscription starts when the administrator confirms payment.
- A monthly subscription covers one calendar month from the activation date.
- An annual subscription covers one calendar year from the activation date.
- When a customer renews before expiration, extend the existing paid-through date rather than starting a new period immediately.
- When a customer renews after expiration, start the new period from the appropriate activation date.
- Handle month-end dates correctly, including subscriptions activated on the 29th, 30th, or 31st.
- Do not allow duplicate payment confirmations to extend a subscription more than once.

## 4. Manual payment instructions

Create a configurable payment-instructions section that administrators can manage.

Support payment methods such as:

- Wave.
- Orange Money.
- Other mobile money services.
- Cash.

For mobile money, allow configuration of the payment recipient's display name, phone number, and any additional instructions.

For cash payments, allow configuration of the collection instructions.

Users must see the appropriate payment instructions when selecting a plan or requesting renewal.

Display the expected amount, selected plan, billing period, and a unique reference for the payment request.

Do not expose sensitive administrator information or permit ordinary users to modify payment instructions.

## 5. User subscription and payment flow

Implement the following flow:

1. An authenticated user views available plans and their prices in FCFA.
2. The user selects a plan and billing interval.
3. The application creates a payment request with a unique reference.
4. The application displays the amount, payment instructions, reference, and current request status.
5. The user makes the payment outside the application.
6. The user can optionally submit a payment notification containing:
   - Payment method.
   - Transaction reference, if available.
   - Payment date.
   - Optional note.
   - Optional payment receipt or screenshot, if file uploads are already supported securely.
7. The payment request enters a pending verification state.
8. An administrator reviews the request and verifies the payment independently.
9. The administrator confirms or rejects the request.
10. Upon confirmation, the application records the payment and activates or extends the subscription.
11. The user can view the outcome and their current subscription period.

A submitted payment notification is not proof of payment. A screenshot must never trigger automatic activation.

Allow users with an existing active subscription to request renewal without losing their current access while the payment is being verified.

Prevent multiple unresolved requests from creating inconsistent subscription state. If multiple requests are allowed, handle them independently and ensure each payment can only be applied once.

## 6. Administrator interface

Implement an administrator-only billing section.

### Overview

Display useful operational information, including:

- Number of active subscriptions.
- Number of pending payment requests.
- Number of expired subscriptions.
- Recent confirmed payments.
- Upcoming subscription expirations, where useful.

### Payment requests

Provide a table or list with:

- Organization/account.
- Contact information, where available.
- Selected plan and billing interval.
- Expected amount.
- Payment method.
- Payment reference.
- Submission date.
- Current payment status.

Provide filters for status, payment method, and date.

### Payment verification

An administrator must be able to:

- Review the payment request and associated account.
- Record the actual amount received.
- Record the actual payment date.
- Record a transaction reference.
- Add an internal administrative note.
- Confirm a payment.
- Reject a payment with a reason.
- View previous attempts and decisions.

Confirmation must require explicit administrator action.

If the received amount differs from the expected amount, flag the discrepancy and require an explicit decision rather than silently activating the subscription.

### Subscription management

Allow authorized administrators to:

- View subscriptions and their history.
- Assign or change a plan.
- Activate a subscription following verified payment.
- Extend a subscription when justified.
- Suspend and reactivate a subscription.
- Record an administrative reason for manual adjustments.
- View associated payment records.

Any manual activation or extension without a corresponding confirmed payment must be explicitly identified as an administrative adjustment and audited.

## 7. Access control and subscription enforcement

Integrate subscription checks into the existing authorization system.

- Only authorized organization members should access their organization's subscription information and payment requests.
- Only administrators with the appropriate privileges can verify payments, manage plans, or modify subscriptions.
- Enforce access restrictions on the server/API, not only in the frontend.
- Do not let users bypass restrictions by directly calling protected endpoints.
- Preserve access to login, subscription management, payment instructions, and account support when a subscription expires.
- Allow a configurable grace period before restricting premium functionality.
- Do not delete an organization's data when its subscription expires or is suspended.
- Restrict only the features that require an active subscription, in accordance with the application's existing authorization model.

If there is no existing entitlement or subscription guard mechanism, implement a small reusable mechanism that can be applied consistently to protected features.

Avoid unnecessarily blocking read-only access to essential account or billing information.

## 8. Notifications and reminders

Implement notifications using the application's existing notification infrastructure, if available.

Support:

- Payment request submitted.
- Payment confirmed.
- Payment rejected, including the reason.
- Subscription activated.
- Subscription approaching expiration.
- Subscription expired.
- Subscription suspended or reactivated.

For now, in-app notifications are sufficient if no email or SMS infrastructure exists.

If scheduled jobs are available, implement configurable expiration reminders, for example 7 days and 1 day before expiration, and an expiration notification.

Do not introduce an unreliable frontend timer as a substitute for server-side scheduled jobs. If scheduled jobs are not available, document the required mechanism and implement the reminder logic in a reusable service.

## 9. Data integrity and auditability

Treat payment verification as a critical financial operation.

- Use database transactions when recording a confirmed payment and updating the subscription.
- Ensure payment confirmation is idempotent.
- Enforce authorization and validate all monetary amounts and dates server-side.
- Store monetary amounts as integers in XOF where appropriate; do not use floating-point arithmetic for currency.
- Record who confirmed, rejected, or manually adjusted a payment.
- Maintain an immutable history of payment decisions and subscription adjustments, using the project's existing audit conventions.
- Prevent a rejected or already-confirmed payment request from being confirmed again.
- Never trust a client-provided amount, plan price, organization ID, or subscription expiration date without server-side validation.
- Do not store mobile money PINs, OTPs, or other payment credentials.
- Validate uploaded receipts if receipt uploads are implemented, including file type, size, and access permissions.

Keep the design provider-independent so a payment gateway can be added later without replacing the subscription domain model.

## 10. UI and UX requirements

Follow the application's existing design system and conventions.

The subscription page should clearly communicate:

- Current plan.
- Subscription status.
- Expiration date or paid-through date.
- Available plans and prices.
- Renewal action.
- Payment instructions.
- Pending payment requests and their status.
- Payment history.

Use clear statuses and actionable error messages. Make the workflow usable on mobile devices, since many users will access the service through their phones.

Do not build a fake checkout page or display a payment as successful before administrator verification.

## 11. Testing

Add tests using the existing testing framework.

At minimum, test:

- New subscription activation after payment confirmation.
- Monthly and annual period calculations.
- Renewals before and after expiration.
- Month-end and leap-year date calculations.
- Pending payments not granting paid access.
- Rejected payments not granting paid access.
- Duplicate confirmation prevention.
- Incorrect amount handling.
- Authorization boundaries between organizations.
- Administrator-only payment verification.
- Subscription expiration and grace-period enforcement.
- Concurrent or repeated confirmation requests.
- Audit records for confirmations and manual adjustments.

## 12. Implementation approach

Implement this in logical stages:

1. Inspect the codebase and summarize the existing architecture and relevant models.
2. Propose the minimal schema changes and subscription lifecycle.
3. Implement database changes and domain services.
4. Implement payment requests and user-facing subscription flows.
5. Implement administrator payment verification and subscription management.
6. Integrate access enforcement and notifications.
7. Add tests and verify existing functionality.

Follow the repository's established migration, validation, error-handling, and API conventions.

Do not stop after producing a plan. Proceed with implementation, run the relevant tests and checks, and report what was implemented, any migration or environment steps required, and any remaining limitations.

Avoid unrelated refactoring. If an important architectural detail is unclear, inspect the codebase and make the most conservative decision consistent with the existing implementation.
