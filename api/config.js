// フロントエンドへ公開設定（GoogleログインのクライアントIDなど）を渡すためのAPI。
// クライアントIDはそもそも公開情報のため、ここで返しても問題ありません。

module.exports = async (req, res) => {
  res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
};
