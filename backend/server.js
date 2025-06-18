// server.js
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Gemini AI インスタンス
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ファイルアップロード設定
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB制限
  }
});

// 音声を Base64 に変換するヘルパー関数
function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

// 音声認識・分類API
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('音声認識リクエスト受信');
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    const categories = JSON.parse(req.body.categories || '[]');
    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // 音声をBase64に変換
    const base64Audio = bufferToBase64(audioBuffer);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
以下の音声データは店舗視察の音声記録です。音声の内容を日本語でテキスト化し、以下のカテゴリに分類してください：

カテゴリ:
${categories.map(cat => `- ${cat.name}: ${cat.description}`).join('\n')}

出力形式（必ずJSON形式で応答してください）:
{
  "transcript": "音声の完全なテキスト化",
  "categorized_items": [
    {
      "category": "カテゴリ名",
      "text": "該当する発言内容",
      "confidence": 0.8
    }
  ]
}

重要な注意事項:
- 音声に関連しない内容や不明瞭な部分は除外してください
- カテゴリに該当しない内容は無視してください
- 必ずJSON形式で応答してください
- confidenceは0.0-1.0の範囲で設定してください
`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Audio
        }
      }
    ]);

    const response = await result.response;
    const content = response.text();

    console.log('Gemini API応答:', content);

    // JSONを抽出して解析
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedResult = JSON.parse(jsonMatch[0]);
        res.json(parsedResult);
      } else {
        // JSONが見つからない場合のフォールバック
        res.json({
          transcript: content,
          categorized_items: []
        });
      }
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      res.json({
        transcript: content,
        categorized_items: []
      });
    }

  } catch (error) {
    console.error('音声認識エラー:', error);
    res.status(500).json({ 
      error: '音声認識処理中にエラーが発生しました',
      details: error.message 
    });
  }
});

// AI インサイト生成API
app.post('/api/generate-insights', async (req, res) => {
  try {
    console.log('インサイト生成リクエスト受信');
    
    const { storeName, categories, transcript } = req.body;

    if (!categories || categories.length === 0) {
      return res.status(400).json({ error: '分析対象のデータがありません' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
あなたは小売業界の専門コンサルタントです。以下の店舗視察データを分析し、実用的なビジネスインサイトを生成してください。

店舗名: ${storeName}

視察データ:
${categories.map(cat => `
### ${cat.name}
${cat.items.join('\n')}
`).join('\n')}

音声ログ:
${transcript}

以下の観点から分析してください:

1. **競合優位性分析**
   - この店舗の強み・弱み
   - 競合との差別化ポイント

2. **改善提案**
   - 具体的な改善アクション
   - 優先度付きの提案

3. **顧客体験分析**
   - 客層・動線・満足度の観点
   - CX向上のポイント

4. **収益性向上策**
   - 売上向上のための施策
   - コスト最適化の提案

5. **リスク要因**
   - 懸念事項や注意すべき点

各項目について、具体的で実行可能な内容で回答してください。データに基づいた根拠も示してください。
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const insights = response.text();

    console.log('インサイト生成完了');
    res.json({ insights });

  } catch (error) {
    console.error('インサイト生成エラー:', error);
    res.status(500).json({ 
      error: 'インサイト生成中にエラーが発生しました',
      details: error.message 
    });
  }
});

// 質問応答API
app.post('/api/ask-question', async (req, res) => {
  try {
    console.log('質問応答リクエスト受信');
    
    const { question, storeName, categories, transcript } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: '質問が必要です' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
あなたは店舗視察データの専門アナリストです。以下のデータに基づいて質問に回答してください。

店舗名: ${storeName}

視察データ:
${categories.map(cat => `
### ${cat.name}
${cat.items.join('\n')}
`).join('\n')}

音声ログ:
${transcript}

質問: ${question}

回答の際は以下を心がけてください:
- データに基づいた具体的な回答
- 推測の場合は明示する
- 実用的で actionable な内容
- 簡潔で分かりやすい表現
- データが不足している場合は正直に伝える

回答:
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    console.log('質問応答完了');
    res.json({ answer });

  } catch (error) {
    console.error('質問応答エラー:', error);
    res.status(500).json({ 
      error: '質問応答処理中にエラーが発生しました',
      details: error.message 
    });
  }
});

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    gemini_configured: !!process.env.GEMINI_API_KEY 
  });
});

// エラーハンドリング
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'サーバー内部エラーが発生しました',
    details: error.message 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});