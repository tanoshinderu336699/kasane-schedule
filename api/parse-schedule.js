// 「言葉で日程を入力」を Gemini 1.5 Flash で構造化データに変換する API
// 環境変数 GEMINI_API_KEY が必要（Google AI Studio で発行）

const MODEL = 'gemini-1.5-flash';

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function buildPrompt({ text, startDate, endDate, startTime, endTime, slotMinutes }) {
  return `あなたは日程調整アプリのアシスタントです。
ユーザーが自由な日本語の文章で入力した予定の可否を、候補日程に基づいて構造化データ（JSON）に変換してください。

【今日の日付】${todayStr()}
【候補期間】${startDate} 〜 ${endDate}
【候補時間帯】${startTime} 〜 ${endTime}（${slotMinutes}分刻み）

【出力ルール】
- entries の各要素の date は "YYYY-MM-DD" 形式で、候補期間内の日付のみ出力してください。
- type は "yes"（○ 行ける）、"maybe"（△ 行けるかも）、"erase"（消す・行けない・対象外にする）のいずれか。
- from / to は "HH:MM" 形式の時刻範囲。時間の指定がなければ null にしてください（終日を意味します）。
- 「〇日以外はOK」のような除外表現は、候補期間内の該当しない日をすべて yes、除外された日を erase として出力してください。
- 「来週の月曜日」「明日」のような相対的な表現は、今日の日付を基準に解釈してください。
- 文章から読み取れない、または候補期間外の日付は出力しないでください。
- 該当するエントリが無ければ entries は空配列にしてください。
- summary には日本語で1〜2文の短い要約を書いてください。

【ユーザーの入力文章】
${text}
`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (!isConfigured()) {
    res.status(503).json({
      error:
        'Gemini API キーが未設定です。Vercel の環境変数 GEMINI_API_KEY を設定してください。'
    });
    return;
  }
  try {
    const body = req.body || {};
    const text = String(body.text || '').slice(0, 2000).trim();
    if (!text) {
      res.status(400).json({ error: '文章を入力してください。' });
      return;
    }
    const prompt = buildPrompt({
      text,
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      startTime: body.startTime || '09:00',
      endTime: body.endTime || '22:00',
      slotMinutes: body.slotMinutes || 30
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: 'string' },
                    type: { type: 'string', enum: ['yes', 'maybe', 'erase'] },
                    from: { type: 'string', nullable: true },
                    to: { type: 'string', nullable: true }
                  },
                  required: ['date', 'type']
                }
              },
              summary: { type: 'string' }
            },
            required: ['entries', 'summary']
          }
        }
      })
    });

    const data = await geminiRes.json();
    if (!geminiRes.ok) {
      const message = data?.error?.message || 'Gemini API の呼び出しに失敗しました。';
      res.status(geminiRes.status === 429 ? 429 : 502).json({ error: message });
      return;
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      res.status(502).json({ error: 'Gemini から解析結果を取得できませんでした。' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      res.status(502).json({ error: '解析結果の形式が不正でした。' });
      return;
    }

    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';

    res.status(200).json({ entries, summary });
  } catch (e) {
    res.status(500).json({ error: e.message || 'サーバーエラーが発生しました' });
  }
};
