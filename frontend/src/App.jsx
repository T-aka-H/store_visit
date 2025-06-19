import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Upload, Trash2, MessageCircle, Brain, HelpCircle, Download, ListTree, Camera, Image, X, Eye, MapPin } from 'lucide-react';

// 現在のURL設定を確認・修正
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://store-visit-7cux.onrender.com'  // 正しいバックエンドURL
  : 'http://localhost:3001';

console.log('API_BASE_URL:', API_BASE_URL); // デバッグ用

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
    console.log('🔄 AI分類開始（CORS回避モード）');
    console.log('送信データ:', { text, categories: categories.map(cat => cat.name) });
    
    // CORSを回避してAPIを呼び出す
    const response = await fetch(`${API_BASE_URL}/api/classify`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ text })  // categoriesは固定のため、送信を省略
    });

    // レスポンスのステータスとテキストを取得
    const responseText = await response.text();
    console.log('APIレスポンス:', {
      status: response.status,
      statusText: response.statusText,
      text: responseText
    });

    if (!response.ok) {
      throw new Error(`API呼び出し失敗 (${response.status}): ${responseText}`);
    }

    // JSONとしてパース
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSONパースエラー:', parseError);
      throw new Error(`レスポンスのJSONパースに失敗: ${responseText}`);
    }

    if (result.classifications) {
      console.log('分類結果:', result.classifications);
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
      console.log('分類完了:', result);
    } else {
      throw new Error('分類結果が不正な形式です');
    }
  } catch (error) {
    console.error('AI分類エラー (CORS):', error);
    
    // CORS エラーの場合は、ローカル分類を実行
    console.log('🔧 フォールバック: ローカル分類実行');
    performLocalClassification(text, categories, setCategories);
  }
};

// ローカル分類関数を追加
const performLocalClassification = (text, categories, setCategories) => {
  const keywords = {
    '価格情報': ['円', '価格', '値段', '料金', '安い', '高い', '割引'],
    '商品・品揃え': ['商品', '品物', 'メニュー', '種類', '品揃え'],
    '店舗環境': ['店内', '雰囲気', '清潔', '広い', '狭い', '明るい'],
    '客層・混雑度': ['客', 'お客様', '混雑', '空いている', '人'],
    '売り場情報': ['売り場', 'レイアウト', '陳列', '配置', '棚'],
    '店舗情報': ['店舗', '営業', '場所', '立地', '店']
  };
  
  // 価格の正確な抽出
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
  
  alert('✅ ローカル分類が完了しました！\n(バックエンドAPIが利用できないため、フロントエンドで処理)');
};

