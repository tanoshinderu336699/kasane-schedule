const { getProject, setProject, isConfigured } = require('../../../lib/store');

function toDate(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function timeToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function getDates(project) {
  const start = toDate(project.startDate);
  const end = toDate(project.endDate);
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 31) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
function getTimes(project) {
  const start = timeToMinutes(project.startTime);
  const end = timeToMinutes(project.endTime);
  const times = [];
  for (let t = start; t < end; t += Number(project.slotMinutes)) times.push(minutesToTime(t));
  return times;
}
function key(date, time) {
  return `${date}|${time}`;
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
    if (!body.token || body.token !== data.editToken) {
      res.status(403).json({ error: '権限がありません' });
      return;
    }

    const names = ['SHIN', 'りょうちゃん', 'ユカちゃん', 'えみさん', '田中さん', '佐藤さん', '中村さん', '小林さん'];
    const dates = getDates(data.project);
    const times = getTimes(data.project);
    const patterns = [
      { start: 10, end: 18, maybe: [18, 20] },
      { start: 9, end: 17, maybe: [17, 19] },
      { start: 13, end: 21, maybe: [11, 13] },
      { start: 9, end: 15, maybe: [15, 17] },
      { start: 11, end: 19, maybe: [9, 11] },
      { start: 14, end: 22, maybe: [12, 14] },
      { start: 10, end: 16, maybe: [16, 19] },
      { start: 9, end: 14, maybe: [14, 18] }
    ];
    const responses = {};
    names.forEach((name, idx) => {
      const availability = {};
      dates.forEach((d, di) => {
        times.forEach((time) => {
          const hour = Number(time.split(':')[0]);
          const p = patterns[(idx + di) % patterns.length];
          if (hour >= p.start && hour < p.end && ((idx + di) % 5 !== 0 || hour >= 14)) {
            availability[key(ymd(d), time)] = 'yes';
          } else if (hour >= p.maybe[0] && hour < p.maybe[1]) {
            availability[key(ymd(d), time)] = 'maybe';
          }
        });
      });
      responses[name] = { name, availability, originalText: '', updatedAt: new Date().toISOString() };
    });

    data.responses = responses;
    await setProject(id, data);
    res.status(200).json({ responses });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
