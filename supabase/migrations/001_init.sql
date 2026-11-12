create extension if not exists pgcrypto;

create table if not exists profiles (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    full_name text not null,
    phone text,
    role text not null check (role in ('ADMIN','OFFICE_ADMIN','TECHNICIAN')),
    employment_status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists customers (
    id uuid primary key default gen_random_uuid(),
    customer_id text not null unique,
    full_name text not null,
    customer_type text not null check (customer_type in ('Residential','Commercial')),
    contact_person text,
    phone text,
    email text,
    address text,
    suburb text,
    city text,
    province text,
    postal_code text,
    notes text,
    date_added timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists equipment (
    id uuid primary key default gen_random_uuid(),
    equipment_id text not null unique,
    customer_id uuid references customers(id) on delete set null,
    installation_address text,
    category text not null,
    manufacturer text,
    model text,
    serial_number text,
    quantity integer not null default 1,
    installation_date date,
    warranty_expiry date,
    condition text not null default 'Good',
    status text not null default 'Active',
    technician_id uuid references profiles(id),
    notes text,
    associated_job_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists jobs (
    id uuid primary key default gen_random_uuid(),
    job_reference text not null unique,
    customer_id uuid references customers(id) on delete set null,
    category text not null,
    description text,
    site_address text,
    priority text not null default 'Medium',
    assigned_technician_id uuid references profiles(id),
    scheduled_date date,
    scheduled_time text,
    status text not null default 'New',
    equipment_list jsonb,
    customer_instructions text,
    internal_notes text,
    completion_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists job_assignments (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references jobs(id) on delete cascade,
    technician_id uuid not null references profiles(id) on delete cascade,
    assigned_at timestamptz not null default now(),
    unique (job_id, technician_id)
);

create table if not exists job_notes (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references jobs(id) on delete cascade,
    author_id uuid references profiles(id),
    note text not null,
    created_at timestamptz not null default now()
);

create table if not exists quotations (
    id uuid primary key default gen_random_uuid(),
    quotation_reference text not null unique,
    customer_id uuid references customers(id) on delete set null,
    date_issued date not null default now(),
    expiry_date date,
    description text,
    status text not null default 'Draft',
    terms text,
    vat_enabled boolean not null default false,
    vat_rate numeric(5,2) not null default 0,
    total numeric(12,2) not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists quotation_items (
    id uuid primary key default gen_random_uuid(),
    quotation_id uuid not null references quotations(id) on delete cascade,
    product_service text not null,
    quantity integer not null default 1,
    unit_price numeric(12,2) not null default 0,
    discount numeric(12,2) not null default 0,
    subtotal numeric(12,2) not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists maintenance_agreements (
    id uuid primary key default gen_random_uuid(),
    agreement_reference text not null unique,
    customer_id uuid references customers(id) on delete set null,
    start_date date,
    end_date date,
    service_frequency text not null,
    next_service_date date,
    maintenance_price numeric(12,2) not null default 0,
    covered_equipment text,
    status text not null default 'Pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists maintenance_visits (
    id uuid primary key default gen_random_uuid(),
    agreement_id uuid references maintenance_agreements(id) on delete cascade,
    job_id uuid references jobs(id) on delete set null,
    visit_date date,
    status text not null default 'Scheduled',
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists invoices (
    id uuid primary key default gen_random_uuid(),
    invoice_reference text not null unique,
    customer_id uuid references customers(id) on delete set null,
    job_id uuid references jobs(id) on delete set null,
    quotation_id uuid references quotations(id) on delete set null,
    invoice_date date not null default now(),
    due_date date,
    subtotal numeric(12,2) not null default 0,
    vat numeric(12,2) not null default 0,
    total numeric(12,2) not null default 0,
    amount_paid numeric(12,2) not null default 0,
    outstanding_balance numeric(12,2) not null default 0,
    payment_status text not null default 'Draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists invoice_items (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references invoices(id) on delete cascade,
    description text not null,
    quantity integer not null default 1,
    unit_price numeric(12,2) not null default 0,
    discount numeric(12,2) not null default 0,
    subtotal numeric(12,2) not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references invoices(id) on delete cascade,
    payment_date date not null default now(),
    amount numeric(12,2) not null default 0,
    payment_method text not null check (payment_method in ('EFT','Cash','Card','Other')),
    reference text,
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists staff (
    id uuid primary key default gen_random_uuid(),
    staff_id text not null unique,
    full_name text not null,
    phone text,
    email text not null unique,
    role text not null,
    employment_status text not null default 'Active',
    date_joined date,
    skills text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references profiles(id),
    title text not null,
    message text not null,
    type text not null,
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid references customers(id) on delete set null,
    job_id uuid references jobs(id) on delete set null,
    document_name text not null,
    document_type text not null,
    storage_path text not null,
    uploaded_by uuid references profiles(id),
    created_at timestamptz not null default now()
);

create table if not exists company_settings (
    id uuid primary key default gen_random_uuid(),
    company_name text not null default 'Access Surveillance',
    company_logo_url text,
    business_address text,
    phone text,
    email text,
    website text,
    company_registration text,
    vat_registration_status boolean not null default false,
    vat_registration_number text,
    quotation_terms text,
    invoice_terms text,
    default_quotation_expiry_days integer not null default 14,
    default_payment_terms text,
    document_numbering text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists activity_logs (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references profiles(id),
    entity_type text not null,
    entity_id text,
    action text not null,
    details jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_customers_customer_id on customers(customer_id);
create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_assigned_technician on jobs(assigned_technician_id);
create index if not exists idx_invoices_customer_id on invoices(customer_id);
create index if not exists idx_notifications_user_id on notifications(user_id);

alter table profiles enable row level security;
alter table customers enable row level security;
alter table equipment enable row level security;
alter table jobs enable row level security;
alter table quotations enable row level security;
alter table maintenance_agreements enable row level security;
alter table invoices enable row level security;
alter table notifications enable row level security;
alter table documents enable row level security;
alter table company_settings enable row level security;

create policy "Profiles are viewable by authenticated users" on profiles
for select using (auth.uid() is not null);

create policy "Customers are read-write for authenticated users" on customers
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Jobs are read-write for authenticated users" on jobs
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Invoices are read-write for authenticated users" on invoices
for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Company settings are admin-only" on company_settings
for all using (auth.uid() is not null) with check (auth.uid() is not null);
