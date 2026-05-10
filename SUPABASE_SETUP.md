# Supabase Setup

Run this SQL in Supabase SQL Editor:

```sql
create table if not exists public.orders (
  id text primary key,
  customer_token text not null,
  customer_name text,
  phone text,
  type text,
  address text,
  note text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  prep_minutes int not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text
);

create table if not exists public.menu_items (
  name text primary key,
  category_id text,
  category text,
  is_available boolean not null default true
);

create table if not exists public.order_history (
  id text primary key,
  customer_name text,
  phone text,
  type text,
  status text,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
```

## Environment

Copy `.env.example` to `.env` and fill:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- optional `DASHBOARD_PASSWORD`

Then restart app:

```bash
npm start
```
