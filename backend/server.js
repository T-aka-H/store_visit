// server.js (Speech-to-Text対応版 - 修正版)
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const sharp = require('sharp');  // 画像処理ライブラリを追加
const archiver = require('archiver');  // ZIP作成用ライブラリを追加
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Gemini AI インスタンス
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ミドルウェア
app.use(cors({
  origin: [
    'https://store-visit-cr9p.onrender.com',  // 正しいフロントエンドURL
    'http://localhost:3000',                   // 開発環境
    'http://localhost:3001'                    // 開発環境
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

// 写真解析用プロンプト
const PHOTO_ANALYSIS_PROMPT = `あなたは小売店舗の視察写真を分析する専門家です。
この写真から店舗視察に関連する重要な情報を抽出し、分類してください。

特に以下の点に注目して分析してください：

1. 店舗名の特定（最優先）
- 看板、サイン、ロゴなどから店舗名を特定
- チェーン店の場合はブランド名も含める
- 店舗の種類（スーパー、コンビニ、専門店など）

2. その他の重要な情報を以下のカテゴリで分類：
価格情報:
- 商品の価格、値段
- セール、割引情報
- 競合との価格比較

売り場情報:
- 店舗レイアウト
- 商品の陳列方法
- 通路、棚の配置

客層・混雑度:
- 来店客の特徴
- 年齢層、性別
- 混雑状況

商品・品揃え:
- 取扱商品の種類
- 品切れ、在庫状況
- 商品の特徴

店舗環境:
- 店舗の雰囲気
- 清潔さ、照明
- 温度、空調

以下のJSON形式で回答してください：
{
  "categories": [
    {
      "category": "店舗情報",
      "text": "〇〇スーパー △△店",
      "confidence": 0.9,
      "reason": "店舗看板から店舗名を特定"
    },
    {
      "category": "その他のカテゴリ",
      "text": "分類されたテキスト",
      "confidence": 0.8,
      "reason": "分類理由"
    }
  ]
}

店舗名が特定できた場合は、必ず最初の分類として "店舗情報" カテゴリで返してください。`;

// 音声認識用プロンプト
const SPEECH_CLASSIFICATION_PROMPT = `
あなたは店舗視察の専門家です。以下のテキストを分析し、店舗調査に関連する情報を分類してください。

分析観点：
1. 店舗情報：店舗名、ブランド、店舗種類に関する情報（最優先）
2. 価格情報：商品の価格、値段に関する情報
3. 売り場情報：商品陳列、レイアウト、棚の配置に関する情報
4. 商品・品揃え：商品の種類、在庫、ブランドに関する情報
5. 店舗環境：店内の雰囲気、清潔感、設備、スタッフ対応に関する情報
6. 客層・混雑度：お客様の様子、混雑状況に関する情報

以下のJSON形式で結果を返してください：
{
  "classifications": [
    {
      "category": "店舗情報",
      "text": "〇〇スーパー △△店",
      "confidence": 0.9,
      "reason": "店舗名への言及を検出"
    },
    {
      "category": "その他のカテゴリ",
      "text": "分類されたテキスト",
      "confidence": 0.8,
      "reason": "分類理由"
    }
  ]
}

店舗名が含まれている場合は、必ず最初の分類として "店舗情報" カテゴリで返してください。

分析対象テキスト：
`;

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
    'category',           // カテゴリ
    'text',              // テキスト
    'confidence',        // 信頼度
    'reason',            // 分類理由
    'photo_descriptions'  // 写真の説明（カンマ区切り）
  ];

  // 写真の説明文を準備
  const photoDescriptions = photos.map(photo => 
    `[${photo.category}] ${photo.description}`
  ).join(' | ');

  // CSVの行データを作成
  const csvRows = classifications.map(classification => ({
    store_name: storeName,
    visit_timestamp: new Date().toISOString(),
    category: classification.category,
    text: classification.text,
    confidence: classification.confidence,
    reason: classification.reason || '',
    photo_descriptions: photoDescriptions
  }));

  return {
    headers: csvHeaders,
    rows: csvRows
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

// 写真ストレージの初期化（メモリ内）
const photoStorage = {
  photos: [],
  addPhoto: function(photo) {
    const photoId = Date.now().toString();
    const photoData = {
      id: photoId,
      ...photo,
      timestamp: new Date().toISOString()
    };
    this.photos.push(photoData);
    return photoId;
  },
  getPhoto: function(id) {
    return this.photos.find(p => p.id === id);
  },
  getAllPhotos: function() {
    return [...this.photos];
  },
  deletePhoto: function(id) {
    const index = this.photos.findIndex(p => p.id === id);
    if (index !== -1) {
      this.photos.splice(index, 1);
      return true;
    }
    return false;
  }
};

// 音声認識API
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== 音声認識開始 ===');
    
    const browserTranscript = req.body.transcript;
    
    if (browserTranscript && browserTranscript.trim()) {
      console.log('ブラウザ音声認識結果:', browserTranscript);
      return res.json({
        transcript: browserTranscript,
        source: 'browser'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルまたはテキストが必要です' });
    }

    console.log('=== Geminiバックアップ処理開始 ===');
    
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64Audio = bufferToBase64(req.file.buffer);

      const prompt = `以下の音声を日本語のテキストに変換してください。
店舗視察に関する内容です。
音声が不明瞭な場合は「音声が不明瞭でした」と回答してください。

テキストのみを返してください。`;

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
      const transcribedText = response.text().trim();

      console.log('Geminiバックアップ成功:', transcribedText);

      res.json({
        transcript: transcribedText,
        source: 'gemini'
      });

    } catch (geminiError) {
      console.error('Geminiバックアップ失敗:', geminiError);
      
      res.status(500).json({
        error: '音声認識エラー',
        details: geminiError.message
      });
    }

  } catch (error) {
    console.error('=== 全体エラー ===');
    console.error('エラー:', error);
    
    res.status(500).json({
      error: '処理エラー',
      details: error.message
    });
  }
});

// AI文脈理解による分類API
app.post('/api/classify', async (req, res) => {
  try {
    console.log('=== AI分類リクエスト受信 ===');
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'テキストが必要です' });
    }

    console.log('分類対象テキスト:', text);
    let classifications = [];
    
    // Gemini 1.5 Flash APIを使用
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `以下のテキストから店舗視察に関連する情報を抽出し、適切なカテゴリに分類してください。

分類カテゴリ:
- 店舗情報（店舗名、場所、規模など）
- 価格情報（商品価格、セール情報など）
- 売り場情報（レイアウト、陳列方法など）
- 客層・混雑度（来店客の特徴、混雑状況など）
- 商品・品揃え（取扱商品、在庫状況など）
- 店舗環境（店舗の雰囲気、清潔さなど）

分析対象テキスト:
${text.trim()}

以下のJSON形式で回答してください:
{
  "classifications": [
    {
      "category": "価格情報",
      "text": "トマト28円",
      "confidence": 0.9,
      "reason": "商品価格の明確な記載"
    }
  ]
}`;

      console.log('Geminiリクエスト送信...');
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const content = response.text().trim();
      console.log('Gemini応答:', content);

      try {
        // まずJSONとして解析を試みる
        let parsedResult;
        try {
          parsedResult = JSON.parse(content);
        } catch (initialParseError) {
          // 失敗した場合、JSONパターンを探して抽出を試みる
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('Gemini応答からJSONを抽出できませんでした');
          }
          parsedResult = JSON.parse(jsonMatch[0]);
        }

        if (parsedResult.classifications && Array.isArray(parsedResult.classifications)) {
          classifications = parsedResult.classifications;
        } else {
          throw new Error('Gemini応答が期待された形式ではありません');
        }
      } catch (parseError) {
        console.error('Gemini応答のパースエラー:', parseError);
        console.error('問題のある応答:', content);
        throw new Error('Gemini応答のパースに失敗しました: ' + parseError.message);
      }
    } catch (geminiError) {
      console.error('Gemini API エラー:', geminiError);
      throw new Error('Gemini APIでの分類に失敗しました: ' + geminiError.message);
    }

    // 分類結果が空の場合はキーワードベース分類を使用
    if (classifications.length === 0) {
      console.log('Gemini分類結果が空のため、キーワードベース分類を使用');
      classifications = performKeywordBasedClassification(text);
    }

    // 重複除去
    const uniqueClassifications = classifications.reduce((unique, item) => {
      const isDuplicate = unique.some(existing => 
        existing.category === item.category && 
        existing.text === item.text
      );
      if (!isDuplicate) {
        unique.push(item);
      }
      return unique;
    }, []);

    console.log('最終分類結果:', uniqueClassifications);
    res.json({
      message: '分類が完了しました',
      classifications: uniqueClassifications
    });

  } catch (error) {
    console.error('分類エラー:', error);
    res.status(500).json({ 
      error: '分類処理中にエラーが発生しました',
      details: error.message
    });
  }
});

