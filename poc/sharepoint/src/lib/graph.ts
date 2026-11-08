// Minimal Microsoft Graph client on top of fetch, with:
//  - per-call timing and a call log (for the scenario measurements)
//  - a site guard: every write must target the site resolved from SP_SITE_URL
//  - a PoC_ guard: list/library writes must target a PoC_-prefixed list
//  - Retry-After handling for 429/503 (bounded)
import { ClientSecretCredential } from '@azure/identity';
import { loadEnv, redact, type PocEnv } from './env.ts';

const V1 = 'https://graph.microsoft.com/v1.0';
const BETA = 'https://graph.microsoft.com/beta';

export interface CallRecord {
  method: string;
  path: string; // relative to the API root, site id shortened
  api: 'v1.0' | 'beta';
  status: number;
  ms: number;
  retryAfter?: number;
  bytesIn: number;
}

export class GraphError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(`${status} ${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

export interface Site {
  id: string;
  webUrl: string;
  displayName: string;
}

export interface RequestOpts {
  body?: unknown;
  headers?: Record<string, string>;
  api?: 'v1.0' | 'beta';
  /** Max automatic retries on 429/503 (default 3). 0 = return the 429 to the caller. */
  maxRetries?: number;
  rawBody?: Uint8Array | ArrayBuffer;
}

export class Graph {
  readonly env: PocEnv;
  readonly calls: CallRecord[] = [];
  readonly betaCalls = new Set<string>();
  private cred: ClientSecretCredential;
  private token?: { value: string; exp: number };
  site?: Site;

  constructor() {
    this.env = loadEnv();
    this.cred = new ClientSecretCredential(this.env.tenantId, this.env.clientId, this.env.clientSecret);
  }

  redact(s: string): string {
    return redact(s, this.env);
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.exp - Date.now() > 120_000) return this.token.value;
    const t = await this.cred.getToken('https://graph.microsoft.com/.default');
    if (!t) throw new Error('No token returned');
    this.token = { value: t.token, exp: t.expiresOnTimestamp };
    return t.token;
  }

  /** Resolve the site from SP_SITE_URL and check its webUrl matches exactly. */
  async resolveSite(): Promise<Site> {
    const s = await this.request<Site>('GET', `/sites/${this.env.host}:${this.env.sitePath}?$select=id,webUrl,displayName`);
    const got = s.webUrl.replace(/\/+$/, '');
    if (got !== this.env.siteUrl) {
      throw new Error(`Site guard: resolved webUrl ${got} does not match SP_SITE_URL ${this.env.siteUrl}. Stopping.`);
    }
    this.site = { id: s.id, webUrl: got, displayName: s.displayName };
    return this.site;
  }

  /** Ids of lists / drives confirmed to be PoC_-named. Only these may be written to. */
  readonly pocLists = new Set<string>();
  readonly pocDrives = new Set<string>();
  readonly pocRecycleIds = new Set<string>();

  registerPocList(id: string, displayName: string, driveId?: string): void {
    assertPocName(displayName);
    this.pocLists.add(id);
    if (driveId) this.pocDrives.add(driveId);
  }

  /**
   * Throws unless a write targets the guarded site AND a PoC_ list/library.
   * Allowed: POST /sites/{site}/lists with a PoC_ displayName; any write under
   * /sites/{site}/lists/{id} or /drives/{id} where id is a registered PoC_ list/drive.
   */
  private guardWrite(method: string, path: string, body: unknown): void {
    if (!this.site) throw new Error('Site guard: resolveSite() must run before any write.');
    const p = path.split('?')[0];
    const site = `/sites/${this.site.id}`;
    // Recycle bin: only entries that cleanup has verified come from PoC_ lists.
    if (p.startsWith(`${site}/recycleBin/items`)) {
      const ids: string[] = p.endsWith('/delete') || p.endsWith('/permanentDelete') ? ((body as any)?.ids ?? []) : [p.split('/').pop()!];
      if (!ids.length || !ids.every((id) => this.pocRecycleIds.has(id))) {
        throw new Error(`PoC guard: recycle bin ${method} for an entry not verified as PoC_ refused.`);
      }
      return;
    }
    if (p === `${site}/lists` && method === 'POST') {
      assertPocName(String((body as any)?.displayName ?? ''));
      return;
    }
    const m = p.match(/^\/sites\/([^/]+)\/lists\/([^/]+)/);
    if (m) {
      if (m[1] !== this.site.id) throw new Error(`Site guard: ${method} to another site refused.`);
      if (!this.pocLists.has(m[2])) throw new Error(`PoC guard: ${method} to a non-PoC_ list refused.`);
      return;
    }
    const d = p.match(/^\/drives\/([^/]+)/);
    if (d) {
      if (!this.pocDrives.has(d[1])) throw new Error(`PoC guard: ${method} to a non-PoC_ library refused.`);
      return;
    }
    throw new Error(`Site guard: ${method} ${this.short(p)} is not an allowed PoC write.`);
  }

  async request<T = any>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const res = await this.raw(method, path, opts);
    const text = res.text;
    if (!res.ok) {
      let code = 'unknown';
      let msg = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        code = j.error?.code ?? code;
        msg = j.error?.message ?? msg;
      } catch {}
      throw new GraphError(res.status, code, this.redact(msg));
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Graph JSON $batch (max 20). Every sub-request is checked by the same write guard.
   * Sub-requests that come back 429/503 are re-sent (in a new batch) after the largest Retry-After seen.
   * Returns sub-responses in the order of `reqs`.
   */
  async batch(
    reqs: { method: string; url: string; body?: unknown; headers?: Record<string, string> }[],
    maxRetries = 3,
  ): Promise<{ status: number; body: any; headers?: Record<string, string> }[]> {
    if (reqs.length > 20) throw new Error('batch: max 20 requests');
    for (const r of reqs) if (r.method !== 'GET') this.guardWrite(r.method, r.url, r.body);
    const out: { status: number; body: any; headers?: Record<string, string> }[] = new Array(reqs.length);
    let pending = reqs.map((_, i) => i);
    for (let attempt = 0; pending.length; attempt++) {
      const payload = {
        requests: pending.map((i) => ({
          id: String(i),
          method: reqs[i].method,
          url: reqs[i].url,
          ...(reqs[i].body !== undefined
            ? { body: reqs[i].body, headers: { 'Content-Type': 'application/json', ...(reqs[i].headers ?? {}) } }
            : reqs[i].headers
              ? { headers: reqs[i].headers }
              : {}),
        })),
      };
      this.subRequests += pending.length;
      const res = await this.raw('POST', '/$batch', { body: payload, internalBatch: true });
      if (!res.ok) throw new GraphError(res.status, 'batchFailed', this.redact(res.text.slice(0, 300)));
      const j = JSON.parse(res.text) as { responses: { id: string; status: number; body: any; headers?: Record<string, string> }[] };
      const retry: number[] = [];
      let wait = 0;
      for (const r of j.responses) {
        const i = Number(r.id);
        out[i] = r;
        if ((r.status === 429 || r.status === 503) && attempt < maxRetries) {
          retry.push(i);
          const ra = Number(r.headers?.['Retry-After'] ?? r.headers?.['retry-after'] ?? 2 ** attempt);
          wait = Math.max(wait, ra);
          this.batchThrottles.push({ at: new Date().toISOString(), status: r.status, retryAfter: ra, url: this.short(reqs[i].url).replace(/lists\/[^/]+/, 'lists/{list}'), attempt });
        }
      }
      pending = retry;
      if (pending.length) await new Promise((r) => setTimeout(r, wait * 1000));
    }
    return out;
  }
  readonly batchThrottles: { at: string; status: number; retryAfter: number; url: string; attempt: number }[] = [];
  /** Sub-requests sent inside $batch calls (what SharePoint actually processes). */
  subRequests = 0;

  /** GET a collection, following @odata.nextLink. Returns all items and the number of pages. */
  async getAll<T = any>(path: string, headers?: Record<string, string>): Promise<{ items: T[]; pages: number }> {
    const items: T[] = [];
    let pages = 0;
    let next: string | undefined = path;
    while (next) {
      const j: any = await this.request('GET', next, { headers });
      pages++;
      items.push(...(j.value ?? []));
      const nl: string | undefined = j['@odata.nextLink'];
      next = nl ? nl.replace(/^https:\/\/graph\.microsoft\.com\/(v1\.0|beta)/, '') : undefined;
    }
    return { items, pages };
  }

  async raw(
    method: string,
    path: string,
    opts: RequestOpts & { internalBatch?: boolean; binary?: boolean } = {},
  ): Promise<{ ok: boolean; status: number; text: string; buf?: Uint8Array; headers: Headers }> {
    if (method !== 'GET' && !opts.internalBatch) this.guardWrite(method, path, opts.body);
    const api = opts.api ?? 'v1.0';
    if (api === 'beta') this.betaCalls.add(`${method} ${this.short(path)}`);
    const url = (api === 'beta' ? BETA : V1) + path;
    const maxRetries = opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await this.getToken()}`,
        ...(opts.headers ?? {}),
      };
      let body: RequestInit["body"] | undefined;
      if (opts.rawBody !== undefined) body = opts.rawBody as RequestInit["body"];
      else if (opts.body !== undefined) {
        body = JSON.stringify(opts.body);
        headers['Content-Type'] ??= 'application/json';
      }
      const t0 = performance.now();
      const r = await fetch(url, { method, headers, body, redirect: 'follow' });
      const buf = new Uint8Array(await r.arrayBuffer());
      const text = opts.binary && r.ok ? '' : new TextDecoder().decode(buf);
      const ms = performance.now() - t0;
      const ra = r.headers.get('Retry-After');
      this.calls.push({
        method,
        path: this.short(path),
        api,
        status: r.status,
        ms: Math.round(ms * 10) / 10,
        retryAfter: ra ? Number(ra) : undefined,
        bytesIn: buf.byteLength,
      });
      if ((r.status === 429 || r.status === 503) && attempt < maxRetries) {
        const wait = (ra ? Number(ra) : 2 ** attempt) * 1000;
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      return { ok: r.ok, status: r.status, text, buf, headers: r.headers };
    }
  }

  private short(path: string): string {
    return this.site ? path.split(this.site.id).join('{site}') : path;
  }
}

export function assertPocName(name: string): void {
  if (!name.startsWith('PoC_')) throw new Error(`PoC guard: refusing to create/modify "${name}" (no PoC_ prefix).`);
}
