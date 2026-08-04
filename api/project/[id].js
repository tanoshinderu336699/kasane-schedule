const { getProject, setProject, deleteProject, removeUserProject, isConfigured } = require('../../lib/store');
const { getSessionUser } = require('../../lib/session');

function toDate(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// 開始日〜終了日の範囲内で「飛ばしたい日（対象から外す日）」を検証・整形する。
// 形式が不正な値や範囲外の日付、重複は取り除き、日付の昇順に並べ替える。
function sanitizeExcludedDates(list, startDate, endDate) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    if (value < startDate || value > endDate) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.sort();
}

// 回答一覧に含まれる修正用パスワードを取り除いたコピーを返す。
// 共有URLを知っている人なら誰でも見られる情報のため、パスワードは絶対に含めない。
function sanitizeResponses(responses) {
  const out = {};
  for (const [name, entry] of Object.entries(responses || {})) {
    const { password, ...rest } = entry || {};
    out[name] = rest;
  }
  return out;
}

module.exports = async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({
      error:
        'データベースが未接続です。Vercel の Storage で Upstash Redis を追加し、プロジェクトに接続してください。'
    });
    return;
  }
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const data = await getProject(id);
    if (!data) {
      res.status(404).json({ error: 'プロジェクトが見つかりませんでした' });
      return;
    }

    if (req.method === 'GET') {
      const token = req.query.token || '';
      const isHost = Boolean(token) && token === data.editToken;
      // excludedDates は後から追加した項目のため、以前作成されたプロジェクトには
      // データが存在しない。存在しない場合は空配列を補って返すことで、
      // 過去のプロジェクトを開いてもエラーにならないようにする。
      const project = { excludedDates: [], ...data.project };
      // 管理者（トークン所有者）には、パスワードを確認・変更できるように生の回答データを返す。
      // 一般の参加者にはこれまで通りパスワードを取り除いたデータのみを返す。
      const responses = isHost ? (data.responses || {}) : sanitizeResponses(data.responses);
      res.status(200).json({ project, responses, isHost });
      return;
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      // 参加者が「修正画面」に進むための、名前＋パスワードの照合専用アクション。
      if (body.action === 'verify') {
        const name = String(body.name || '').trim().slice(0, 40);
        const password = String(body.password || '').slice(0, 40);
        // パスワードが未入力の場合は、常に照合エラーとして修正画面へ進めないようにする。
        if (!password) {
          res.status(403).json({ error: 'パスワードを入力してください' });
          return;
        }
        const entry = (data.responses || {})[name];
        if (!entry) {
          res.status(404).json({ error: 'その名前の回答が見つかりませんでした' });
          return;
        }
        const existingPassword = String(entry.password || '');
        // パスワードが未設定の回答は、本人でも自己修正できない（管理者に設定してもらう必要がある）。
        if (!existingPassword) {
          res.status(403).json({ error: 'この回答にはまだパスワードが設定されていません。主催者に確認してください。' });
          return;
        }
        if (existingPassword !== password) {
          res.status(403).json({ error: 'パスワードが正しくありません' });
          return;
        }
        // 照合に成功した本人にだけ、自分の回答内容（パスワードを含む）を返す。
        res.status(200).json({ entry });
        return;
      }
      // 主催者が、参加者の修正用パスワードを確認・変更するための専用アクション。
      if (body.action === 'setPassword') {
        const token = String(body.token || '');
        if (!token || token !== data.editToken) {
          res.status(403).json({ error: '権限がありません' });
          return;
        }
        const name = String(body.name || '').trim().slice(0, 40);
        const entry = (data.responses || {})[name];
        if (!entry) {
          res.status(404).json({ error: 'その名前の回答が見つかりませんでした' });
          return;
        }
        const newPassword = String(body.password || '').slice(0, 40);
        entry.password = newPassword;
        entry.updatedAt = new Date().toISOString();
        await setProject(id, data);
        res.status(200).json({ ok: true, password: newPassword });
        return;
      }
      res.status(400).json({ error: '不正なリクエストです' });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const token = body.token || '';
      if (!token || token !== data.editToken) {
        res.status(403).json({ error: '編集権限がありません' });
        return;
      }
      const p = body.project || {};
      const next = {
        name: String(p.name || '名称未設定プロジェクト').slice(0, 60).trim() || '名称未設定プロジェクト',
        startDate: p.startDate,
        endDate: p.endDate,
        startTime: p.startTime,
        endTime: p.endTime,
        slotMinutes: Number(p.slotMinutes) || 30,
        meetingMinutes: Number(p.meetingMinutes) || 60,
        excludedDates: [],
        createdAt: data.project.createdAt
      };
      if (!next.startDate || !next.endDate || toDate(next.startDate) > toDate(next.endDate)) {
        res.status(400).json({ error: '終了日は開始日以降にしてください' });
        return;
      }
      if (timeToMinutes(next.startTime) >= timeToMinutes(next.endTime)) {
        res.status(400).json({ error: '終了時間は開始時間より後にしてください' });
        return;
      }
      const spanDays = (toDate(next.endDate) - toDate(next.startDate)) / (1000 * 60 * 60 * 24);
      if (spanDays > 30) {
        res.status(400).json({ error: '調整期間は最大31日までです' });
        return;
      }
      // 開始日〜終了日の範囲内で、飛ばしたい日（対象から外す日）があれば反映する。
      next.excludedDates = sanitizeExcludedDates(p.excludedDates, next.startDate, next.endDate);
      data.project = next;
      await setProject(id, data);
      res.status(200).json({ project: data.project, isHost: true });
      return;
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};
      const token = body.token || req.query.token || '';
      if (!token || token !== data.editToken) {
        res.status(403).json({ error: '削除権限がありません' });
        return;
      }
      await deleteProject(id);
      // 過去に作成したプロジェクト一覧からも、削除したプロジェクトを取り除く。
      // 作成時に保存した所有者IDに加えて、削除操作を行った時点のログインセッションも
      // 念のため対象にすることで、以前から存在するプロジェクトでも一覧から消えるようにする。
      const owners = new Set();
      if (data.ownerSub) owners.add(data.ownerSub);
      const sessionUser = getSessionUser(req.headers.cookie);
      if (sessionUser) owners.add(sessionUser.sub);
      for (const sub of owners) {
        try {
          await removeUserProject(sub, id);
        } catch (e) {
          // 一覧からの削除に失敗しても、プロジェクト自体の削除は成功として扱う
        }
      }
      res.status(200).json({ deleted: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
