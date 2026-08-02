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
    if (!body.token || body.token !== data.editToken) {
      res.status(403).json({ error: '権限がありません' });
      return;
    }
    data.responses = {};
    await setProject(id, data);
    res.status(200).json({ responses: {} });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
