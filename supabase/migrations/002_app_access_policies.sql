-- Repair profiles created before full_name was part of the schema.
alter table public.profiles
    add column if not exists full_name text;

-- Older manually-created profile tables may not include the app access fields.
-- New or existing profiles default to the least-privileged application role.
alter table public.profiles
    add column if not exists role text not null default 'TECHNICIAN',
    add column if not exists employment_status text not null default 'active';

update public.profiles
set full_name = coalesce(nullif(btrim(full_name), ''), nullif(btrim(email), ''), id::text)
where full_name is null or btrim(full_name) = '';

alter table public.profiles
    alter column full_name set not null;

-- Resolve the application role from the authenticated user's email. Inactive
-- or unprovisioned users have no application role and therefore no app access.
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
    select p.role
    from public.profiles as p
    where lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
      and lower(btrim(coalesce(p.employment_status, ''))) = 'active'
      and p.role in ('ADMIN', 'OFFICE_ADMIN', 'TECHNICIAN')
    limit 1
$function$;

revoke all on function public.app_current_role() from public;
revoke all on function public.app_current_role() from anon;
revoke all on function public.app_current_role() from authenticated;
grant execute on function public.app_current_role() to authenticated;

-- Apply RLS consistently to every application table.
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.equipment enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_notes enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.maintenance_agreements enable row level security;
alter table public.maintenance_visits enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.staff enable row level security;
alter table public.notifications enable row level security;
alter table public.documents enable row level security;
alter table public.company_settings enable row level security;
alter table public.activity_logs enable row level security;

-- Remove the permissive policies from 001_init.sql and make this migration
-- repeatable by replacing each policy it owns.
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Customers are read-write for authenticated users" on public.customers;
drop policy if exists "Jobs are read-write for authenticated users" on public.jobs;
drop policy if exists "Invoices are read-write for authenticated users" on public.invoices;
drop policy if exists "Company settings are admin-only" on public.company_settings;

drop policy if exists app_profiles_select on public.profiles;
drop policy if exists app_profiles_insert on public.profiles;
drop policy if exists app_profiles_update on public.profiles;
drop policy if exists app_profiles_delete on public.profiles;
drop policy if exists app_customers_all on public.customers;
drop policy if exists app_equipment_all on public.equipment;
drop policy if exists app_jobs_all on public.jobs;
drop policy if exists app_job_assignments_all on public.job_assignments;
drop policy if exists app_job_notes_all on public.job_notes;
drop policy if exists app_quotations_all on public.quotations;
drop policy if exists app_quotation_items_all on public.quotation_items;
drop policy if exists app_maintenance_agreements_all on public.maintenance_agreements;
drop policy if exists app_maintenance_visits_all on public.maintenance_visits;
drop policy if exists app_invoices_all on public.invoices;
drop policy if exists app_invoice_items_all on public.invoice_items;
drop policy if exists app_payments_all on public.payments;
drop policy if exists app_staff_all on public.staff;
drop policy if exists app_notifications_select on public.notifications;
drop policy if exists app_notifications_insert on public.notifications;
drop policy if exists app_notifications_update on public.notifications;
drop policy if exists app_notifications_delete on public.notifications;
drop policy if exists app_documents_all on public.documents;
drop policy if exists app_company_settings_all on public.company_settings;
drop policy if exists app_activity_logs_select on public.activity_logs;
drop policy if exists app_activity_logs_insert on public.activity_logs;

-- The profile directory is available to active signed-in staff for assignment
-- labels. Only administrative roles can change profile records.
create policy app_profiles_select on public.profiles
for select to authenticated
using (public.app_current_role() is not null);

create policy app_profiles_insert on public.profiles
for insert to authenticated
with check (public.app_current_role() = 'ADMIN');

create policy app_profiles_update on public.profiles
for update to authenticated
using (public.app_current_role() = 'ADMIN')
with check (public.app_current_role() = 'ADMIN');

create policy app_profiles_delete on public.profiles
for delete to authenticated
using (public.app_current_role() = 'ADMIN');

