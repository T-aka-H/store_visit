import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Upload, 
  Download, 
  Trash2, 
  Brain,
  MessageCircle,
  ListTree,
  HelpCircle,
  Camera,
  Image,
  X,
  Eye,
  MapPin
} from 'lucide-react';

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
  const [showHelp, setShowHelp] = useState(false);
  
  const recognitionRef = useRef(null);

  // バックエンドステータス管理
  const [backendStatus, setBackendStatus] = useState('checking');
  const [lastStatusCheck, setLastStatusCheck] = useState(null);

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
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
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

  // バックエンドステータスチェック関数
  const checkBackendStatus = async () => {
    try {
      setBackendStatus('checking');
      console.log('🔍 AIシステムステータスチェック開始');
      
      const startTime = Date.now();
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000)
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        setBackendStatus('ready');
        setLastStatusCheck(new Date());
        console.log(`✅ AI機能準備完了 (${responseTime}ms)`);
        return { success: true, responseTime, data };
      } else {
        throw new Error(`Status: ${response.status}`);
      }
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

      // Blobを作成してダウンロード
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      alert('CSVファイルをエクスポートしました！');
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

        {/* AI機能ステータス表示 */}
        <BackendStatusIndicator />

        {/* メイン機能エリア */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 音声入力セクション */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="text-gray-400" size={24} />
              <h2 className="text-xl font-semibold text-gray-700">音声入力</h2>
            </div>

            {/* 音声認識UI */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleRecording}
                  disabled={isProcessing}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                    isWebSpeechRecording
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  } disabled:opacity-50`}
                >
                  {isWebSpeechRecording ? <MicOff size={20} /> : <Mic size={20} />}
                  {isWebSpeechRecording ? '録音停止' : '録音開始'}
                </button>

                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                  id="audio-upload"
                />
                <label
                  htmlFor="audio-upload"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 cursor-pointer"
                >
                  <Upload size={20} />
                  音声ファイル
                </label>
              </div>

              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="ここに音声認識結果が表示されます..."
                className="w-full h-32 p-3 border rounded-lg resize-none"
              />

              {/* 処理ボタン */}
              <div className="flex gap-4 mt-4">
                <button
                  onClick={processTranscript}
                  disabled={!transcript.trim() || isProcessing || backendStatus !== 'ready'}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 ${
                    backendStatus === 'ready' 
                      ? 'bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50'
                      : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  <Brain size={20} />
                  {isProcessing ? '処理中...' : 
                   backendStatus === 'checking' ? 'AI準備中...' :
                   backendStatus === 'error' ? 'AI接続エラー' :
                   'AI分類実行'}
                </button>
              </div>
            </div>
          </div>

          {/* 写真撮影セクション */}
          <PhotoCapture
            onPhotoAdded={capturePhoto}
            categories={categories}
            setCategories={setCategories}
            isProcessing={isAnalyzing}
            storeName={storeName}
            photos={photos}
            setPhotos={setPhotos}
            downloadPhoto={downloadPhoto}
            downloadAllPhotos={downloadAllPhotos}
          />
        </div>

        {/* 分類結果表示 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ListTree className="text-gray-400" size={24} />
              <h2 className="text-xl font-semibold text-gray-700">分類結果</h2>
            </div>
          </div>

          {categories.map(category => (
            <ClassificationTable
              key={category.name}
              category={category.name}
              items={category.items}
            />
          ))}
        </div>

        {/* データ操作ボタン */}
        <div className="flex justify-center gap-4 mt-8 mb-24">
          <button
            onClick={exportData}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200 flex items-center gap-2"
          >
            <Download size={20} />
            データ出力
          </button>

          <button
            onClick={clearAllData}
            className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors duration-200 flex items-center gap-2"
          >
            <Trash2 size={20} />
            データ削除
          </button>
        </div>
      </div>

      {/* カメラボタン */}
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

      {/* ヘルプボタン */}
      <button
        onClick={() => setShowHelp(true)}
        className="fixed bottom-20 right-6 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors duration-200"
        title="ヘルプを表示"
      >
        <HelpCircle size={20} />
      </button>

      {/* ヘルプモーダル */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">📖 使い方ガイド</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-6 text-sm">
              <div>
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                  🎤 音声入力機能
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• 右下のマイクボタンでリアルタイム音声録音</li>
                  <li>• 音声ファイルのアップロードにも対応</li>
                  <li>• 音声認識結果は手動編集可能</li>
                  <li>• 「AI分類実行」で自動的にカテゴリ分類</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                  📸 写真撮影機能
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• 左下のカメラボタンで写真撮影</li>
                  <li>• AI解析で内容を自動分類（バックエンド接続時）</li>
                  <li>• 写真の個別ダウンロードやZIP一括保存</li>
                  <li>• 写真ごとに信頼度とカテゴリを表示</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                  🤖 AI分類機能
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• 店舗情報、価格情報、売り場情報など6カテゴリに自動分類</li>
                  <li>• AI接続時は高精度、未接続時はローカル分類</li>
                  <li>• 各項目に信頼度と記録時刻を表示</li>
                  <li>• 音声・写真の種別も識別</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                  📊 データ出力機能
                </h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• CSV形式で店舗視察レポートを出力</li>
                  <li>• 音声認識ログと写真一覧も含む</li>
                  <li>• Excel対応のBOM付きエンコーディング</li>
                  <li>• 店舗名と日付でファイル名自動生成</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">💡 使用のコツ</h4>
                <ul className="space-y-1 text-blue-700 text-xs">
                  <li>• 店舗名を最初に入力すると分析精度が向上</li>
                  <li>• 音声は短い文章に区切って録音するとより正確</li>
                  <li>• 写真は店舗の特徴的な箇所を撮影</li>
                  <li>• 定期的にデータ出力してバックアップ</li>
                </ul>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200"
            >
              理解しました
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;error('❌ AIシステムエラー:', error);
      
      if (error.name === 'TimeoutError') {
        setBackendStatus('error');
        alert('⏰ AI機能の準備に時間がかかっています。\n\nもう一度お試しください。');
      } else {
        setBackendStatus('error');
      }
      
      return { success: false, error: error.message };
    }
  };

  // ページロード時の自動チェック
  useEffect(() => {
    checkBackendStatus();
    
    // 定期的なヘルスチェック（5分間隔）
    const interval = setInterval(checkBackendStatus, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // API呼び出し前のステータスチェック
  const performAIClassificationWithStatusCheck = async (text, categories, setCategories) => {
    // AI機能がready状態でない場合は先にチェック
    if (backendStatus !== 'ready') {
      const statusResult = await checkBackendStatus();
      if (!statusResult.success) {
        alert('AI機能に接続できません。しばらく待ってから再試行してください。');
        return;
      }
    }
    
    // 元のAI分類処理を実行
    return performAIClassification(text, categories, setCategories);
  };

  // ステータス表示コンポーネント
  const BackendStatusIndicator = () => {
    const getStatusConfig = () => {
      switch (backendStatus) {
        case 'checking':
          return {
            color: 'bg-yellow-100 border-yellow-400 text-yellow-800',
            icon: '🤖',
            title: 'AIを準備しています',
            message: 'AI機能の準備中です。少々お待ちください...',
            showSpinner: true
          };
        case 'ready':
          return {
            color: 'bg-green-100 border-green-400 text-green-800',
            icon: '✅',
            title: 'AIの準備が整いました',
            message: lastStatusCheck ? 
              `最終確認: ${lastStatusCheck.toLocaleTimeString()}` : 
              'すべてのAI機能が利用可能です',
            showSpinner: false
          };
        case 'error':
          return {
            color: 'bg-red-100 border-red-400 text-red-800',
            icon: '❌',
            title: 'AI機能に接続できません',
            message: 'しばらく時間をおいてから再試行してください',
            showSpinner: false
          };
        default:
          return {
            color: 'bg-gray-100 border-gray-400 text-gray-800',
            icon: '❓',
            title: 'AI状態確認中',
            message: 'AI機能の状態を確認しています',
            showSpinner: false
          };
      }
    };

    const config = getStatusConfig();

    return (
      <div className={`mb-4 p-3 rounded-lg border ${config.color} transition-all duration-300`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.icon}</span>
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                {config.title}
                {config.showSpinner && (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
              <div className="text-xs opacity-75">
                {config.message}
              </div>
            </div>
          </div>
          
          <button
            onClick={checkBackendStatus}
            disabled={backendStatus === 'checking'}
            className="text-xs px-2 py-1 rounded bg-white bg-opacity-50 hover:bg-opacity-75 transition-all duration-200 disabled:opacity-50"
            title="手動でAI状態を再確認"
          >
            🔄 再確認
          </button>
        </div>
      </div>
    );
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

  // AI分類処理
  const processTranscript = async () => {
    if (!transcript.trim()) {
      alert('音声が認識されていません');
      return;
    }

    setIsProcessing(true);
    try {
      await performAIClassificationWithStatusCheck(transcript, categories, setCategories);
      alert('✅ AI分類が完了しました！');
    } catch (error) {
      console.error('分類処理エラー:', error);
      alert('分類処理に失敗しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // 写真撮影関数（簡略版）
  const capturePhoto = async () => {
    if (isAnalyzing || isProcessing) {
      alert('現在処理中です。しばらくお待ちください。');
      return;
    }
    
    try {
      setIsAnalyzing(true);
      console.log('📷 写真撮影開始');
      
      const file = await new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        
        input.onchange = (event) => {
          const files = event.target.files;
          if (files && files.length > 0) {
            resolve(files[0]);
          } else {
            reject(new Error('ファイルが選択されませんでした'));
          }
        };
        
        input.click();
      });

      if (!file) {
        throw new Error('ファイルが選択されませんでした');
      }
      
      // 画像をBase64に変換
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });

      // 写真データの作成
      const photoData = {
        id: Date.now(),
        base64: base64,
        timestamp: new Date().toLocaleString('ja-JP'),
        category: '店舗環境',
        description: '写真が追加されました',
        confidence: 0.7
      };

      setPhotos(prev => [...prev, photoData]);
      alert('📸 写真を保存しました！');

    } catch (error) {
      console.error('📸 写真撮影エラー:', error);
      alert('写真の処理に失敗しました。');
    } finally {
      setIsAnalyzing(false);
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
      console.