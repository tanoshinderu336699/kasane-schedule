const { verifyGoogleIdToken } = require('../../lib/googleAuth');
const { createSessionCookie, isSessionConfigured } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: 'Googleログインが設定されていません（GOOGLE_CLIENT_ID未設定）。管理者にお問い合わせください。' });
    return;
  }
  if (!isSessionConfigured()) {
    res.status(503).json({ error: 'セッションの設定が未完了です（SESSION_SECRET未設定）。管理者にお問い合わせください。' });
    return;
  }
  try {
    const body = req.body || {};
    const credential = body.credential;
    if (!credential) {
      res.status(400).json({ error: 'credentialが必要です' });
      return;
    }
    const payload = await verifyGoogleIdToken(credential, clientId);
    const user = {
      sub: payload.sub,
      email: payload.email || '',
      name: payload.name || payload.email || 'ユーザー',
      picture: payload.picture || ''
    };
    const cookie = createSessionCookie(user);
    res.setHeader('Set-Cookie', cookie);
    res.status(200).json({ ok: true, user: { name: user.name, email: user.email, picture: user.picture } });
  } catch (e) {
    res.status(401).json({ error: 'ログインの検証に失敗しました：' + (e.message || '') });
  }
};
