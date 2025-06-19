import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Upload, Trash2, MessageCircle, Brain, HelpCircle, Download, ListTree, Camera, Image, X, Eye, MapPin } from 'lucide-react';

// API設定
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://store-visit-7cux.onrender.com'
  : 'http://localhost:3001';

console.log('環境設定:', {
  NODE_ENV: process.env.NODE_ENV,
  API_BASE_URL,
  BUILD_TIME: new Date().toISOString()
});

// ユーティリティ関数
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

// カテゴリ名の日英対応
const CATEGORY_MAPPING = {
  '価格情報': 'price_info',
  '売り場情報': 'layout_info',
  '客層・混雑度': 'customer_info',
  '商品・品揃え': 'product_info',
  '店舗環境': 'environment_info'
};

// AI分類実行関数
const performAIClassification = async (text, categories, setCategories) => {
  try {
    console.log('🔄 AI分類開始');
    const response = await fetch(`${API_BASE_URL}/api/classify`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API呼び出し失敗 (${response.status}): ${responseText}`);
    }

    const result = JSON.parse(responseText);
    if (result.classifications) {
      setCategories(prevCategories => 
        prevCategories.map(cat => {
          const newItems = result.classifications
            .filter(c => c.category === cat.name)
            .map(c => ({
              id: Date.now() + Math.random(),
              text: c.text,
              confidence: c.confidence || 0.8,
              reason: c.reason,
              timestamp: new Date().toLocaleTimeString(),
              isPhoto: false
            }));
          
          return {
            ...cat,
            items: [...cat.items, ...newItems]
          };
        })
      );
    }
  } catch (error) {
    console.error('AI分類エラー:', error);
    performLocalClassification(text, categories, setCategories);
  }
};

// ローカル分類関数
const performLocalClassification = (text, categories, setCategories) => {
  const keywords = {
    '価格情報': ['円', '価格', '値段', '料金', '安い', '高い', '割引'],
    '商品・品揃え': ['商品', '品物', 'メニュー', '種類', '品揃え'],
    '店舗環境': ['店内', '雰囲気', '清潔', '広い', '狭い', '明るい'],
    '客層・混雑度': ['客', 'お客様', '混雑', '空いている', '人'],
    '売り場情報': ['売り場', 'レイアウト', '陳列', '配置', '棚'],
    '店舗情報': ['店舗', '営業', '場所', '立地', '店']
  };
  
  const priceMatches = text.match(/(\S+?)\s*(\d+)\s*円/g) || [];
  
  Object.entries(keywords).forEach(([category, words]) => {
    const matches = words.filter(word => text.includes(word));
    
    if (matches.length > 0 || (category === '価格情報' && priceMatches.length > 0)) {
      const extractedText = category === '価格情報' && priceMatches.length > 0 
        ? priceMatches.join(', ') 
        : text;
        
      setCategories(prevCategories => 
        prevCategories.map(cat => {
          if (cat.name === category) {
            return {
              ...cat,
              items: [...cat.items, {
                id: Date.now() + Math.random(),
                text: extractedText,
                confidence: 0.8,
                timestamp: new Date().toLocaleTimeString(),
                isPhoto: false
              }]
            };
          }
          return cat;
        })
      );
    }
  });
  
  alert('✅ ローカル分類が完了しました！');
};

// 分類結果テーブルコンポーネント
const ClassificationTable = ({ category, items }) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
        📋 {category}
        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
          {items.length}件
        </span>
      </h3>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  コメント
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  信頼度
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  記録時刻
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  種別
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item, index) => (
                <tr key={item.id || index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-md">
                    <div className="break-words">
                      {item.text}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      item.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                      item.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {Math.round((item.confidence || 0) * 100)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {item.timestamp}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                      item.isPhoto ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {item.isPhoto ? '📸 写真' : '🎤 音声'}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl mb-2">📝</span>
                      <p className="text-sm font-medium">データがありません</p>
                      <p className="text-xs text-gray-400">
                        音声録音や写真撮影で情報を追加してください
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// 写真撮影コンポーネント
const PhotoCapture = ({ 
  onPhotoAdded, 
  categories, 
  setCategories, 
  isProcessing, 
  storeName, 
  photos, 
  setPhotos, 
  downloadPhoto,
  downloadAllPhotos
}) => {
  return (
    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
      <h3 className="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
        📸 写真撮影・管理
        <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">
          {photos.length}枚
        </span>
        {isProcessing && (
          <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full animate-pulse">
            AI解析中
          </span>
        )}
      </h3>
      
      <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-600">📱</span>
          <span className="font-medium text-red-800 text-sm">写真撮影機能</span>
        </div>
        <p className="text-red-700 text-xs mb-2">
          左下の赤いカメラボタンで写真撮影が可能です。AIが自動で内容を分析・分類します。
        </p>
      </div>

      {photos.length > 0 ? (
        <>
          <h4 className="text-sm font-medium text-gray-600 mb-3 flex items-center gap-2">
            撮影済み写真一覧
            <button
              onClick={() => {
                if (photos.length > 0 && window.confirm(`${photos.length}枚の写真をすべて削除しますか？`)) {
                  setPhotos([]);
                }
              }}
              className="text-xs text-red-600 hover:text-red-800 ml-2"
            >
              🗑️ 全削除
            </button>
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {photos.map((photo, index) => (
              <div key={photo.id || index} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border">
                  <img
                    src={photo.base64}
                    alt={`撮影写真 ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 rounded-lg flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                    <button
                      onClick={() => downloadPhoto(photo)}
                      className="bg-white text-gray-700 px-2 py-1 rounded text-xs font-medium transition-all duration-200 hover:bg-gray-100"
                      title="この写真をダウンロード"
                    >
                      📥
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('この写真を削除しますか？')) {
                          setPhotos(prev => prev.filter(p => p.id !== photo.id));
                        }
                      }}
                      className="bg-red-500 text-white px-2 py-1 rounded text-xs font-medium transition-all duration-200 hover:bg-red-600"
                      title="この写真を削除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <div className="mt-1 text-xs">
                  <div className="text-gray-500 text-center truncate font-medium">
                    {photo.category || '未分類'}
                  </div>
                  {photo.confidence && (
                    <div className="text-center mt-1">
                      <span className={`inline-flex px-1 py-0.5 rounded text-xs ${
                        photo.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                        photo.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        AI信頼度: {Math.round(photo.confidence * 100)}%
                      </span>
                    </div>
                  )}
                  {photo.description && (
                    <div className="text-gray-400 text-center mt-1 truncate">
                      {photo.description}
                    </div>
                  )}
                  <div className="text-gray-400 text-center mt-1">
                    {photo.timestamp}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-2 justify-center">
            <button
              onClick={downloadAllPhotos}
              disabled={isProcessing}
              className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all duration-200 text-sm"
            >
              📦 ZIP保存
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <Camera size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500 mb-1">
            まだ写真が撮影されていません
          </p>
          <p className="text-xs text-gray-400 mb-3">
            左下の赤いカメラボタンで撮影を開始してください
          </p>
        </div>
      )}
    </div>
  );
};

// 分類セクションコンポーネント
const ClassificationSection = ({ categories }) => {
  return (
    <div className="mt-8">
      {categories.map(category => (
        <ClassificationTable
          key={category.name}
          category={category.name}
          items={category.items}
        />
      ))}
    </div>
  );
};

// JSZipの動的ロード関数
const loadJSZip = async () => {
  try {
    const JSZip = await import('jszip');
    return JSZip.default || JSZip;
  } catch (error) {
    console.error('JSZipの読み込みに失敗:', error);
    return null;
  }
};

// メインアプリコンポーネント
function App() {
  const [storeName, setStoreName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [categories, setCategories] = useState([
    { name: '店舗情報', items: [] },
    { name: '価格情報', items: [] },
    { name: '売り場情報', items: [] },
    { name: '客層・混雑度', items: [] },
    { name: '商品・品揃え', items: [] },
    { name: '店舗環境', items: [] }
  ]);
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [insights, setInsights] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [qaPairs, setQaPairs] = useState([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [isWebSpeechSupported, setIsWebSpeechSupported] = useState(false);
  const [isWebSpeechRecording, setIsWebSpeechRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [uploadedAudio, setUploadedAudio] = useState(null);
  
  const recognitionRef = useRef(null);

  // Web Speech API初期化
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setIsWebSpeechSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ja-JP';
      
      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        setTranscript(prev => prev + finalTranscript);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('音声認識エラー:', event.error);
        setIsWebSpeechRecording(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsWebSpeechRecording(false);
      };
    }
  }, []);

  // 高速化されたAI解析関数
  const analyzePhotoWithGemini = async (base64Image) => {
    console.log('🚀 AI解析開始');
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          image: base64Image,
          fast_mode: true
        })
      });
      
      console.log(`📡 APIレスポンス: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (parseError) {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(`API Error: ${errorMessage}`);
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ AI解析完了 (${processingTime}ms)`);
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ AI解析エラー (${processingTime}ms):`, error);
      throw error;
    }
  };

  // 分類結果をカテゴリに追加する関数
  const addClassificationsToCategories = (classifications) => {
    setCategories(prevCategories => 
      prevCategories.map(cat => {
        const newItems = classifications
          .filter(c => c.category === cat.name)
          .map(c => ({
            id: Date.now() + Math.random(),
            text: c.text,
            confidence: c.confidence || 0.8,
            reason: c.reason || '写真解析による分類',
            timestamp: new Date().toLocaleTimeString(),
            isPhoto: true
          }));
        
        return {
          ...cat,
          items: [...cat.items, ...newItems]
        };
      })
    );
  };

  // 写真撮影関数（エラーハンドリング強化版）
  const capturePhoto = async () => {
    if (isAnalyzing || isProcessing) {
      alert('現在処理中です。しばらくお待ちください。');
      return;
    }
    
    try {
      setIsAnalyzing(true);
      console.log('📷 写真撮影開始');
      
      // ファイル選択の改善版
      const file = await new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        
        // タイムアウト設定（30秒）
        const timeoutId = setTimeout(() => {
          reject(new Error('ファイル選択がタイムアウトしました'));
        }, 30000);
        
        input.onchange = (event) => {
          clearTimeout(timeoutId);
          const files = event.target.files;
          if (files && files.length > 0) {
            console.log('📷 ファイル選択成功:', files[0].name);
            resolve(files[0]);
          } else {
            reject(new Error('ファイルが選択されませんでした'));
          }
        };
        
        // エラーハンドリング追加
        input.onerror = (error) => {
          clearTimeout(timeoutId);
          console.error('📷 input要素エラー:', error);
          reject(new Error('ファイル選択でエラーが発生しました'));
        };
        
        try {
          input.click();
        } catch (clickError) {
          clearTimeout(timeoutId);
          console.error('📷 click()エラー:', clickError);
          reject(new Error('ファイル選択ダイアログを開けませんでした'));
        }
      });

      if (!file) {
        throw new Error('ファイルが選択されませんでした');
      }
      
      console.log(`📷 ファイル情報:`, {
        name: file.name,
        type: file.type,
        size: `${(file.size/1024/1024).toFixed(2)}MB`
      });
      
      // ファイル形式チェック
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type.toLowerCase())) {
        throw new Error(`対応していない画像形式です: ${file.type}\n\n対応形式: JPEG, PNG, WebP`);
      }
      
      // ファイルサイズチェック（10MB制限）
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error(`ファイルサイズが大きすぎます: ${(file.size/1024/1024).toFixed(2)}MB\n\n制限: 10MB以下`);
      }

      // 画像をBase64に変換（エラーハンドリング強化）
      console.log('🔄 画像変換開始...');
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
          try {
            const result = event.target.result;
            if (result && typeof result === 'string') {
              console.log('✅ Base64変換成功');
              resolve(result);
            } else {
              reject(new Error('Base64変換結果が無効です'));
            }
          } catch (error) {
            console.error('📷 reader.onload エラー:', error);
            reject(new Error('Base64変換中にエラーが発生しました'));
          }
        };
        
        reader.onerror = (error) => {
          console.error('📷 FileReader エラー:', error);
          reject(new Error('ファイル読み込み中にエラーが発生しました'));
        };
        
        reader.onabort = () => {
          console.error('📷 FileReader 中断');
          reject(new Error('ファイル読み込みが中断されました'));
        };
        
        try {
          reader.readAsDataURL(file);
        } catch (readError) {
          console.error('📷 readAsDataURL エラー:', readError);
          reject(new Error('ファイル読み込みを開始できませんでした'));
        }
      });

      // 画像サイズ確認
      const imageSizeKB = Math.round(base64.length * 0.75 / 1024);
      console.log(`📊 Base64サイズ: ${imageSizeKB}KB`);
      
      if (imageSizeKB > 5000) { // 5MB制限
        throw new Error(`変換後の画像サイズが大きすぎます: ${imageSizeKB}KB\n\nより小さな画像をお選びください`);
      }

      // AI解析実行（簡略版）
      console.log('🤖 AI解析開始...');
      let analysis;
      try {
        // タイムアウト設定（20秒）
        const analysisPromise = analyzePhotoWithGemini(base64);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AI解析がタイムアウトしました（20秒）')), 20000);
        });
        
        analysis = await Promise.race([analysisPromise, timeoutPromise]);
      } catch (analysisError) {
        console.error('🤖 AI解析エラー:', analysisError);
        
        // フォールバック: 基本的な写真データを作成
        console.log('🔄 フォールバック処理開始');
        analysis = {
          success: true,
          id: Date.now(),
          classifications: [{
            category: '店舗環境',
            text: `写真が追加されました (${new Date().toLocaleTimeString()})`,
            confidence: 0.5,
            reason: 'AI解析失敗のためフォールバック'
          }],
          processedImage: {
            data: base64
          }
        };
        
        console.log('⚠️ AI解析に失敗しましたが、写真は正常に保存されます');
      }

      if (!analysis) {
        throw new Error('AI解析結果が無効です');
      }

      // 写真データの作成
      const photoData = {
        id: analysis.id || Date.now(),
        base64: analysis.processedImage?.data || base64,
        timestamp: new Date().toLocaleString('ja-JP'),
        category: analysis.classifications?.[0]?.category || '店舗環境',
        description: analysis.classifications?.[0]?.text || '写真が追加されました',
        confidence: analysis.classifications?.[0]?.confidence || 0.7
      };

      console.log('💾 写真データ保存:', {
        id: photoData.id,
        category: photoData.category,
        confidence: photoData.confidence
      });
      
      setPhotos(prev => [...prev, photoData]);
      
      // カテゴリに自動追加
      if (analysis.classifications && analysis.classifications.length > 0) {
        try {
          addClassificationsToCategories(analysis.classifications);
          console.log(`📊 ${analysis.classifications.length}件の分類を追加`);
        } catch (categoryError) {
          console.error('📊 カテゴリ追加エラー:', categoryError);
          // カテゴリ追加に失敗しても写真保存は成功とする
        }
      }

      // 成功メッセージ
      const successMessage = analysis.fallback 
        ? `📸 写真を保存しました！\n\n⚠️ AI解析は失敗しましたが、写真は正常に保存されています。\n\nカテゴリ: ${photoData.category}`
        : `📸 写真解析完了！\n\nカテゴリ: ${photoData.category}\n説明: ${photoData.description}\n信頼度: ${Math.round(photoData.confidence * 100)}%`;
      
      alert(successMessage);

    } catch (error) {
      console.error('📸 写真撮影エラー:', error);
      
      // エラーメッセージの詳細化
      let userMessage = '写真の処理に失敗しました。';
      
      if (error.message) {
        if (error.message.includes('選択されませんでした') || error.message.includes('タイムアウト')) {
          userMessage = '写真の選択がキャンセルまたはタイムアウトしました。';
        } else if (error.message.includes('対応していない')) {
          userMessage = `${error.message}\n\n別の画像をお試しください。`;
        } else if (error.message.includes('サイズが大きすぎます')) {
          userMessage = `${error.message}\n\nより小さな画像をお選びください。`;
        } else if (error.message.includes('ネットワーク') || error.message.includes('fetch')) {
          userMessage = 'ネットワーク接続エラーです。\n\nインターネット接続を確認して再試行してください。';
        } else if (error.message.includes('AI解析')) {
          userMessage = 'AI解析に失敗しました。\n\nしばらく時間をおいてから再試行してください。';
        } else {
          userMessage = `写真処理エラー: ${error.message}`;
        }
      } else {
        userMessage = '不明なエラーが発生しました。\n\nページを再読み込みして再試行してください。';
      }
      
      alert(userMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 音声録音機能（Web Speech API版）
  const toggleRecording = () => {
    if (!isWebSpeechSupported) {
      alert('お使いのブラウザは音声認識に対応していません');
      return;
    }

    if (isWebSpeechRecording) {
      recognitionRef.current?.stop();
      setIsWebSpeechRecording(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsWebSpeechRecording(true);
      } catch (error) {
        console.error('音声認識開始エラー:', error);
        alert('音声認識を開始できませんでした');
      }
    }
  };

  // 音声ファイルアップロード機能
  const handleAudioUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      alert('音声ファイルを選択してください');
      return;
    }

    setUploadedAudio(file);
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`音声認識エラー: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.transcript) {
        setTranscript(prev => prev + result.transcript + ' ');
        alert('音声ファイルの認識が完了しました！');
      } else {
        throw new Error('音声認識結果が空でした');
      }
    } catch (error) {
      console.error('音声ファイル処理エラー:', error);
      alert('音声ファイルの処理に失敗しました');
    } finally {
      setIsProcessing(false);
      setUploadedAudio(null);
    }
  };

  // テキスト入力追加機能
  const addTextInput = () => {
    if (textInput.trim()) {
      setTranscript(prev => prev + textInput.trim() + ' ');
      setTextInput('');
      setShowTextInput(false);
    }
  };

  // AI分類処理
  const processTranscript = async () => {
    if (!transcript.trim()) {
      alert('音声が認識されていません');
      return;
    }

    setIsProcessing(true);
    try {
      await performAIClassification(transcript, categories, setCategories);
      alert('✅ AI分類が完了しました！');
    } catch (error) {
      console.error('分類処理エラー:', error);
      alert('分類処理に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // インサイト生成機能
  const generateInsights = async () => {
    const allItems = categories.flatMap(cat => cat.items);
    if (allItems.length === 0) {
      alert('分析対象となるデータがありません');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          categories: categories,
          storeName: storeName 
        })
      });

      if (!response.ok) {
        throw new Error(`インサイト生成エラー: ${response.status}`);
      }

      const result = await response.json();
      setInsights(result.insights || 'インサイトの生成に失敗しました');
    } catch (error) {
      console.error('インサイト生成エラー:', error);
      setInsights('ローカルインサイト: 収集されたデータの分析を行ってください');
    } finally {
      setIsProcessing(false);
    }
  };

  // Q&A機能
  const handleQuestionSubmit = async () => {
    if (!questionInput.trim()) return;

    const question = questionInput.trim();
    setQuestionInput('');
    setIsAnswering(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question,
          categories: categories,
          storeName: storeName 
        })
      });

      if (!response.ok) {
        throw new Error(`Q&A エラー: ${response.status}`);
      }

      const result = await response.json();
      
      setQaPairs(prev => [...prev, {
        question,
        answer: result.answer || '回答の生成に失敗しました',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } catch (error) {
      console.error('Q&A エラー:', error);
      setQaPairs(prev => [...prev, {
        question,
        answer: '申し訳ございませんが、現在回答を生成できません',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsAnswering(false);
    }
  };

  // データクリア機能
  const clearAllData = () => {
    if (window.confirm('すべてのデータを削除しますか？この操作は取り消せません。')) {
      setCategories(prev => prev.map(cat => ({ ...cat, items: [] })));
      setTranscript('');
      setInsights('');
      setQaPairs([]);
      setPhotos([]);
      alert('すべてのデータが削除されました');
    }
  };

  // 写真ダウンロード機能
  const downloadPhoto = (photo) => {
    try {
      const link = document.createElement('a');
      link.href = photo.base64;
      link.download = `store-photo-${photo.id || Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('写真ダウンロードエラー:', error);
      alert('写真のダウンロードに失敗しました');
    }
  };

  // 全写真ZIP保存機能
  const downloadAllPhotos = async () => {
    if (photos.length === 0) {
      alert('保存する写真がありません');
      return;
    }

    try {
      setIsProcessing(true);
      const JSZip = await loadJSZip();
      
      if (!JSZip) {
        throw new Error('ZIP機能が利用できません');
      }

      const zip = new JSZip();
      
      photos.forEach((photo, index) => {
        const base64Data = photo.base64.split(',')[1];
        zip.file(`photo-${index + 1}-${photo.category || 'unknown'}.jpg`, base64Data, { base64: true });
      });

      const content = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `store-photos-${storeName || 'unknown'}-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(link.href);
      
    } catch (error) {
      console.error('ZIP保存エラー:', error);
      alert('ZIP保存に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // データエクスポート機能（CSV形式）
  const exportData = () => {
    try {
      // BOMを追加してExcelで文字化けを防ぐ
      const BOM = '\uFEFF';
      let csvContent = BOM;
      
      // ヘッダー情報
      csvContent += '店舗視察レポート\n';
      csvContent += `店舗名,${storeName || '未設定'}\n`;
      csvContent += `作成日時,${new Date().toLocaleString('ja-JP')}\n`;
      csvContent += `写真枚数,${photos.length}\n\n`;

      // カテゴリごとのデータ
      categories.forEach(category => {
        if (category.items.length > 0) {
          csvContent += `${category.name}\n`;
          csvContent += '内容,信頼度,記録時刻,写真有無\n';
          
          category.items.forEach(item => {
            const escapedText = `"${item.text.replace(/"/g, '""')}"`;
            const confidence = item.confidence ? `${Math.round(item.confidence * 100)}%` : '-';
            const timestamp = item.timestamp || '-';
            const hasPhoto = item.isPhoto ? '有' : '無';
            
            csvContent += `${escapedText},${confidence},${timestamp},${hasPhoto}\n`;
          });
          csvContent += '\n';
        }
      });

      // 音声認識結果
      if (transcript.trim()) {
        csvContent += '音声認識ログ\n';
        csvContent += `"${transcript.replace(/"/g, '""').replace(/\n/g, ' ')}"\n\n`;
      }

      // AIインサイト
      if (insights.trim()) {
        csvContent += 'AIインサイト\n';
        csvContent += `"${insights.replace(/"/g, '""').replace(/\n/g, ' ')}"\n\n`;
      }

      // Q&A履歴
      if (qaPairs.length > 0) {
        csvContent += 'Q&A履歴\n';
        csvContent += '質問,回答,記録時刻\n';
        qaPairs.forEach(qa => {
          const escapedQ = `"${qa.question.replace(/"/g, '""')}"`;
          const escapedA = `"${qa.answer.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          csvContent += `${escapedQ},${escapedA},${qa.timestamp}\n`;
        });
        csvContent += '\n';
      }

      // 写真一覧
      if (photos.length > 0) {
        csvContent += '写真一覧\n';
        csvContent += '撮影日時,カテゴリ,説明,信頼度\n';
        photos.forEach(photo => {
          const escapedDesc = `"${photo.description.replace(/"/g, '""')}"`;
          const confidence = photo.confidence ? `${Math.round(photo.confidence * 100)}%` : '-';
          csvContent += `${photo.timestamp},${photo.category},${escapedDesc},${confidence}\n`;
        });
      }

      // ファイル名を生成
      const timestamp = new Date().toISOString().slice(0, 10);
      const safeStoreName = (storeName || '未設定').replace(/[\\/:*?"<>|]/g, '_');
      const fileName = `店舗視察_${safeStoreName}_${timestamp}.csv`;

      try {
        // Blobを作成してダウンロード
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        
        if (window.navigator && window.navigator.msSaveOrOpenBlob) {
          // IEとEdge用の処理
          window.navigator.msSaveOrOpenBlob(blob, fileName);
        } else {
          // その他のブラウザ用の処理
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(link);
        }
        
        console.log('CSVエクスポート成功:', fileName);
        alert('CSVファイルをエクスポートしました！');
      } catch (downloadError) {
        console.error('ダウンロードエラー:', downloadError);
        
        // 代替のダウンロード方法を試す
        try {
          const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          console.log('代替方法でのエクスポート成功:', fileName);
          alert('CSVファイルをエクスポートしました！');
        } catch (fallbackError) {
          console.error('代替ダウンロード方法エラー:', fallbackError);
          throw new Error('ファイルのダウンロードに失敗しました');
        }
      }
    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert(`エクスポート中にエラーが発生しました: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🏪 店舗視察アプリ
          </h1>
          <p className="text-gray-600 text-lg">
            音声・写真で店舗情報を効率的に収集・分析
          </p>
        </div>

        {/* 店舗名入力 */}
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            店舗名
          </label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="例: セブンイレブン新宿店"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* メイン機能エリア */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 左側: 音声録音・テキスト入力 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center gap-2">
              🎤 音声・テキスト入力
            </h2>

            {/* 音声録音ボタン */}
            <div className="mb-4">
              <button
                onClick={toggleRecording}
                disabled={isProcessing}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isWebSpeechRecording
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                } disabled:opacity-50`}
              >
                {isWebSpeechRecording ? (
                  <>
                    <MicOff size={20} />
                    録音停止
                  </>
                ) : (
                  <>
                    <Mic size={20} />
                    音声録音開始
                  </>
                )}
              </button>
              {!isWebSpeechSupported && (
                <p className="text-red-500 text-xs mt-2">
                  お使いのブラウザは音声認識に対応していません
                </p>
              )}
            </div>

            {/* 音声ファイルアップロード */}
            <div className="mb-4">
              <label className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 transition-colors duration-200">
                <Upload size={20} />
                音声ファイルアップロード
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                  disabled={isProcessing}
                />
              </label>
            </div>

            {/* テキスト直接入力 */}
            <div className="mb-4">
              <button
                onClick={() => setShowTextInput(!showTextInput)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200"
              >
                <MessageCircle size={20} />
                テキスト直接入力
              </button>
              
              {showTextInput && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="ここに直接テキストを入力してください..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows="3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addTextInput}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      追加
                    </button>
                    <button
                      onClick={() => {
                        setTextInput('');
                        setShowTextInput(false);
                      }}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 認識されたテキスト表示 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                認識されたテキスト
              </label>
              <div className="min-h-[100px] p-3 border border-gray-300 rounded-lg bg-gray-50">
                {transcript || (
                  <span className="text-gray-400">
                    音声録音またはテキスト入力でデータを追加してください
                  </span>
                )}
              </div>
            </div>

            {/* 処理ボタン */}
            <div className="flex gap-2">
              <button
                onClick={processTranscript}
                disabled={!transcript.trim() || isProcessing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors duration-200"
              >
                <Brain size={20} />
                {isProcessing ? '処理中...' : 'AI分類実行'}
              </button>
              
              <button
                onClick={() => setTranscript('')}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>

          {/* 右側: 写真撮影 */}
          <PhotoCapture
            onPhotoAdded={capturePhoto}
            categories={categories}
            setCategories={setCategories}
            isProcessing={isAnalyzing || isProcessing}
            storeName={storeName}
            photos={photos}
            setPhotos={setPhotos}
            downloadPhoto={downloadPhoto}
            downloadAllPhotos={downloadAllPhotos}
          />
        </div>

        {/* インサイト・Q&Aセクション */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* インサイト生成 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                💡 AIインサイト
              </h3>
              <button
                onClick={generateInsights}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors duration-200"
              >
                <Brain size={16} />
                {isProcessing ? '生成中...' : '生成'}
              </button>
            </div>
            
            <div className="min-h-[150px] p-4 border border-gray-300 rounded-lg bg-gray-50">
              {insights || (
                <span className="text-gray-400">
                  AIがデータを分析してインサイトを生成します
                </span>
              )}
            </div>
          </div>

          {/* Q&A機能 */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              ❓ Q&A
            </h3>
            
            <div className="mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleQuestionSubmit()}
                  placeholder="質問を入力してください..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isAnswering}
                />
                <button
                  onClick={handleQuestionSubmit}
                  disabled={!questionInput.trim() || isAnswering}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors duration-200"
                >
                  <HelpCircle size={20} />
                </button>
              </div>
            </div>

            <div className="max-h-[200px] overflow-y-auto space-y-3">
              {qaPairs.map((qa, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium text-gray-700 mb-1">
                    Q: {qa.question}
                  </div>
                  <div className="text-gray-600 text-sm mb-1">
                    A: {qa.answer}
                  </div>
                  <div className="text-xs text-gray-400">
                    {qa.timestamp}
                  </div>
                </div>
              ))}
              {qaPairs.length === 0 && (
                <div className="text-center text-gray-400 py-4">
                  質問を入力してAIに聞いてみましょう
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 分類結果表示 */}
        <ClassificationSection categories={categories} />

        {/* データ操作ボタン - 下部の余白を増やして浮動ボタンとの重なりを防ぐ */}
        <div className="flex justify-center gap-4 mt-8 mb-24">
          <button
            onClick={exportData}
            disabled={(categories.every(cat => cat.items.length === 0) && !transcript.trim()) || isWebSpeechRecording}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 shadow-md"
            title="視察データをCSVファイルとして出力"
          >
            <Download size={20} />
            <span>CSV出力</span>
          </button>
          
          <button
            onClick={() => {
              if (window.confirm('本当にすべてのデータをクリアしますか？この操作は元に戻せません。')) {
                clearAllData();
              }
            }}
            disabled={isProcessing || isWebSpeechRecording}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 shadow-md"
            title="すべてのデータを削除"
          >
            <Trash2 size={20} />
            <span>データクリア</span>
          </button>
        </div>
      </div>

      {/* カメラボタン */}
      <div className="fixed bottom-6 left-6 z-50">
        <button
          onClick={() => {
            capturePhoto().catch(error => {
              console.error('📸 ボタンクリックエラー:', error);
              alert(`写真撮影でエラーが発生しました: ${error.message || '不明なエラー'}`);
            });
          }}
          disabled={isAnalyzing || isProcessing}
          className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 border-4 ${
            isAnalyzing 
              ? 'bg-red-500 hover:bg-red-600 animate-pulse border-red-700' 
              : 'bg-red-100 hover:bg-red-200 hover:scale-110 border-red-700'
          } ${isProcessing || isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''} text-red-900`}
          title={isAnalyzing ? 'AI解析中...' : '写真撮影'}
        >
          {isAnalyzing ? <Camera size={24} className="animate-pulse" /> : <Camera size={24} />}
        </button>
      </div>

      {/* マイクボタン */}
      <div className="fixed bottom-6 right-6 z-50">
        {isWebSpeechSupported ? (
          <button
            onClick={toggleRecording}
            disabled={isProcessing}
            className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 border-4 ${
              isWebSpeechRecording 
                ? 'bg-red-500 hover:bg-red-600 animate-pulse border-red-700' 
                : 'bg-blue-100 hover:bg-blue-200 hover:scale-110 border-blue-700'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''} text-blue-900`}
            title={isWebSpeechRecording ? '録音停止' : '音声録音'}
          >
            {isWebSpeechRecording ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        ) : (
          <div className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center bg-gray-400 text-white" title="このブラウザは音声認識に対応していません">
            <HelpCircle size={24} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;