// 回答送信後、内容をメールで控えとして送るための API
// 環境変数 RESEND_API_KEY が必要（https://resend.com で発行）
// 任意で RESEND_FROM（送信元アドレス）も設定可能。未設定時は Resend のテスト用アドレスを使用します。

const { getProject, isConfigured: dbConfigured } = require('../../../lib/store');

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({
      error:
        'メール送信サービスが未設定です。Vercel の環境変数 RESEND_API_KEY を設定してください。'
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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'KASANE <onboarding@resend.dev>',
        to: [email],
        subject,
        text,
        html
      })
    });
    const resendData = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      const message = resendData?.message || 'メール送信に失敗しました。';
      res.status(resendRes.status === 429 ? 429 : 502).json({ error: message });
      return;
    }

    res.status(200).json({ sent: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}
