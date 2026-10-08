/*
  The one Supabase client the whole app shares.

  The URL and publishable key come from .env.local (Vite only exposes
  variables that start with VITE_). The publishable key is safe in the
  browser: it identifies the project, and the database's row level security
  rules decide what a signed-in user may read or write. Never put the secret
  key here.
*/
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase settings. Copy .env.example to .env.local and fill it in.');
}

export const supabase = createClient(url, key);
