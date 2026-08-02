const { setProject, genId, genToken, isConfigured } = require('../lib/store');

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
      createdAt: new Date().toISOString()
    };

    if (project.startDate > project.endDate) {
      res.status(400).json({ error: '終了日は開始日以降にしてください' });
      return;
    }

    const id = genId(6);
    const editToken = genToken(18);

    await setProject(id, { project, editToken, responses: {} });

    res.status(200).json({ id, token: editToken });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
