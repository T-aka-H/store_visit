// server.js (Speech-to-Text対応版 - 改善版)
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
app.use(express.json({ limit: '50mb' }));  // 写真アップロード用に制限を緩和
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

// テキストから指定キーワード周辺のコンテキストを抽出
function extractContext(text, keyword, contextLength = 20) {
  const index = text.indexOf(keyword);
  if (index === -1) return keyword;
  
  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + keyword.length + contextLength);
  
  return text.substring(start, end).trim();
}

// 文脈を考慮した分類確信度計算（改善版）
function classifyWithContext(sentence, category, matchedKeywords) {
  let confidence = 0.6; // ベース確信度

  // キーワード数による重み付け
  confidence += Math.min(0.3, matchedKeywords.length * 0.1);

  // 価格情報の特別処理
  if (category === '価格情報') {
    const pricePattern = /\d+円/;
    if (pricePattern.test(sentence)) {
      confidence = Math.min(0.95, confidence + 0.2);
    }
  }

  // 店舗環境の特別処理
  if (category === '店舗環境') {
    const environmentPatterns = [
      /(?:大きな|小さな|広い|狭い).*?(?:店|お店)/,
      /(?:案内|サービス|接客)/,
      /(?:清潔|きれい|汚い)/
    ];
    
    if (environmentPatterns.some(pattern => pattern.test(sentence))) {
      confidence = Math.min(0.9, confidence + 0.15);
    }
  }

  return Math.round(confidence * 100) / 100;
}

// キーワードベース分類の関数（改善版）
function performKeywordBasedClassification(text) {
  const classifications = [];
  
  // 価格情報の詳細抽出
  const priceRegex = /([^\s、。]{1,10}?)(\d+)円/g;
  let priceMatch;
  while ((priceMatch = priceRegex.exec(text)) !== null) {
    const productName = priceMatch[1] || '商品';
    const price = priceMatch[2];
    classifications.push({
      category: '価格情報',
      text: `${productName}${price}円`,
      confidence: 0.9,
      reason: '価格表記を検出'
    });
  }

  // サービス関連の抽出
  const serviceKeywords = ['案内係', 'サービス', 'スタッフ', '接客', 'カスタマーサービス', '店員'];
  serviceKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const context = extractContext(text, keyword, 20);
      classifications.push({
        category: '店舗環境',
        text: context,
        confidence: 0.8,
        reason: `サービス関連キーワード「${keyword}」を検出`
      });
    }
  });

  // 店舗規模・環境の抽出
  const sizeKeywords = ['大きな', '小さな', '広い', '狭い', '巨大な', '大型'];
  sizeKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const context = extractContext(text, keyword, 15);
      classifications.push({
        category: '店舗環境',
        text: context,
        confidence: 0.8,
        reason: `店舗規模キーワード「${keyword}」を検出`
      });
    }
  });

  // 店舗名の抽出
  const storeNameRegex = /([^\s、。]+(?:店|ストア|マート|スーパー))/g;
  let storeMatch;
  while ((storeMatch = storeNameRegex.exec(text)) !== null) {
    classifications.push({
      category: '店舗環境',
      text: `店舗名: ${storeMatch[1]}`,
      confidence: 0.9,
      reason: '店舗名を検出'
    });
  }

  // 客層・混雑度関連の抽出
  const customerKeywords = ['客', 'お客', '混雑', '空い', '客層', '年齢', '家族', '子供', '高齢', '若い'];
  customerKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const context = extractContext(text, keyword, 20);
      classifications.push({
        category: '客層・混雑度',
        text: context,
        confidence: 0.8,
        reason: `客層関連キーワード「${keyword}」を検出`
      });
    }
  });

  // 商品・品揃え関連の抽出
  const productKeywords = ['商品', '品揃え', '欠品', '在庫', '種類', 'ブランド', '新商品', '品切れ'];
  productKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const context = extractContext(text, keyword, 20);
      classifications.push({
        category: '商品・品揃え',
        text: context,
        confidence: 0.8,
        reason: `商品関連キーワード「${keyword}」を検出`
      });
    }
  });

  // 売り場情報関連の抽出
  const layoutKeywords = ['売り場', 'レイアウト', '陳列', '棚', '配置', '展示', '通路', 'エンド'];
  layoutKeywords.forEach(keyword => {
    if (text.includes(keyword)) {
      const context = extractContext(text, keyword, 20);
      classifications.push({
        category: '売り場情報',
        text: context,
        confidence: 0.8,
        reason: `売り場関連キーワード「${keyword}」を検出`
      });
    }
  });

  return classifications;
}

