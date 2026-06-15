'use strict';

const http = require('http');
const crypto = require('crypto');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3001);
const MISSKEY_ORIGIN = (process.env.MISSKEY_ORIGIN || 'https://dc.hhhl.cc').replace(/\/$/, '');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3001/dc-oauth').replace(/\/$/, '');
const NEWAPI_BASE_URL = (process.env.NEWAPI_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SERVICE_NAME = process.env.SERVICE_NAME || 'New API';
const STATE_TTL_MS = Number(process.env.STATE_TTL_MS || 10 * 60 * 1000);

const states = new Map();
const codes = new Map();

function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function text(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function cleanup() {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [key, value] of states) {
    if (value.createdAt < cutoff) states.delete(key);
  }
  for (const [key, value] of codes) {
    if (value.createdAt < cutoff) codes.delete(key);
  }
}

function getParam(url, name) {
  return url.searchParams.get(name) || '';
}

function normalizeUser(user) {
  const username = user.username || user.usernyame || user.name || user.id;
  const displayName = user.name || user.displayName || user.display_nyame || username;
  return {
    id: String(user.id || username),
    usernyame: String(username),
    username: String(username),
    display_nyame: String(displayName),
    displayName: String(displayName),
    name: String(displayName),
  };
}

function validateRedirectUri(raw) {
  try {
    const target = new URL(raw);
    const newApiBase = new URL(NEWAPI_BASE_URL);
    if (target.origin !== newApiBase.origin) return null;
    if (!target.pathname.startsWith('/oauth/')) return null;
    return target.toString();
  } catch {
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function parseRequestParams(req, url) {
  if (req.method === 'GET') return url.searchParams;
  const body = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const obj = body ? JSON.parse(body) : {};
    return new URLSearchParams(Object.entries(obj).map(([key, value]) => [key, String(value)]));
  }
  return new URLSearchParams(body);
}

async function misskey(endpoint, payload) {
  const res = await fetch(`${MISSKEY_ORIGIN}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data && data.error ? `${data.error.code || ''} ${data.error.message || ''}` : `HTTP ${res.status}`;
    throw new Error(`Misskey API ${endpoint} failed: ${message}`);
  }
  return data;
}

async function handleAuthorize(req, res, url) {
  cleanup();
  const rawRedirectUri = getParam(url, 'redirect_uri');
  const oauthState = getParam(url, 'state');
  if (!rawRedirectUri) return text(res, 400, 'missing redirect_uri');

  const redirectUri = validateRedirectUri(rawRedirectUri);
  if (!redirectUri) return text(res, 400, 'invalid redirect_uri');

  const session = token(16);
  states.set(oauthState || session, { redirectUri, session, createdAt: Date.now() });

  const callback = `${PUBLIC_BASE_URL}/callback?state=${encodeURIComponent(oauthState || session)}`;
  const miAuthUrl = `${MISSKEY_ORIGIN}/miauth/${session}`
    + `?name=${encodeURIComponent(SERVICE_NAME)}`
    + `&callback=${encodeURIComponent(callback)}`
    + `&permission=${encodeURIComponent('read:account')}`;

  redirect(res, miAuthUrl);
}

async function handleCallback(req, res, url) {
  cleanup();
  const state = getParam(url, 'state');
  const item = states.get(state);
  if (!item) return text(res, 400, 'state expired or not found');

  let check;
  try {
    check = await misskey(`miauth/${item.session}/check`, {});
  } catch (err) {
    return text(res, 502, String(err.message || err));
  }
  if (!check || check.ok !== true || !check.user) return text(res, 401, 'MiAuth was not approved');

  const code = token(24);
  codes.set(code, { user: normalizeUser(check.user), createdAt: Date.now() });
  states.delete(state);

  const back = new URL(item.redirectUri);
  back.searchParams.set('code', code);
  back.searchParams.set('state', state);
  redirect(res, back.toString());
}

async function handleToken(req, res, url) {
  cleanup();
  const params = await parseRequestParams(req, url);
  const code = params.get('code') || '';
  const item = codes.get(code);
  if (!item) return json(res, 400, { error: 'invalid_grant' });

  codes.delete(code);
  const accessToken = token(32);
  codes.set(accessToken, { user: item.user, createdAt: Date.now() });
  json(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(STATE_TTL_MS / 1000),
    scope: 'read:account',
  });
}

async function handleUserinfo(req, res) {
  cleanup();
  const auth = req.headers.authorization || '';
  const accessToken = auth.replace(/^Bearer\s+/i, '').trim();
  const item = codes.get(accessToken);
  if (!item) return json(res, 401, { error: 'invalid_token' });
  json(res, 200, item.user);
}

async function router(req, res) {
  try {
    const url = new URL(req.url, PUBLIC_BASE_URL);
    const path = url.pathname.replace(/^\/dc-oauth/, '') || '/';
    if (req.method === 'OPTIONS') return json(res, 200, {});
    if (path === '/health') return json(res, 200, { ok: true, service: 'dc-oauth', misskey: MISSKEY_ORIGIN });
    if (path === '/authorize' && req.method === 'GET') return handleAuthorize(req, res, url);
    if (path === '/callback' && req.method === 'GET') return handleCallback(req, res, url);
    if (path === '/token' && (req.method === 'POST' || req.method === 'GET')) return handleToken(req, res, url);
    if (path === '/userinfo' && req.method === 'GET') return handleUserinfo(req, res);
    return text(res, 404, 'not found');
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: 'server_error', message: String(err.message || err) });
  }
}

http.createServer(router).listen(PORT, HOST, () => {
  console.log(`dc-oauth bridge listening on http://${HOST}:${PORT}`);
  console.log(`public base: ${PUBLIC_BASE_URL}`);
  console.log(`new api base: ${NEWAPI_BASE_URL}`);
});
