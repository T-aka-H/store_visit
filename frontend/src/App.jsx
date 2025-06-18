import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Upload, Trash2, MessageCircle, Brain, HelpCircle, Download, ListTree, Camera, Image, X, Eye, MapPin } from 'lucide-react';
import JSZip from 'jszip';

// APIエンドポイントの設定
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://store-visit-7cux.onrender.com'
  : 'http://localhost:3001';

const performAIClassification = async (text, categories, setCategories) => {
  console.log('performAIClassification 呼び出し:', text);
  console.log('分類カテゴリ:', categories);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/classify-context`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        categories: categories
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '分類処理中にエラーが発生しました');
    }

    const data = await response.json();
    console.log('分類結果:', data);

    if (data.classifications && data.classifications.length > 0) {
      setCategories(prevCategories => {
        const updatedCategories = [...prevCategories];
        
        data.classifications.forEach(classification => {
          const categoryIndex = updatedCategories.findIndex(
            cat => cat.name === classification.category
          );
          
          if (categoryIndex !== -1) {
            updatedCategories[categoryIndex].items.push({
              text: classification.text,
              confidence: classification.confidence,
              reason: classification.reason,
              timestamp: new Date().toLocaleTimeString()
            });
          }
        });
        
        return updatedCategories;
      });
    }

    return data.classifications;
  } catch (error) {
    console.error('AI分類エラー:', error);
    throw error;
  }
};

// 写真機能コンポーネント
const PhotoCapture = ({ onPhotoAdded, categories, setCategories, isProcessing }) => {
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 個別写真ダウンロード関数
  const downloadPhoto = async (photo) => {
    try {
      // まずバックエンドAPIを試す
      const response = await fetch(`${API_BASE_URL}/api/photos/${photo.id}/download`, {
        method: 'GET',
      });
      
      if (response.ok) {
        // バックエンドAPIが成功した場合
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `store_visit_photo_${photo.id}.zip`;
        document.body.appendChild(a);
        a.click();
        
        // クリーンアップ
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
      
      // ファイル名を生成（日時とカテゴリを含む）
      const timestamp = new Date(photo.timestamp || Date.now())
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, '-');
      const category = photo.category ? `_${photo.category}` : '';
      link.download = `store_photo_${timestamp}${category}.jpg`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('写真ダウンロード完了:', link.download);
    } catch (fallbackError) {
      console.error('フォールバックダウンロードエラー:', fallbackError);
      alert('写真のダウンロードに失敗しました');
    }
  };

  // 全写真一括ダウンロード関数
  const downloadAllPhotos = async () => {
    if (photos.length === 0) {
      alert('ダウンロード可能な写真がありません');
      return;
    }

    try {
      const zip = new JSZip();
      const photoFolder = zip.folder("store_photos");
      
      // 各写真をZIPに追加
      photos.forEach((photo, index) => {
        try {
          // Base64データからバイナリデータを取得
          const base64Data = photo.base64.split(',')[1];
          
          // ファイル名生成
          const timestamp = new Date(photo.timestamp || Date.now())
            .toISOString()
            .slice(0, 19)
            .replace(/[T:]/g, '-');
          const category = photo.category ? `_${photo.category}` : '';
          const fileName = `photo_${String(index + 1).padStart(3, '0')}_${timestamp}${category}.jpg`;
          
          photoFolder.file(fileName, base64Data, {base64: true});
          
          // メタデータファイルも追加
          const metadata = {
            originalTimestamp: photo.timestamp,
            category: photo.category,
            description: photo.description,
            confidence: photo.confidence,
            analysis: photo.analysis
          };
          photoFolder.file(`${fileName}.json`, JSON.stringify(metadata, null, 2));
          
        } catch (error) {
          console.error(`写真 ${index + 1} の処理エラー:`, error);
        }
      });
      
      // レポート情報も追加
      const reportData = {
        storeName: storeName || '未設定',
        exportDate: new Date().toISOString(),
        totalPhotos: photos.length,
        categories: categories.map(cat => ({
          name: cat.name,
          itemCount: cat.items.length
        })),
        photos: photos.map((photo, index) => ({
          index: index + 1,
          timestamp: photo.timestamp,
          category: photo.category,
          description: photo.description,
          confidence: photo.confidence
        }))
      };
      
      zip.file("report.json", JSON.stringify(reportData, null, 2));
      
      // ZIPファイル生成とダウンロード
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });
      
      const url = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      
      // ZIPファイル名生成
      const exportDate = new Date().toISOString().slice(0, 10);
      const storeNameSafe = (storeName || 'unknown').replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
      link.download = `store_photos_${storeNameSafe}_${exportDate}.zip`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert(`${photos.length}枚の写真をZIPファイルでダウンロードしました！`);
      
    } catch (error) {
      console.error('一括ダウンロードエラー:', error);
      alert('写真の一括ダウンロードに失敗しました: ' + error.message);
    }
  };

  // iPhone向け写真撮影（ネイティブカメラ起動）
  const capturePhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.multiple = true;
    
    input.onchange = (event) => {
      const files = Array.from(event.target.files);
      files.forEach(file => processPhoto(file));
    };
    
    input.click();
  };

  // 写真処理（AI解析 + 自動分類）
  const processPhoto = async (file) => {
    try {
      setIsAnalyzing(true);
      
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

      setPhotos(prev => [...prev, photoData]);
      
      // カテゴリに自動追加
      if (analysis?.suggestedCategory && analysis?.description) {
        addPhotoToCategory(photoData);
      }
      
      onPhotoAdded?.(photoData);
      
    } catch (error) {
      console.error('写真処理エラー:', error);
      alert('写真の処理中にエラーが発生しました');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Gemini Vision APIで写真解析
  const analyzePhotoWithGemini = async (base64Image) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          image: base64Image.split(',')[1],
          categories: categories.map(c => c.name)
        })
      });
      
      if (!response.ok) throw new Error('AI解析に失敗');
      
      return await response.json();
    } catch (error) {
      console.error('AI解析エラー:', error);
      return {
        suggestedCategory: '店舗環境',
        description: '写真が追加されました',
        confidence: 0.5,
        detectedElements: []
      };
    }
  };

  // 写真をカテゴリに自動追加
  const addPhotoToCategory = (photoData) => {
    setCategories(prevCategories => {
      const updatedCategories = [...prevCategories];
      const categoryIndex = updatedCategories.findIndex(
        cat => cat.name === photoData.category
      );
      
      if (categoryIndex !== -1) {
        updatedCategories[categoryIndex].items.push({
          text: `📸 ${photoData.description}`,
          confidence: photoData.confidence,
          reason: 'AI写真解析による自動分類',
          timestamp: photoData.timestamp,
          photoId: photoData.id,
          isPhoto: true
        });
      }
      
      return updatedCategories;
    });
  };

  // Base64変換
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 写真メタデータ抽出
  const extractPhotoMetadata = async (file) => {
    try {
      const location = await getCurrentLocation();
      
      return {
        size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
        type: file.type,
        lastModified: new Date(file.lastModified).toLocaleString('ja-JP'),
        location: location
      };
    } catch (error) {
      return { size: `${(file.size / 1024 / 1024).toFixed(1)}MB` };
    }
  };

  // 位置情報取得
  const getCurrentLocation = () => {
    return new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            lat: position.coords.latitude.toFixed(6),
            lng: position.coords.longitude.toFixed(6),
            accuracy: Math.round(position.coords.accuracy)
          }),
          () => resolve(null),
          { timeout: 5000, enableHighAccuracy: true }
        );
      } else {
        resolve(null);
      }
    });
  };

  // 写真削除
  const removePhoto = (photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
    
    setCategories(prevCategories => {
      return prevCategories.map(category => ({
        ...category,
        items: category.items.filter(item => item.photoId !== photoId)
      }));
    });
  };

  // ファイルサイズフォーマット
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
          📸 視察写真
          {photos.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
              {photos.length}枚
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {/* 一括ダウンロードボタン */}
          {photos.length > 0 && (
            <button
              onClick={downloadAllPhotos}
              disabled={isAnalyzing || isProcessing}
              className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 shadow-sm hover:shadow-md transition-all duration-200 text-sm"
              title={`${photos.length}枚の写真をZIPでダウンロード`}
            >
              <Download size={14} />
              <span className="font-medium">全写真DL</span>
            </button>
          )}
          {/* 写真撮影ボタン */}
          <button
            onClick={capturePhoto}
            disabled={isAnalyzing || isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Camera size={16} />
            <span className="text-sm font-medium">
              {isAnalyzing ? '解析中...' : '写真撮影'}
            </span>
          </button>
        </div>
      </div>

      {/* 解析中インジケーター */}
      {isAnalyzing && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-blue-700 text-sm font-medium">
              🤖 AIが写真を解析中... 自動でカテゴリ分類します
            </span>
          </div>
        </div>
      )}

      {/* 写真グリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {photos.map(photo => (
          <div key={photo.id} className="relative group">
            <img
              src={photo.base64}
              alt={photo.description}
              className="w-full aspect-square object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 flex gap-2">
                {/* 詳細表示ボタン */}
                <button
                  onClick={() => setSelectedPhoto(photo)}
                  className="p-2 bg-white bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
                  title="詳細表示"
                >
                  <Eye size={16} className="text-gray-700" />
                </button>
                
                {/* ダウンロードボタン */}
                <button
                  onClick={() => downloadPhoto(photo)}
                  className="p-2 bg-green-500 bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
                  title="この写真をダウンロード"
                >
                  <Download size={16} className="text-white" />
                </button>
                
                {/* 削除ボタン */}
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="p-2 bg-red-500 bg-opacity-90 rounded-full hover:bg-opacity-100 transition-all"
                  title="削除"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 写真詳細モーダル */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">写真詳細</h3>
                <div className="flex gap-2">
                  {/* ダウンロードボタン */}
                  <button
                    onClick={() => downloadPhoto(selectedPhoto)}
                    className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all"
                    title="ダウンロード"
                  >
                    <Download size={20} />
                  </button>
                  {/* 閉じるボタン */}
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="p-2 hover:bg-gray-100 rounded-full"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              <img
                src={selectedPhoto.base64}
                alt={selectedPhoto.description}
                className="w-full rounded-lg mb-4"
              />
              
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-700">撮影日時</h4>
                  <p className="text-sm text-gray-600">
                    {new Date(selectedPhoto.timestamp).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700">分類</h4>
                  <p className="text-sm text-gray-600">
                    {selectedPhoto.category}
                  </p>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700">説明</h4>
                  <p className="text-sm text-gray-600">
                    {selectedPhoto.description}
                  </p>
                </div>
                
                {selectedPhoto.metadata?.location && (
                  <div>
                    <h4 className="font-medium text-gray-700">位置情報</h4>
                    <p className="text-sm text-gray-600">
                      緯度: {selectedPhoto.metadata.location.lat}
                      <br />
                      経度: {selectedPhoto.metadata.location.lng}
                      <br />
                      精度: {selectedPhoto.metadata.location.accuracy}m
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 分類結果テーブルコンポーネント
const ClassificationTable = ({ category, items }) => {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-2">{category}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left border-b">コメント</th>
              <th className="px-4 py-2 text-center border-b w-24">信頼度</th>
              <th className="px-4 py-2 text-center border-b w-32">記録時刻</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-2 border-b">{item.text}</td>
                <td className="px-4 py-2 text-center border-b">
                  {typeof item.confidence === 'number' 
                    ? `${Math.round(item.confidence * 100)}%`
                    : item.confidence}
                </td>
                <td className="px-4 py-2 text-center border-b text-sm">
                  {item.timestamp || new Date().toLocaleTimeString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// カテゴリ名の日英対応
const CATEGORY_MAPPING = {
  '価格情報': 'price_info',
  '売り場情報': 'layout_info',
  '客層・混雑度': 'customer_info',
  '商品・品揃え': 'product_info',
  '店舗環境': 'environment_info'
};

// CSVデータを分類結果に変換する関数
const convertCsvToCategories = (csvData) => {
  if (!csvData || !csvData.row) return [];

  return Object.entries(CATEGORY_MAPPING).map(([jaName, enKey]) => {
    const items = csvData.row[enKey]
      ? csvData.row[enKey].split(' | ').map(text => ({
          text,
          confidence: 0.9,
          timestamp: new Date().toLocaleTimeString()
        }))
      : [];

    return {
      name: jaName,
      items
    };
  });
};

const PhotoCard = ({ photo, onDelete }) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/photos/${photo.id}/download`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('ダウンロードに失敗しました');
      }

      // レスポンスをBlobとして取得
      const blob = await response.blob();
      
      // ダウンロードリンクを作成
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `store_visit_photo_${photo.id}.zip`;
      document.body.appendChild(a);
      a.click();
      
      // クリーンアップ
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('写真ダウンロードエラー:', error);
      alert('写真のダウンロードに失敗しました');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <img
        src={photo.processedImage.data}
        alt="Store visit"
        className="w-full h-48 object-cover rounded-lg mb-4"
      />
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-600 text-sm">
          {new Date(photo.timestamp).toLocaleString()}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm flex items-center gap-1"
          >
            <Download size={16} />
            ダウンロード
          </button>
          <button
            onClick={() => onDelete(photo.id)}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm flex items-center gap-1"
          >
            <Trash2 size={16} />
            削除
          </button>
        </div>
      </div>
      {photo.classifications.map((classification, index) => (
        <div key={index} className="mb-2 last:mb-0">
          <div className="flex justify-between items-center">
            <span className="font-medium">{classification.category}</span>
            <span className="text-sm text-gray-500">
              信頼度: {Math.round(classification.confidence * 100)}%
            </span>
          </div>
          <p className="text-gray-700 text-sm mt-1">{classification.text}</p>
          {classification.reason && (
            <p className="text-gray-500 text-xs mt-1">{classification.reason}</p>
          )}
        </div>
      ))}
    </div>
  );
};

