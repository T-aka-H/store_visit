// server.js (Speech-to-Text対応版 - 修正版)
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

// 写真解析用プロンプト
const PHOTO_ANALYSIS_PROMPT = `あなたは小売店舗の視察写真を分析する専門家です。
この写真から店舗視察に関連する重要な情報を抽出し、分類してください。

以下のカテゴリに関連する情報を抽出してください：

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
  "categories": [
    {
      "category": "カテゴリ名",
      "text": "該当する観察内容",
      "confidence": 0.8
    }
  ],
  "description": "写真の詳細な説明（日本語）",
  "detectedElements": [
    "検出された要素1",
    "検出された要素2"
  ]
}`;

// 音声認識用プロンプト
const SPEECH_CLASSIFICATION_PROMPT = `
あなたは店舗視察の専門家です。以下のテキストを分析し、店舗調査に関連する情報を分類してください。

分析観点：
1. 価格情報：商品の価格、値段に関する情報
2. 売り場情報：商品陳列、レイアウト、棚の配置に関する情報
3. 商品・品揃え：商品の種類、在庫、ブランドに関する情報
4. 店舗環境：店内の雰囲気、清潔感、設備、スタッフ対応に関する情報
5. 客層・混雑度：お客様の様子、混雑状況に関する情報

以下のJSON形式で結果を返してください：
{
  "classifications": [
    {
      "category": "価格情報",
      "text": "分類されたテキスト",
      "confidence": 0.9,
      "reason": "分類理由"
    }
  ],
  "summary": "全体的な要約"
}

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

// 音声認識・分類API（新規追加）
app.post('/api/speech-to-text', upload.single('audio'), async (req, res) => {
  try {
    console.log('=== 音声認識開始 ===');
    
    if (!req.file) {
      return res.status(400).json({ error: '音声ファイルが必要です' });
    }

    const audioBuffer = req.file.buffer;
    const audioBase64 = bufferToBase64(audioBuffer);

    // Gemini APIで音声認識
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    // 音声認識プロンプト
    const transcriptPrompt = `
以下の音声を日本語のテキストに変換してください。
店舗視察に関する内容です。

音声データ（Base64）: ${audioBase64.substring(0, 100)}...

