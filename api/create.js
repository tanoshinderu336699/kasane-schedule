const { setProject, genId, genToken, isConfigured, addUserProject } = require('../lib/store');
const { getSessionUser } = require('../lib/session');

const DEFAULTS = {
  name: '名称未設定プロジェクト',
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '22:00',
  slotMinutes: 30,
  meetingMinutes: 60
};

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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
  try {
    const body = req.body || {};
    const project = {
      name: String(body.name || DEFAULTS.name).slice(0, 60).trim() || DEFAULTS.name,
      startDate: body.startDate || todayStr(0),
      endDate: body.endDate || todayStr(6),
      startTime: body.startTime || DEFAULTS.startTime,
      endTime: body.endTime || DEFAULTS.endTime,
      slotMinutes: Number(body.slotMinutes) || DEFAULTS.slotMinutes,
      meetingMinutes: Number(body.meetingMinutes) || DEFAULTS.meetingMinutes,
      excludedDates: [],
      createdAt: new Date().toISOString()
    };

    if (project.startDate > project.endDate) {
      res.status(400).json({ error: '終了日は開始日以降にしてください' });
      return;
    }

    // 開始日〜終了日の範囲内で、飛ばしたい日（対象から外す日）があれば反映する。
    project.excludedDates = sanitizeExcludedDates(body.excludedDates, project.startDate, project.endDate);

    const id = genId(6);
    const editToken = genToken(18);

    // ログイン中のユーザーが作成した場合は、削除時に過去プロジェクト一覧からも
    // 取り除けるよう、所有者のユーザーIDをプロジェクトデータ自体にも保存しておく。
    const user = getSessionUser(req.headers.cookie);

    await setProject(id, { project, editToken, responses: {}, ownerSub: user ? user.sub : null });

    // ログイン中のユーザーが作成した場合は、そのユーザーの過去プロジェクト一覧に追加します。
    if (user) {
      try {
        await addUserProject(user.sub, {
          id,
          token: editToken,
          name: project.name,
          createdAt: project.createdAt
        });
      } catch (e) {
        // プロジェクト一覧への追加に失敗しても、作成自体は成功として扱う
      }
    }

    res.status(200).json({ id, token: editToken });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
