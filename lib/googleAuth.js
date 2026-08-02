// Google ID トークン（Google Identity Services から受け取る credential）の検証。
// 外部ライブラリを使わず、GoogleのJWKS（公開鍵一覧）を取得してRS256署名を検証します。

const crypto = require('crypto');

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let cachedKeys = null;
let cachedAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1時間キャッシュ

function base64urlToBuffer(str) {
  return Buffer.from(str, 'base64url');
}

async function getGoogleKeys() {
  const now = Date.now();
  if (cachedKeys && now - cachedAt < CACHE_MS) return cachedKeys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Googleの公開鍵取得に失敗しました');
  const data = await res.json();
  cachedKeys = data.keys || [];
  cachedAt = now;
  return cachedKeys;
}

async function verifyGoogleIdToken(idToken, expectedClientId) {
  if (!idToken || typeof idToken !== 'string') throw new Error('IDトークンがありません');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('IDトークンの形式が不正です');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(base64urlToBuffer(headerB64).toString('utf8'));
  const payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8'));

  if (!header.kid) throw new Error('署名鍵IDがありません');

  const keys = await getGoogleKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('対応する公開鍵が見つかりませんでした');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64urlToBuffer(sigB64);
  const ok = crypto.verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature);
  if (!ok) throw new Error('署名の検証に失敗しました');

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('IDトークンの有効期限が切れています');
  if (!payload.iss || !VALID_ISSUERS.includes(payload.iss)) throw new Error('発行者が不正です');
  if (!payload.aud || payload.aud !== expectedClientId) throw new Error('クライアントIDが一致しません');
  if (!payload.sub) throw new Error('ユーザーIDがありません');

  return payload;
}

module.exports = { verifyGoogleIdToken };
