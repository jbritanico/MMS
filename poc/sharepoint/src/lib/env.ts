// Loads and validates .env values. Never prints secret values.

export interface PocEnv {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string; // exactly as written in .env (trailing slash removed)
  host: string;
  sitePath: string;
}

const REQUIRED = ['SP_TENANT_ID', 'SP_CLIENT_ID', 'SP_CLIENT_SECRET', 'SP_SITE_URL'] as const;

export function loadEnv(): PocEnv {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing in .env: ${missing.join(', ')}`);
  }
  const siteUrl = process.env.SP_SITE_URL!.trim().replace(/\/+$/, '');
  const u = new URL(siteUrl);
  if (u.protocol !== 'https:') throw new Error('SP_SITE_URL must be https');
  return {
    tenantId: process.env.SP_TENANT_ID!.trim(),
    clientId: process.env.SP_CLIENT_ID!.trim(),
    clientSecret: process.env.SP_CLIENT_SECRET!.trim(),
    siteUrl,
    host: u.host,
    sitePath: u.pathname,
  };
}

/** Removes any secret / id values from a string before it is printed or saved. */
export function redact(text: string, env: PocEnv): string {
  let out = text;
  for (const [value, label] of [
    [env.clientSecret, '<SECRET>'],
    [env.tenantId, '<TENANT_ID>'],
    [env.clientId, '<CLIENT_ID>'],
  ] as const) {
    if (value) out = out.split(value).join(label);
  }
  // Bearer tokens, just in case an error echoes a header.
  return out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <TOKEN>');
}
