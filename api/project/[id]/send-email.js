// 回答送信後、内容をメールで控えとして送るための API
//
// メール送信は lib/email.js の共通ロジック（Gmail優先・Resendフォールバック）を利用します。

const { getProject, isConfigured: dbConfigured } = require('../../../lib/store');
const { isEmailConfigured, sendEmail, escapeHtml } = require('../../../lib/email');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
          res.status(405).json({ error: 'Method Not Allowed' });
          return;
    }
    if (!isEmailConfigured()) {
          res.status(503).json({
                  error:
                            'メール送信サービスが未設定です。Vercel の環境変数 GMAIL_USER / GMAIL_APP_PASSWORD（推奨）または RESEND_API_KEY を設定してください。'
          });
          return;
    }
    if (!dbConfigured()) {
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
          const email = String(body.email || '').trim();
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(email)) {
                  res.status(400).json({ error: '正しいメールアドレスを入力してください。' });
                  return;
          }

      const projectName = String(body.projectName || data.project.name || '名称未設定プロジェクト').slice(0, 200);
          const summary = String(body.summary || '').slice(0, 6000).trim();
          if (!summary) {
                  res.status(400).json({ error: '送信する内容がありません。' });
                  return;
          }

      const subject = `【KASANE】${projectName} の回答控え`;
          const text = `${summary}\n\n---\nこのメールは KASANE（日程調整アプリ）から自動送信されています。`;
          const html = `<pre style="font-family:inherit;white-space:pre-wrap;line-height:1.7;">${escapeHtml(summary)}</pre><hr/><p style="color:#888;font-size:12px">このメールは KASANE（日程調整アプリ）から自動送信されています。</p>`;

      await sendEmail({ to: email, subject, text, html });

      res.status(200).json({ sent: true });
    } catch (e) {
          res.status(e.status || 500).json({ error: e.message || 'サーバーエラーが発生しました' });
    }
};
