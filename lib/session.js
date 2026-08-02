// KASANE のログインセッション（署名付きCookie）ユーティリティ
// 環境変数 SESSION_SECRET（Vercelに設定する任意の長いランダム文字列）で
// セッション内容（ユーザーのGoogleアカウント情報）に署名し、改ざんを防ぎます。

const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET || '';
const COOKIE_NAME = 'kasane_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90日

function isSessionConfigured() {
  return Boolean(SESSION_SECRET);
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSessionCookie(user) {
  const payload = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture || '',
    iat: Date.now()
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = sign(body);
  const value = `${body}.${sig}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function getSessionUser(cookieHeader) {
  if (!isSessionConfigured()) return null;
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let expected;
  try {
    expected = sign(body);
  } catch (e) {
    return null;
  }
  // タイミング攻撃対策：長さが違う場合は先にfalseを返す
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || !payload.sub) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = {
  isSessionConfigured,
  createSessionCookie,
  clearSessionCookie,
  getSessionUser,
  COOKIE_NAME
};
