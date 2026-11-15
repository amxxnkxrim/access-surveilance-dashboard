create table if not exists public.job_expenses (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    expense_date date not null default current_date,
    category text not null,
    description text,
    amount numeric(12,2) not null check (amount > 0),
    created_at timestamptz not null default now()
);

create index if not exists idx_job_expenses_job_date
    on public.job_expenses(job_id, expense_date);

alter table public.job_expenses enable row level security;

drop policy if exists app_job_expenses_all on public.job_expenses;
create policy app_job_expenses_all on public.job_expenses
for all to authenticated
using (public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN'))
with check (
    public.app_current_role() in ('ADMIN', 'OFFICE_ADMIN')
    and exists (select 1 from public.jobs as j where j.id = job_expenses.job_id)
);

grant select, insert, update, delete on public.job_expenses to authenticated;
