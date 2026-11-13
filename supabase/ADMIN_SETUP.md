# Admin setup

1. Run `admin_role.sql` in the Supabase SQL Editor after `erd_schema.sql` and `signup.sql`.
2. Create the first admin login in Supabase **Authentication → Users**. The existing trigger creates its `public.users` row.
3. Promote that account from the SQL Editor, using its real email:

   ```sql
   update public.users
   set role = 'admin'
   where email = 'admin@example.com';
   ```

   Confirm the update affected exactly one row. Do not add `admin` to the public sign-up choices.
4. Deploy the `admin-users` Edge Function from this project. It uses the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment values. Keep the service role key in Edge Function secrets only; never add it to `.env.local` or browser code.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to the deployed app URL. Add the app URLs to **Redirect URLs**. For local Vite development, add `http://localhost:5173/**`; also add the deployed app URL with `/**`. The invitation function requests a redirect to the app origin that created the invitation, and Supabase only honors it if it is allowlisted.
6. Sign in with the promoted account. Admins land at `/admin`; the shared header includes sign out.

Invitation acceptance redirects to `/invite` on the app's current origin. The matching origin and path must be allowed in **Authentication → URL Configuration → Redirect URLs**. The **Invite user** email template should link with `{{ .ConfirmationURL }}` so Supabase verifies the invitation before returning to the app.

The Users tab creates invitation-based Auth accounts, edits the Auth email and profile fields together, and deletes the Auth account. Deleting an account cascades to records tied to that user. Exercise deletion also deletes its assigned plans and dependent logs and appointment links.
