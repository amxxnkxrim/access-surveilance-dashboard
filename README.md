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
5. Run `supabase/migrations/003_job_expenses.sql` to add the job expense ledger and its admin-only row-level security policy.
6. Optionally run `supabase/seed.sql` for starter company configuration.
7. In Authentication, enable email sign-in.
8. Add storage buckets for documents, photos, and signed PDFs if you plan to enable other file uploads.

### Profit and AI document extraction

The **Profit & expenses** page calculates monthly billed net profit (invoice subtotal excluding VAT, less job expenses) and cash net profit (payments received, less job expenses), plus both figures per job. Expenses must be assigned to a job and use their expense date for monthly totals. Add itemized expenses from the separate **Add job expenses** screen. Opening a job in **Jobs** shows a read-only expense summary with a client-ready PDF download; the summary has no entry or edit controls. The Profit & expenses summary shows the expense ledger before the AI business advisor. The advisor receives only the selected month's totals, expense categories, job references, and the user's question; customer names and invoice images are not included.

To enable invoice/receipt extraction, install the Supabase CLI, set the Gemini API key as a server-side secret, and deploy the Edge Function:

```bash
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase functions deploy extract-financial-document
```

Never put the Gemini key in a `VITE_*` variable or the browser bundle. When a user chooses **Analyze with Gemini**, the selected image or PDF is sent to Google Gemini for extraction and is not stored by the app. The user must review and confirm the extracted values before an invoice or expense is saved. Manual expense entry remains available without AI extraction.

## First administrator account

The application uses real Supabase Auth for sign-in. Complete the following:

1. Create a user in Supabase Authentication with the staff email address.
2. Insert or update a matching row in `public.profiles` with the same email, a full name, and a role (`ADMIN`, `OFFICE_ADMIN`, or `TECHNICIAN`). If the migration assigned `TECHNICIAN` by default, change the role of the trusted administrator in the Supabase SQL editor.
3. Give only a trusted user the `ADMIN` role, then log in with the Auth email and password.
4. The app requires the profile to have `employment_status = 'active'`.

The app loads all 18 application tables from the initial schema into the admin-only **Data manager**. Admins can browse the tables and add, edit, or delete rows subject to the configured RLS policies; activity logs are read-only, and profile creation/deletion stays tied to Auth provisioning. The business pages load customer, equipment, job, quotation, maintenance, invoice, and staff records; their forms save changes to Supabase. Payments and related child records are managed from the Data manager. Reports are calculated from the loaded records.

Demo credentials are not used in production mode; they are only retained as a local fallback when Supabase is not configured.

## Deployment

### Quick publish with Netlify Drop

1. Make sure `.env` contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These Vite values are included in the public frontend bundle; never use a Supabase `service_role` key in the app.
2. In the project folder, run:
   ```bash
   npm.cmd run build
   ```
3. Sign in to Netlify Drop at `https://app.netlify.com/drop` and drag the generated `dist/` folder onto the page.
4. Open the Netlify URL on each phone. In the mobile browser menu, choose **Add to Home Screen** to install it like an app.
5. In Supabase Authentication URL configuration, set the Netlify URL as the Site URL and add it to the allowed redirect URLs.

The `public/_redirects` file keeps client-side routes such as `/jobs` working when a phone opens or refreshes a deep link. To publish later code changes, build again and upload the new `dist/` folder. For automatic deploys on every code change, connect a Git repository to Netlify or Vercel and set the same two `VITE_SUPABASE_*` variables in the host's environment settings.

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
