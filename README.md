# Mess Manager

A responsive, installable mess-management PWA backed by Supabase PostgreSQL and Supabase Auth. It supports Admin and Member roles, daily meals, bazar costs, deposits, utility sharing, bazar schedules, monthly settlements, reports, settings, and audit activity.

## Architecture

Business data is no longer stored in browser `localStorage`. The browser uses the Supabase publishable/anon key; PostgreSQL Row Level Security (RLS) is the authorization boundary. Supabase Auth may persist its managed refresh session in browser storage by design, but passwords and application records are never stored there.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the audited legacy design, schema map, security decisions, and staged rollout plan.

## Setup

1. Create a Supabase project and install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
2. Link the project and apply the schema:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. In Supabase Auth, create the initial admin user. Run the two commented bootstrap statements at the bottom of `supabase/migrations/202608070001_initial_schema.sql`, using that Auth user's UUID.
4. Replace the placeholders in `config.js` (or generate it during deployment) with the project URL and **publishable/anon** key. Never place a service-role key in frontend files.
5. Serve the repository over HTTP:

   ```bash
   python3 -m http.server 8080
   ```

6. Open `http://localhost:8080`. Production must use HTTPS for full PWA behavior.

## Authentication and member onboarding

There are no demo PINs or client-side credentials. Users sign in with Supabase email/password authentication and can request a password reset. A user also needs an active `members` row whose `user_id` points to their Auth UUID. Admins can manage member profiles and roles in the app; creating/inviting Auth identities should happen through the Supabase dashboard or a server-side Edge Function so privileged keys never reach the browser.

Recommended production Auth settings include confirmed email, MFA for admins, leaked-password protection, appropriate rate limits, and exact redirect allow-list entries.

## Security notes

* Apply the migration before using a browser key; every business table has RLS enabled.
* Role checks in JavaScript only tailor the UI. Database policies enforce the actual permissions.
* Do not commit real project credentials if the repository is public. Inject `config.js` in the deployment pipeline.
* Test policies using distinct admin/member accounts and a second mess before launch.
