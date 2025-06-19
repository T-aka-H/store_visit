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

// ファイルサイズのフォーマット関数
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

// PhotoCaptureコンポーネント
const PhotoCapture = ({ 
  onPhotoAdded, 
  categories, 
  setCategories, 
  isProcessing, 
  storeName,
  photos,
  setPhotos,
  downloadPhoto // propsとして受け取る
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // removePhoto関数
  const removePhoto = (photoId) => {
    setPhotos(prev => prev.filter(photo => photo.id !== photoId));
    
    setCategories(prevCategories => {
      return prevCategories.map(category => ({
        ...category,
        items: category.items.filter(item => item.photoId !== photoId)
      }));
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-3 p-4">
        <h2 className="text-lg font-semibold text-gray-700 flex items-center gap-2">
          📸 視察写真
          {photos.length > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
              {photos.length}枚
            </span>
          )}
        </h2>
        {/* 全保存ボタンを削除 - 最下部に移動済み */}
      </div>

      {/* 撮影ヒント */}
      {photos.length === 0 && (
        <div className="mx-4 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-red-600" />
            <span className="text-red-700 text-sm font-medium">
              📸 左下の赤いカメラボタンで写真撮影できます
            </span>
          </div>
        </div>
      )}

      {/* 写真一覧 */}
      {photos.length > 0 ? (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                {/* 写真画像 */}
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  <img
                    src={photo.base64}
                    alt={photo.description}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* 写真情報とアクションボタン */}
                <div className="p-3">
                  {/* 写真メタ情報 */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                      <span className="font-medium text-sm text-gray-700">{photo.category}</span>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">
                      {photo.timestamp}
                    </div>
                    {photo.analysis?.confidence && (
                      <div className="text-xs text-blue-600">
                        信頼度: {Math.round(photo.analysis.confidence * 100)}%
                      </div>
                    )}
                    {photo.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {photo.description}
                      </p>
                    )}
                  </div>
                  
                  {/* アクションボタン群 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPhoto(photo)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-3 bg-blue-500 text-white rounded-lg text-sm font-medium active:bg-blue-600 transition-colors"
                    >
                      <Eye size={16} />
                      <span>詳細</span>
                    </button>
                    
                    <button
                      onClick={() => downloadPhoto(photo)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-3 bg-green-500 text-white rounded-lg text-sm font-medium active:bg-green-600 transition-colors"
                    >
                      <Download size={16} />
                      <span>保存</span>
                    </button>
                    
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="flex items-center justify-center py-3 px-3 bg-red-500 text-white rounded-lg active:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-gray-400">
          <Camera size={48} className="mx-auto mb-3 opacity-50" />
          <p>まだ写真がありません</p>
          <p className="text-sm mt-1">左下のカメラボタンでiPhoneカメラが起動します</p>
        </div>
      )}

      {/* 写真詳細モーダル */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-4">
              {/* ヘッダー */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">写真詳細</h3>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="p-2 hover:bg-gray-100 rounded-full active:bg-gray-200"
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* 写真 */}
              <img
                src={selectedPhoto.base64}
                alt={selectedPhoto.description}
                className="w-full rounded-lg mb-4"
              />
              
              {/* アクションボタン */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => downloadPhoto(selectedPhoto)}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-green-500 text-white rounded-lg font-medium active:bg-green-600 transition-colors"
                >
                  <Download size={20} />
                  <span>この写真を保存</span>
                </button>
                <button
                  onClick={() => {
                    removePhoto(selectedPhoto.id);
                    setSelectedPhoto(null);
                  }}
                  className="flex items-center justify-center py-4 px-4 bg-red-500 text-white rounded-lg active:bg-red-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              {/* 詳細情報 */}
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-medium text-gray-700">カテゴリ:</span>
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    {selectedPhoto.category}
                  </span>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">AI分析結果:</span>
                  <p className="mt-1 text-gray-600">{selectedPhoto.description}</p>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">撮影日時:</span>
                  <span className="ml-2 text-gray-600">{selectedPhoto.timestamp}</span>
                </div>
                
                <div>
                  <span className="font-medium text-gray-700">ファイルサイズ:</span>
                  <span className="ml-2 text-gray-600">{formatFileSize(selectedPhoto.size)}</span>
                </div>
                
                {selectedPhoto.metadata?.location && (
                  <div>
                    <span className="font-medium text-gray-700 flex items-center gap-1">
                      <MapPin size={14} />
                      位置情報:
                    </span>
                    <span className="ml-2 text-gray-600 text-xs">
                      {selectedPhoto.metadata.location.lat}, {selectedPhoto.metadata.location.lng}
                      (精度: ±{selectedPhoto.metadata.location.accuracy}m)
                    </span>
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
  const recognitionRef = useRef(null);
  const [textInput, setTextInput] = useState('');
  const [uploadedAudio, setUploadedAudio] = useState(null);
  
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

  // 音声ファイルアップロード処理
  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // ファイルサイズチェック（50MB制限）
      if (file.size > 50 * 1024 * 1024) {
        alert('ファイルサイズが大きすぎます。50MB以下の音声ファイルを選択してください。');
        return;
      }

      // 音声ファイル形式チェック
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/webm', 'audio/ogg'];
      if (!allowedTypes.includes(file.type)) {
        alert('対応していない音声形式です。MP3、WAV、M4A等の音声ファイルを選択してください。');
        return;
      }

      setUploadedAudio(file);
      console.log('音声ファイルアップロード:', file.name, file.type, (file.size / 1024 / 1024).toFixed(1) + 'MB');
    }
  };

  // アップロードされた音声の処理
  const processUploadedAudio = async () => {
    if (!uploadedAudio) return;

    setIsProcessing(true);
    
    try {
      console.log('=== 音声ファイル処理開始 ===');
      
      // FormDataを作成して音声ファイルを送信
      const formData = new FormData();
      formData.append('audio', uploadedAudio);
      formData.append('language', 'ja-JP'); // 日本語指定

      const response = await fetch(`${API_BASE_URL}/api/transcribe-audio`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '音声ファイルの処理に失敗しました');
      }

      const result = await response.json();
      console.log('音声文字起こし結果:', result);

      if (result.transcript) {
        // 音声認識結果を追加
        setTranscript(prev => {
          const newContent = `[アップロード音声: ${uploadedAudio.name}]\n${result.transcript}`;
          return prev ? `${prev}\n\n${newContent}` : newContent;
        });

        // 自動分類を実行
        if (result.transcript.trim()) {
          console.log('自動分類開始...');
          await performAIClassification(result.transcript, categories, setCategories);
        }

        // 店舗名の自動抽出も試行
        if (!storeName) {
          const extractedStoreName = extractStoreName(result.transcript);
          if (extractedStoreName) {
            console.log('店舗名を自動抽出:', extractedStoreName);
            setStoreName(extractedStoreName);
          }
        }

        alert('音声ファイルの文字起こしが完了しました！');
      } else {
        alert('音声から文字起こしできませんでした。音声が明瞭でない可能性があります。');
      }

    } catch (error) {
      console.error('音声処理エラー:', error);
      alert(`音声ファイルの処理中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setUploadedAudio(null); // 処理完了後にクリア
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

  // downloadAllPhotos関数（写真のみ、JSONファイルなし）
  const downloadAllPhotos = async () => {
    if (photos.length === 0) {
      alert('ダウンロード可能な写真がありません');
      return;
    }

    try {
      // JSZipの安全な使用
      if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        
        // 写真のみZIPに追加
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
        // JSZipが利用できない場合は個別ダウンロード
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
        </div>

        {/* 音声アップロードセクション */}
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-base font-medium text-gray-700 mb-3 flex items-center gap-2">
            🎵 音声ファイルアップロード
          </h3>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              disabled={isProcessing || isWebSpeechRecording}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-800 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <div className="text-xs text-gray-500">
              MP3、WAV、M4A等の音声ファイルに対応
            </div>
          </div>
          {uploadedAudio && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span className="text-green-700 text-sm font-medium">
                  音声ファイルがアップロードされました: {uploadedAudio.name}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={processUploadedAudio}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-all duration-200 text-sm"
                >
                  {isProcessing ? '処理中...' : '音声を文字起こし'}
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

        {/* 分類結果の表示（テーブル形式） */}
        <div className="mt-8">
          {categories.map(category => (
            <ClassificationTable
              key={category.name}
              category={category.name}
              items={category.items}
            />
          ))}
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