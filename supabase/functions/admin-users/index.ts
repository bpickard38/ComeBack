import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const roles = new Set(['athlete', 'trainer', 'coach', 'admin']);

function inviteErrorMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return 'This email already has an account. Edit the existing user instead.';
  }
  if (lower.includes('email') && (lower.includes('invalid') || lower.includes('not valid') || lower.includes('malformed') || lower.includes('format'))) {
    return 'The email address is invalid. Enter a real, deliverable email address.';
  }
  if (lower.includes('rate limit')) {
    return 'Supabase has temporarily limited invitation emails. Try again later or configure a custom Auth email provider.';
  }
  if (lower.includes('email') || lower.includes('smtp') || lower.includes('send')) {
    return 'Supabase could not deliver the invitation. Check that this is a real, deliverable email address. If it is correct, check the Supabase Auth email provider settings.';
  }
  return message;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'Server is missing Supabase configuration.' }, 500);

  const authorization = request.headers.get('Authorization');
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in as an admin to continue.' }, 401);

  const callerClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !caller) return json({ error: 'Your session is not valid. Sign in again.' }, 401);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerProfile, error: profileError } = await adminClient.from('users').select('role').eq('id', caller.id).maybeSingle();
  if (profileError || callerProfile?.role !== 'admin') return json({ error: 'Admin access is required.' }, 403);

  let input: { action?: string; id?: string; name?: string; email?: string; phone?: string | null; role?: string };
  try { input = await request.json(); } catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  const action = input.action;

  if (action === 'create') {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const role = input.role;
    if (!name || !email || !role || !roles.has(role)) return json({ error: 'Name, email, and a valid role are required.' }, 400);
    // Use the app origin that made this authenticated request. Supabase only
    // honors it when that origin is in Authentication > URL Configuration.
    const origin = request.headers.get('origin');
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { name, role },
      ...(origin ? { redirectTo: `${origin}/invite` } : {}),
    });
    if (error || !data.user) return json({ error: inviteErrorMessage(error?.message ?? 'Could not invite this user.') }, 400);
    // New-user triggers assign only self-service roles. Set the requested role
    // here after the Auth user exists, including admin, using the service key.
    const { error: updateError } = await adminClient.from('users').update({ name, email, phone: input.phone?.trim() || null, role }).eq('id', data.user.id);
    if (updateError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return json({ error: `Profile setup failed: ${updateError.message}` }, 500);
    }
    return json({ id: data.user.id });
  }

  if (!input.id) return json({ error: 'User ID is required.' }, 400);
  if (action === 'update') {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const role = input.role;
    if (!name || !email || !role || !roles.has(role)) return json({ error: 'Name, email, and a valid role are required.' }, 400);
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(input.id, { email, user_metadata: { name, role } });
    if (authUpdateError) return json({ error: authUpdateError.message }, 400);
    const { error } = await adminClient.from('users').update({ name, email, phone: input.phone?.trim() || null, role }).eq('id', input.id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (action === 'delete') {
    if (input.id === caller.id) return json({ error: 'You cannot delete your own signed-in admin account.' }, 400);
    const { error } = await adminClient.auth.admin.deleteUser(input.id);
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, 400);
});
