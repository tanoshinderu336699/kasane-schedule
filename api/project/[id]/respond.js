const { getProject, setProject, isConfigured } = require('../../../lib/store');

// 保存済みの回答一覧からパスワードを取り除いたコピーを返す。
// GETと同様、respondのレスポンスにも生のパスワードを含めないようにするため。
function sanitizeResponses(responses) {
  const out = {};
  for (const [name, entry] of Object.entries(responses || {})) {
    const { password, ...rest } = entry;
    out[name] = rest;
  }
  return out;
}

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
    const existing = data.responses[name];
    // 主催者（管理用URLのトークンを持つ人）は、参加者本人がパスワードを忘れた場合でも
    // 代わりに修正できるように、パスワード確認を省略できるようにする。
    const hostToken = String(body.token || '');
    const isHostRequest = Boolean(hostToken) && hostToken === data.editToken;
    const submittedPassword = String(body.password || '').slice(0, 40);
    if (existing && !isHostRequest) {
      const existingPassword = String(existing.password || '');
      // 既存の回答に修正用パスワードが設定されている場合のみ、一致を必須にする。
      // （以前パスワードなしで送られた回答は、これまで通り誰でも上書きできる）
      if (existingPassword && existingPassword !== submittedPassword) {
        res.status(403).json({
          error: 'パスワードが正しくないため、修正できませんでした。設定したパスワードをご確認ください。'
        });
        return;
      }
    }
    const now = new Date().toISOString();
    const createdAt = existing && existing.createdAt ? existing.createdAt : now;
    data.responses[name] = {
      name,
      availability,
      originalText: String(body.originalText || '').slice(0, 2000),
      comment: String(body.comment || '').slice(0, 500),
      password: submittedPassword,
      createdAt,
      updatedAt: now
    };
    await setProject(id, data);
    res.status(200).json({
      responses: sanitizeResponses(data.responses),
      // 送信した本人にだけ、確認画面に表示するためのパスワードを返す
      password: submittedPassword
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