// 文章を文単位で分割する関数（改善版）
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

// 分類結果をCSV形式に変換する関数
function convertToCSVFormat(classifications, storeName = '') {
  // CSVヘッダー（固定）
  const csvHeaders = [
    'store_name',          // 店舗名
    'visit_timestamp',     // 視察日時
    'price_info',         // 価格情報
    'layout_info',        // 売り場情報
    'customer_info',      // 客層・混雑度
    'product_info',       // 商品・品揃え
    'environment_info'    // 店舗環境
  ];

  // 分類結果を一時格納する配列
  const categoryData = {
    '価格情報': [],
    '売り場情報': [],
    '客層・混雑度': [],
    '商品・品揃え': [],
    '店舗環境': []
  };

  // 分類結果を各カテゴリに振り分け
  classifications.forEach(item => {
    if (categoryData[item.category]) {
      categoryData[item.category].push(item.text);
    }
  });

  // CSVの1行のデータを作成
  const csvRow = {
    store_name: storeName,
    visit_timestamp: new Date().toISOString(),
    price_info: categoryData['価格情報'].join(' | '),
    layout_info: categoryData['売り場情報'].join(' | '),
    customer_info: categoryData['客層・混雑度'].join(' | '),
    product_info: categoryData['商品・品揃え'].join(' | '),
    environment_info: categoryData['店舗環境'].join(' | ')
  };

  return {
    headers: csvHeaders,
    row: csvRow
  };
}

// 音声認識・分類API（ブラウザベース + Geminiバックアップ）
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== 音声認識開始 ===');
    
    // ブラウザからの音声認識テキストを確認
    const browserTranscript = req.body.transcript;
    
    if (browserTranscript && browserTranscript.trim()) {
      console.log('ブラウザ音声認識結果:', browserTranscript);
      
      // 改善されたキーワードベース分類を使用
      const categorizedItems = performKeywordBasedClassification(browserTranscript);

      // 店舗名の抽出
      const storeNameMatch = browserTranscript.match(/([^\s、。]+(?:店|ストア|マート|スーパー))/);
      const storeName = storeNameMatch ? storeNameMatch[1] : '';

      // CSV形式のデータを生成
      const csvData = convertToCSVFormat(categorizedItems, storeName);

      return res.json({
        transcript: browserTranscript,
        categorized_items: categorizedItems,
        csv_format: {
          headers: csvData.headers,
          row: csvData.row
        },
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

        // 改善されたキーワードベース分類を追加実行
        const additionalClassifications = performKeywordBasedClassification(parsedResponse.transcript);
        const allClassifications = [...(parsedResponse.categories || []), ...additionalClassifications];

        console.log('分類結果:', allClassifications);

        // 店舗名の抽出
        const storeNameMatch = parsedResponse.transcript.match(/([^\s、。]+(?:店|ストア|マート|スーパー))/);
        const storeName = storeNameMatch ? storeNameMatch[1] : '';

        // CSV形式のデータを生成
        const csvData = convertToCSVFormat(allClassifications, storeName);

        res.json({
          transcript: parsedResponse.transcript,
          categorized_items: allClassifications,
          csv_format: {
            headers: csvData.headers,
            row: csvData.row
          },
          source: 'gemini'
        });

      } catch (parseError) {
        console.error('Geminiレスポースのパースエラー:', parseError);
        
        // パースに失敗した場合は、テキスト全体を transcript として扱う
        const categorizedItems = performKeywordBasedClassification(content);

        // 店舗名の抽出
        const storeNameMatch = content.match(/([^\s、。]+(?:店|ストア|マート|スーパー))/);
        const storeName = storeNameMatch ? storeNameMatch[1] : '';

        // CSV形式のデータを生成
        const csvData = convertToCSVFormat(categorizedItems, storeName);

        res.json({
          transcript: content,
          categorized_items: categorizedItems,
          csv_format: {
            headers: csvData.headers,
            row: csvData.row
          },
          source: 'gemini_fallback'
        });
      }

    } catch (geminiError) {
      console.error('Geminiバックアップ失敗:', geminiError);
      
      res.status(500).json({
        error: '音声認識エラー',
        transcript: `音声認識に失敗しました: ${geminiError.message}`,
        categorized_items: [],
        csv_format: {
          headers: [],
          row: {}
        }
      });
    }

  } catch (error) {
    console.error('=== 全体エラー ===');
    console.error('エラー名:', error.name);
    console.error('エラーメッセージ:', error.message);
    console.error('エラースタック:', error.stack);
    console.error('=== エラー終了 ===');
    
    res.status(500).json({
      error: '処理エラー',
      details: error.message,
      categorized_items: [],
      csv_format: {
        headers: [],
        row: {}
      }
    });
  }
});

