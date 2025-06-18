// server.js (完全版)
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

// ファイルアップロード設定（モバイル対応）
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MBに拡張（モバイル音声対応）
  },
  fileFilter: (req, file, cb) => {
    // より広範囲の音声形式を許可
    const allowedMimes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-m4a',
      'audio/m4a',
      'audio/aac'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.log('非対応MIME型:', file.mimetype);
      cb(new Error(`非対応の音声形式です: ${file.mimetype}`), false);
    }
  }
});

// 音声を Base64 に変換するヘルパー関数
function bufferToBase64(buffer) {
  return buffer.toString('base64');
}

// 音声認識・分類API（iPhone対応版）
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== 音声認識リクエスト開始 ===');
    console.log('ファイル情報:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    // APIキーの存在確認
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY が設定されていません');
      return res.status(500).json({ 
        error: 'API設定エラー',
        transcript: 'API設定に問題があります',
        categorized_items: []
      });
    }

    const categories = JSON.parse(req.body.categories || '[]');
    const audioBuffer = req.file.buffer;
    let mimeType = req.file.mimetype;

    console.log('カテゴリ数:', categories.length);
    console.log('音声ファイルサイズ:', audioBuffer.length);

    // iPhone特有のMIME型を標準化
    if (mimeType === 'audio/mp4' || mimeType === 'audio/m4a' || mimeType === 'audio/x-m4a') {
      console.log('iPhone音声ファイルを検出、標準形式として処理');
      mimeType = 'audio/mp4'; // 統一
    }

    // 音声をBase64に変換
    const base64Audio = bufferToBase64(audioBuffer);
    console.log('Base64変換完了, 長さ:', base64Audio.length);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // iPhone対応: JSONを使わない単純なプロンプト
    const prompt = `この音声ファイルの内容を日本語で文字起こししてください。

音声が聞き取れない場合は「音声が不明瞭でした」と回答してください。
マークダウンやJSON形式は使わず、普通の文章で回答してください。`;

    console.log('Gemini APIリクエスト送信中...');
    console.log('使用MIME型:', mimeType);
    
    try {
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        }
      ]);

      console.log('Gemini APIレスポンス受信');
      const response = await result.response;
      const content = response.text();

      console.log('=== Gemini API生レスポンス ===');
      console.log('レスポンス長:', content.length);
      console.log('レスポンス内容:', content);
      console.log('=== レスポンス終了 ===');

      // JSONを期待せず、プレーンテキストとして処理
      const finalResult = {
        transcript: content.trim() || '音声認識に失敗しました',
        categorized_items: []
      };

      console.log('最終レスポンス:', finalResult);
      res.json(finalResult);

    } catch (geminiError) {
      console.error('Gemini API エラー:', geminiError);
      
      // Gemini API固有のエラーハンドリング
      if (geminiError.message.includes('SAFETY')) {
        res.json({
          transcript: '音声の内容が安全フィルターにより処理できませんでした',
          categorized_items: []
        });
      } else if (geminiError.message.includes('QUOTA_EXCEEDED')) {
        res.status(429).json({
          error: 'API利用制限に達しました',
          transcript: 'API利用制限のため処理できませんでした',
          categorized_items: []
        });
      } else {
        res.status(500).json({
          error: 'Gemini API エラー',
          transcript: `API処理エラー: ${geminiError.message}`,
          categorized_items: []
        });
      }
    }

  } catch (error) {
    console.error('=== 全体エラー ===');
    console.error('エラー名:', error.name);
    console.error('エラーメッセージ:', error.message);
    console.error('エラースタック:', error.stack);
    console.error('=== エラー終了 ===');
    
    res.status(500).json({ 
      error: '音声認識処理中にエラーが発生しました',
      details: `${error.name}: ${error.message}`,
      transcript: `処理エラー: ${error.message}`,
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

// テスト用モックAPI（緊急対応）
app.post('/api/transcribe-mock', upload.single('audio'), async (req, res) => {
  try {
    console.log('モックAPI呼び出し');
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    // ファイル情報をログ出力
    console.log('ファイル情報:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    // モック応答を返す
    const mockResponse = {
      transcript: `音声ファイル（${req.file.mimetype}, ${Math.round(req.file.size/1024)}KB）を受信しました。実際の音声認識APIではここに文字起こし結果が表示されます。`,
      categorized_items: [
        {
          category: '価格情報',
          text: 'モックデータ: 商品価格について',
          confidence: 0.9,
          timestamp: new Date().toLocaleTimeString()
        }
      ]
    };

    console.log('モックレスポンス:', mockResponse);
    res.json(mockResponse);

  } catch (error) {
    console.error('モックAPIエラー:', error);
    res.status(500).json({
      error: 'モックAPI処理エラー',
      transcript: 'モックAPI処理中にエラーが発生しました',
      categorized_items: []
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