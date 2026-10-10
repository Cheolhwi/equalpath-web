// This adapter is intentionally restricted to the new private test database.
// No catalogue/owner resource identifier can be supplied by a request.
export const DATABASE = 'equalpath-enquiry-demo', TABLE = 'events';
const query = (method, attribute, values) => JSON.stringify({ method, ...(attribute ? { attribute } : {}), values });
export function createCloudStore({ endpoint, project, key, fetcher = fetch }) {
  if (!/^https:\/\/[a-z]+\.cloud\.appwrite\.io\/v1$/.test(endpoint || '') || !project || !key) throw Error('Test storage is unavailable.');
  const base = `${endpoint}/tablesdb/${DATABASE}/tables/${TABLE}/rows`;
  async function api(method, suffix, body) {
    let r;
    try { r = await fetcher(base + suffix, { method, headers: { 'Content-Type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) }); }
    catch { throw Error('Test storage is unavailable.'); }
    if (!r.ok) { const e = Error('Test storage request failed.'); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  const decode = row => ({ id: row.$id, ...JSON.parse(row.payload), at: Date.parse(row.$createdAt) });
  return {
    async get(id) { if (!/^[a-zA-Z0-9_-]{1,36}$/.test(id)) return null; try { return decode(await api('GET', `/${id}`)); } catch(e) { if(e.status === 404) return null; throw e; } },
    async put(id, data, { parent = id, kind = 'event', expiresAt } = {}) {
      try { return decode(await api('POST', '', { rowId: id, data: { parent, kind, expiresAt: Math.floor(expiresAt / 1000), count: 0, payload: JSON.stringify(data) }, permissions: [] })); }
      catch(e) { if(e.status === 409) return null; throw e; }
    },
    async events(id) {
      const params = new URLSearchParams();
      // The parent also owns the immutable job row. Read only its events, so
      // every status check does not pay to retrieve that same job twice.
      for (const q of [query('equal', 'parent', [id]), query('equal', 'kind', ['event']), query('limit', null, [30])]) params.append('queries[]', q);
      return (await api('GET', `?${params}`)).rows.map(decode);
    },
    async queue() {
      const p=new URLSearchParams();
      for(const q of [query('equal','kind',['queued']),query('orderAsc','$sequence',[]),query('limit',null,[1])])p.append('queries[]',q);
      return (await api('GET',`?${p}`)).rows.map(decode);
    },
    async setKind(id,kind) {
      if(!/^[a-f0-9]{24}$/.test(id)||!['queued','done'].includes(kind))throw Error('Invalid queue update.');
      try {await api('PATCH',`/${id}_queue`,{data:{kind}});}catch(e){if(e.status!==404)throw e;}
    },
    async quota(id, limit, expiresAt) {
      try { await api('POST', '', { rowId: id, data: { parent: id, kind: 'quota', expiresAt: Math.floor(expiresAt / 1000), count: 0, payload: '{}' }, permissions: [] }); }
      catch(e) { if(e.status !== 409) throw e; }
      try { await api('PATCH', `/${id}/count/increment`, { value: 1, max: limit }); }
      catch(e) { if([400,409].includes(e.status)) { const x = Error('The test has reached its daily limit. Please try tomorrow.'); x.status = 429; throw x; } throw e; }
    },
    async prune(now) {
      let deleted = 0;
      // Bounded hourly cleanup, limited to this disposable test table.
      for(let page=0;page<12;page++) {
        const p = new URLSearchParams();
        for(const q of [query('lessThan', 'expiresAt', [Math.floor(now / 1000)]), query('limit', null, [100])]) p.append('queries[]', q);
        const rows = (await api('GET', `?${p}`)).rows;
        for(const row of rows) { try { await api('DELETE', `/${row.$id}`); deleted++; } catch(e) { if(e.status !== 404) throw e; } }
        if(rows.length < 100) break;
      }
      return deleted;
    },
  };
}
