const { getSessionUser } = require('../../lib/session');
const { getUserProjects, isConfigured } = require('../../lib/store');

module.exports = async (req, res) => {
  const user = getSessionUser(req.headers.cookie);
  if (!user) {
    res.status(200).json({ projects: [], loggedIn: false });
    return;
  }
  if (!isConfigured()) {
    res.status(200).json({ projects: [], loggedIn: true });
    return;
  }
  try {
    const projects = await getUserProjects(user.sub);
    res.status(200).json({ projects, loggedIn: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
