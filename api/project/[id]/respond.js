const { getProject, setProject, isConfigured } = require('../../../lib/store');

module.exports = async (req, res) => {
if (req.method !== 'POST') {
res.status(405).json({ error: 'Method Not Allowed' });
return;
}
if (!isConfigured()) {
res.status(503).json({
error:
'データベースが未接続です。Vercel の Storage で Upstash Redis を追加し、プロジェクトに接続してください。'
});
return;
}
const { id } = req.query;
try {
const data = await getProject(id);
if (!data) {
res.status(404).json({ error: 'プロジェクトが見つかりませんでした' });
return;
}
const body = req.body || {};
const name = String(body.name || '').trim().slice(0, 40);
if (!name) {
res.status(400).json({ error: 'お名前を入力してください' });
return;
}
const availability =
body.availability && typeof body.availability === 'object' ? body.availability : {};
if (!Object.keys(availability).length) {
res.status(400).json({ error: '参加できる日程を選択してください' });
return;
}
data.responses = data.responses || {};
data.responses[name] = {
name,
availability,
originalText: String(body.originalText || '').slice(0, 2000),
comment: String(body.comment || '').slice(0, 500),
updatedAt: new Date().toISOString()
};
await setProject(id, data);
res.status(200).json({ responses: data.responses });
} catch (e) {
res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
}
};
