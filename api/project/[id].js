const { getProject, setProject, isConfigured } = require('../../lib/store');

function toDate(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
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
      res.status(200).json({ project: data.project, responses: data.responses || {}, isHost });
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
      data.project = next;
      await setProject(id, data);
      res.status(200).json({ project: data.project, isHost: true });
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
