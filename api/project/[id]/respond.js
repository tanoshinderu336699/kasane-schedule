const { getProject, setProject, isConfigured } = require('../../../lib/store');
const { isEmailConfigured, sendEmail, escapeHtml } = require('../../../lib/email');

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
    // 主催者が代わりに修正する場合、修正フォームにはパスワードが入力されないため、
  // 空欄のまま保存すると本人が設定したパスワードが消えてしまう。
  // ホストからの編集で、かつパスワード欄が空、かつ既存の回答がある場合は、
  // 既存のパスワードをそのまま引き継ぐ。
  let finalPassword = submittedPassword;
    if (isHostRequest && !submittedPassword && existing) {
      finalPassword = String(existing.password || '');
    }
    const comment = String(body.comment || '').slice(0, 500);
    data.responses[name] = {
      name,
      availability,
      originalText: String(body.originalText || '').slice(0, 2000),
      comment,
      password: finalPassword,
      createdAt,
      updatedAt: now
    };
    await setProject(id, data);

  // プロジェクト作成者がGoogleアカウントでログインして作成しており、通知先メール
  // アドレスが保存されている場合のみ、回答があったことを知らせる通知メールを送る。
  // 未ログインで作成されたプロジェクトでは ownerEmail が null のため、何も送らない。
  // 通知メールの送信に失敗しても、回答自体の保存は成功として扱う（処理を止めない）。
  if (data.ownerEmail && isEmailConfigured()) {
    try {
      const projectName = (data.project && data.project.name) || '名称未設定プロジェクト';
      const summaryText = String(body.summaryText || '').slice(0, 4000).trim();
      const adminUrl = `https://${req.headers.host}/app.html?id=${id}&token=${data.editToken}`;
      const subject = `【KASANE】${projectName} に ${name}さんが回答しました`;
      const detailText = summaryText || '（参加可能な日程は選択されていません）';
      const commentText = comment ? `\n\n【コメント】\n${comment}` : '';
      const text =
        `${name}さんが「${projectName}」の日程調整に回答しました。\n\n` +
        `【参加可能な日程】\n${detailText}${commentText}\n\n` +
        `管理画面で回答状況を確認できます:\n${adminUrl}\n\n` +
        `---\nこのメールは KASANE（日程調整アプリ）から自動送信されています。`;
      const html =
        `<p>${escapeHtml(name)}さんが「${escapeHtml(projectName)}」の日程調整に回答しました。</p>` +
        `<p><strong>【参加可能な日程】</strong><br/><pre style="font-family:inherit;white-space:pre-wrap;line-height:1.7;margin:4px 0;">${escapeHtml(detailText)}</pre></p>` +
        (comment ? `<p><strong>【コメント】</strong><br/>${escapeHtml(comment)}</p>` : '') +
        `<p><a href="${adminUrl}">管理画面で回答状況を確認する</a></p>` +
        `<hr/><p style="color:#888;font-size:12px">このメールは KASANE（日程調整アプリ）から自動送信されています。</p>`;
      await sendEmail({ to: data.ownerEmail, subject, text, html });
    } catch (e) {
      // 通知メールの送信失敗は無視する（回答保存自体は成功として扱う）
    }
  }

  res.status(200).json({
    // 主催者からのリクエストには、パスワードを含む生の回答データを返す
    // （管理画面でパスワード一覧を表示・変更できるようにするため）。
    responses: isHostRequest ? data.responses : sanitizeResponses(data.responses),
    // 送信した本人（または代理で修正した主催者）にだけ、確認画面に表示するためのパスワードを返す
    password: finalPassword
  });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
