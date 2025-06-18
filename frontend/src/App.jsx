import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Upload, Trash2, MessageCircle, Brain, HelpCircle, Download, ListTree } from 'lucide-react';

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
  const recognitionRef = useRef(null);
  const [textInput, setTextInput] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const apiEndpoint = 'https://store-visit-7cux.onrender.com/api/transcribe';

  // Web Speech API サポート確認
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsWebSpeechSupported(true);
      console.log('Web Speech API サポート確認済み');
      
      // 音声認識インスタンス作成
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

        // リアルタイム表示更新
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
          // 最終的な文字起こし結果を処理
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
    console.log('認識テキスト:', transcriptText);
    
    setIsProcessing(true);
    
    try {
      // 音声ログを更新（[録音中]を削除して確定版に）
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

      // 店舗名自動抽出
      if (!storeName) { // 店舗名が未設定の場合のみ
        const extractedStoreName = extractStoreName(transcriptText);
        if (extractedStoreName) {
          console.log('店舗名を自動抽出:', extractedStoreName);
          setStoreName(extractedStoreName);
        }
      }

      // AI分類を実行
      await performAIClassification(transcriptText, categories, setCategories);

      console.log('Web Speech 処理完了');
      
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
    
    // 店舗名パターンのマッチング
    const storePatterns = [
      // 「店舗名〇〇」パターン（最優先）
      /店舗名\s*([^。、\s]+)/i,
      /店舗名は\s*([^。、\s]+)/i,
      
      // 基本パターン
      /(?:今日は|今回は|本日は)?\s*(.+?店)\s*(?:に来|を視察|の視察|について|です|だ|。)/i,
      /(?:ここは|この店は)?\s*(.+?店)\s*(?:です|だ|。|の)/i,
      
      // 多様な店舗形態対応
      /(?:今日は|今回は|本日は)?\s*(.+?(?:店|薬局|クリニック|病院|商会|商店|マート|ストア|ショップ|デパート|百貨店|スーパー|コンビニ|書店|本屋|美容室|理容室|カフェ|レストラン|居酒屋|料理店|焼肉店|寿司店|ラーメン店|パン屋|ケーキ店|花屋|クリーニング店|修理店|整備工場|ガソリンスタンド|銀行|郵便局|役所|市役所|区役所|図書館|体育館|プール|公園))\s*(?:に来|を視察|の視察|について|です|だ|。)/i,
      
      // 具体的店舗チェーン
      /(イオン\w*店?|アピタ\w*店?|ピアゴ\w*店?)/i,
      /(ドン・?キホーテ\w*店?|ドンキ\w*店?)/i,
      /(セブン-?イレブン\w*店?|セブン\w*店?)/i,
      /(ファミリーマート\w*店?|ファミマ\w*店?)/i,
      /(ローソン\w*店?)/i,
      /(コストコ\w*店?)/i,
      /(西友\w*店?|サニー\w*店?)/i,
      /(マックスバリュ\w*店?)/i,
      /(ヨーカドー\w*店?|イトーヨーカドー\w*店?)/i,
      /(ライフ\w*店?)/i,
      /(マルエツ\w*店?)/i,
      /(業務スーパー\w*店?)/i,
      /(ヤマダ電機\w*店?|ヤマダデンキ\w*店?)/i,
      /(ビックカメラ\w*店?|ビッグカメラ\w*店?)/i,
      /(ヨドバシカメラ\w*店?|ヨドバシ\w*店?)/i,
      /(ユニクロ\w*店?)/i,
      /(無印良品\w*店?|MUJI\w*店?)/i,
      /(ダイソー\w*店?)/i,
      /(ニトリ\w*店?)/i,
      /(スターバックス\w*店?|スタバ\w*店?)/i,
      /(マクドナルド\w*店?|マック\w*店?)/i,
      /(ケンタッキー\w*店?|KFC\w*店?)/i,
      
      // 地名 + 店舗
      /([あ-ん一-龯ァ-ヴｦ-ﾟ]+(?:駅|店|店舗|SC|モール|プラザ|ショッピングセンター|薬局|クリニック|病院|商会|商店|マート|ストア))/i,
      
      // 汎用パターン（より広範囲）
      /([あ-ん一-龯ァ-ヴｦ-ﾟ\w]{2,}(?:店|薬局|クリニック|病院|商会|商店|マート|ストア|ショップ|デパート|百貨店|スーパー|コンビニ|書店|本屋|美容室|理容室|カフェ|レストラン|居酒屋|料理店|焼肉店|寿司店|ラーメン店|パン屋|ケーキ店|花屋|クリーニング店|修理店|整備工場|ガソリンスタンド|銀行|郵便局))/i
    ];

    for (const pattern of storePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let storeName = match[1].trim();
        
        // 不要な文字を除去
        storeName = storeName
          .replace(/^(の|を|に|で|は|が|も)\s*/, '') // 助詞除去
          .replace(/\s*(です|だ|である|。|、)$/, '') // 語尾除去
          .trim();
        
        // 最小長チェック（2文字以上、50文字以下）
        if (storeName.length >= 2 && storeName.length <= 50) {
          console.log('店舗名マッチ:', storeName, 'パターン:', pattern);
          return storeName;
        }
      }
    }
    
    // キーワードベース抽出（拡張版）
    const storeKeywords = ['店', '店舗', 'モール', 'SC', 'ショッピングセンター', 'プラザ', '薬局', 'クリニック', '病院', '商会', '商店', 'マート', 'ストア', 'ショップ', 'デパート', '百貨店', 'スーパー', 'コンビニ', '書店', '本屋', '美容室', '理容室', 'カフェ', 'レストラン', '居酒屋'];
    
    for (const keyword of storeKeywords) {
      if (text.includes(keyword)) {
        // キーワード周辺の文字列を抽出
        const keywordIndex = text.indexOf(keyword);
        const start = Math.max(0, keywordIndex - 20);
        const end = Math.min(text.length, keywordIndex + keyword.length + 5);
        const surrounding = text.substring(start, end);
        
        // 店舗名らしき部分を抽出
        const storeMatch = surrounding.match(/([あ-ん一-龯ァ-ヴｦ-ﾟ\w]{2,20}(?:店|モール|SC|プラザ|薬局|クリニック|病院|商会|商店|マート|ストア|ショップ|デパート|百貨店|スーパー|コンビニ|書店|本屋|美容室|理容室|カフェ|レストラン|居酒屋))/);
        if (storeMatch) {
          console.log('キーワードベース抽出:', storeMatch[1]);
          return storeMatch[1];
        }
      }
    }
    
    console.log('店舗名抽出失敗');
    return null;
  };

  const startRecording = async () => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
          sampleSize: 16
        }
      };

      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('HTTPSが必要です。セキュアな接続でアクセスしてください。');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      let mimeType = 'audio/mp4';
      const mimeTypes = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/wav'
      ];
      
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 64000
      });
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        
        if (audioBlob.size > 5 * 1024 * 1024) {
          alert('録音ファイルが大きすぎます。短い音声で試してください。');
          return;
        }
        
        await processAudioWithBackend(audioBlob);
        setAudioChunks([]);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setAudioChunks(chunks);
      
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording();
        }
      }, 30000);
      
    } catch (error) {
      console.error('録音開始エラー:', error);
      
      let errorMessage = 'マイクアクセスに失敗しました。';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'マイクの許可が必要です。設定 > Safari > マイク で許可してください。';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'マイクが見つかりません。';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'このブラウザでは音声録音がサポートされていません。音声ファイルアップロード機能をお使いください。';
      }
      
      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const processAudioWithBackend = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('categories', JSON.stringify(categories));
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      console.log('=== バックエンドレスポンス受信 ===');
      console.log('transcript:', result.transcript);
      console.log('categorized_items:', result.categorized_items);
      console.log('categorized_items数:', result.categorized_items?.length || 0);
      
      if (result.transcript) {
        setTranscript(prev => prev + result.transcript + '\n\n');
        console.log('音声ログ更新完了');

        // 音声ファイルアップロード時も店舗名自動抽出
        if (!storeName) {
          const extractedStoreName = extractStoreName(result.transcript);
          if (extractedStoreName) {
            console.log('音声ファイルから店舗名を自動抽出:', extractedStoreName);
            setStoreName(extractedStoreName);
          }
        }

        // AI文脈理解による分類
        await performAIClassification(result.transcript, categories, setCategories);
      }
      
      if (result.categorized_items && Array.isArray(result.categorized_items) && result.categorized_items.length > 0) {
        console.log('カテゴリ分類データあり、処理開始');
        
        setCategories(prevCategories => {
          const updatedCategories = [...prevCategories];
          
          result.categorized_items.forEach((item, index) => {
            console.log(`アイテム ${index + 1}:`, item);
            
            const categoryIndex = updatedCategories.findIndex(
              cat => cat.name === item.category
            );
            
            if (categoryIndex !== -1) {
              const newItem = {
                text: item.text,
                confidence: item.confidence || 1.0,
                timestamp: new Date().toLocaleTimeString()
              };
              
              updatedCategories[categoryIndex].items.push(newItem);
              console.log(`カテゴリ「${item.category}」にアイテム追加:`, newItem);
            } else {
              console.log(`カテゴリ「${item.category}」が見つかりません`);
            }
          });
          
          console.log('更新後のカテゴリ:', updatedCategories.map(cat => ({
            name: cat.name, 
            itemCount: cat.items.length
          })));
          
          return updatedCategories;
        });
      } else {
        console.log('カテゴリ分類データなし');
        
        // フォールバック: フロントエンドでキーワードマッチング
        if (result.transcript) {
          console.log('フロントエンドでキーワードマッチング実行');
          
          const frontendKeywords = {
            '価格情報': ['円', '価格', '値段', '安い', '高い', '特売', 'セール', '割引'],
            '売り場情報': ['売り場', 'レイアウト', '陳列', '棚', '配置', '展示'],
            '客層・混雑度': ['客', 'お客', '混雑', '空い', '客層', '年齢', '家族'],
            '商品・品揃え': ['商品', '品揃え', '欠品', '在庫', '種類', '品目'],
            '店舗環境': ['店舗', '立地', '駐車場', '清潔', '照明', '音楽', '空調']
          };
          
          const matchedCategories = [];
          Object.entries(frontendKeywords).forEach(([categoryName, keywords]) => {
            const matches = keywords.filter(keyword => result.transcript.includes(keyword));
            if (matches.length > 0) {
              matchedCategories.push({
                category: categoryName,
                text: result.transcript,
                confidence: 0.5,
                matchedKeywords: matches
              });
            }
          });
          
          if (matchedCategories.length > 0) {
            console.log('フロントエンドマッチング結果:', matchedCategories);
            
            setCategories(prevCategories => {
              const updatedCategories = [...prevCategories];
              
              matchedCategories.forEach(item => {
                const categoryIndex = updatedCategories.findIndex(
                  cat => cat.name === item.category
                );
                
                if (categoryIndex !== -1) {
                  updatedCategories[categoryIndex].items.push({
                    text: `${item.text} [ファイルアップロード - キーワード: ${item.matchedKeywords.join(', ')}]`,
                    confidence: item.confidence,
                    timestamp: new Date().toLocaleTimeString()
                  });
                }
              });
              
              return updatedCategories;
            });
          }
        }
      }
      
    } catch (error) {
      console.error('音声処理エラー:', error);
      
      let userMessage = '音声処理中にエラーが発生しました。';
      
      if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        userMessage = 'ネットワークエラーです。インターネット接続を確認してください。';
      } else if (error.message.includes('413')) {
        userMessage = 'ファイルサイズが大きすぎます。短い音声で試してください。';
      } else if (error.message.includes('500')) {
        userMessage = 'サーバーエラーです。しばらく時間をおいて再試行してください。';
      }
      
      alert(userMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      await processAudioWithBackend(file);
      event.target.value = '';
    }
  };

  const clearData = () => {
    setTranscript('');
    setCategories(categories.map(cat => ({ ...cat, items: [] })));
    setInsights('');
    setQaPairs([]);
    setQuestionInput('');
    setTextInput('');
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
        transcript: transcript
      };

      console.log('インサイト生成データ:', insightData);

      const response = await fetch('https://store-visit-7cux.onrender.com/api/generate-insights', {
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
        transcript: transcript
      };

      const response = await fetch('https://store-visit-7cux.onrender.com/api/ask-question', {
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

  const processTextInput = async () => {
    if (!textInput.trim()) return;
    
    setIsProcessing(true);
    
    try {
      setTranscript(prev => prev + textInput + '\n\n');
      
      // AI分類を実行
      await performAIClassification(textInput, categories, setCategories);
      
      setTextInput('');
      alert('テキストが正常に処理されました！');
      
    } catch (error) {
      console.error('テキスト処理エラー:', error);
      alert('テキスト処理中にエラーが発生しました: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToExcel = () => {
    try {
      // より互換性の高いCSV形式での出力に変更
      let csvContent = '\uFEFF'; // BOM（UTF-8識別用）
      
      // ヘッダー
      csvContent += '店舗視察レポート\n';
      csvContent += `店舗名,${storeName || '未設定'}\n`;
      csvContent += `作成日時,${new Date().toLocaleString('ja-JP')}\n`;
      csvContent += '\n';

      // カテゴリ別データ
      categories.forEach(category => {
        if (category.items.length > 0) {
          csvContent += `${category.name}\n`;
          csvContent += 'コメント,信頼度,記録時刻\n';
          
          category.items.forEach(item => {
            // CSV用にデータをエスケープ
            const escapedText = `"${item.text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
            const confidence = `${Math.round(item.confidence * 100)}%`;
            const timestamp = item.timestamp;
            
            csvContent += `${escapedText},${confidence},${timestamp}\n`;
          });
          csvContent += '\n';
        }
      });

      // 音声ログ
      if (transcript.trim()) {
        csvContent += '音声ログ\n';
        const escapedTranscript = `"${transcript.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csvContent += `${escapedTranscript}\n`;
        csvContent += '\n';
      }

      // AI分析結果
      if (insights.trim()) {
        csvContent += 'AI分析結果\n';
        const escapedInsights = `"${insights.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csvContent += `${escapedInsights}\n`;
      }

      // 質問応答履歴
      if (qaPairs.length > 0) {
        csvContent += '\n質問応答履歴\n';
        csvContent += '質問,回答,記録時刻\n';
        
        qaPairs.forEach(qa => {
          const escapedQuestion = `"${qa.question.replace(/"/g, '""')}"`;
          const escapedAnswer = `"${qa.answer.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          csvContent += `${escapedQuestion},${escapedAnswer},${qa.timestamp}\n`;
        });
      }

      // Excel互換のCSVファイルとしてダウンロード
      const blob = new Blob([csvContent], { 
        type: 'text/csv;charset=utf-8' 
      });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      // ファイル名を.csvに変更（Excelで正しく開ける）
      const fileName = `店舗視察_${storeName || '未設定'}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // メモリ解放
      URL.revokeObjectURL(url);

      console.log('CSVエクスポート完了:', fileName);
      alert('CSVファイルをエクスポートしました！Excelで開くことができます。');

    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert('エクスポート中にエラーが発生しました');
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
            音声録音で効率的な店舗視察を実現。AIが自動で音声を認識・分類し、ビジネスインサイトを生成します。
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

        {/* コントロールボタン */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* 音声ファイルアップロード */}
          <label className="flex items-center justify-center gap-2 px-4 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md min-h-[52px]">
            <Upload size={20} />
            <span className="text-sm font-medium">音声ファイル</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isProcessing || isWebSpeechRecording}
            />
          </label>
          
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
            className="flex items-center justify-center gap-2 px-4 py-4 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all duration-200 shadow-sm hover:shadow-md min-h-[52px] disabled:opacity-50 col-span-2"
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
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                  : 'bg-gray-500 hover:bg-gray-600 hover:scale-110'
              } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''} text-white`}
            >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
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
                      <div key={itemIndex} className="bg-gray-50 rounded-lg p-3 border-l-4 border-blue-400">
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
        {(categories.some(cat => cat.items.length > 0) || transcript) && (
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
        {(categories.some(cat => cat.items.length > 0) || transcript) && (
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