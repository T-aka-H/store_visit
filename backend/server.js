// server.js (Speech-to-Text対応版)
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
    fileSize: 10 * 1024 * 1024 // 10MB制限
  },
  fileFilter: (req, file, cb) => {
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

// 音声認識・分類API（ブラウザベース + Geminiバックアップ）
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== 音声認識開始 ===');
    
    // ブラウザからの音声認識テキストを確認
    const browserTranscript = req.body.transcript;
    
    if (browserTranscript && browserTranscript.trim()) {
      console.log('ブラウザ音声認識結果:', browserTranscript);
      
      // カテゴリ自動分類（キーワードマッチング）
      const categorizedItems = [];
      const keywords = {
        '価格情報': ['円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引', '税込', '税抜', 'コスト'],
        '売り場情報': ['売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド', 'ゴンドラ'],
        '客層・混雑度': ['客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い', '人'],
        '商品・品揃え': ['商品', '品揃え', '欠品', '在庫', '種類', '品目', 'アイテム', 'SKU', '商材'],
        '店舗環境': ['店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調', '広い', '狭い', 'BGM', '温度']
      };

      Object.entries(keywords).forEach(([category, keywordList]) => {
        const matchedKeywords = keywordList.filter(keyword => browserTranscript.includes(keyword));
        
        if (matchedKeywords.length > 0) {
          console.log(`カテゴリ「${category}」でマッチ:`, matchedKeywords);
          
          categorizedItems.push({
            category: category,
            text: browserTranscript,
            confidence: Math.min(0.9, 0.6 + (matchedKeywords.length * 0.1))
          });
        }
      });

      return res.json({
        transcript: browserTranscript,
        categorized_items: categorizedItems,
        source: 'browser'
      });
    }

    // ブラウザでの音声認識が失敗した場合、Geminiをバックアップとして使用
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルまたはテキストが必要です' });
    }

    console.log('=== Geminiバックアップ処理開始 ===');
    console.log('ファイル情報:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64Audio = bufferToBase64(req.file.buffer);

      const prompt = `この音声ファイルの内容を日本語で文字起こししてください。音声が聞き取れない場合は「音声が不明瞭でした」と回答してください。`;

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: base64Audio
          }
        }
      ]);

      const response = await result.response;
      const content = response.text().trim();

      console.log('Geminiバックアップ成功:', content);

      // カテゴリ自動分類（キーワードマッチング）
      const categorizedItems = [];
      const keywords = {
        '価格情報': ['円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引', '税込', '税抜', 'コスト'],
        '売り場情報': ['売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド', 'ゴンドラ'],
        '客層・混雑度': ['客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い', '人'],
        '商品・品揃え': ['商品', '品揃え', '欠品', '在庫', '種類', '品目', 'アイテム', 'SKU', '商材'],
        '店舗環境': ['店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調', '広い', '狭い', 'BGM', '温度']
      };

      Object.entries(keywords).forEach(([category, keywordList]) => {
        const matchedKeywords = keywordList.filter(keyword => content.includes(keyword));
        
        if (matchedKeywords.length > 0) {
          console.log(`カテゴリ「${category}」でマッチ:`, matchedKeywords);
          
          categorizedItems.push({
            category: category,
            text: content,
            confidence: Math.min(0.9, 0.6 + (matchedKeywords.length * 0.1))
          });
        }
      });

      res.json({
        transcript: content || 'バックアップ音声認識に失敗しました',
        categorized_items: categorizedItems,
        source: 'gemini'
      });

    } catch (geminiError) {
      console.error('Geminiバックアップ失敗:', geminiError);
      
      res.status(500).json({
        error: '音声認識エラー',
        transcript: `音声認識に失敗しました: ${geminiError.message}`,
        categorized_items: []
      });
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

// AI文脈理解による分類API
app.post('/api/classify-context', async (req, res) => {
  try {
    console.log('=== AI文脈分類リクエスト受信 ===');
    const { text, categories } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'テキストが必要です' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY が設定されていません');
      return res.status(500).json({ error: 'API設定エラー' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const categoriesText = categories.map(cat => 
      `- ${cat.name}: ${cat.description}`
    ).join('\n');

    const prompt = `以下のテキストを分析し、最も適切なカテゴリに分類してください。

分析対象テキスト: "${text}"

利用可能カテゴリ:
${categoriesText}

分類ルール:
1. テキストの文脈と意味を理解して分類する
2. キーワードの有無ではなく、内容の本質で判断する
3. 複数のカテゴリに該当する場合は、最も関連性の高いものを選ぶ
4. 分類理由を簡潔に説明する
5. 信頼度を0.1〜1.0で評価する

以下のJSON形式で回答してください:
{
  "classifications": [
    {
      "category": "カテゴリ名",
      "text": "分析対象テキスト",
      "confidence": 0.9,
      "reason": "分類理由の簡潔な説明"
    }
  ]
}

該当するカテゴリがない場合は空の配列を返してください。`;

    console.log('Gemini API で文脈分析中...');
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const content = response.text();

    console.log('Gemini文脈分析レスポンス:', content);

    try {
      // JSONを抽出・解析
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classification = JSON.parse(jsonMatch[0]);
        
        if (classification.classifications && Array.isArray(classification.classifications)) {
          console.log('文脈分類成功:', classification.classifications);
          res.json(classification);
        } else {
          console.log('有効な分類結果なし');
          res.json({ classifications: [] });
        }
      } else {
        console.log('JSON形式が見つからない');
        res.json({ classifications: [] });
      }
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      res.json({ classifications: [] });
    }

  } catch (error) {
    console.error('AI文脈分類エラー:', error);
    res.status(500).json({ 
      error: '文脈分類処理中にエラーが発生しました',
      classifications: []
    });
  }
});

// AI インサイト生成API
app.post('/api/generate-insights', async (req, res) => {
  try {
    console.log('インサイト生成リクエスト受信');
    console.log('リクエストボディ:', JSON.stringify(req.body, null, 2));
    
    const { storeName, categories, transcript } = req.body;

    if ((!categories || categories.length === 0) && (!transcript || transcript.trim() === '')) {
      console.log('分析対象データなし');
      return res.status(400).json({ error: '分析対象のデータがありません' });
    }

    // APIキー確認
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY が設定されていません');
      return res.status(500).json({ 
        error: 'API設定エラー',
        insights: 'API設定に問題があります。管理者にお問い合わせください。'
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // より安全で確実なプロンプト
    const categoriesText = categories && categories.length > 0 
      ? categories.map(cat => `### ${cat.name}\n${cat.items.join('\n')}`).join('\n\n')
      : '（カテゴリデータなし）';

    const transcriptText = transcript && transcript.trim() 
      ? transcript 
      : '（音声ログなし）';

    const prompt = `あなたは小売業界の専門コンサルタントです。以下の店舗視察データを分析し、ビジネスインサイトを生成してください。

店舗名: ${storeName || '未設定'}

視察データ:
${categoriesText}

音声ログ:
${transcriptText}

以下の観点から簡潔に分析してください:

1. 店舗の強みと弱み
2. 改善提案（優先度付き）
3. 顧客体験の評価
4. 収益性向上のアイデア
5. 注意すべきリスク要因

各項目について具体的で実行可能な内容で回答してください。データが不足している場合は、一般的な小売業の観点から推奨事項を提示してください。`;

    console.log('Gemini APIリクエスト送信中...');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const insights = response.text();

    console.log('インサイト生成完了, 長さ:', insights.length);
    res.json({ insights });

  } catch (error) {
    console.error('インサイト生成エラー詳細:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // より詳細なエラーハンドリング
    let userMessage = 'インサイト生成中にエラーが発生しました。';
    
    if (error.message.includes('SAFETY')) {
      userMessage = '安全フィルターによりインサイトを生成できませんでした。';
    } else if (error.message.includes('QUOTA_EXCEEDED')) {
      userMessage = 'API利用制限に達しました。しばらく時間をおいて再試行してください。';
    } else if (error.message.includes('INVALID_ARGUMENT')) {
      userMessage = 'データ形式に問題があります。録音内容を確認してください。';
    }
    
    res.status(500).json({ 
      error: userMessage,
      details: error.message,
      insights: `エラーが発生したため、インサイトを生成できませんでした。\n\nエラー詳細: ${error.message}\n\n別の方法でデータを入力し直すか、しばらく時間をおいて再試行してください。`
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