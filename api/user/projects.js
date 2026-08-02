const { getSessionUser } = require('../../lib/session');
const { getUserProjects, removeUserProject, isConfigured } = require('../../lib/store');

module.exports = async (req, res) => {
  const user = getSessionUser(req.headers.cookie);
  if (!user) {
    if (req.method === 'DELETE') {
      res.status(401).json({ error: 'ログインが必要です' });
      return;
    }
    res.status(200).json({ projects: [], loggedIn: false });
    return;
  }
  if (!isConfigured()) {
    if (req.method === 'DELETE') {
      res.status(503).json({
        error: 'データベースが未接続です。Vercel の Storage で Upstash Redis を追加し、プロジェクトに接続してください。'
      });
      return;
    }
    res.status(200).json({ projects: [], loggedIn: true });
    return;
  }

  if (req.method === 'DELETE') {
    try {
      const body = req.body || {};
      const id = body.id;
      if (!id) {
        res.status(400).json({ error: 'id is required' });
        return;
      }
      await removeUserProject(user.sub, id);
      res.status(200).json({ removed: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
    }
    return;
  }

  try {
    const projects = await getUserProjects(user.sub);
    res.status(200).json({ projects, loggedIn: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