// CSV形式をカテゴリ配列に変換
const convertCsvToCategories = (csvFormat) => {
  const categories = [
    { name: '店舗情報', items: [] },
    { name: '価格情報', items: [] },
    { name: '売り場情報', items: [] },
    { name: '客層・混雑度', items: [] },
    { name: '商品・品揃え', items: [] },
    { name: '店舗環境', items: [] }
  ];

  try {
    const lines = csvFormat.split('\n');
    
    lines.forEach(line => {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const [category, text, confidence] = parts;
        const categoryObj = categories.find(cat => 
          cat.name === category.trim() || CATEGORY_MAPPING[category.trim()] === cat.name
        );
        
        if (categoryObj && text.trim()) {
          categoryObj.items.push({
            id: Date.now() + Math.random(),
            text: text.trim(),
            confidence: parseFloat(confidence) || 0.8,
            timestamp: new Date().toLocaleTimeString(),
            isPhoto: false
          });
        }
      }
    });
  } catch (error) {
    console.error('CSV変換エラー:', error);
  }

  return categories;
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
  downloadAllPhotos  // 追加: downloadAllPhotosをpropsとして受け取る
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
      
      {/* 写真撮影の説明 */}
      <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-red-600">📱</span>
          <span className="font-medium text-red-800 text-sm">写真撮影機能</span>
        </div>
        <p className="text-red-700 text-xs mb-2">
          左下の赤いカメラボタンで写真撮影が可能です。AIが自動で内容を分析・分類します。
        </p>
        <div className="text-xs text-red-600 space-y-1">
          <div>📷 <strong>撮影:</strong> 左下の赤いカメラボタンをタップ</div>
          <div>🤖 <strong>AI解析:</strong> 撮影後、自動でカテゴリ分類・説明文生成</div>
          <div>💾 <strong>保存:</strong> 個別ダウンロード・一括ZIP保存対応</div>
          <div>🏷️ <strong>自動分類:</strong> 店舗環境、商品、価格等を自動判定</div>
        </div>
      </div>

      {/* 撮影済み写真の表示 */}
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
          
          {/* 写真関連の操作ボタン */}
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
          <div className="bg-gray-50 rounded-lg p-3 mx-8">
            <p className="text-xs text-gray-500">
              <strong>💡 撮影のコツ:</strong><br/>
              商品、価格表示、店内環境など、<br/>
              視察に必要な要素を撮影すると<br/>
              AIが自動で分類・分析します
            </p>
          </div>
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
  const [audioChunks, setAudioChunks] = useState([]);
  const [insights, setInsights] = useState('');
  const [questionInput, setQuestionInput] = useState('');
  const [qaPairs, setQaPairs] = useState([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [showAiFeatures, setShowAiFeatures] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [isWebSpeechSupported, setIsWebSpeechSupported] = useState(false);
  const [isWebSpeechRecording, setIsWebSpeechRecording] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [uploadedAudio, setUploadedAudio] = useState(null);
  
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // Web Speech API録音開始関数
  const startWebSpeechRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('このブラウザでは音声認識がサポートされていません。Chrome、Safari、Edgeをお使いください。');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';
      recognition.maxAlternatives = 1;

      let finalTranscript = '';

      recognition.onstart = () => {
        console.log('Web Speech API開始');
        setIsWebSpeechRecording(true);
        setTranscript(prev => prev + '[録音中]\n');
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(prev => {
          const lines = prev.split('\n\n');
          const lastIndex = lines.length - 1;
          
          if (lines[lastIndex].startsWith('[録音中]')) {
            lines[lastIndex] = '[録音中] ' + finalTranscript + interimTranscript;
          }
          
          return lines.join('\n\n');
        });
      };

      recognition.onerror = (event) => {
        console.error('Web Speech API エラー:', event.error);
        setIsWebSpeechRecording(false);
        
        let errorMessage = '音声認識でエラーが発生しました。';
        if (event.error === 'no-speech') {
          errorMessage = '音声が検出されませんでした。マイクが正常に動作しているか確認してください。';
        } else if (event.error === 'not-allowed') {
          errorMessage = 'マイクの使用が許可されていません。ブラウザの設定を確認してください。';
        }
        
        alert(errorMessage);
      };

      recognition.onend = () => {
        console.log('Web Speech API終了');
        setIsWebSpeechRecording(false);
        
        if (finalTranscript.trim()) {
          processWebSpeechResult(finalTranscript.trim());
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (error) {
      console.error('音声認識初期化エラー:', error);
      alert('音声認識の初期化に失敗しました');
    }
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

  // useEffectでWeb Speech APIサポート確認
  useEffect(() => {
    const checkWebSpeechSupport = () => {
      const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
      setIsWebSpeechSupported(isSupported);
      console.log('Web Speech API サポート:', isSupported);
    };

    checkWebSpeechSupport();
  }, []);

  // アップロードされた音声の処理（Gemini 1.5 Flash使用）
  const processUploadedAudio = async () => {
    if (!uploadedAudio) return;

    setIsProcessing(true);
    
    try {
      console.log('=== Gemini音声認識開始 ===');
      console.log('ファイル情報:', {
        name: uploadedAudio.name,
        type: uploadedAudio.type,
        size: uploadedAudio.size,
        lastModified: uploadedAudio.lastModified
      });

      // FormDataを作成（Gemini APIに音声ファイルを送信）
      const formData = new FormData();
      formData.append('audio', uploadedAudio);
      formData.append('model', 'gemini-1.5-flash');
      formData.append('language', 'ja-JP');
      formData.append('source', 'file_upload');

      console.log('Gemini APIリクエスト送信中...');

      const response = await fetch(`${API_BASE_URL}/api/transcribe-audio-gemini`, {
        method: 'POST',
        body: formData
      });

      console.log('Gemini APIレスポンス状態:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          console.error('Gemini APIエラー詳細:', errorData);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          console.error('エラーレスポンスのパースに失敗:', parseError);
          const errorText = await response.text();
          console.error('エラーレスポンステキスト:', errorText);
          
          if (response.status === 404) {
            throw new Error('Gemini音声認識APIが実装されていません。バックエンド側で `/api/transcribe-audio-gemini` エンドポイントの実装が必要です。');
          }
          
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('Gemini音声認識結果:', result);

      let transcriptText = '';
      if (result.transcript) {
        transcriptText = result.transcript;
      } else if (result.transcription) {
        transcriptText = result.transcription;
      } else if (result.text) {
        transcriptText = result.text;
      } else if (typeof result === 'string') {
        transcriptText = result;
      } else {
        console.warn('予期しないレスポンス形式:', result);
        throw new Error('Gemini音声認識の結果を取得できませんでした');
      }

      if (transcriptText && transcriptText.trim()) {
        setTranscript(prev => {
          const newContent = `[Gemini音声認識: ${uploadedAudio.name}]\n${transcriptText}`;
          return prev ? `${prev}\n\n${newContent}` : newContent;
        });

        // 店舗名の自動抽出のみ実行
        if (!storeName) {
          const extractedStoreName = extractStoreName(transcriptText);
          if (extractedStoreName) {
            console.log('店舗名を自動抽出:', extractedStoreName);
            setStoreName(extractedStoreName);
          }
        }

        alert(`✅ Gemini 1.5 Flashによる音声認識が完了しました！\n\nファイル: ${uploadedAudio.name}\n認識結果: ${transcriptText.length}文字\n\n分類は手動で実行してください。`);
      } else {
        console.warn('Gemini音声認識結果が空です:', result);
        throw new Error('音声から文字起こしできませんでした。音声が明瞭でない、またはサポートされていない形式の可能性があります。');
      }

    } catch (error) {
      console.error('Gemini音声処理エラー:', error);
      
      let userMessage = 'Gemini音声認識中にエラーが発生しました。';
      
      if (error.message.includes('Gemini音声認識APIが実装されていません')) {
        userMessage = `🚧 バックエンド実装が必要です

Gemini 1.5 Flash音声認識を使用するには、バックエンド側で以下のAPIエンドポイントの実装が必要です：

📍 エンドポイント: /api/transcribe-audio-gemini
📍 メソッド: POST
📍 形式: FormData (音声ファイル)
📍 レスポンス: { transcript: "認識結果" }

💡 一時的な代替案：
右下の青いマイクボタンでリアルタイム音声認識をご利用ください。`;
      } else if (error.message.includes('Invalid file format')) {
        userMessage = 'このファイル形式はGeminiでサポートされていません。MP3、WAV、M4Aファイルをお試しください。';
      } else if (error.message.includes('File too large')) {
        userMessage = 'ファイルサイズが大きすぎます。Gemini APIの制限内（通常50MB以下）のファイルをお試しください。';
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        userMessage = 'Gemini APIの利用制限に達しました。しばらく時間をおいてから再試行してください。';
      }
      
      alert(userMessage);
    } finally {
      setIsProcessing(false);
      setUploadedAudio(null);
    }
  };

  const stopWebSpeechRecording = () => {
    if (recognitionRef.current && isWebSpeechRecording) {
      console.log('Web Speech API 停止');
      recognitionRef.current.stop();
    }
  };

  // 店舗名抽出関数
  const extractStoreName = (text) => {
    console.log('店舗名抽出開始:', text);
    
    const storePatterns = [
      /店舗名\s*([^。、\s]+)/i,
      /店舗名は\s*([^。、\s]+)/i,
      /(?:今日は|今回は|本日は)?\s*(.+?店)\s*(?:に来|を視察|の視察|について|です|だ|。)/i,
      /(?:ここは|この店は)?\s*(.+?店)\s*(?:です|だ|。|の)/i,
    ];

    for (const pattern of storePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let storeName = match[1].trim();
        
        storeName = storeName
          .replace(/^(の|を|に|で|は|が|も)\s*/, '')
          .replace(/\s*(です|だ|である|。|、)$/, '')
          .trim();
        
        if (storeName.length >= 2 && storeName.length <= 50) {
          console.log('店舗名マッチ:', storeName, 'パターン:', pattern);
          return storeName;
        }
      }
    }
    
    console.log('店舗名抽出失敗');
    return null;
  };

  // 音声認識結果の処理
  const processWebSpeechResult = async (transcriptText) => {
    console.log('=== Web Speech 結果処理開始 ===');
    setIsProcessing(true);
    
    try {
      // 音声認識結果をトランスクリプトに追加するだけ
      setTranscript(prev => {
        const lines = prev.split('\n\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine.startsWith('[録音中]')) {
          lines[lines.length - 1] = transcriptText;
        } else {
          lines.push(transcriptText);
        }
        return lines.join('\n\n');
      });

      // 店舗名の自動抽出のみ実行
      if (!storeName) {
        const extractedStoreName = extractStoreName(transcriptText);
        if (extractedStoreName) {
          console.log('店舗名を自動抽出:', extractedStoreName);
          setStoreName(extractedStoreName);
        }
      }

      console.log('✅ 音声認識完了（分類は手動で実行してください）');

    } catch (error) {
      console.error('Web Speech 結果処理エラー:', error);
      alert('音声認識結果の処理中にエラーが発生しました: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 音声ファイルアップロード処理
  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // ファイルサイズチェック（50MB制限）
      if (file.size > 50 * 1024 * 1024) {
        alert('ファイルサイズが大きすぎます。50MB以下の音声ファイルを選択してください。');
        return;
      }

      // 音声ファイル形式チェック（M4A対応を強化）
      const allowedTypes = [
        'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 
        'audio/x-m4a', 'audio/mp4a-latm', 'audio/aac',
        'audio/webm', 'audio/ogg'
      ];
      
      // ファイル拡張子もチェック
      const fileName = file.name.toLowerCase();
      const allowedExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.webm', '.ogg', '.mp4'];
      const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
      
      if (!allowedTypes.includes(file.type) && !hasValidExtension) {
        alert('対応していない音声形式です。MP3、WAV、M4A等の音声ファイルを選択してください。');
        return;
      }

      // M4Aファイルの場合は追加の警告
      if (fileName.endsWith('.m4a') || file.type.includes('m4a')) {
        console.log('M4Aファイルを検出しました。iPhoneで録音された場合、ロスレス形式だと処理できない可能性があります。');
      }

      setUploadedAudio(file);
      console.log('音声ファイルアップロード:', file.name, file.type, (file.size / 1024 / 1024).toFixed(1) + 'MB');
    }
  };

  const clearData = () => {
    setTranscript('');
    setCategories(categories.map(cat => ({ ...cat, items: [] })));
    setInsights('');
    setQaPairs([]);
    setQuestionInput('');
    setTextInput('');
    setPhotos([]);
    setUploadedAudio(null);
  };

  const processTextInput = async () => {
    if (!textInput.trim()) return;
    
    setIsProcessing(true);
    
    try {
      // トランスクリプトに追加
      setTranscript(prev => prev + textInput + '\n\n');
      
      // AI分類を実行
      await performAIClassification(textInput, categories, setCategories);
      
      setTextInput('');
      alert('テキストが追加され、分類が完了しました！');
      
    } catch (error) {
      console.error('テキスト処理エラー:', error);
      alert('テキスト処理中にエラーが発生しました: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateInsights = async () => {
    if (categories.every(cat => cat.items.length === 0) && !transcript.trim()) {
      alert('分析対象のデータがありません。まず音声録音を行ってください。');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const insightData = {
        storeName: storeName || '未設定',
        categories: categories.filter(cat => cat.items.length > 0).map(cat => ({
          name: cat.name,
          items: cat.items.map(item => item.text)
        })),
        transcript: transcript,
        photos: photos.map(photo => ({
          category: photo.category,
          description: photo.description,
          timestamp: photo.timestamp
        }))
      };

      console.log('インサイト生成データ:', insightData);

      const response = await fetch(`${API_BASE_URL}/api/generate-insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(insightData)
      });

      console.log('インサイトレスポンス状態:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('インサイトAPIエラー:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('インサイト結果:', result);
      setInsights(result.insights);
      
    } catch (error) {
      console.error('インサイト生成エラー:', error);
      alert(`インサイト生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const askQuestion = async () => {
    if (!questionInput.trim()) return;
    
    setIsAnswering(true);
    
    try {
      const questionData = {
        question: questionInput,
        storeName: storeName || '未設定',
        categories: categories.filter(cat => cat.items.length > 0).map(cat => ({
          name: cat.name,
          items: cat.items.map(item => item.text)
        })),
        transcript: transcript,
        photos: photos.map(photo => ({
          category: photo.category,
          description: photo.description,
          timestamp: photo.timestamp
        }))
      };

      const response = await fetch(`${API_BASE_URL}/api/ask-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(questionData)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      
      setQaPairs(prev => [...prev, {
        question: questionInput,
        answer: result.answer,
        timestamp: new Date().toLocaleTimeString()
      }]);
      
      setQuestionInput('');
      
    } catch (error) {
      console.error('質問応答エラー:', error);
      alert(`質問処理中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsAnswering(false);
    }
  };

  const exportToExcel = () => {
    try {
      let csvContent = '\uFEFF';
      
      csvContent += '店舗視察レポート\n';
      csvContent += `店舗名,${storeName || '未設定'}\n`;
      csvContent += `作成日時,${new Date().toLocaleString('ja-JP')}\n`;
      csvContent += `写真枚数,${photos.length}\n`;
      csvContent += '\n';

      categories.forEach(category => {
        if (category.items.length > 0) {
          csvContent += `${category.name}\n`;
          csvContent += 'コメント,信頼度,記録時刻,写真\n';
          
          category.items.forEach(item => {
            const escapedText = `"${item.text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
            const confidence = `${Math.round(item.confidence * 100)}%`;
            const timestamp = item.timestamp;
            const hasPhoto = item.isPhoto ? '有' : '無';
            
            csvContent += `${escapedText},${confidence},${timestamp},${hasPhoto}\n`;
          });
          csvContent += '\n';
        }
      });

      if (transcript.trim()) {
        csvContent += '音声ログ\n';
        const escapedTranscript = `"${transcript.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csvContent += `${escapedTranscript}\n`;
        csvContent += '\n';
      }

      if (insights.trim()) {
        csvContent += 'AI分析結果\n';
        const escapedInsights = `"${insights.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csvContent += `${escapedInsights}\n`;
      }

      if (qaPairs.length > 0) {
        csvContent += '\n質問応答履歴\n';
        csvContent += '質問,回答,記録時刻\n';
        
        qaPairs.forEach(qa => {
          const escapedQuestion = `"${qa.question.replace(/"/g, '""')}"`;
          const escapedAnswer = `"${qa.answer.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          csvContent += `${escapedQuestion},${escapedAnswer},${qa.timestamp}\n`;
        });
      }

      if (photos.length > 0) {
        csvContent += '\n写真一覧\n';
        csvContent += '撮影日時,カテゴリ,説明,信頼度\n';
        
        photos.forEach(photo => {
          const escapedDesc = `"${photo.description.replace(/"/g, '""')}"`;
          csvContent += `${photo.timestamp},${photo.category},${escapedDesc},${Math.round(photo.confidence * 100)}%\n`;
        });
      }

      const blob = new Blob([csvContent], { 
        type: 'text/csv;charset=utf-8' 
      });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      const fileName = `店舗視察_${storeName || '未設定'}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);

      console.log('CSVエクスポート完了:', fileName);
      alert('CSVファイルをエクスポートしました！Excelで開くことができます。');

    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert('エクスポート中にエラーが発生しました');
    }
  };

  // 個別写真ダウンロード関数
  const downloadPhoto = async (photo) => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/photos/${photo.id}/download`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `store_visit_photo_${photo.id}.zip`;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      }
    } catch (error) {
      console.log('バックエンドAPI利用不可、フォールバックを使用:', error);
    }
    
    // フォールバック: Base64画像を直接ダウンロード
    try {
      const link = document.createElement('a');
      link.href = photo.base64;
      
      const timestamp = new Date(photo.timestamp || Date.now())
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, '-');
      const category = photo.category ? `_${photo.category}` : '';
      link.download = `store_photo_${timestamp}${category}.jpg`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (fallbackError) {
      console.error('フォールバックダウンロードエラー:', fallbackError);
      alert('写真のダウンロードに失敗しました');
    }
  };

  // downloadAllPhotos関数を修正（動的import使用）
  const downloadAllPhotos = async () => {
    if (photos.length === 0) {
      alert('ダウンロード可能な写真がありません');
      return;
    }

    try {
      const JSZip = await loadJSZip();
      
      if (JSZip) {
        const zip = new JSZip();
        
        photos.forEach((photo, index) => {
          try {
            const base64Data = photo.base64.split(',')[1];
            
            const timestamp = new Date(photo.timestamp || Date.now())
              .toISOString()
              .slice(0, 19)
              .replace(/[T:]/g, '-');
            const category = photo.category ? `_${photo.category}` : '';
            const fileName = `photo_${String(index + 1).padStart(3, '0')}_${timestamp}${category}.jpg`;
            
            zip.file(fileName, base64Data, {base64: true});
            
          } catch (error) {
            console.error(`写真 ${index + 1} の処理エラー:`, error);
          }
        });
        
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        });
        
        const url = window.URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        
        const exportDate = new Date().toISOString().slice(0, 10);
        const storeNameSafe = (storeName || 'unknown').replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
        link.download = `store_photos_${storeNameSafe}_${exportDate}.zip`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        alert(`${photos.length}枚の写真をZIPファイルでダウンロードしました！`);
        
      } else {
        photos.forEach((photo, index) => {
          setTimeout(() => {
            downloadPhoto(photo);
          }, index * 500);
        });
        
        alert('JSZipが利用できないため、写真を個別にダウンロードします');
      }
    } catch (error) {
      console.error('一括ダウンロードエラー:', error);
      alert('写真の一括ダウンロードに失敗しました: ' + error.message);
    }
  };

  const handlePhotoAdded = (photoData) => {
    console.log('写真が追加されました:', photoData);
    setPhotos(prev => [...prev, photoData]);
  };

  // 分類結果を処理する関数を更新
  const processClassificationResult = (result) => {
    if (result.csv_format) {
      const newCategories = convertCsvToCategories(result.csv_format);
      setCategories(prevCategories => 
        prevCategories.map(cat => {
          const newCat = newCategories.find(nc => nc.name === cat.name);
          return {
            ...cat,
            items: newCat ? [...cat.items, ...newCat.items] : cat.items
          };
        })
      );
    }
  };

  // Base64変換ユーティリティ
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 写真のメタデータ抽出
  const extractPhotoMetadata = async (file) => {
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified
    };

    // 位置情報の取得を試みる
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });

      metadata.location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
    } catch (error) {
      console.log('位置情報の取得に失敗:', error);
    }

    return metadata;
  };

  // 写真のAI解析
  const analyzePhotoWithGemini = async (base64Image) => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
      const response = await fetch(`${API_BASE_URL}/api/analyze-photo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: base64Image })
      });

      if (!response.ok) {
        throw new Error('AI解析に失敗しました');
      }

      const result = await response.json();
      
      // 最も信頼度の高い分類を取得
      const bestClassification = result.classifications.reduce(
        (best, current) => (!best || current.confidence > best.confidence) ? current : best,
        null
      );

      return {
        suggestedCategory: bestClassification?.category || '店舗環境',
        description: bestClassification?.text || '',
        confidence: bestClassification?.confidence || 0,
        allClassifications: result.classifications
      };
    } catch (error) {
      console.error('AI解析エラー:', error);
      return null;
    }
  };

  // カテゴリへの写真追加
  const addPhotoToCategory = (photoData) => {
    setCategories(prevCategories => {
      return prevCategories.map(category => {
        if (category.name === photoData.category) {
          return {
            ...category,
            items: [...category.items, {
              id: Date.now().toString(),
              photoId: photoData.id,
              text: photoData.description,
              confidence: photoData.confidence,
              timestamp: photoData.timestamp
            }]
          };
        }
        return category;
      });
    });
  };

  // 写真撮影とAI解析
  const capturePhoto = async () => {
    if (isAnalyzing || isProcessing) return;
    
    try {
      setIsAnalyzing(true);
      
      // input要素の作成と設定
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      
      // ファイル選択プロミスの作成
      const file = await new Promise((resolve) => {
        input.onchange = (event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            resolve(files[0]);
          }
        };
        input.click();
      });

      if (!file) {
        throw new Error('写真が選択されませんでした');
      }

      // Base64変換
      const base64 = await fileToBase64(file);
      
      // 位置情報とメタデータ取得
      const metadata = await extractPhotoMetadata(file);
      
      // AI解析でカテゴリ自動判定
      const analysis = await analyzePhotoWithGemini(base64);
      
      const photoData = {
        id: Date.now() + Math.random(),
        file: file,
        base64: base64,
        timestamp: new Date().toLocaleString('ja-JP'),
        metadata: metadata,
        analysis: analysis,
        category: analysis?.suggestedCategory || '店舗環境',
        description: analysis?.description || '',
        confidence: analysis?.confidence || 0,
        size: file.size,
        name: file.name || `photo_${Date.now()}.jpg`
      };

      handlePhotoAdded(photoData);
      
      // カテゴリに自動追加
      if (analysis?.suggestedCategory && analysis?.description) {
        addPhotoToCategory(photoData);
      }

    } catch (error) {
      console.error('写真撮影エラー:', error);
      alert('写真の撮影に失敗しました');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 pb-24">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-700 mb-3">
            🏪 店舗視察AI
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            音声録音と写真撮影で効率的な店舗視察を実現。AIが自動で音声・写真を認識・分類し、ビジネスインサイトを生成します。
          </p>
        </div>

        {/* 店舗名入力 */}
        <div className="mb-6">
          <label className="block text-base font-medium text-gray-700 mb-2">
            📍 視察店舗名
          </label>
          <div className="relative">
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="音声で「今日はサミット野沢龍雲寺店の視察です」等と話すか、直接入力してください"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-800 placeholder-gray-400"
            />
            {storeName && (
              <div className="absolute right-3 top-3">
                <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                  音声抽出
                </span>
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            💡 ヒント: 「今日は〇〇店の視察です」「ここは〇〇店です」等と話すと自動で店舗名が設定されます
          </p>
        </div>

        {/* 写真撮影機能 */}
        <PhotoCapture 
          onPhotoAdded={handlePhotoAdded}
          categories={categories}
          setCategories={setCategories}
          isProcessing={isAnalyzing}
          storeName={storeName}
          photos={photos}
          setPhotos={setPhotos}
          downloadPhoto={downloadPhoto}
          downloadAllPhotos={downloadAllPhotos}  // 追加: downloadAllPhotosを渡す
        />

        {/* コントロールボタン - 上部（安全な機能のみ） */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* テキスト入力 */}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            disabled={isWebSpeechRecording}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            <MessageCircle size={20} />
            <span className="text-sm font-medium">テキスト入力</span>
          </button>

          {/* 音声認識結果を分類 */}
          <button
            onClick={async () => {
              if (!transcript) {
                alert('音声認識結果がありません。先に音声を認識してください。');
                return;
              }
              setIsProcessing(true);
              try {
                await performAIClassification(transcript, categories, setCategories);
              } catch (error) {
                console.error('分類エラー:', error);
                alert('分類処理中にエラーが発生しました: ' + error.message);
              } finally {
                setIsProcessing(false);
              }
            }}
            disabled={isWebSpeechRecording || isProcessing || !transcript}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md min-h-[52px] disabled:opacity-50"
          >
            <ListTree size={20} />
            <span className="text-sm font-medium">
              {isProcessing ? '分類中...' : '音声認識結果を分類'}
            </span>
          </button>

          {/* 分類ボタン */}
          <button
            onClick={async () => {
              if (!transcript.trim()) {
                alert('分類するテキストがありません。');
                return;
              }
              setIsProcessing(true);
              try {
                await performAIClassification(transcript, categories, setCategories);
                alert('分類が完了しました！');
              } catch (error) {
                console.error('分類エラー:', error);
                alert('分類中にエラーが発生しました: ' + error.message);
              } finally {
                setIsProcessing(false);
              }
            }}
            disabled={isProcessing || !transcript.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Brain size={20} />
            テキストを分類
          </button>
        </div>

        {/* 音声アップロードセクション */}
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
            🎵 音声ファイルアップロード
            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full">
              Gemini 1.5 Flash
            </span>
          </h3>
          
          {/* 機能説明 */}
          <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-blue-600">🤖</span>
              <span className="font-medium text-blue-800 text-sm">Gemini AI音声認識</span>
            </div>
            <p className="text-blue-700 text-xs mb-2">
              アップロードされた音声ファイルは、Gemini 1.5 Flash AIモデルで高精度な文字起こしを行います。
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept=".m4a,.mp3,.wav,.aac,.webm,.ogg,audio/*"
              onChange={handleAudioUpload}
              disabled={isProcessing || isWebSpeechRecording}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white text-gray-800 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
            />
            <div className="text-xs text-gray-500 space-y-1">
              <div>🎯 <strong>AI認識:</strong> Gemini 1.5 Flash（高精度・多言語対応）</div>
              <div>📱 <strong>対応形式:</strong> M4A、MP3、WAV、AAC、WebM、OGG</div>
              <div>📁 <strong>iPhone:</strong> 「ブラウズ」→「ファイル」アプリからファイルを選択</div>
              <div>⚖️ <strong>制限:</strong> ファイルサイズ50MB以下推奨</div>
              <div className="flex items-center gap-2">
                <span>🔄 <strong>代替:</strong> リアルタイム音声認識（右下の青いマイクボタン）</span>
                <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Web Speech API</span>
              </div>
            </div>
          </div>
          {uploadedAudio && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span className="text-green-700 text-sm font-medium">
                  音声ファイル準備完了: {uploadedAudio.name}
                </span>
                <span className="text-gray-500 text-xs">
                  ({(uploadedAudio.size / 1024 / 1024).toFixed(1)}MB)
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={processUploadedAudio}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-all duration-200 text-sm flex items-center gap-2"
                >
                  <span>🤖</span>
                  <span>{isProcessing ? 'Gemini処理中...' : 'Gemini音声認識開始'}</span>
                </button>
                <button
                  onClick={() => setUploadedAudio(null)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200 text-sm"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 浮遊録音ボタン */}
        <div className="fixed bottom-6 right-6 z-50">
          {isWebSpeechSupported ? (
            <button
              onClick={isWebSpeechRecording ? stopWebSpeechRecording : startWebSpeechRecording}
              disabled={isProcessing}
              className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 border-4 ${
                isWebSpeechRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse border-red-700' 
                  : 'bg-blue-100 hover:bg-blue-200 hover:scale-110 border-blue-700'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''} text-blue-900`}
            >
              {isWebSpeechRecording ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
          ) : (
            <div className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center bg-gray-400 text-white">
              <HelpCircle size={24} />
            </div>
          )}
        </div>

        {/* 浮遊カメラボタン */}
        <div className="fixed bottom-6 left-6 z-50">
          <button
            onClick={capturePhoto}
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

        {/* Web Speech API 状態表示 */}
        {!isWebSpeechSupported && (
          <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="flex items-center gap-2">
              <HelpCircle size={16} className="text-yellow-600" />
              <span className="text-yellow-700 text-sm">
                このブラウザでは音声認識機能が利用できません。Chrome、Safari、Edgeをお使いください。
              </span>
            </div>
          </div>
        )}

        {/* テキスト入力モード */}
        {showTextInput && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-base font-medium text-gray-700 mb-3">テキスト入力モード</h3>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="視察内容をテキストで入力してください..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-800 placeholder-gray-400 resize-none"
            />
            <button
              onClick={processTextInput}
              disabled={!textInput.trim() || isProcessing}
              className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-all duration-200 text-sm"
            >
              {isProcessing ? '処理中...' : 'テキストを分析'}
            </button>
          </div>
        )}

        {/* 処理状況表示 */}
        {(isRecording || isProcessing || isWebSpeechRecording) && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <span className="text-blue-700 font-medium text-sm">
                {isWebSpeechRecording ? '🎤 音声認識中... リアルタイムで文字起こししています' :
                 isRecording ? '🎤 録音中... 録音停止ボタンを押して終了してください' : 
                 '🔄 音声を処理中... しばらくお待ちください'}
              </span>
            </div>
          </div>
        )}

        {/* 音声認識結果 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
              🎤 音声認識結果
            </h2>
            <button
              onClick={async () => {
                if (!transcript) {
                  alert('音声認識結果がありません。先に音声を認識してください。');
                  return;
                }
                setIsProcessing(true);
                try {
                  await performAIClassification(transcript, categories, setCategories);
                  alert('分類が完了しました！');
                } catch (error) {
                  console.error('分類エラー:', error);
                  alert('分類処理中にエラーが発生しました: ' + error.message);
                } finally {
                  setIsProcessing(false);
                }
              }}
              disabled={isWebSpeechRecording || isProcessing || !transcript}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50"
            >
              <ListTree size={16} />
              <span className="text-sm font-medium">
                {isProcessing ? '分類中...' : '音声認識結果を分類'}
              </span>
            </button>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
            {transcript ? (
              <pre className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed font-sans">
                {transcript}
              </pre>
            ) : (
              <p className="text-gray-400 italic text-center py-6">
                音声認識結果がここに表示されます
              </p>
            )}
          </div>
        </div>

        <ClassificationSection categories={categories} />

        {/* AIインサイト生成 */}
        {(categories.some(cat => cat.items.length > 0) || transcript || photos.length > 0) && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
                🤖 AIインサイト
              </h2>
              <button
                onClick={generateInsights}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md"
              >
                <Brain size={16} />
                <span className="text-sm font-medium">
                  {isProcessing ? '生成中...' : 'インサイト生成'}
                </span>
              </button>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              {insights ? (
                <div className="prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: insights.replace(/\n/g, '<br/>') }} />
                </div>
              ) : (
                <p className="text-gray-400 italic text-center py-6">
                  「インサイト生成」ボタンを押すと、AIが分類結果を分析してインサイトを生成します
                </p>
              )}
            </div>
          </div>
        )}

        {/* Q&A セクション */}
        {(categories.some(cat => cat.items.length > 0) || transcript || photos.length > 0) && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
              ❓ 質問応答
            </h2>
            <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="視察データについて質問してください..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={isAnswering}
                />
                <button
                  onClick={askQuestion}
                  disabled={!questionInput.trim() || isAnswering}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md"
                >
                  <span className="text-sm font-medium">
                    {isAnswering ? '回答中...' : '質問する'}
                  </span>
                </button>
              </div>
              <div className="space-y-4">
                {qaPairs.map((qa, index) => (
                  <div key={index} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                    <p className="text-gray-800 font-medium mb-2">Q: {qa.question}</p>
                    <p className="text-gray-600 text-sm">A: {qa.answer}</p>
                    <p className="text-gray-400 text-xs mt-1">{qa.timestamp}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 最下部のボタンセクション（重要な操作） */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <div className="bg-yellow-50 rounded-lg p-4 mb-4 border border-yellow-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-yellow-600">⚠️</span>
              <span className="font-medium text-yellow-800">注意</span>
            </div>
            <p className="text-yellow-700 text-sm">
              以下のボタンは重要な操作です。データの保存やクリアを行う前に、必要な情報が含まれているか確認してください。
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 写真全保存 */}
            {photos.length > 0 && (
              <button
                onClick={downloadAllPhotos}
                disabled={isProcessing}
                className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md min-h-[56px] font-medium"
                title={`${photos.length}枚の写真をZIPでダウンロード`}
              >
                <Download size={20} />
                <span>📸 写真を全保存</span>
              </button>
            )}

            {/* Excel出力 */}
            <button
              onClick={exportToExcel}
              disabled={(categories.every(cat => cat.items.length === 0) && !transcript.trim()) || isWebSpeechRecording}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md min-h-[56px] font-medium"
            >
              <Download size={20} />
              <span>📊 視察レポートをExcel出力</span>
            </button>

            {/* データクリア */}
            <button
              onClick={() => {
                if (window.confirm('本当にすべてのデータをクリアしますか？この操作は元に戻せません。')) {
                  clearData();
                }
              }}
              disabled={isProcessing || isWebSpeechRecording}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 shadow-sm hover:shadow-md min-h-[56px] font-medium"
            >
              <Trash2 size={20} />
              <span>🗑️ すべてのデータをクリア</span>
            </button>
          </div>
        </div>

        {/* フッター */}
        <div className="text-center text-gray-500 pt-6 border-t border-gray-200">
          <p className="text-sm">🚀 Powered by Gemini AI • 効率的な店舗視察をサポート</p>
        </div>
      </div>
    </div>
  );
}

export default App;