テキストのみを返してください。
`;

    const result = await model.generateContent(transcriptPrompt);
    const response = await result.response;
    const transcribedText = response.text().trim();

    console.log('音声認識結果:', transcribedText);

    res.json({
      transcribedText: transcribedText,
      audioInfo: {
        mimetype: req.file.mimetype,
        size: req.file.size,
        duration: null // 音声の長さは別途計算が必要
      }
    });

  } catch (error) {
    console.error('音声認識エラー:', error);
    res.status(500).json({
      error: '音声認識中にエラーが発生しました',
      details: error.message
    });
  }
});

// テキスト分類API（新規追加）
app.post('/api/classify-text', async (req, res) => {
  try {
    console.log('=== テキスト分類開始 ===');
    
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'テキストが必要です' });
    }

    console.log('分類対象テキスト:', text);

    // キーワードベース分類
    const keywordClassifications = performKeywordBasedClassification(text);
    console.log('キーワード分類結果:', keywordClassifications);

    // Gemini APIで高度な分類
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const fullPrompt = SPEECH_CLASSIFICATION_PROMPT + text;
    
    try {
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const content = response.text().trim();
      
      console.log('Gemini API応答:', content);

      // JSONの抽出を改善
      let aiClassifications = [];
      let aiSummary = '';
      
      try {
        // JSONブロックを抽出
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          aiClassifications = jsonData.classifications || [];
          aiSummary = jsonData.summary || '';
        } else {
          console.log('JSONが見つからない、キーワード分類のみ使用');
        }
      } catch (parseError) {
        console.log('JSON解析エラー、キーワード分類のみ使用:', parseError.message);
      }

      // キーワード分類とAI分類を結合
      const allClassifications = [...keywordClassifications, ...aiClassifications];
      
      // 重複を除去
      const uniqueClassifications = allClassifications.filter((item, index, self) => 
        index === self.findIndex(t => t.text === item.text && t.category === item.category)
      );

      res.json({
        classifications: uniqueClassifications,
        summary: aiSummary,
        method: 'hybrid',
        keywordCount: keywordClassifications.length,
        aiCount: aiClassifications.length
      });

    } catch (geminiError) {
      console.log('Gemini API エラー、キーワード分類のみ使用:', geminiError.message);
      
      // Gemini APIが失敗した場合、キーワード分類のみを返す
      res.json({
        classifications: keywordClassifications,
        summary: 'キーワードベース分類のみ実行',
        method: 'keyword-only',
        keywordCount: keywordClassifications.length,
        aiCount: 0
      });
    }

  } catch (error) {
    console.error('テキスト分類エラー:', error);
    res.status(500).json({
      error: 'テキスト分類中にエラーが発生しました',
      details: error.message
    });
  }
});

// 写真解析APIを更新
app.post('/api/analyze-photo', async (req, res) => {
  try {
    console.log('=== 写真解析開始 ===');
    console.log('リクエストボディのキー:', Object.keys(req.body));
    
    const { image } = req.body;

    // 画像データの厳密なバリデーション
    if (!image) {
      console.error('画像データが未定義です');
      return res.status(400).json({ 
        error: '写真データが必要です',
        details: '画像データが送信されていません'
      });
    }

    // Base64データの形式チェック
    if (typeof image !== 'string' || !image.includes('base64,')) {
      console.error('不正な画像データ形式:', typeof image);
      return res.status(400).json({ 
        error: '不正な画像データ形式です',
        details: '画像はBase64形式で送信してください'
      });
    }

    try {
      // Base64文字列をバッファに変換（エラーハンドリング付き）
      const base64Data = image.split('base64,')[1];
      if (!base64Data) {
        throw new Error('Base64データの抽出に失敗しました');
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('画像バッファの生成に失敗しました');
      }

      console.log('画像バッファ生成成功:', {
        bufferLength: imageBuffer.length,
        isBuffer: Buffer.isBuffer(imageBuffer)
      });

      // 画像処理とサムネイル生成
      const processedImage = await processPhotoAndCreateThumbnail(imageBuffer);

      // Gemini Vision APIによる解析
      const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

      console.log('Gemini Vision API呼び出し開始');
      const result = await model.generateContent([
        { text: PHOTO_ANALYSIS_PROMPT },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBuffer
          }
        }
      ]);

      const response = await result.response;
      const content = response.text().trim();

      console.log('Gemini Vision応答受信成功');

      try {
        // JSONレスポースのパース
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('JSON形式の応答が見つかりません');
        }

        const analysis = JSON.parse(jsonMatch[0]);
        
        // キーワードベース分類を追加
        const keywordClassifications = performKeywordBasedClassification(analysis.description);
        
        // 分類結果を統合（重複を除去）
        const allClassifications = [
          ...(analysis.categories || []),
          ...keywordClassifications
        ].reduce((unique, item) => {
          const exists = unique.some(u => 
            u.category === item.category && 
            u.text === item.text
          );
          if (!exists) {
            unique.push(item);
          }
          return unique;
        }, []);

        console.log('分類結果:', {
          totalCategories: allClassifications.length,
          categories: allClassifications.map(c => c.category)
        });

        // 写真データの保存
        const photoData = {
          processedImage: {
            data: `data:image/jpeg;base64,${processedImage.optimized}`,
            metadata: processedImage.metadata
          },
          analysis: {
            categories: allClassifications,
            description: analysis.description,
            detectedElements: analysis.detectedElements || []
          },
          timestamp: new Date().toISOString()
        };

        // 写真をストレージに保存
        const photoId = photoStorage.addPhoto(photoData);

        res.json({
          id: photoId,
          ...photoData
        });

      } catch (parseError) {
        console.error('Gemini Vision応答のパースエラー:', parseError);
        console.error('受信した内容:', content);
        
        // パース失敗時のフォールバック
        const keywordClassifications = performKeywordBasedClassification(content);
        
        const fallbackPhotoData = {
          processedImage: {
            data: `data:image/jpeg;base64,${processedImage.optimized}`,
            metadata: processedImage.metadata
          },
          analysis: {
            categories: keywordClassifications,
            description: content.substring(0, 200) + '...',
            detectedElements: []
          },
          timestamp: new Date().toISOString()
        };

        // フォールバックデータを保存
        const photoId = photoStorage.addPhoto(fallbackPhotoData);
        
        res.json({
          id: photoId,
          ...fallbackPhotoData
        });
      }

    } catch (error) {
      console.error('写真処理エラー:', error);
      throw error;
    }

  } catch (error) {
    console.error('=== 写真解析エラー ===');
    console.error('エラー名:', error.name);
    console.error('エラーメッセージ:', error.message);
    console.error('エラースタック:', error.stack);
    console.error('=== エラー終了 ===');
    
    res.status(500).json({
      error: '処理エラー',
      details: error.message
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
      photos = photoStorage.getAllPhotos();
    }

    // CSV形式に変換
    const csvData = convertToCSVFormat(classifications, storeName, photos);
    
    res.json({
      message: 'CSVデータを生成しました',
      csvData: csvData,
      timestamp: new Date().toISOString()

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