// AI文脈理解による分類API（完全改善版）
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

    // 改善されたプロンプト
    const categoriesText = categories.map(cat => cat.name).join(', ');

    const prompt = `あなたは店舗視察データの分析エキスパートです。以下のテキストから複数の情報要素を抽出し、それぞれを適切なカテゴリに分類してください。

テキスト: "${text.trim()}"

利用可能なカテゴリ: ${categoriesText}

分析ルール:
1. テキスト内の異なる情報要素（価格、商品、サービス、環境など）を個別に識別する
2. 各情報要素を最も適切なカテゴリに分類する
3. 一つのテキストから複数の分類結果を抽出することが重要
4. 価格情報は商品名と価格をセットで抽出する
5. サービス情報、店舗環境情報なども個別に抽出する
6. 店舗名、立地情報も個別に抽出する

以下のJSON配列形式で回答してください（複数の分類結果を含めること）:

[
  {
    "category": "価格情報",
    "text": "トマト28円",
    "confidence": 0.9,
    "reason": "商品価格の明確な記載"
  },
  {
    "category": "価格情報", 
    "text": "ネギ29円",
    "confidence": 0.9,
    "reason": "商品価格の明確な記載"
  },
  {
    "category": "店舗環境",
    "text": "非常に大きなお店",
    "confidence": 0.8,
    "reason": "店舗規模に関する情報"
  },
  {
    "category": "店舗環境",
    "text": "案内係というサービスがあります",
    "confidence": 0.8,
    "reason": "店舗サービスに関する情報"
  }
]

重要: 一つのテキストから複数の異なる情報要素を必ず抽出してください。価格、サービス、環境などの情報が混在している場合は、それぞれを個別の分類結果として出力してください。JSON配列で複数の結果を返すことが必須です。`;

    try {
      console.log('文章を分析中:', text.substring(0, 100) + '...');
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const content = response.text().trim();

      console.log('Gemini応答:', content);

      let classifications = [];

      try {
        // JSON配列の抽出を試みる
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const jsonArray = JSON.parse(jsonMatch[0]);
          if (Array.isArray(jsonArray)) {
            classifications = jsonArray.filter(item => 
              item.category && 
              item.text && 
              categories.some(cat => cat.name === item.category)
            );
            console.log('AI分類成功。結果数:', classifications.length);
          }
        }
      } catch (parseError) {
        console.error('JSONパースエラー:', parseError.message);
        
        // パースに失敗した場合、単一オブジェクトとして解析を試みる
        try {
          const singleJsonMatch = content.match(/\{[\s\S]*\}/);
          if (singleJsonMatch) {
            const singleResult = JSON.parse(singleJsonMatch[0]);
            if (singleResult.category && singleResult.text && 
                categories.some(cat => cat.name === singleResult.category)) {
              classifications = [singleResult];
              console.log('単一オブジェクト分類成功');
            }
          }
        } catch (singleParseError) {
          console.error('単一JSONパースも失敗:', singleParseError.message);
        }
      }

      // フォールバック: 改善されたキーワードベース分類
      if (classifications.length === 0) {
        console.log('AIによる分類が失敗、改善されたフォールバック分類を実行');
        classifications = performKeywordBasedClassification(text);
      }

      // 重複除去（同じカテゴリの類似テキストを統合）
      const uniqueClassifications = [];
      classifications.forEach(item => {
        const existing = uniqueClassifications.find(existing => 
          existing.category === item.category && 
          existing.text.includes(item.text.substring(0, 10))
        );
        
        if (!existing) {
          uniqueClassifications.push(item);
        }
      });

      console.log('分類完了。最終結果数:', uniqueClassifications.length);

      // 店舗名の抽出
      const storeNameMatch = text.match(/([^\s、。]+(?:店|ストア|マート|スーパー))/);
      const storeName = storeNameMatch ? storeNameMatch[1] : '';

      // CSV形式のデータを生成
      const csvData = convertToCSVFormat(uniqueClassifications, storeName);

      res.json({ 
        classifications: uniqueClassifications,
        csv_format: {
          headers: csvData.headers,
          row: csvData.row
        }
      });

    } catch (error) {
      console.error('AI分類中にエラー:', error.message);
      
      // エラー時のフォールバック
      const fallbackClassifications = performKeywordBasedClassification(text);
      res.json({ classifications: fallbackClassifications });
    }

  } catch (error) {
    console.error('AI文脈分類エラー:', error);
    res.status(500).json({
      error: 'エラー',
      details: error.message,
      classifications: [],
      csv_format: {
        headers: [],
        row: {}
      }
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

// 写真解析API
app.post('/api/analyze-photo', async (req, res) => {
  try {
    console.log('=== 写真解析開始 ===');
    const { image, categories } = req.body;

    if (!image) {
      return res.status(400).json({ error: '写真データが必要です' });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY が設定されていません');
      return res.status(500).json({ error: 'API設定エラー' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    const prompt = `あなたは小売店舗の視察写真を分析する専門家です。
この写真から店舗視察に関連する重要な情報を抽出し、最も適切なカテゴリに分類してください。

利用可能なカテゴリ:
${categories ? categories.join('\n') : `
- 価格情報（商品価格、セール情報など）
- 売り場情報（レイアウト、陳列方法など）
- 客層・混雑度（来店客の特徴、混雑状況など）
- 商品・品揃え（商品の種類、在庫状況など）
- 店舗環境（店舗の雰囲気、清潔さなど）`}

以下の点に注目して分析してください：
1. 写真に写っている主な要素（商品、設備、人物など）
2. 店舗環境や雰囲気
3. レイアウトや陳列方法
4. 価格表示や販促物
5. 混雑状況や客層の特徴

以下のJSON形式で回答してください：
{
  "suggestedCategory": "最も適切なカテゴリ名",
  "description": "写真の詳細な説明（日本語）",
  "confidence": 0.8,  // 0.1-1.0の範囲で確信度を設定
  "detectedElements": [
    "検出された要素1",
    "検出された要素2"
  ]
}`;

    try {
      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: image
          }
        }
      ]);

      const response = await result.response;
      const content = response.text().trim();

      console.log('Gemini Vision応答:', content);

      try {
        // JSONレスポースのパース
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          res.json(analysis);
        } else {
          throw new Error('JSON形式の応答が見つかりません');
        }

      } catch (parseError) {
        console.error('Gemini Vision応答のパースエラー:', parseError);
        
        // パース失敗時のフォールバック
        res.json({
          suggestedCategory: '店舗環境',
          description: content.substring(0, 200) + '...',
          confidence: 0.5,
          detectedElements: []
        });
      }

    } catch (geminiError) {
      console.error('Gemini Vision APIエラー:', geminiError);
      res.status(500).json({
        error: '写真解析エラー',
        details: geminiError.message
      });
    }

  } catch (error) {
    console.error('写真解析エラー:', error);
    res.status(500).json({
      error: '処理エラー',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});