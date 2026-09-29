import { portfolioConfig } from './portfolio-config.js';

const url = portfolioConfig.url.replace(/\/+$/, '');
const key = portfolioConfig.publishableKey;
const sessionKey = `folio-lab-owner-session-${portfolioConfig.slug}`;
let session = null;

export const portfolioBackendReady = Boolean(url && key && portfolioConfig.slug);

function headers(extra = {}, authenticated = false) {
  return {
    apikey: key,
    ...(authenticated ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...extra,
  };
}

async function readResponse(response) {
  const body = await response.text();
  let data;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) throw new Error(data?.message || data?.error_description || data?.error || `Request failed (${response.status})`);
  return data;
}

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    user: data.user,
  };
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function hasOwnerSession() {
  if (!session) {
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
  }
  return Boolean(session?.refresh_token);
}

async function refreshSession() {
  if (!hasOwnerSession()) throw new Error('Please sign in to continue.');
  if (session.expires_at > Date.now() + 60000) return session.access_token;
  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    saveSession(await readResponse(response));
    return session.access_token;
  } catch {
    signOut();
    throw new Error('Your sign-in expired. Please sign in again.');
  }
}

async function ownerRequest(path, options = {}) {
  await refreshSession();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: headers(options.headers, true),
  });
  return readResponse(response);
}

export async function signIn(email, password) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  });
  saveSession(await readResponse(response));
}

export function signOut() {
  session = null;
  localStorage.removeItem(sessionKey);
}

export async function getOwnedPortfolio() {
  const rows = await ownerRequest(`/rest/v1/model_portfolios?select=id,slug&slug=eq.${encodeURIComponent(portfolioConfig.slug)}&limit=1`);
  if (!rows?.[0]) throw new Error('This account is not connected to Vasilina’s portfolio yet.');
  return rows[0];
}

export async function getDraft(portfolioId, startingContent) {
  const path = `/rest/v1/model_portfolio_drafts?select=content,revision&portfolio_id=eq.${encodeURIComponent(portfolioId)}`;
  const rows = await ownerRequest(path);
  if (rows?.[0]) return rows[0];
  const inserted = await ownerRequest('/rest/v1/model_portfolio_drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ portfolio_id: portfolioId, content: startingContent }),
  });
  return inserted[0];
}

export async function saveOwnerDraft(portfolioId, content, revision) {
  const rows = await ownerRequest(`/rest/v1/model_portfolio_drafts?portfolio_id=eq.${encodeURIComponent(portfolioId)}&revision=eq.${revision}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ content }),
  });
  if (!rows?.[0]) throw new Error('This draft changed on another device. Reload Studio before saving.');
  return rows[0].revision;
}

export async function publishOwnerDraft(portfolioId) {
  return ownerRequest('/rest/v1/rpc/publish_model_portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_portfolio_id: portfolioId }),
  });
}

export async function getPublishedPortfolio() {
  if (!portfolioBackendReady) return null;
  const response = await fetch(`${url}/rest/v1/model_portfolio_publications?select=content,revision,published_at&slug=eq.${encodeURIComponent(portfolioConfig.slug)}&limit=1`, {
    headers: headers(),
    cache: 'no-store',
  });
  const rows = await readResponse(response);
  return rows?.[0] || null;
}

export async function uploadOwnerImage(file) {
  await refreshSession();
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }[file.type];
  if (!extension) throw new Error('Choose a JPG, PNG, WebP, or AVIF image.');
  const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${url}/storage/v1/object/model-media/${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': file.type, 'cache-control': '3600' }, true),
    body: file,
  });
  await readResponse(response);
  return `${url}/storage/v1/object/public/model-media/${path}`;
}
