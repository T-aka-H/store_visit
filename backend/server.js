// server.js (Speech-to-Text対応版 - 改善版)
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const sharp = require('sharp');  // 画像処理ライブラリを追加
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

// サムネイルの設定
const THUMBNAIL_CONFIG = {
  width: 300,
  height: 300,
  fit: 'cover',
  position: 'center',
  format: 'jpeg',
  quality: 80
};

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

// 分類結果をCSV形式に変換する関数を更新
function convertToCSVFormat(classifications, storeName = '', photos = []) {
  // CSVヘッダー（固定）
  const csvHeaders = [
    'store_name',          // 店舗名
    'visit_timestamp',     // 視察日時
    'price_info',         // 価格情報
    'layout_info',        // 売り場情報
    'customer_info',      // 客層・混雑度
    'product_info',       // 商品・品揃え
    'environment_info',    // 店舗環境
    'photo_descriptions'   // 写真の説明（カンマ区切り）
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

  // 写真の説明文を準備
  const photoDescriptions = photos.map(photo => 
    `[${photo.category}] ${photo.description} (${photo.timestamp})`
  ).join(' | ');

  // CSVの1行のデータを作成
  const csvRow = {
    store_name: storeName,
    visit_timestamp: new Date().toISOString(),
    price_info: categoryData['価格情報'].join(' | '),
    layout_info: categoryData['売り場情報'].join(' | '),
    customer_info: categoryData['客層・混雑度'].join(' | '),
    product_info: categoryData['商品・品揃え'].join(' | '),
    environment_info: categoryData['店舗環境'].join(' | '),
    photo_descriptions: photoDescriptions
  };

  return {
    headers: csvHeaders,
    row: csvRow
  };
}

// 写真処理とサムネイル生成
async function processPhotoAndCreateThumbnail(imageBuffer) {
  try {
    // オリジナル画像の最適化
    const optimizedImage = await sharp(imageBuffer)
      .rotate()  // EXIF情報に基づいて自動回転
      .jpeg({ quality: 90 })
      .toBuffer();

    // サムネイルの生成
    const thumbnail = await sharp(imageBuffer)
      .rotate()
      .resize(THUMBNAIL_CONFIG.width, THUMBNAIL_CONFIG.height, {
        fit: THUMBNAIL_CONFIG.fit,
        position: THUMBNAIL_CONFIG.position
      })
      .jpeg({ quality: THUMBNAIL_CONFIG.quality })
      .toBuffer();

    // 画像情報の取得
    const metadata = await sharp(imageBuffer).metadata();

    return {
      optimized: optimizedImage.toString('base64'),
      thumbnail: thumbnail.toString('base64'),
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: optimizedImage.length,
        thumbnailSize: thumbnail.length
      }
    };
  } catch (error) {
    console.error('画像処理エラー:', error);
    throw new Error('画像の処理中にエラーが発生しました');
  }
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

      // CSV形式のデータを生成（写真情報を含める）
      const csvData = convertToCSVFormat(categorizedItems, storeName, []);

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

        // CSV形式のデータを生成（写真情報を含める）
        const csvData = convertToCSVFormat(allClassifications, storeName, []);

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

        // CSV形式のデータを生成（写真情報を含める）
        const csvData = convertToCSVFormat(categorizedItems, storeName, []);

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

// 写真解析APIを更新
app.post('/api/analyze-photo', async (req, res) => {
  try {
    console.log('=== 写真解析開始 ===');
    const { image, categories } = req.body;

    if (!image) {
      return res.status(400).json({ error: '写真データが必要です' });
    }

    // Base64文字列をバッファに変換
    const imageBuffer = Buffer.from(image.split(',')[1], 'base64');

    // 画像処理とサムネイル生成
    const processedImage = await processPhotoAndCreateThumbnail(imageBuffer);

    // Gemini Vision APIによる解析
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
            data: imageBuffer
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
          
          // キーワードベース分類を追加
          const additionalClassifications = performKeywordBasedClassification(analysis.description);
          
          // 分類結果を統合
          const combinedAnalysis = {
            ...analysis,
            additionalClassifications,
            // 処理済み画像データを追加
            processedImage: {
              data: `data:image/jpeg;base64,${processedImage.optimized}`,
              metadata: processedImage.metadata
            }
          };
          
          res.json(combinedAnalysis);
        } else {
          throw new Error('JSON形式の応答が見つかりません');
        }

      } catch (parseError) {
        console.error('Gemini Vision応答のパースエラー:', parseError);
        
        // パース失敗時のフォールバック
        const fallbackAnalysis = {
          suggestedCategory: '店舗環境',
          description: content.substring(0, 200) + '...',
          confidence: 0.5,
          detectedElements: [],
          additionalClassifications: performKeywordBasedClassification(content),
          // 処理済み画像データを追加
          processedImage: {
            data: `data:image/jpeg;base64,${processedImage.optimized}`,
            metadata: processedImage.metadata
          }
        };
        
        res.json(fallbackAnalysis);
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

// 写真データのエクスポートエンドポイントを追加
app.post('/api/export-photos', async (req, res) => {
  try {
    const { photos } = req.body;
    
    if (!photos || !Array.isArray(photos)) {
      return res.status(400).json({ error: '写真データが必要です' });
    }

    // 写真のメタデータをJSONファイルとして準備
    const metadata = photos.map(photo => ({
      id: photo.id,
      filename: photo.name,
      category: photo.category,
      description: photo.description,
      timestamp: photo.timestamp,
      location: photo.metadata?.location || null
    }));

    res.json({
      message: '写真メタデータを出力しました',
      metadata: metadata,
      total_photos: photos.length
    });

  } catch (error) {
    console.error('写真エクスポートエラー:', error);
    res.status(500).json({
      error: '写真のエクスポート中にエラーが発生しました',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});