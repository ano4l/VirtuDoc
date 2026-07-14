# Supabase backend

This folder contains the hosted Postgres target schema for VirtuDoc.

Apply it to a linked Supabase project:

```powershell
supabase link --project-ref <project-ref>
supabase db push
```

For a direct SQL apply, run `supabase/migrations/20260712000000_init_virtudoc.sql` in the Supabase SQL editor.

Current runtime note: the application still uses the local SQLite store by default. The Supabase schema is ready for the durable database cutover; keep Vercel deployments in preview mode or run production on a persistent runtime such as Railway until the Postgres store adapter replaces SQLite.