// 写真解析API（デバッグ強化版）
app.post('/api/analyze-photo', async (req, res) => {
  try {
    console.log('=== 写真解析リクエスト受信 ===');
    console.log('リクエストヘッダー:', req.headers);
    console.log('リクエストボディの存在:', !!req.body);
    console.log('imageプロパティの存在:', !!req.body?.image);
    
    const { image } = req.body;

    if (!image) {
      console.error('画像データが見つかりません');
      return res.status(400).json({ 
        error: '写真データが必要です',
        received: Object.keys(req.body || {})
      });
    }

    // Base64データの抽出
    let base64Data;
    if (typeof image === 'string') {
      if (image.includes('base64,')) {
        base64Data = image.split('base64,')[1];
      } else {
        base64Data = image;
      }
    } else {
      console.error('不正な画像データ形式:', typeof image);
      return res.status(400).json({ 
        error: '不正な画像データ形式です',
        type: typeof image
      });
    }

    console.log('Base64データ取得完了, サイズ:', base64Data.length);

    try {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      console.log('画像バッファ作成完了, サイズ:', imageBuffer.length);
      
      const processedImage = await processPhotoAndCreateThumbnail(imageBuffer);
      console.log('画像処理完了');

      // デフォルトの解析結果
      let classifications = [{
        category: '店舗環境',
        text: '店舗の写真が追加されました',
        confidence: 0.7,
        reason: 'デフォルト分類'
      }];

      // Gemini APIが利用可能な場合の解析
      if (process.env.GEMINI_API_KEY) {
        console.log('Gemini API による写真解析を開始...');
        try {
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const result = await model.generateContent([
            { text: PHOTO_ANALYSIS_PROMPT },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]);

          const response = await result.response;
          const content = response.text().trim();
          console.log('Gemini解析レスポンス長:', content.length);

          // JSONの抽出と解析
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const geminiAnalysis = JSON.parse(jsonMatch[0]);
              console.log('Gemini解析結果:', geminiAnalysis);
              
              if (geminiAnalysis.categories && geminiAnalysis.categories.length > 0) {
                classifications = geminiAnalysis.categories.map(category => ({
                  category: category.category,
                  text: category.text,
                  confidence: category.confidence,
                  reason: category.reason || '画像解析による分類'
                }));
                console.log('分類結果を更新:', classifications.length, '件');
              }
            } catch (parseError) {
              console.error('JSON解析エラー:', parseError);
              console.error('問題のあるJSON:', jsonMatch[0].substring(0, 200));
            }
          } else {
            console.log('JSONパターンが見つかりませんでした');
            console.log('レスポンス内容（最初の200文字）:', content.substring(0, 200));
          }
        } catch (geminiError) {
          console.error('Gemini解析エラー:', geminiError);
          // デフォルト分類を使用
        }
      } else {
        console.log('Gemini APIキーが設定されていません');
      }

      // 写真データを保存
      const photoData = {
        analysis: {
          categories: classifications,
          description: classifications.map(c => c.text).join(', ')
        },
        classifications: classifications,
        processedImage: {
          data: `data:image/jpeg;base64,${processedImage.optimized}`,
          thumbnail: `data:image/jpeg;base64,${processedImage.thumbnail}`,
          metadata: processedImage.metadata
        }
      };

      const photoId = photoStorage.addPhoto(photoData);
      console.log('写真を保存しました, ID:', photoId);

      // レスポンスを返す
      const response = {
        success: true,
        id: photoId,
        classifications: classifications,
        processedImage: {
          data: `data:image/jpeg;base64,${processedImage.optimized}`,
          thumbnail: `data:image/jpeg;base64,${processedImage.thumbnail}`,
          metadata: processedImage.metadata
        },
        timestamp: new Date().toISOString(),
        message: `写真を解析しました。${classifications.length}件の分類を検出。`,
        geminiUsed: !!process.env.GEMINI_API_KEY
      };

      console.log('レスポンス送信:', {
        id: response.id,
        classificationsCount: response.classifications.length,
        hasProcessedImage: !!response.processedImage.data,
        messageLength: response.message.length
      });

      res.json(response);

    } catch (imageProcessingError) {
      console.error('画像処理エラー:', imageProcessingError);
      res.status(500).json({ 
        error: '画像処理に失敗しました',
        details: imageProcessingError.message,
        stack: process.env.NODE_ENV === 'development' ? imageProcessingError.stack : undefined
      });
    }

  } catch (error) {
    console.error('写真解析全体エラー:', error);
    res.status(500).json({ 
      error: '写真解析中にエラーが発生しました',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// APIテスト用のヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
    photoStorageCount: photoStorage.getAllPhotos().length,
    nodeEnv: process.env.NODE_ENV,
    corsOrigins: [
      'https://store-visit-cr9p.onrender.com',
      'http://localhost:3000',
      'http://localhost:3001'
    ]
  });
});

