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
        '価格情報': [
          '円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引', '税込', '税抜', 'コスト',
          '値上げ', '値下げ', 'プライス', '料金', '定価', '原価', '利益', '粗利', '利幅',
          'お買い得', 'バーゲン', '特価', '安価', '高価', '相場'
        ],
        '売り場情報': [
          '売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド', 'ゴンドラ',
          'コーナー', 'スペース', '売場', '平台', '山積み', 'フェイス', '什器', 'ショーケース',
          'ディスプレイ', '売り場面積', '通路幅', '棚割り', '商品配置', 'POPスペース'
        ],
        '客層・混雑度': [
          '客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い', '人',
          '来店', '客数', '男性', '女性', '学生', '主婦', '会社員', '観光客', '地元',
          '客足', '入店', '退店', '滞在時間', '待ち時間', '行列'
        ],
        '商品・品揃え': [
          '商品', '品揃え', '欠品', '在庫', '種類', '品目', 'アイテム', 'SKU', '商材',
          'ブランド', '新商品', '定番', '季節商品', '限定', '品切れ', '品質', '鮮度',
          'パッケージ', '売れ筋', '死に筋', '回転率', '仕入れ', '発注', '入荷'
        ],
        '店舗環境': [
          '店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調', '広い', '狭い', 'BGM', '温度',
          '雰囲気', '清掃', '匂い', '臭い', '騒音', '快適', '不快', 'トイレ', '休憩所',
          'アクセス', '案内表示', 'サイン', '外観', '内装', '床', '天井', '壁'
        ]
      };

      // 文章を文単位で分割する関数
      function splitIntoSentences(text) {
        // 1. 価格情報を一時的にマーク
        let processedText = text.replace(/(\d+)円/g, '___PRICE___$1円___END___');
        
        // 2. 店舗名を一時的にマーク
        processedText = processedText.replace(/([\u3040-\u309Fー\u30A0-\u30FF\u4E00-\u9FAF]{2,}(?:店|ストア|マート|スーパー))/g, '___STORE___$1___END___');
        
        // 3. 数値+単位を一時的にマーク
        processedText = processedText.replace(/(\d+)([坪平米㎡])/g, '___UNIT___$1$2___END___');

        // 4. 文を分割（句点、感嘆符、疑問符に加えて、「です」「ます」などの文末表現も考慮）
        const segments = processedText.split(/(?:[。．.！!？?]|(?:です|ます)(?![かがのを]))/g);

        // 5. 各セグメントを整形して意味のある文に分割
        const sentences = segments
          .flatMap(segment => {
            // マーカーを元に戻す
            segment = segment
              .replace(/___PRICE___/g, '')
              .replace(/___STORE___/g, '')
              .replace(/___UNIT___/g, '')
              .replace(/___END___/g, '')
              .trim();

            if (!segment) return [];

            // 価格情報を含む部分を分離
            const priceMatches = segment.match(/[^、\s]+\d+円/g) || [];
            const nonPriceText = segment
              .replace(/[^、\s]+\d+円[、\s]*/g, '')
              .trim();

            const results = [];
            if (nonPriceText) {
              results.push(nonPriceText);
            }
            if (priceMatches.length > 0) {
              results.push(priceMatches.join('、'));
            }

            return results;
          })
          .filter(s => s.length > 0);

        return sentences;
      }

      // 文章を分割して処理
      const sentences = splitIntoSentences(browserTranscript);
      console.log('分割された文章:', sentences);

      // 各文に対して分類を実行
      sentences.forEach(sentence => {
        const sentenceCategories = [];

        Object.entries(keywords).forEach(([category, keywordList]) => {
          const matchedKeywords = keywordList.filter(keyword => sentence.includes(keyword));
          
          if (matchedKeywords.length > 0) {
            const confidence = classifyWithContext(sentence, category, matchedKeywords);
            
            sentenceCategories.push({
              category: category,
              text: sentence,
              confidence: confidence,
              reason: `キーワード「${matchedKeywords.join('、')}」を検出し、文脈を考慮して分類しました`
            });
          }
        });

        // 最も確信度の高い分類のみを採用
        if (sentenceCategories.length > 0) {
          const bestMatch = sentenceCategories.reduce((prev, current) => 
            (current.confidence > prev.confidence) ? current : prev
          );
          categorizedItems.push(bestMatch);
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

      const prompt = `あなたは小売店舗の視察データを分析する専門家です。
以下の音声ファイルは店舗視察時の録音データです。以下の手順で分析してください：

1. 音声の文字起こし
- 日本語で正確に文字起こしを行ってください
- 聞き取れない場合は「音声が不明瞭でした」と回答してください
- 話者の口調や感情も可能な限り反映してください

2. 内容の分類
以下のカテゴリに関連する情報を抽出し、分類してください：

価格情報:
- 商品の価格、値段
- セール、割引情報
- 競合との価格比較
- コスト関連の言及

売り場情報:
- 店舗レイアウト
- 商品の陳列方法
- 通路、棚の配置
- 売り場の使い方

客層・混雑度:
- 来店客の特徴
- 年齢層、性別
- 混雑状況
- 客数、客の動き

商品・品揃え:
- 取扱商品の種類
- 品切れ、在庫状況
- 商品の特徴
- 品揃えの傾向

店舗環境:
- 店舗の雰囲気
- 清潔さ、照明
- 温度、空調
- BGM、騒音レベル

以下のJSON形式で回答してください：
{
  "transcript": "文字起こしの内容をここに記載",
  "categories": [
    {
      "category": "カテゴリ名",
      "text": "該当する発言内容",
      "confidence": 0.8  // 0.1-1.0の範囲で確信度を設定
    }
  ]
}

音声が不明瞭な場合でも、聞き取れた部分から最大限の情報抽出を試みてください。`;

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

      try {
        // JSONレスポースのパース
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        let parsedResponse = {
          transcript: '音声認識に失敗しました',
          categories: []
        };

        if (jsonMatch) {
          const jsonContent = JSON.parse(jsonMatch[0]);
          parsedResponse = {
            transcript: jsonContent.transcript || '音声認識に失敗しました',
            categories: jsonContent.categories || []
          };
        }

        // カテゴリごとの分類結果を整形
        const sentences = splitIntoSentences(content);
        const categorizedItems = [];

        sentences.forEach(sentence => {
          const sentenceCategories = [];

          Object.entries(keywords).forEach(([category, keywordList]) => {
            const matchedKeywords = keywordList.filter(keyword => sentence.includes(keyword));
            
            if (matchedKeywords.length > 0) {
              const confidence = classifyWithContext(sentence, category, matchedKeywords);
              
              sentenceCategories.push({
                category: category,
                text: sentence,
                confidence: confidence,
                reason: `キーワード「${matchedKeywords.join('、')}」を検出し、文脈を考慮して分類しました`
              });
            }
          });

          // 最も確信度の高い分類のみを採用
          if (sentenceCategories.length > 0) {
            const bestMatch = sentenceCategories.reduce((prev, current) => 
              (current.confidence > prev.confidence) ? current : prev
            );
            categorizedItems.push(bestMatch);
          }
        });

        console.log('分類結果:', categorizedItems);

        res.json({
          transcript: parsedResponse.transcript,
          categorized_items: categorizedItems,
          source: 'gemini'
        });

      } catch (parseError) {
        console.error('Geminiレスポースのパースエラー:', parseError);
        
        // パースに失敗した場合は、テキスト全体を transcript として扱う
        const sentences = splitIntoSentences(content);
        const categorizedItems = [];

        sentences.forEach(sentence => {
          const sentenceCategories = [];

          Object.entries(keywords).forEach(([category, keywordList]) => {
            const matchedKeywords = keywordList.filter(keyword => sentence.includes(keyword));
            if (matchedKeywords.length > 0) {
              categorizedItems.push({
                category: category,
                text: sentence,
                confidence: Math.min(0.9, 0.6 + (matchedKeywords.length * 0.1)),
                reason: `キーワード「${matchedKeywords.join('、')}」を検出`
              });
            }
          });
        });

        res.json({
          transcript: content,
          categorized_items: categorizedItems,
          source: 'gemini_fallback'
        });
      }

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

    // テキストを文単位で分割（句点で区切る）
    const sentences = text.split(/[。．.]\s*/).filter(s => s.trim());
    console.log('分割された文章数:', sentences.length);

    const categoriesText = categories.map(cat => 
      `${cat.name}`
    ).join('\n');

    const classifications = [];

    // 各文章を個別に分類
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;

      const prompt = `次の文章を指定されたカテゴリのいずれかに分類してください。

文章: "${sentence.trim()}"

カテゴリ一覧:
${categoriesText}

以下のJSON形式で回答してください。余計な説明は一切不要です。

{
  "category": "カテゴリ名",
  "text": "分析対象文章",
  "confidence": 0.9,
  "reason": "分類理由"
}`;

      try {
        console.log('文章を分析中:', sentence.substring(0, 50) + '...');
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const content = response.text().trim();

        console.log('Gemini応答:', content);

        // JSONの抽出を試みる
        let jsonContent = null;

        try {
          // JSONブロックを抽出
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonContent = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('JSONパースエラー:', parseError.message);
          continue;
        }

        // 有効な分類結果の確認
        if (jsonContent && 
            typeof jsonContent.category === 'string' && 
            typeof jsonContent.text === 'string') {
          
          // カテゴリ名が有効かチェック
          const isValidCategory = categories.some(cat => 
            cat.name === jsonContent.category
          );

          if (isValidCategory) {
            classifications.push({
              category: jsonContent.category,
              text: jsonContent.text,
              confidence: typeof jsonContent.confidence === 'number' ? 
                         jsonContent.confidence : 0.7,
              reason: typeof jsonContent.reason === 'string' ? 
                     jsonContent.reason : '分類理由なし'
            });
            console.log('分類成功:', jsonContent.category);
          } else {
            console.log('無効なカテゴリ名:', jsonContent.category);
          }
        } else {
          console.log('無効な分類結果');
        }

      } catch (error) {
        console.error('文章の分類中にエラー:', error.message);
      }
    }

    console.log('全文章の分類完了。結果数:', classifications.length);
    
    // 分類結果がない場合のフォールバック
    if (classifications.length === 0) {
      console.log('フォールバック分類を実行');
      
      const keywords = {
        '価格情報': [
          '円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引', '税込', '税抜', 'コスト',
          '値上げ', '値下げ', 'プライス', '料金', '定価', '原価', '利益', '粗利', '利幅',
          'お買い得', 'バーゲン', '特価', '安価', '高価', '相場'
        ],
        '売り場情報': [
          '売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド', 'ゴンドラ',
          'コーナー', 'スペース', '売場', '平台', '山積み', 'フェイス', '什器', 'ショーケース',
          'ディスプレイ', '売り場面積', '通路幅', '棚割り', '商品配置', 'POPスペース'
        ],
        '客層・混雑度': [
          '客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い', '人',
          '来店', '客数', '男性', '女性', '学生', '主婦', '会社員', '観光客', '地元',
          '客足', '入店', '退店', '滞在時間', '待ち時間', '行列'
        ],
        '商品・品揃え': [
          '商品', '品揃え', '欠品', '在庫', '種類', '品目', 'アイテム', 'SKU', '商材',
          'ブランド', '新商品', '定番', '季節商品', '限定', '品切れ', '品質', '鮮度',
          'パッケージ', '売れ筋', '死に筋', '回転率', '仕入れ', '発注', '入荷'
        ],
        '店舗環境': [
          '店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調', '広い', '狭い', 'BGM', '温度',
          '雰囲気', '清掃', '匂い', '臭い', '騒音', '快適', '不快', 'トイレ', '休憩所',
          'アクセス', '案内表示', 'サイン', '外観', '内装', '床', '天井', '壁'
        ]
      };

      sentences.forEach(sentence => {
        Object.entries(keywords).forEach(([category, keywordList]) => {
          const matchedKeywords = keywordList.filter(keyword => sentence.includes(keyword));
          if (matchedKeywords.length > 0) {
            classifications.push({
              category: category,
              text: sentence,
              confidence: Math.min(0.9, 0.6 + (matchedKeywords.length * 0.1)),
              reason: `キーワード「${matchedKeywords.join('、')}」を検出`
            });
          }
        });
      });
      
      console.log('フォールバック分類結果数:', classifications.length);
    }

    res.json({ classifications });

  } catch (error) {
    console.error('AI文脈分類エラー:', error);
    res.status(500).json({ 
      error: '文脈分類処理中にエラーが発生しました',
      details: error.message,
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