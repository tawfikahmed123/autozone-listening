#!/usr/bin/env node
// Autozone · Google Places review collector (one genuine source, end to end)
// Usage:  GOOGLE_PLACES_API_KEY=xxx node backend/collect-google-places.mjs
// Requires Node 18+. Reads backend/branches.json, writes dist/data/records.json + dist/data/runs.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'dist', 'data');
const KEY = process.env.GOOGLE_PLACES_API_KEY;
const FIELDS = 'id,displayName,rating,userRatingCount,googleMapsUri,reviews';

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

async function main() {
  const startedAt = new Date().toISOString();
  const run = { run_id: `places-${Date.now()}`, source: 'google_places', started_at: startedAt, branches: [], errors: [] };

  if (!KEY) {
    run.status = 'failed';
    run.errors.push('GOOGLE_PLACES_API_KEY is not set');
  }

  const branches = (await readJson(join(here, 'branches.json'), { branches: [] })).branches
    .filter(b => b.place_id && !b.place_id.startsWith('REPLACE'));
  if (KEY && branches.length === 0) {
    run.status = 'failed';
    run.errors.push('No verified place_id in backend/branches.json');
  }

  const registry = await readJson(join(dataDir, 'companies.json'), {companies:[]});
  const knownCompanies = new Set(registry.companies.map(c=>c.id));
  const places = new Map();
  for (const b of branches) {
    if (!knownCompanies.has(b.company_id)) throw new Error('Branch has missing or unknown company_id');
    if (places.has(b.place_id) && places.get(b.place_id)!==b.company_id) throw new Error('Ambiguous place_id shared across companies');
    places.set(b.place_id,b.company_id);
  }
  run.company_ids = [...new Set(branches.map(b=>b.company_id))];
  if (!run.company_ids.length) run.company_ids=['autozone'];

  await mkdir(dataDir, { recursive: true });
  const store = await readJson(join(dataDir, 'records.json'), { records: [], place_summaries: [] });
  const byId = new Map(store.records.map(r => [`${r.company_id||'autozone'}:${r.id}`, {...r,company_id:r.company_id||'autozone'}]));
  const summaries = new Map((store.place_summaries || []).map(s => [s.place_id, s]));

  if (!run.status) {
    for (const b of branches) {
      const collectedAt = new Date().toISOString();
      try {
        const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(b.place_id)}?languageCode=ar`, {
          headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const p = await res.json();
        summaries.set(b.place_id, {
          company_id:b.company_id, place_id: b.place_id, branch: b.branch_key, name: p.displayName?.text,
          rating: p.rating ?? null, rating_count: p.userRatingCount ?? null,
          maps_url: p.googleMapsUri, collected_at: collectedAt
        });
        let added = 0;
        for (const rv of p.reviews || []) {
          const id = rv.name; // stable resource name: places/{id}/reviews/{id}
          const key = `${b.company_id}:${id}`;
          if (!byId.has(key)) added++;
          const prev = byId.get(key) || {};
          byId.set(key, {
            ...prev,
            id,
            data_state: 'live',
            data_origin:'real',
            company_id:b.company_id,
            source: 'google_places',
            branch: b.branch_key,
            author: rv.authorAttribution?.displayName || 'Google user',
            author_url: rv.authorAttribution?.uri || null,
            text: rv.originalText?.text || rv.text?.text || '',
            language: rv.originalText?.languageCode || rv.text?.languageCode || null,
            rating: rv.rating ?? null,
            published_at: rv.publishTime || null,
            url: rv.googleMapsUri || p.googleMapsUri,
            collected_at: collectedAt,
            // Human review fields are preserved across runs, never auto-filled
            sentiment: prev.sentiment ?? null,
            topic: prev.topic ?? null,
            reviewed_by: prev.reviewed_by ?? null,
            requires_response: prev.requires_response ?? null,
            responded_at: prev.responded_at ?? null
          });
        }
        run.branches.push({ company_id:b.company_id, branch: b.branch_key, ok: true, returned: (p.reviews || []).length, new: added });
      } catch (e) {
        run.branches.push({ company_id:b.company_id, branch: b.branch_key, ok: false, error: String(e.message || e) });
        run.errors.push(`${b.branch_key}: ${e.message || e}`);
      }
    }
    const okCount = run.branches.filter(x => x.ok).length;
    run.status = okCount === 0 ? 'failed' : okCount < branches.length ? 'partial' : 'success';
  }

  run.finished_at = new Date().toISOString();
  store.records = [...byId.values()];
  store.place_summaries = [...summaries.values()];
  store.updated_at = run.finished_at;
  await writeFile(join(dataDir, 'records.json'), JSON.stringify(store, null, 2));

  const runs = await readJson(join(dataDir, 'runs.json'), { runs: [] });
  runs.runs.unshift(run);
  runs.runs = runs.runs.slice(0, 100);
  await writeFile(join(dataDir, 'runs.json'), JSON.stringify(runs, null, 2));

  console.log(JSON.stringify({ status: run.status, branches: run.branches, errors: run.errors }, null, 2));
  process.exit(run.status === 'failed' ? 1 : 0);
}

main();