// 写真解析状況確認用のデバッグエンドポイント
app.get('/api/debug/photo-analysis', (req, res) => {
  try {
    const photos = photoStorage.getAllPhotos();
    res.json({
      totalPhotos: photos.length,
      photos: photos.map(photo => ({
        id: photo.id,
        timestamp: photo.timestamp,
        classificationsCount: photo.classifications?.length || 0,
        hasProcessedImage: !!photo.processedImage?.data,
        analysisCategories: photo.analysis?.categories?.map(c => c.category) || []
      })),
      geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
      environment: process.env.NODE_ENV,
      cors: {
        allowedOrigins: [
          'https://store-visit-cr9p.onrender.com',
          'http://localhost:3000',
          'http://localhost:3001'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 写真一覧取得API
app.get('/api/photos', (req, res) => {
  try {
    const photos = photoStorage.getAllPhotos().map(photo => ({
      id: photo.id,
      timestamp: photo.timestamp,
      analysis: photo.analysis,
      thumbnail: photo.processedImage.data
    }));

    res.json({ photos });
  } catch (error) {
    console.error('写真一覧取得エラー:', error);
    res.status(500).json({
      error: '写真一覧の取得に失敗しました',
      details: error.message
    });
  }
});

// 写真削除API
app.delete('/api/photos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = photoStorage.deletePhoto(id);

    if (deleted) {
      res.json({ message: '写真を削除しました', id });
    } else {
      res.status(404).json({ error: '写真が見つかりません', id });
    }
  } catch (error) {
    console.error('写真削除エラー:', error);
    res.status(500).json({
      error: '写真の削除に失敗しました',
      details: error.message
    });
  }
});

// 写真データのエクスポートエンドポイントを更新
app.post('/api/export-photos', async (req, res) => {
  try {
    const { photoIds } = req.body;
    
    // 指定されたIDの写真を取得
    let targetPhotos = [];
    if (photoIds && Array.isArray(photoIds)) {
      targetPhotos = photoIds.map(id => photoStorage.getPhoto(id)).filter(Boolean);
    } else {
      targetPhotos = photoStorage.getAllPhotos();
    }

    if (targetPhotos.length === 0) {
      return res.status(400).json({ error: 'エクスポートする写真がありません' });
    }

    // 写真のメタデータを準備
    const metadata = targetPhotos.map(photo => ({
      id: photo.id,
      filename: `store_visit_photo_${photo.id}.jpg`,
      timestamp: photo.timestamp,
      categories: photo.analysis.categories.map(c => c.category).join(', '),
      description: photo.analysis.description
    }));

    // 写真データを準備
    const photoFiles = targetPhotos.map(photo => ({
      filename: `store_visit_photo_${photo.id}.jpg`,
      data: photo.processedImage.data
    }));

    res.json({
      message: '写真データを出力しました',
      metadata: metadata,
      photos: photoFiles,
      total_photos: targetPhotos.length
    });

  } catch (error) {
    console.error('写真エクスポートエラー:', error);
    res.status(500).json({ 
      error: '写真のエクスポート中にエラーが発生しました',
      details: error.message
    });
  }
});

// CSVエクスポートAPI（新規追加）
app.post('/api/export-csv', async (req, res) => {
  try {
    const { classifications, storeName, includePhotos } = req.body;
    
    if (!classifications || !Array.isArray(classifications)) {
      return res.status(400).json({ error: '分類データが必要です' });
    }

    // 写真データを取得（必要に応じて）
    let photos = [];
    if (includePhotos) {
      photos = photoStorage.getAllPhotos().map(photo => ({
        id: photo.id,
        timestamp: photo.timestamp,
        category: photo.analysis.category,
        description: photo.analysis.description
      }));
    }

    // CSV形式に変換
    const csvData = convertToCSVFormat(classifications, storeName, photos);
    
    res.json({
      message: 'CSVデータを生成しました',
      csvData: csvData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('CSVエクスポートエラー:', error);
    res.status(500).json({ 
      error: 'CSVエクスポート中にエラーが発生しました',
      details: error.message
    });
  }
});

// 単一写真のダウンロードAPI
app.get('/api/photos/:id/download', (req, res) => {
  try {
    const { id } = req.params;
    const photo = photoStorage.getPhoto(id);

    if (!photo) {
      return res.status(404).json({ error: '写真が見つかりません' });
    }

    // Base64データをバッファに変換
    const imageData = photo.processedImage.data.split('base64,')[1];
    const imageBuffer = Buffer.from(imageData, 'base64');

    // メタデータをJSONファイルとして準備
    const metadata = {
      id: photo.id,
      timestamp: photo.timestamp,
      classifications: photo.classifications,
      metadata: photo.processedImage.metadata
    };
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8');

    // ZIPファイルの作成
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最大圧縮レベル
    });

    // ヘッダーの設定
    res.attachment(`store_visit_photo_${id}.zip`);
    archive.pipe(res);

    // 写真とメタデータをZIPに追加
    archive.append(imageBuffer, { name: `store_visit_photo_${id}.jpg` });
    archive.append(metadataBuffer, { name: `metadata_${id}.json` });

    // CSVサマリーの追加
    const storeInfo = photo.classifications.find(c => c.category === '店舗情報');
    const storeName = storeInfo ? storeInfo.text : '不明';
    const csvContent = `ID,撮影日時,店舗名,分類情報\n${id},${photo.timestamp},"${storeName}","${photo.classifications.map(c => `${c.category}: ${c.text} (信頼度: ${c.confidence})`).join('; ')}"`;
    archive.append(Buffer.from(csvContent, 'utf-8'), { name: 'summary.csv' });

    archive.finalize();

  } catch (error) {
    console.error('写真ダウンロードエラー:', error);
    res.status(500).json({ 
      error: '写真のダウンロード中にエラーが発生しました',
      details: error.message
    });
  }
});

// 複数写真のZIPダウンロードAPI
app.post('/api/photos/download-multiple', (req, res) => {
  try {
    const { photoIds } = req.body;
    
    // 写真の取得
    let targetPhotos = [];
    if (photoIds && Array.isArray(photoIds)) {
      targetPhotos = photoIds.map(id => photoStorage.getPhoto(id)).filter(Boolean);
    } else {
      targetPhotos = photoStorage.getAllPhotos();
    }

    if (targetPhotos.length === 0) {
      return res.status(400).json({ error: 'ダウンロードする写真がありません' });
    }

    // ZIPファイルの作成
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    // ヘッダーの設定
    res.attachment('store_visit_photos.zip');
    archive.pipe(res);

    // CSVサマリーの準備
    let csvContent = 'ID,撮影日時,店舗名,分類情報\n';

    // 各写真の処理
    targetPhotos.forEach(photo => {
      // 写真データの追加
      const imageData = photo.processedImage.data.split('base64,')[1];
      const imageBuffer = Buffer.from(imageData, 'base64');
      archive.append(imageBuffer, { name: `photos/store_visit_photo_${photo.id}.jpg` });

      // メタデータの追加
      const metadata = {
        id: photo.id,
        timestamp: photo.timestamp,
        classifications: photo.classifications,
        metadata: photo.processedImage.metadata
      };
      archive.append(
        Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8'),
        { name: `metadata/metadata_${photo.id}.json` }
      );

      // CSVサマリーの行を追加
      const storeInfo = photo.classifications.find(c => c.category === '店舗情報');
      const storeName = storeInfo ? storeInfo.text : '不明';
      csvContent += `${photo.id},${photo.timestamp},"${storeName}","${photo.classifications.map(c => `${c.category}: ${c.text} (信頼度: ${c.confidence})`).join('; ')}"\n`;
    });

    // CSVサマリーの追加
    archive.append(Buffer.from(csvContent, 'utf-8'), { name: 'summary.csv' });

    // エラーハンドリング
    archive.on('error', (err) => {
      console.error('ZIPファイル作成エラー:', err);
      res.status(500).json({ 
        error: 'ZIPファイルの作成中にエラーが発生しました',
        details: err.message
      });
    });

    archive.finalize();

  } catch (error) {
    console.error('複数写真ダウンロードエラー:', error);
    res.status(500).json({ 
      error: '写真のダウンロード中にエラーが発生しました',
      details: error.message 
    });
  }
});

// Gemini 1.5 Flash専用音声認識API（音声ファイルアップロード用）
app.post('/api/transcribe-audio-gemini', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== Gemini音声ファイル認識開始 ===');
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    console.log('アップロードファイル情報:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Gemini APIキーが設定されていません' 
      });
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64Audio = bufferToBase64(req.file.buffer);

      const prompt = `この音声ファイルを正確に日本語のテキストに変換してください。
      
音声の内容は店舗視察に関するものです。以下の点に注意して文字起こしを行ってください：

1. 店舗名、ブランド名は正確に
2. 価格情報（○○円など）は数字を含めて正確に
3. 商品名、カテゴリ名は具体的に
4. 話し手の感想や評価も含める
5. 聞き取りにくい部分は [不明瞭] と記載

文字起こししたテキストのみを返してください。`;

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
      const transcribedText = response.text().trim();

      console.log('Gemini音声認識結果:', transcribedText);

      if (!transcribedText || transcribedText.length < 3) {
        return res.status(400).json({
          error: '音声から文字起こしできませんでした',
          details: '音声が不明瞭、または対応していない形式の可能性があります'
        });
      }

      res.json({
        transcript: transcribedText,
        source: 'gemini-1.5-flash',
        fileInfo: {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype
        },
        timestamp: new Date().toISOString()
      });

    } catch (geminiError) {
      console.error('Gemini音声認識エラー:', geminiError);
      
      let errorMessage = 'Gemini音声認識に失敗しました';
      if (geminiError.message.includes('quota')) {
        errorMessage = 'Gemini APIの利用制限に達しました';
      } else if (geminiError.message.includes('invalid')) {
        errorMessage = '音声ファイル形式がサポートされていません';
      }
      
      res.status(500).json({
        error: errorMessage,
        details: geminiError.message
      });
    }

  } catch (error) {
    console.error('=== 音声ファイル処理エラー ===');
    console.error('エラー:', error);
    
    res.status(500).json({
      error: '音声ファイル処理エラー',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Gemini API Key configured: ${!!process.env.GEMINI_API_KEY}`);
});