-- Customer, quotation, invoice, staff, and settings administration.
create policy app_customers_all on public.customers
for all to authenticated
using (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'))
with check (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'));

create policy app_quotations_all on public.quotations
for all to authenticated
using (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'))
with check (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'));

create policy app_invoices_all on public.invoices
for all to authenticated
using (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'))
with check (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'));

create policy app_staff_all on public.staff
for all to authenticated
using (public.app_current_role() = 'ADMIN')
with check (public.app_current_role() = 'ADMIN');

create policy app_company_settings_all on public.company_settings
for all to authenticated
using (public.app_current_role() = 'ADMIN')
with check (public.app_current_role() = 'ADMIN');

-- Active authenticated staff may manage jobs, equipment, and maintenance.
create policy app_jobs_all on public.jobs
for all to authenticated
using (public.app_current_role() is not null)
with check (public.app_current_role() is not null);

create policy app_equipment_all on public.equipment
for all to authenticated
using (public.app_current_role() is not null)
with check (public.app_current_role() is not null);

create policy app_maintenance_agreements_all on public.maintenance_agreements
for all to authenticated
using (public.app_current_role() is not null)
with check (public.app_current_role() is not null);

-- Child rows inherit access from their parent row.
create policy app_job_assignments_all on public.job_assignments
for all to authenticated
using (
    exists (select 1 from public.jobs as j where j.id = job_assignments.job_id)
)
with check (
    exists (select 1 from public.jobs as j where j.id = job_assignments.job_id)
);

create policy app_job_notes_all on public.job_notes
for all to authenticated
using (
    exists (select 1 from public.jobs as j where j.id = job_notes.job_id)
)
with check (
    exists (select 1 from public.jobs as j where j.id = job_notes.job_id)
);

create policy app_quotation_items_all on public.quotation_items
for all to authenticated
using (
    exists (select 1 from public.quotations as q where q.id = quotation_items.quotation_id)
)
with check (
    exists (select 1 from public.quotations as q where q.id = quotation_items.quotation_id)
);

create policy app_maintenance_visits_all on public.maintenance_visits
for all to authenticated
using (
    (agreement_id is not null and exists (
        select 1 from public.maintenance_agreements as ma where ma.id = maintenance_visits.agreement_id
    ))
    or (job_id is not null and exists (
        select 1 from public.jobs as j where j.id = maintenance_visits.job_id
    ))
)
with check (
    (agreement_id is not null and exists (
        select 1 from public.maintenance_agreements as ma where ma.id = maintenance_visits.agreement_id
    ))
    or (job_id is not null and exists (
        select 1 from public.jobs as j where j.id = maintenance_visits.job_id
    ))
);

create policy app_invoice_items_all on public.invoice_items
for all to authenticated
using (
    exists (select 1 from public.invoices as i where i.id = invoice_items.invoice_id)
)
with check (
    exists (select 1 from public.invoices as i where i.id = invoice_items.invoice_id)
);

create policy app_payments_all on public.payments
for all to authenticated
using (
    exists (select 1 from public.invoices as i where i.id = payments.invoice_id)
)
with check (
    exists (select 1 from public.invoices as i where i.id = payments.invoice_id)
);

create policy app_notifications_select on public.notifications
for select to authenticated
using (
    exists (
        select 1
        from public.profiles as p
        where p.id = notifications.user_id
          and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and public.app_current_role() is not null
    )
);

create policy app_notifications_insert on public.notifications
for insert to authenticated
with check (
    exists (
        select 1
        from public.profiles as p
        where p.id = notifications.user_id
          and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and public.app_current_role() is not null
    )
);

create policy app_notifications_update on public.notifications
for update to authenticated
using (
    exists (
        select 1
        from public.profiles as p
        where p.id = notifications.user_id
          and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and public.app_current_role() is not null
    )
)
with check (
    exists (
        select 1
        from public.profiles as p
        where p.id = notifications.user_id
          and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and public.app_current_role() is not null
    )
);

create policy app_notifications_delete on public.notifications
for delete to authenticated
using (
    exists (
        select 1
        from public.profiles as p
        where p.id = notifications.user_id
          and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
          and public.app_current_role() is not null
    )
);

-- Documents inherit access from each linked parent. Unlinked documents are
-- limited to their uploader, except for administrative roles.
create policy app_documents_all on public.documents
for all to authenticated
using (
    public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN')
    or (
        public.app_current_role() is not null
        and (customer_id is null or exists (
            select 1 from public.customers as c where c.id = documents.customer_id
        ))
        and (job_id is null or exists (
            select 1 from public.jobs as j where j.id = documents.job_id
        ))
        and (
            customer_id is not null
            or job_id is not null
            or exists (
                select 1
                from public.profiles as p
                where p.id = documents.uploaded_by
                  and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
            )
        )
    )
)
with check (
    public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN')
    or (
        public.app_current_role() is not null
        and (customer_id is null or exists (
            select 1 from public.customers as c where c.id = documents.customer_id
        ))
        and (job_id is null or exists (
            select 1 from public.jobs as j where j.id = documents.job_id
        ))
        and (
            customer_id is not null
            or job_id is not null
            or exists (
                select 1
                from public.profiles as p
                where p.id = documents.uploaded_by
                  and lower(btrim(p.email)) = lower(btrim(auth.jwt() ->> 'email'))
            )
        )
    )
);

create policy app_activity_logs_select on public.activity_logs
for select to authenticated
using (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'));

create policy app_activity_logs_insert on public.activity_logs
for insert to authenticated
with check (public.app_current_role() is not null);
