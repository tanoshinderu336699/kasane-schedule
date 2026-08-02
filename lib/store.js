// KASANE のデータ保存ユーティリティ
// Vercel Marketplace 経由で追加した Upstash Redis (もしくは旧 Vercel KV) を利用します。
// 環境変数は KV_REST_API_URL / KV_REST_API_TOKEN、または
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN のどちらでも動作します。

const crypto = require('crypto');

const REST_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured() {
  return Boolean(REST_URL && REST_TOKEN);
}

async function redisCall(command) {
  if (!isConfigured()) {
    const err = new Error(
      'データベースが未接続です。Vercel の Storage で Upstash Redis を追加し、プロジェクトに接続してください。'
    );
    err.code = 'NO_DB';
    throw err;
  }
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function projectKey(id) {
  return `kasane:project:${id}`;
}

async function getProject(id) {
  const raw = await redisCall(['GET', projectKey(id)]);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function setProject(id, data) {
  await redisCall(['SET', projectKey(id), JSON.stringify(data)]);
  return data;
}

async function deleteProject(id) {
  await redisCall(['DEL', projectKey(id)]);
  return true;
}

function genId(bytes = 6) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function genToken(bytes = 18) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function userProjectsKey(sub) {
  return `kasane:user:${sub}:projects`;
}

// ユーザーが作成したプロジェクトの一覧に追加します（新しい順、最大50件保持）。
async function addUserProject(sub, meta) {
  await redisCall(['LPUSH', userProjectsKey(sub), JSON.stringify(meta)]);
  await redisCall(['LTRIM', userProjectsKey(sub), '0', '49']);
  return true;
}

async function getUserProjects(sub) {
  const raw = await redisCall(['LRANGE', userProjectsKey(sub), '0', '49']);
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map(item => {
      try {
        return JSON.parse(item);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

// プロジェクトを削除したときに、ユーザーの過去プロジェクト一覧からも
// 該当エントリを取り除きます（並び順は維持したまま再構築します）。
async function removeUserProject(sub, id) {
  if (!sub) return true;
  const raw = await redisCall(['LRANGE', userProjectsKey(sub), '0', '49']);
  if (!raw || !Array.isArray(raw) || !raw.length) return true;
  const remaining = raw.filter(item => {
    try {
      const parsed = JSON.parse(item);
      return parsed.id !== id;
    } catch (e) {
      return true;
    }
  });
  if (remaining.length === raw.length) return true;
  await redisCall(['DEL', userProjectsKey(sub)]);
  for (const item of remaining) {
    await redisCall(['RPUSH', userProjectsKey(sub), item]);
  }
  return true;
}

module.exports = {
  isConfigured,
  getProject,
  setProject,
  deleteProject,
  genId,
  genToken,
  addUserProject,
  getUserProjects,
  removeUserProject
};
