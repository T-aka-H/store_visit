// server.js (本番版)
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

// 音声認識・分類API
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
      mimeType = 'audio/mp4';
    }

    // 音声をBase64に変換
    const base64Audio = bufferToBase64(audioBuffer);
    console.log('Base64変換完了, 長さ:', base64Audio.length);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // シンプルなプロンプト
    const prompt = `この音声ファイルの内容を日本語で文字起こししてください。

以下のカテゴリに関連する内容があれば、該当するカテゴリ名と内容を教えてください：

カテゴリ：
- 価格情報（商品の価格、特売情報、値段に関する内容）
- 売り場情報（売り場レイアウト、陳列、棚に関する内容）
- 客層・混雑度（お客様、混雑状況、客層に関する内容）
- 商品・品揃え（商品の種類、品揃え、欠品に関する内容）
- 店舗環境（清潔さ、照明、音楽、空調に関する内容）

以下のJSON形式で回答してください：
{
  "transcript": "音声の文字起こし内容",
  "categorized_items": [
    {
      "category": "該当カテゴリ名",
      "text": "カテゴリに関連する具体的な内容",
      "confidence": 0.8
    }
  ]
}

音声が聞き取れない場合は transcript のみ返してください。`;

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

      // JSONを試行、失敗時はプレーンテキストとして処理
      let finalResult = {
        transcript: '',
        categorized_items: []
      };

      try {
        console.log('=== JSON解析試行開始 ===');
        
        // JSONコードブロックを除去
        let cleanContent = content.replace(/```json|```/g, '').trim();
        console.log('クリーンアップ後:', cleanContent.substring(0, 200) + '...');
        
        // JSON全体を解析
        const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('JSON形式検出:', jsonMatch[0].substring(0, 100) + '...');
          const parsedJson = JSON.parse(jsonMatch[0]);
          console.log('JSON解析成功:', parsedJson);
          
          finalResult = {
            transcript: parsedJson.transcript || content.trim(),
            categorized_items: Array.isArray(parsedJson.categorized_items) ? parsedJson.categorized_items : []
          };
          
          console.log('最終結果（JSON）:', finalResult);
        } else {
          throw new Error('JSON形式が見つかりません');
        }
      } catch (parseError) {
        console.log('=== JSON解析失敗、キーワードマッチング開始 ===');
        console.log('解析エラー:', parseError.message);
        
        // プレーンテキストとして処理し、キーワードマッチング
        finalResult = {
          transcript: content.trim(),
          categorized_items: []
        };

        // より詳細なキーワードマッチング
        const keywords = {
          '価格情報': ['円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引', '税込', '税抜', 'コスト'],
          '売り場情報': ['売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド', 'ゴンドラ'],
          '客層・混雑度': ['客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い', '人'],
          '商品・品揃え': ['商品', '品揃え', '欠品', '在庫', '種類', '品目', 'アイテム', 'SKU', '商材'],
          '店舗環境': ['店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調', '広い', '狭い', 'BGM', '温度']
        };

        console.log('キーワードマッチング対象テキスト:', content);

        Object.entries(keywords).forEach(([category, keywordList]) => {
          const matchedKeywords = keywordList.filter(keyword => content.includes(keyword));
          
          if (matchedKeywords.length > 0) {
            console.log(`カテゴリ「${category}」でマッチ:`, matchedKeywords);
            
            finalResult.categorized_items.push({
              category: category,
              text: content.trim(),
              confidence: 0.6 + (matchedKeywords.length * 0.1) // マッチした数に応じて信頼度調整
            });
          }
        });

        console.log('キーワードマッチング結果:', finalResult.categorized_items);

        // 重複除去
        const uniqueItems = [];
        const seen = new Set();
        finalResult.categorized_items.forEach(item => {
          const key = `${item.category}-${item.text.substring(0, 50)}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueItems.push(item);
          }
        });
        finalResult.categorized_items = uniqueItems;
        
        console.log('重複除去後:', finalResult.categorized_items);
      }

      // transcriptが空の場合のフォールバック
      if (!finalResult.transcript || finalResult.transcript.trim() === '') {
        finalResult.transcript = content.trim() || '音声認識に失敗しました';
      }

      // categorized_itemsが配列でない場合の修正
      if (!Array.isArray(finalResult.categorized_items)) {
        finalResult.categorized_items = [];
      }

      console.log('=== 最終レスポンス送信 ===');
      console.log('transcript:', finalResult.transcript);
      console.log('categorized_items数:', finalResult.categorized_items.length);
      console.log('categorized_items:', finalResult.categorized_items);
      
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