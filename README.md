# Access Surveillance Business Management App

A production-style access control, security, and maintenance business management application for Access Surveillance in Durban, South Africa.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase client integration
- React Router
- Recharts
- React Hook Form + Zod
- jsPDF
- PWA support via Vite PWA

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local environment file:
   ```bash
   copy .env.example .env
   ```
3. Update `.env` with your Supabase values:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   VITE_APP_MODE=demo
   ```
4. Start development:
   ```bash
   npm run dev -- --host 0.0.0.0
   ```

## Supabase configuration

1. Create a new Supabase project.
2. Copy the project URL and anon key into `.env`.
3. If this is a new project, run `supabase/migrations/001_init.sql` once in the Supabase SQL editor.
4. Run `supabase/migrations/002_app_access_policies.sql` to repair profile columns and apply role-based RLS policies. This second migration is safe to rerun. If `role` or `employment_status` is missing, it adds them and gives existing profiles the least-privileged `TECHNICIAN` role.
5. Optionally run `supabase/seed.sql` for starter company configuration.
6. In Authentication, enable email sign-in.
7. Add storage buckets for documents, photos, and signed PDFs if you plan to enable file uploads.

## First administrator account

The application uses real Supabase Auth for sign-in. Complete the following:

1. Create a user in Supabase Authentication with the staff email address.
2. Insert or update a matching row in `public.profiles` with the same email, a full name, and a role (`ADMIN`, `OFFICE_ADMIN`, or `TECHNICIAN`). If the migration assigned `TECHNICIAN` by default, change the role of the trusted administrator in the Supabase SQL editor.
3. Give only a trusted user the `ADMIN` role, then log in with the Auth email and password.
4. The app requires the profile to have `employment_status = 'active'`.

The app loads all 18 application tables from the initial schema into the admin-only **Data manager**. Admins can browse the tables and add, edit, or delete rows subject to the configured RLS policies; activity logs are read-only, and profile creation/deletion stays tied to Auth provisioning. The business pages load customer, equipment, job, quotation, maintenance, invoice, and staff records; their forms save changes to Supabase. Payments and related child records are managed from the Data manager. Reports are calculated from the loaded records.

Demo credentials are not used in production mode; they are only retained as a local fallback when Supabase is not configured.

## Deployment

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. Deploy the `dist/` output to a static host such as Vercel, Netlify, or Cloudflare Pages.
3. Add the same environment variables to your production deployment.
4. Ensure Supabase security policies and storage buckets are configured before production use.

## Important limitations

When Supabase is configured, the app uses database-backed records instead of demo data. Without Supabase configuration it keeps a local demo fallback. Remaining work before a full production deployment includes:

- staff invitations and Supabase Auth user provisioning (adding a staff directory record does not create an Auth account)
- live storage uploads and signed URLs
- real notification/email/WhatsApp automation
- automated payment reconciliation and advanced reporting

## Expansion guidance

- Keep business logic in reusable service modules under `src/`.
- Add each feature as a route and connected data panel.
- Extend the Supabase schema with more tables and policies as the business grows.
- Replace demo state with real database queries once Supabase is connected.
