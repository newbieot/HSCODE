const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_URL = 'https://api.groq.com/openai/v1/models/llama-3.3-70b-versatile';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_BODY_BYTES = 128 * 1024;
const MAX_BATCH_ITEMS = 40;
const REQUEST_TIMEOUT_MS = 45_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 15;
const rateBuckets = new Map();

const BATCH_SYSTEM_PROMPT = `Klasifikasi kandidat HS Code 8-digit untuk daftar nama barang CIPL.
Pertahankan perilaku sistem lama: output harus berupa JSON MURNI berbentuk objek {"NAMA BARANG":"HSCODE"} dan semua key nama barang harus HURUF KAPITAL.
Jangan menambahkan markdown, penjelasan, confidence, atau teks lain.
Gunakan kode kandidat paling relevan berdasarkan nama yang tersedia. Bila nama terlalu umum, tetap berikan kandidat awal terbaik tanpa mengarang rincian produk.`;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
}

function isRateLimited(request) {
  const now = Date.now();
  const ip = getClientIp(request);
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (rateBuckets.size > 500) {
    for (const [key, value] of rateBuckets) {
      if (now - value.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(key);
    }
  }
  return bucket.count > RATE_LIMIT;
}

function sanitizeText(value, maxLength = 2000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLength);
}

function getApiKey(request, env) {
  const serverKey = sanitizeText(env?.GROQ_API_KEY, 300);
  if (serverKey) return { key: serverKey, source: 'server' };
  const userKey = sanitizeText(request.headers.get('X-Groq-API-Key'), 300);
  if (userKey) return { key: userKey, source: 'user' };
  return { key: '', source: 'none' };
}

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(content) {
  if (content && typeof content === 'object') return content;
  const text = String(content || '').trim();
  if (!text) throw new Error('empty_response');
  try { return JSON.parse(text); } catch (_) { /* fallback below */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('invalid_json');
}

function mapGroqError(status, payload = {}) {
  const upstream = sanitizeText(payload?.error?.message || payload?.message, 500);
  if (status === 401) return { status: 401, code: 'invalid_api_key', message: 'Groq API key tidak valid. Periksa kembali key atau buat key baru melalui Groq Console.' };
  if (status === 403) return { status: 403, code: 'model_forbidden', message: 'Project Groq tidak memiliki izin menggunakan model yang dikonfigurasi.' };
  if (status === 429) return { status: 429, code: 'rate_limited', message: 'Batas penggunaan Groq sementara tercapai. Silakan tunggu dan coba kembali.' };
  if (status === 404) return { status: 503, code: 'model_unavailable', message: 'Model Groq yang dikonfigurasi sedang tidak tersedia.' };
  if (status >= 500) return { status: 503, code: 'groq_unavailable', message: 'Groq sedang tidak dapat diakses. Silakan coba kembali beberapa saat lagi.' };
  return { status: 502, code: 'groq_error', message: upstream ? `Groq menolak permintaan: ${upstream}` : 'Permintaan ke Groq tidak dapat diproses.' };
}

async function testConnection(auth) {
  const response = await fetchWithTimeout(GROQ_MODEL_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${auth.key}` }
  }, 15_000);
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch (_) { /* no-op */ }
    const mapped = mapGroqError(response.status, payload);
    return json(mapped, mapped.status);
  }
  return json({ ok: true, model: MODEL, auth_source: auth.source });
}

async function callGroq(auth, body) {
  let response;
  try {
    response = await fetchWithTimeout(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error?.name === 'AbortError') return json({ code: 'timeout', message: 'Permintaan ke Groq melewati batas waktu. Silakan coba kembali.' }, 504);
    return json({ code: 'network_error', message: 'Tidak dapat terhubung ke Groq. Periksa koneksi atau coba kembali.' }, 502);
  }

  let payload = {};
  try { payload = await response.json(); } catch (_) { /* handled below */ }
  if (!response.ok) {
    const mapped = mapGroqError(response.status, payload);
    return json(mapped, mapped.status);
  }

  const content = payload?.choices?.[0]?.message?.content;
  try {
    const parsed = extractJson(content);
    return json({ ok: true, data: parsed, model: MODEL, auth_source: auth.source });
  } catch (error) {
    return json({
      code: error.message === 'empty_response' ? 'empty_response' : 'invalid_json',
      message: error.message === 'empty_response'
        ? 'Groq mengembalikan respons kosong. Silakan coba kembali.'
        : 'Format respons AI tidak dapat diproses dengan aman. Silakan coba kembali.'
    }, 502);
  }
}

async function handleBatch(auth, payload) {
  if (!Array.isArray(payload.items)) return json({ code: 'invalid_items', message: 'Daftar barang tidak valid.' }, 400);
  const items = payload.items.map(item => sanitizeText(item, 300).toUpperCase()).filter(Boolean).slice(0, MAX_BATCH_ITEMS);
  if (!items.length) return json({ code: 'empty_items', message: 'Daftar barang kosong.' }, 400);
  return callGroq(auth, {
    model: MODEL,
    messages: [
      { role: 'system', content: BATCH_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(items) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_completion_tokens: 1800
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Gunakan method POST untuk endpoint ini.' }, 405, { Allow: 'POST' });
  if (isRateLimited(request)) return json({ code: 'local_rate_limit', message: 'Terlalu banyak permintaan dari koneksi ini. Coba kembali satu menit lagi.' }, 429, { 'Retry-After': '60' });

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return json({ code: 'unsupported_media_type', message: 'Content-Type harus application/json.' }, 415);

  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ code: 'payload_too_large', message: 'Ukuran permintaan terlalu besar.' }, 413);

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ code: 'payload_too_large', message: 'Ukuran permintaan terlalu besar.' }, 413);

  let payload;
  try { payload = JSON.parse(rawBody); } catch (_) { return json({ code: 'invalid_json_body', message: 'Body JSON tidak valid.' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return json({ code: 'invalid_request', message: 'Permintaan tidak valid.' }, 400);

  const auth = getApiKey(request, env);
  if (!auth.key) return json({ code: 'missing_api_key', message: 'Groq API key belum dikonfigurasi. Tambahkan secret GROQ_API_KEY di Cloudflare Pages atau gunakan key sesi.' }, 401);

  if (payload.mode === 'test') return testConnection(auth);
  if (payload.mode === 'batch') return handleBatch(auth, payload);
  return json({ code: 'invalid_mode', message: 'Mode analisis tidak dikenal.' }, 400);
}
