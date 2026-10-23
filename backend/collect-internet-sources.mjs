#!/usr/bin/env node
// Balubaid Group · Genuine Internet Source Collector
// Strictly retrieves real, verifiable internet-sourced media and engagement metrics
// across AutoZone, APICO, and Balubaid Spare Parts.
// Reads real public oEmbed and video metadata from YouTube.
// Never fabricates fallback dates, ratings, or human review labels.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'dist', 'data');

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

// Genuine public internet targets to retrieve dynamically
const REAL_TARGETS = [
  // 1. AutoZone Official Media (Channel: @AutozoneJeddah)
  {
    company_id: 'autozone',
    source: 'youtube',
    branch: 'jeddah_madinah',
    video_id: 'TnZ00r0OMXs'
  },
  {
    company_id: 'autozone',
    source: 'youtube',
    branch: 'jeddah_sultan',
    video_id: '2Oy4cKQOEiw'
  },
  {
    company_id: 'autozone',
    source: 'youtube',
    branch: 'riyadh_khurais',
    video_id: 'bvjXcgpNRAk'
  },

  // 2. APICO Official Public Media Feature
  {
    company_id: 'apico',
    source: 'youtube',
    branch: 'jeddah_industrial',
    video_id: 'ZXVV8bW0PIg'
  },

  // 3. Balubaid Automotive / Spare Parts Public Media Feature
  {
    company_id: 'balubaid_parts',
    source: 'youtube',
    branch: 'jeddah_central',
    video_id: 'eURGFLMvS40'
  }
];

async function fetchYoutubeData(videoId) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  let oembed = null;
  try {
    const res = await fetch(oembedUrl);
    if (res.ok) oembed = await res.json();
  } catch (err) {
    console.warn(`[Collector] oEmbed fetch failed for ${videoId}:`, err.message);
  }

  let views = null, likes = null, publishDate = null;
  try {
    const pageRes = await fetch(watchUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const vMatch = html.match(/"viewCount":"(\d+)"/);
      if (vMatch) views = parseInt(vMatch[1], 10);
      const lMatch = html.match(/"likeCount":"(\d+)"/);
      if (lMatch) likes = parseInt(lMatch[1], 10);
      const dMatch = html.match(/"publishDate":"([^"]+)"/);
      if (dMatch) publishDate = dMatch[1];
    }
  } catch (err) {
    console.warn(`[Collector] Page metrics fetch failed for ${videoId}:`, err.message);
  }

  if (!oembed && !publishDate && views === null) {
    throw new Error(`Failed to retrieve genuine data from YouTube for videoId: ${videoId}`);
  }

  return {
    title: oembed?.title || `YouTube Video ${videoId}`,
    author: oembed?.author_name || 'YouTube Channel',
    author_url: oembed?.author_url || null,
    url: watchUrl,
    views: views,
    likes: likes,
    // Strict accuracy: only return publishDate if genuinely found; NO invented fallback dates
    published_at: publishDate || null
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[Collector] Starting genuine internet sources collection at ${startedAt}...`);

  await mkdir(dataDir, { recursive: true });
  
  const collectedRecords = [];
  const errors = [];

  for (const t of REAL_TARGETS) {
    const collectedAt = new Date().toISOString();
    try {
      const yt = await fetchYoutubeData(t.video_id);
      const record = {
        id: `yt-${t.video_id}`,
        company_id: t.company_id,
        source: 'youtube',
        data_state: 'live',
        data_origin: 'real',
        branch: t.branch,
        author: yt.author,
        author_url: yt.author_url,
        url: yt.url,
        text: yt.title,
        rating: null,
        metrics: {
          views: yt.views,
          likes: yt.likes
        },
        published_at: yt.published_at,
        collected_at: collectedAt,
        sentiment: null,       // Unreviewed: never claim a sentiment without human/AI audit
        topic: null,           // Uncategorized until audited
        reviewed_by: null,     // Strictly null: never fabricate 'تدقيق بشري موثق'
        requires_response: false,
        responded_at: null
      };
      collectedRecords.push(record);
      console.log(`[Collector] Successfully retrieved live record: [${t.company_id}] ${yt.title.slice(0, 60)} | Views: ${yt.views} | Likes: ${yt.likes} | Published: ${yt.published_at}`);
    } catch (err) {
      errors.push(`${t.company_id} (${t.video_id}): ${err.message}`);
      console.error(`[Collector] Failed to collect ${t.company_id} (${t.video_id}): ${err.message}`);
    }
  }

  const finishedAt = new Date().toISOString();

  // Save ONLY genuinely collected records
  const store = {
    records: collectedRecords,
    place_summaries: [],
    updated_at: finishedAt
  };
  await writeFile(join(dataDir, 'records.json'), JSON.stringify(store, null, 2), 'utf8');

  // Record Run details with explicit coverage gaps
  const runs = await readJson(join(dataDir, 'runs.json'), { runs: [] });
  const runEntry = {
    run_id: `live-run-${Date.now()}`,
    source: 'youtube_public',
    status: errors.length === 0 ? 'success' : 'partial',
    started_at: startedAt,
    finished_at: finishedAt,
    company_ids: ['autozone', 'apico', 'balubaid_parts'],
    collected_count: collectedRecords.length,
    errors: errors,
    coverage_gaps: [
      'YouTube: تم جمع المقاطع الموثقة والتفاعلات الفعلية (المشاهدات والإعجابات) بنجاح عبر الربط البرمجي العام.',
      'خرائط Google: غير مفعل (يتطلب Places API New مع تفعيل Cloud Billing ومفتاح API). عدد السجلات الحقيقية المجمعة حالياً = 0.',
      'Instagram: غير موصول (يتطلب Meta Graph API مع حساب أعمال مصادق).',
      'X (تويتر): غير موصول (يتطلب اشتراك مدفوع في X API).',
      'TikTok: غير موصول (يتطلب اعتماد حساب مطور أعمال في TikTok).',
      'Snapchat: الملف العام مقروء فقط ولا يتيح استخراج تفاعلات العملاء برمجياً.'
    ]
  };

  runs.runs.unshift(runEntry);
  runs.runs = runs.runs.slice(0, 50);
  await writeFile(join(dataDir, 'runs.json'), JSON.stringify(runs, null, 2), 'utf8');

  console.log(`[Collector] Run completed. Saved ${collectedRecords.length} genuine live records to dist/data/records.json.`);
}

main().catch(err => {
  console.error('[Collector] Fatal error:', err);
  process.exit(1);
});
