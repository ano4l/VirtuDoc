create extension if not exists pgcrypto;

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

create table if not exists public.customers (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  country text not null default 'South Africa',
  vat_number text not null default '',
  registration_number text not null default '',
  notes text not null default '',
  vat_registered boolean not null default false,
  currency text not null default 'ZAR',
  terms_days integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text not null default '',
  unit_price_minor integer not null default 0 check (unit_price_minor >= 0),
  tax_bps integer not null default 1500 check (tax_bps between 0 and 10000),
  currency text not null default 'ZAR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_sequences (
  document_type text not null check (document_type in ('invoice', 'quote', 'receipt')),
  year integer not null,
  value integer not null default 0 check (value >= 0),
  primary key (document_type, year)
);

create table if not exists public.documents (
  id text primary key default gen_random_uuid()::text,
  document_type text not null check (document_type in ('invoice', 'quote', 'receipt')),
  number text not null unique,
  number_year integer not null,
  status text not null,
  customer_id text references public.customers(id) on delete set null,
  source_document_id text references public.documents(id) on delete set null,
  recurring_schedule_id text,
  data_json jsonb not null,
  totals_json jsonb not null,
  snapshot_json jsonb,
  amount_paid_minor integer not null default 0 check (amount_paid_minor >= 0),
  balance_due_minor integer not null default 0 check (balance_due_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  finalized_at timestamptz,
  unique (document_type, number_year, number)
);

create table if not exists public.document_audit_events (
  id bigint generated always as identity primary key,
  document_id text not null references public.documents(id) on delete cascade,
  type text not null,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references public.documents(id) on delete cascade,
  receipt_id text references public.documents(id) on delete set null,
  amount_minor integer not null check (amount_minor > 0),
  method text not null,
  reference text not null default '',
  received_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  method_type text not null default 'bank_transfer',
  details_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branding_presets (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  data_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  purpose text primary key,
  subject text not null,
  text text not null,
  html text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id text primary key default gen_random_uuid()::text,
  storage_key text not null unique,
  filename text not null,
  content_type text not null,
  byte_size integer not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.email_delivery_attempts (
  id text primary key default gen_random_uuid()::text,
  document_id text not null references public.documents(id) on delete cascade,
  request_key text not null,
  recipients_json jsonb not null,
  template_purpose text not null references public.email_templates(purpose),
  provider text not null,
  provider_status text not null,
  provider_message_id text,
  provider_error text,
  rendered_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (document_id, request_key)
);

create table if not exists public.reminder_rules (
  id text primary key,
  label text not null,
  offset_days integer not null check (offset_days between -90 and 365),
  purpose text not null references public.email_templates(purpose),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_reminder_deliveries (
  id text primary key default gen_random_uuid()::text,
  document_id text not null references public.documents(id) on delete cascade,
  rule_id text not null references public.reminder_rules(id),
  due_date date not null,
  scheduled_for date not null,
  attempt_id text references public.email_delivery_attempts(id) on delete set null,
  status text not null,
  provider_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, rule_id, due_date)
);

create table if not exists public.recurring_schedules (
  id text primary key default gen_random_uuid()::text,
  source_document_id text references public.documents(id) on delete set null,
  name text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_on date not null,
  ends_on date,
  active boolean not null default true,
  data_json jsonb not null,
  last_run_on date,
  generated_count integer not null default 0 check (generated_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_schedule_runs (
  id text primary key default gen_random_uuid()::text,
  schedule_id text not null references public.recurring_schedules(id) on delete cascade,
  run_date date not null,
  document_id text not null unique references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_id, run_date)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_recurring_schedule_fk'
  ) then
    alter table public.documents
      add constraint documents_recurring_schedule_fk
      foreign key (recurring_schedule_id) references public.recurring_schedules(id) on delete set null;
  end if;
end $$;

create index if not exists documents_type_status_idx on public.documents(document_type, status);
create index if not exists documents_customer_idx on public.documents(customer_id);
create index if not exists document_audit_document_idx on public.document_audit_events(document_id, created_at);
create index if not exists payments_invoice_idx on public.payments(invoice_id, received_date);
create index if not exists email_delivery_document_idx on public.email_delivery_attempts(document_id, created_at);
create index if not exists reminder_due_idx on public.document_reminder_deliveries(document_id, due_date);
create index if not exists recurring_next_run_idx on public.recurring_schedules(active, next_run_on);
