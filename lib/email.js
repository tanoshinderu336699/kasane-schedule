// メール送信の共通ユーティリティ
//
// 送信方法は2種類対応しています（どちらか一方の設定があれば動作します）。
// ① Gmail 経由（推奨・どんな宛先にも送信可能）
//    Vercel の環境変数に GMAIL_USER（Gmailアドレス）と
//    GMAIL_APP_PASSWORD（Googleアカウントで発行したアプリパスワード）を設定してください。
// ② Resend 経由（要 RESEND_API_KEY。独自ドメイン未認証の場合、
//    Resend アカウント登録メールアドレス以外には送信できません）

const nodemailer = require('nodemailer');

function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function isEmailConfigured() {
  return isGmailConfigured() || isResendConfigured();
}

let gmailTransporter = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return gmailTransporter;
}

async function sendViaGmail({ to, subject, text, html }) {
  const transporter = getGmailTransporter();
  await transporter.sendMail({
    from: `KASANE <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text,
    html
  });
}

async function sendViaResend({ to, subject, text, html }) {
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'KASANE <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
      html
    })
  });
  const resendData = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    const message = resendData?.message || 'メール送信に失敗しました。';
    const error = new Error(message);
    error.status = resendRes.status === 429 ? 429 : 502;
    throw error;
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (isGmailConfigured()) {
    await sendViaGmail({ to, subject, text, html });
  } else if (isResendConfigured()) {
    await sendViaResend({ to, subject, text, html });
  } else {
    const error = new Error('メール送信サービスが未設定です。');
    error.status = 503;
    throw error;
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

module.exports = {
  isGmailConfigured,
  isResendConfigured,
  isEmailConfigured,
  sendEmail,
  escapeHtml
};
