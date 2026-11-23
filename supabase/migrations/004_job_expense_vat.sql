alter table public.job_expenses
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists vat numeric(12,2) not null default 0;