// メインアプリコンポーネント
function App() {
  const [storeName, setStoreName] = useState('');
  const [categories, setCategories] = useState([
    { name: '価格情報', items: [], description: '商品の価格、特売情報、価格比較に関する情報' },
    { name: '売り場情報', items: [], description: '売り場のレイアウト、面積、陳列方法に関する情報' },
    { name: '客層・混雑度', items: [], description: '来店客の年齢層、混雑状況、客動線に関する情報' },
    { name: '商品・品揃え', items: [], description: '商品の種類、品揃え、欠品状況に関する情報' },
    { name: '店舗環境', items: [], description: '清潔さ、照明、音楽、空調などの店舗環境に関する情報' }
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
  const [photos, setPhotos] = useState([]); // 写真データ
  const recognitionRef = useRef(null);
  const [textInput, setTextInput] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const apiEndpoint = `${API_BASE_URL}/api/transcribe`;

  // Web Speech API サポート確認
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsWebSpeechSupported(true);
      console.log('Web Speech API サポート確認済み');
      
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';
      
      recognitionRef.current = recognition;
    } else {
      console.log('Web Speech API 非対応');
      setIsWebSpeechSupported(false);
    }
  }, []);

  const startWebSpeechRecording = () => {
    if (!recognitionRef.current) {
      alert('このブラウザでは音声認識がサポートされていません');
      return;
    }

    try {
      console.log('=== Web Speech API 開始 ===');
      setIsWebSpeechRecording(true);
      setIsProcessing(false);

      let finalTranscript = '';
      let interimTranscript = '';

      recognitionRef.current.onresult = (event) => {
        interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
            console.log('確定音声:', transcript);
          } else {
            interimTranscript += transcript;
          }
        }

        const currentDisplay = finalTranscript + interimTranscript;
        if (currentDisplay.trim()) {
          setTranscript(prev => {
            const lines = prev.split('\n\n');
            if (lines[lines.length - 1].startsWith('[録音中]')) {
              lines[lines.length - 1] = `[録音中] ${currentDisplay}`;
            } else {
              lines.push(`[録音中] ${currentDisplay}`);
            }
            return lines.join('\n\n');
          });
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Web Speech API エラー:', event.error);
        setIsWebSpeechRecording(false);
        
        if (event.error === 'not-allowed') {
          alert('マイクの許可が必要です。ブラウザの設定でマイクを許可してください。');
        } else if (event.error === 'no-speech') {
          alert('音声が検出されませんでした。もう一度お試しください。');
        } else {
          alert(`音声認識エラー: ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        console.log('Web Speech API 終了');
        setIsWebSpeechRecording(false);
        
        if (finalTranscript.trim()) {
          processWebSpeechResult(finalTranscript.trim());
        }
      };

      recognitionRef.current.start();
      
    } catch (error) {
      console.error('Web Speech API 開始エラー:', error);
      setIsWebSpeechRecording(false);
      alert('音声認識の開始に失敗しました');
    }
  };

  const stopWebSpeechRecording = () => {
    if (recognitionRef.current && isWebSpeechRecording) {
      console.log('Web Speech API 停止');
      recognitionRef.current.stop();
    }
  };

  const processWebSpeechResult = async (transcriptText) => {
    console.log('=== Web Speech 結果処理開始 ===');
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptText })
      });

      if (!response.ok) throw new Error('音声認識処理に失敗しました');
      
      const result = await response.json();
      processClassificationResult(result);
      
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

      if (!storeName) {
        const extractedStoreName = extractStoreName(transcriptText);
        if (extractedStoreName) {
          console.log('店舗名を自動抽出:', extractedStoreName);
          setStoreName(extractedStoreName);
        }
      }

    } catch (error) {
      console.error('Web Speech 結果処理エラー:', error);
      alert('音声認識結果の処理中にエラーが発生しました: ' + error.message);
    } finally {
      setIsProcessing(false);
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

  const clearData = () => {
    setTranscript('');
    setCategories(categories.map(cat => ({ ...cat, items: [] })));
    setInsights('');
    setQaPairs([]);
    setQuestionInput('');
    setTextInput('');
    setPhotos([]);
  };

  const processTextInput = async () => {
    if (!textInput.trim()) return;
    
    setIsProcessing(true);
    
    try {
      setTranscript(prev => prev + textInput + '\n\n');
      setTextInput('');
      alert('テキストが追加されました！');
      
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

  const handlePhotoAdded = (photoData) => {
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
          isProcessing={isProcessing}
        />

        {/* コントロールボタン */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* テキスト入力 */}
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            disabled={isWebSpeechRecording}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 shadow-sm hover:shadow-md min-h-[52px] disabled:opacity-50"
          >
            <MessageCircle size={20} />
            <span className="text-sm font-medium">テキスト入力</span>
          </button>
          
          {/* データクリア */}
          <button
            onClick={clearData}
            disabled={isProcessing || isWebSpeechRecording}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md min-h-[52px]"
          >
            <Trash2 size={20} />
            <span className="text-sm font-medium">データクリア</span>
          </button>

          {/* Excel出力 */}
          <button
            onClick={exportToExcel}
            disabled={(categories.every(cat => cat.items.length === 0) && !transcript.trim()) || isWebSpeechRecording}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow-md min-h-[52px]"
          >
            <Download size={20} />
            <span className="text-sm font-medium">Excel出力</span>
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

        {/* 分類結果の表示を更新 */}
        <div className="mt-8">
          {categories.map(category => (
            <ClassificationTable
              key={category.name}
              category={category.name}
              items={category.items}
            />
          ))}
        </div>

        {/* カテゴリ別結果表示 */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-4 flex items-center gap-2">
            📊 分類結果
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {categories.map((category, index) => (
              <div key={index} className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="text-xl">
                    {category.name.includes('価格') ? '💰' : 
                     category.name.includes('売り場') ? '🏬' : 
                     category.name.includes('客層') ? '👥' : 
                     category.name.includes('商品') ? '📦' : '🏪'}
                  </span>
                  {category.name}
                </h3>
                <div className="space-y-2">
                  {category.items.length > 0 ? (
                    category.items.map((item, itemIndex) => (
                      <div key={itemIndex} className={`rounded-lg p-3 border-l-4 ${item.isPhoto ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-blue-400'}`}>
                        <p className="text-gray-700 leading-relaxed text-sm">{item.text}</p>
                        <div className="mt-2 flex justify-between items-center text-xs text-gray-500">
                          <span>信頼度: {Math.round(item.confidence * 100)}%</span>
                          <span>{item.timestamp}</span>
                        </div>
                        {item.reason && (
                          <p className="mt-1 text-xs text-gray-500 italic">
                            理由: {item.reason}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-400 italic text-center py-6 text-sm">まだデータがありません</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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

        {/* フッター */}
        <div className="text-center text-gray-500 pt-6 border-t border-gray-200">
          <p className="text-sm">🚀 Powered by Gemini AI • 効率的な店舗視察をサポート</p>
        </div>
      </div>
    </div>
  );
}

export default App;