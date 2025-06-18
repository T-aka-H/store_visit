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
    console.log('ファイル情報:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    const categories = JSON.parse(req.body.categories || '[]');
    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // 音声をBase64に変換
    const base64Audio = bufferToBase64(audioBuffer);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // より明確で簡潔なプロンプト
    const prompt = `
音声の内容を日本語でテキスト化し、以下のカテゴリに分類してください。

カテゴリ:
${categories.map(cat => `- ${cat.name}`).join('\n')}

必ず以下のJSON形式で応答してください:
{
  "transcript": "音声をテキスト化した内容",
  "categorized_items": [
    {
      "category": "該当するカテゴリ名",
      "text": "該当する部分のテキスト",
      "confidence": 0.8
    }
  ]
}

音声が不明瞭な場合は、transcriptに「音声が不明瞭でした」と記載し、categorized_itemsは空配列にしてください。
`;

    console.log('Gemini APIにリクエスト送信');
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

    console.log('Gemini API生レスポンス:', content);

    // より堅牢なJSON抽出
    let parsedResult;
    try {
      // まず全体をJSONとして解析を試みる
      parsedResult = JSON.parse(content);
    } catch (firstParseError) {
      console.log('全体のJSON解析失敗、部分抽出を試行');
      
      // JSONブロックを抽出して解析
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedResult = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          console.error('JSON抽出・解析失敗:', secondParseError);
          
          // フォールバック: プレーンテキストとして処理
          parsedResult = {
            transcript: content.replace(/```json|```/g, '').trim(),
            categorized_items: []
          };
        }
      } else {
        console.log('JSONブロック未発見、フォールバック処理');
        parsedResult = {
          transcript: content,
          categorized_items: []
        };
      }
    }

    // レスポンス形式の検証と正規化
    const normalizedResponse = {
      transcript: parsedResult.transcript || content || '音声認識に失敗しました',
      categorized_items: Array.isArray(parsedResult.categorized_items) 
        ? parsedResult.categorized_items 
        : []
    };

    console.log('正規化されたレスポンス:', normalizedResponse);
    res.json(normalizedResponse);

  } catch (error) {
    console.error('音声認識エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: '音声認識処理中にエラーが発生しました',
      details: error.message,
      transcript: '処理中にエラーが発生しました',
      categorized_items: []
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
    console.error('インサイト生成エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: 'インサイト生成中にエラーが発生しました',
      details: error.message,
      insights: 'エラーが発生したため、インサイトを生成できませんでした。'
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
    console.error('質問応答エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: '質問応答処理中にエラーが発生しました',
      details: error.message,
      answer: 'エラーが発生したため、質問に回答できませんでした。'
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