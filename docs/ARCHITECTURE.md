# Production architecture and delivery plan

## Current-state audit

The original app was a static, single-file PWA. It stored users (including plaintext PINs), sessions, members, meals, bazar entries, deposits, utilities, schedules, and settings in `localStorage`. Authorization existed only in client-side conditionals. The production implementation retains every screen and calculation, but makes Supabase Auth the identity provider and PostgreSQL with row-level security (RLS) the source of truth.

## Architecture

```text
Responsive static PWA
  └─ Supabase JS (publishable/anon key only)
      ├─ Auth: email + password, managed sessions, password reset
      └─ PostgREST: PostgreSQL tables protected by RLS
          ├─ tenant boundary: mess_id
          ├─ authorization: members.role (admin/member)
          └─ audit: activity_logs
```

The browser never receives a service-role key and never decides authorization. UI role checks improve navigation only; RLS is authoritative. Each authenticated user maps to one active `members.user_id`. An admin can create roster placeholders, while linking/inviting Auth users should be done by a trusted Supabase Edge Function or dashboard because creating Auth users requires privileged credentials.

## Relational model

| Table | Purpose and important relationships |
| --- | --- |
| `messes` | Tenant/root record. Every business row is scoped to one mess. |
| `members` | Profile, `auth.users` link, active state, and `admin`/`member` role. This is the roles model. |
| `meals` | One member/day row with enabled state and fractional units. |
| `bazar_entries` | Dated buyer, item description, and food-market cost. |
| `deposits` | Positive member payments with date and note. |
| `utility_bills` | Dated utility expense; many-to-many shares live in `utility_bill_members`. |
| `bazar_schedules` | Dated assignment and pending/done state. |
| `monthly_settlements` | Immutable-ready monthly member totals with draft/finalized lifecycle. |
| `activity_logs` | Append-oriented actor/action/entity metadata audit trail. |

See `supabase/migrations/202608070001_initial_schema.sql` for types, constraints, indexes, helper functions, and all RLS policies.

## Security model

* Supabase Auth performs password hashing, session refresh, password reset, and email verification.
* RLS limits all reads to the caller's mess. Members can change only their own meal rows and see only their deposits/settlements. Admins manage financial and roster data.
* Role and tenant values are read from the database, not user-editable JWT metadata.
* Inputs are validated in the UI and again by PostgreSQL constraints. Text rendered into HTML is escaped.
* The Content Security Policy restricts scripts and connections to the app and Supabase.
* Production deployments should enable email confirmation, MFA for admins, leaked-password protection, rate limits, PITR/backups, and an Edge Function for invitations and finalized-settlement transactions.

## Rollout plan

1. Create separate Supabase projects for staging and production; apply the migration with the Supabase CLI.
2. Create the first Auth user, then bootstrap its mess/member admin row using the commented SQL at the migration's end.
3. Copy `config.example.js` to `config.js` and supply only the project URL and publishable/anon key.
4. Import legacy data with a one-time server-side script, mapping old member IDs to UUIDs; reconcile monthly totals before cutover.
5. Test RLS as both roles, including cross-tenant and direct REST attempts. Enable Auth email confirmation and configure the allowed redirect URL.
6. Deploy over HTTPS, verify PWA install/offline shell behavior, set monitoring/backups, and then freeze the legacy app as read-only.
