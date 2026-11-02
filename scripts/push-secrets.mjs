/*
  Makes the secrets push reminders need. Run: npm run push-secrets -- you@example.com

  Writes two files (both ignored by git, see *.local in .gitignore):
  - .env.local gets VITE_VAPID_PUBLIC_KEY, the public half of the VAPID key
    pair. Browsers use it to check pushes really come from us. (Vercel needs
    it too, under Settings > Environment Variables.)
  - supabase/.env.push.local gets everything the send-reminders function
    needs, ready for: npx supabase secrets set --env-file supabase/.env.push.local
    VAPID_PRIVATE_KEY signs our pushes; CRON_SECRET proves a call came from
    our schedule. Nothing secret is printed.

  If the secrets file already exists its keys are kept, so running this again
  is safe. Pass --new to make a fresh pair (every device would then have to
  turn reminders on again; only do it if the private key leaked).
*/
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SECRETS_FILE = 'supabase/.env.push.local';
const ENV_FILE = '.env.local';

const args = process.argv.slice(2);
const fresh = args.includes('--new');
const contact = args.find((a) => !a.startsWith('--'));

/** KEY=value lines to an object. */
function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

function newVapidKeys() {
  // VAPID keys are P-256 elliptic-curve keys, written as URL-safe base64.
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  // The public key browsers want is the raw point: 0x04, then x, then y.
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
  return { VAPID_PUBLIC_KEY: raw.toString('base64url'), VAPID_PRIVATE_KEY: privateKey.export({ format: 'jwk' }).d };
}

const existing = fresh ? {} : readEnv(SECRETS_FILE);
const keys = existing.VAPID_PRIVATE_KEY && existing.VAPID_PUBLIC_KEY ? existing : newVapidKeys();
const subject = contact ? (contact.includes(':') ? contact : `mailto:${contact}`) : existing.VAPID_SUBJECT;
if (!subject) {
  console.error('Give a contact for push services, e.g.: npm run push-secrets -- you@example.com');
  process.exit(1);
}

const secrets = {
  VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: keys.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: subject,
  CRON_SECRET: existing.CRON_SECRET ?? randomBytes(32).toString('hex'),
};
writeFileSync(
  SECRETS_FILE,
  '# Push reminder secrets for the send-reminders function. Never commit this.\n' +
    Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
);

// Only the public key goes to the app.
const line = `VITE_VAPID_PUBLIC_KEY=${secrets.VAPID_PUBLIC_KEY}`;
const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
writeFileSync(
  ENV_FILE,
  /^VITE_VAPID_PUBLIC_KEY=.*$/m.test(env)
    ? env.replace(/^VITE_VAPID_PUBLIC_KEY=.*$/m, line)
    : `${env.trimEnd()}${env ? '\n' : ''}${line}\n`,
);

console.log(`${keys === existing ? 'Kept the existing' : 'Made new'} keys.
- ${SECRETS_FILE}: function secrets (not printed; never commit it)
- ${ENV_FILE}: VITE_VAPID_PUBLIC_KEY for the app. Restart "npm run dev".
Public key, for Vercel's VITE_VAPID_PUBLIC_KEY: ${secrets.VAPID_PUBLIC_KEY}`);
