const { getSessionUser } = require('../../lib/session');

module.exports = async (req, res) => {
  const user = getSessionUser(req.headers.cookie);
  if (!user) {
    res.status(200).json({ user: null });
    return;
  }
  res.status(200).json({
    user: { name: user.name, email: user.email, picture: user.picture }
  });
};
