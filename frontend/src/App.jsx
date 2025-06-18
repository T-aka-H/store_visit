import React, { useState, useRef } from 'react';
import { Mic, MicOff, Upload, Trash2, MessageCircle, Brain, HelpCircle, Download } from 'lucide-react';

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
  const [textInput, setTextInput] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const apiEndpoint = 'https://store-visit-7cux.onrender.com/api/transcribe';

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
      
      if (result.transcript) {
        setTranscript(prev => prev + result.transcript + '\n\n');
      }
      
      if (result.categorized_items) {
        setCategories(prevCategories => {
          const updatedCategories = [...prevCategories];
          
          result.categorized_items.forEach(item => {
            const categoryIndex = updatedCategories.findIndex(
              cat => cat.name === item.category
            );
            
            if (categoryIndex !== -1) {
              updatedCategories[categoryIndex].items.push({
                text: item.text,
                confidence: item.confidence || 1.0,
                timestamp: new Date().toLocaleTimeString()
              });
            }
          });
          
          return updatedCategories;
        });
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
      
      const newItems = [];
      categories.forEach(category => {
        const keywords = category.name.includes('価格') ? ['円', '価格', '値段', '安い', '高い'] :
                        category.name.includes('売り場') ? ['売り場', 'レイアウト', '陳列', '棚'] :
                        category.name.includes('客層') ? ['客', 'お客', '混雑', '空い'] :
                        category.name.includes('商品') ? ['商品', '品揃え', '欠品'] :
                        category.name.includes('店舗') ? ['店舗', '立地', '駐車場', '清潔'] : [];
        
        keywords.forEach(keyword => {
          if (textInput.includes(keyword)) {
            newItems.push({
              category: category.name,
              text: textInput,
              confidence: 0.8
            });
          }
        });
      });
      
      if (newItems.length > 0) {
        setCategories(prevCategories => {
          const updatedCategories = [...prevCategories];
          
          newItems.forEach(item => {
            const categoryIndex = updatedCategories.findIndex(
              cat => cat.name === item.category
            );
            
            if (categoryIndex !== -1) {
              updatedCategories[categoryIndex].items.push({
                text: item.text,
                confidence: item.confidence,
                timestamp: new Date().toLocaleTimeString()
              });
            }
          });
          
          return updatedCategories;
        });
      }
      
      setTextInput('');
      alert('テキストが正常に処理されました！');
      
    } catch (error) {
      console.error('テキスト処理エラー:', error);
      alert('テキスト処理中にエラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportToExcel = () => {
    try {
      // Excel形式のHTMLテーブルを作成
      let excelContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>店舗視察レポート</x:Name>
                  <x:WorksheetSource HRef="sheet.html"/>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .header { background-color: #4472C4; color: white; font-size: 16px; font-weight: bold; }
            .category { background-color: #D9E1F2; font-weight: bold; }
          </style>
        </head>
        <body>
          <table>
            <tr><td class="header" colspan="3">🏪 店舗視察レポート</td></tr>
            <tr><td><strong>店舗名</strong></td><td colspan="2">${storeName || '未設定'}</td></tr>
            <tr><td><strong>作成日時</strong></td><td colspan="2">${new Date().toLocaleString('ja-JP')}</td></tr>
            <tr><td colspan="3"></td></tr>
      `;

      // カテゴリ別データ
      categories.forEach(category => {
        if (category.items.length > 0) {
          excelContent += `
            <tr><td class="category" colspan="3">${category.name}</td></tr>
            <tr><th>コメント</th><th>信頼度</th><th>記録時刻</th></tr>
          `;
          category.items.forEach(item => {
            const text = item.text.replace(/"/g, '""').replace(/\n/g, ' ');
            const confidence = Math.round(item.confidence * 100);
            excelContent += `
              <tr>
                <td>${text}</td>
                <td>${confidence}%</td>
                <td>${item.timestamp}</td>
              </tr>
            `;
          });
          excelContent += `<tr><td colspan="3"></td></tr>`;
        }
      });

      // 音声ログ
      if (transcript.trim()) {
        excelContent += `
          <tr><td class="category" colspan="3">🎤 音声ログ</td></tr>
          <tr><td colspan="3">${transcript.replace(/\n/g, '<br>')}</td></tr>
          <tr><td colspan="3"></td></tr>
        `;
      }

      // AI分析結果
      if (insights.trim()) {
        excelContent += `
          <tr><td class="category" colspan="3">🧠 AI分析結果</td></tr>
          <tr><td colspan="3">${insights.replace(/\n/g, '<br>')}</td></tr>
        `;
      }

      excelContent += `
          </table>
        </body>
        </html>
      `;

      // Excel用のBlobを作成
      const blob = new Blob([excelContent], { 
        type: 'application/vnd.ms-excel;charset=utf-8' 
      });
      
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const fileName = `店舗視察_${storeName || '未設定'}_${new Date().toISOString().slice(0, 10)}.xls`;
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('Excelエクスポート完了:', fileName);
      alert('Excelファイルをエクスポートしました！');

    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert('エクスポート中にエラーが発生しました');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 text-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent mb-4">
            🏪 AI店舗視察アシスタント
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
            音声録音で効率的な店舗視察を実現。AIが自動で音声を認識・分類し、ビジネスインサイトを生成します。
          </p>
        </div>

        {/* 店舗名入力 */}
        <div className="mb-8">
          <label className="block text-lg font-semibold text-gray-200 mb-3">
            📍 視察店舗名
          </label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="例: イオン〇〇店、ドン・キホーテ〇〇店"
            className="w-full px-6 py-4 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100 placeholder-gray-400 text-lg"
          />
        </div>

        {/* コントロールボタン */}
        <div className="flex flex-wrap gap-4 mb-8">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl ${
              isRecording 
                ? 'bg-gradient-to-r from-red-600 to-pink-600 text-white hover:from-red-700 hover:to-pink-700' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
          >
            {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
            {isRecording ? '録音停止' : '録音開始'}
          </button>
          
          <label className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl hover:scale-105">
            <Upload size={20} />
            音声ファイル
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isProcessing}
            />
          </label>
          
          <button
            onClick={() => setShowTextInput(!showTextInput)}
            className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-yellow-600 to-orange-600 text-white rounded-xl hover:from-yellow-700 hover:to-orange-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <MessageCircle size={20} />
            テキスト入力
          </button>
          
          <button
            onClick={clearData}
            disabled={isProcessing}
            className="flex items-center gap-3 px-6 py-4 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 hover:text-white transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Trash2 size={20} />
            データクリア
          </button>

          <button
            onClick={exportToExcel}
            disabled={categories.every(cat => cat.items.length === 0) && !transcript.trim()}
            className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Download size={20} />
            Excel出力
          </button>
        </div>

        {/* テキスト入力モード */}
        {showTextInput && (
          <div className="mb-8 p-6 bg-slate-700/50 rounded-xl border border-slate-600">
            <h3 className="text-lg font-semibold text-gray-200 mb-4">テキスト入力モード</h3>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="視察内容をテキストで入力してください..."
              className="w-full h-32 px-4 py-3 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100 placeholder-gray-400 resize-none"
            />
            <button
              onClick={processTextInput}
              disabled={!textInput.trim() || isProcessing}
              className="mt-4 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 transition-all duration-200"
            >
              {isProcessing ? '処理中...' : 'テキストを分析'}
            </button>
          </div>
        )}

        {/* 処理状況表示 */}
        {(isRecording || isProcessing) && (
          <div className="mb-8 p-6 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-blue-500/30">
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400"></div>
              <span className="text-cyan-300 font-medium">
                {isRecording ? '🎤 録音中... 録音停止ボタンを押して終了してください' : '🔄 音声を処理中... しばらくお待ちください'}
              </span>
            </div>
          </div>
        )}

        {/* カテゴリ別結果表示 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {categories.map((category, index) => (
            <div key={index} className="bg-slate-800/60 rounded-xl p-6 border border-slate-600 hover:border-slate-500 transition-all duration-200">
              <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <span className="text-2xl">
                  {category.name.includes('価格') ? '💰' : 
                   category.name.includes('売り場') ? '🏬' : 
                   category.name.includes('客層') ? '👥' : 
                   category.name.includes('商品') ? '📦' : '🏪'}
                </span>
                {category.name}
              </h3>
              <div className="space-y-3">
                {category.items.length > 0 ? (
                  category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="bg-slate-900/50 rounded-lg p-4 border-l-4 border-cyan-500">
                      <p className="text-gray-200 leading-relaxed">{item.text}</p>
                      <div className="mt-2 flex justify-between items-center text-xs text-gray-400">
                        <span>信頼度: {Math.round(item.confidence * 100)}%</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 italic text-center py-8">まだデータがありません</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 音声ログ */}
        {transcript && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-200 mb-6 flex items-center gap-3">
              🎤 音声ログ
            </h2>
            <div className="bg-slate-800/60 rounded-xl p-6 border border-slate-600">
              <div className="whitespace-pre-wrap text-gray-200 leading-relaxed max-h-64 overflow-y-auto">
                {transcript}
              </div>
            </div>
          </div>
        )}

        {/* AI機能セクション */}
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl p-8 border border-purple-500/30 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-transparent bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text">
              🧠 AI分析機能
            </h2>
            <button
              onClick={() => setShowAiFeatures(!showAiFeatures)}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {showAiFeatures ? '非表示' : '表示'}
            </button>
          </div>

          {showAiFeatures && (
            <div className="space-y-8">
              {/* インサイト生成 */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={generateInsights}
                    disabled={isProcessing}
                    className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    <Brain size={24} />
                    {isProcessing ? 'AI分析中...' : 'ビジネスインサイト生成'}
                  </button>
                </div>

                {insights && (
                  <div className="bg-slate-800/60 rounded-xl p-6 border border-emerald-500/30">
                    <h3 className="text-xl font-bold text-emerald-400 mb-4">📊 AI分析結果</h3>
                    <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
                      {insights}
                    </div>
                  </div>
                )}
              </div>

              {/* 質問応答 */}
              <div>
                <h3 className="text-xl font-bold text-cyan-400 mb-4">💬 データに関する質問</h3>
                <div className="flex gap-4 mb-4">
                  <input
                    type="text"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
                    placeholder="例: この店舗の強みは何ですか？改善点は？"
                    className="flex-1 px-6 py-4 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100 placeholder-gray-400"
                  />
                  <button
                    onClick={askQuestion}
                    disabled={!questionInput.trim() || isAnswering}
                    className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    {isAnswering ? '回答中...' : '質問する'}
                  </button>
                </div>

                {/* 質問応答履歴 */}
                {qaPairs.length > 0 && (
                  <div className="space-y-4">
                    {qaPairs.map((qa, index) => (
                      <div key={index} className="bg-slate-800/60 rounded-xl p-6 border border-slate-600">
                        <div className="mb-4">
                          <div className="flex items-start gap-3 mb-2">
                            <span className="text-cyan-400 font-semibold">❓ 質問:</span>
                            <span className="text-gray-200">{qa.question}</span>
                          </div>
                          <div className="text-xs text-gray-400">{qa.timestamp}</div>
                        </div>
                        <div className="border-l-4 border-emerald-500 pl-4">
                          <div className="flex items-start gap-3 mb-2">
                            <span className="text-emerald-400 font-semibold">💡 回答:</span>
                          </div>
                          <div className="text-gray-200 leading-relaxed whitespace-pre-wrap">
                            {qa.answer}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="text-center text-gray-400 pt-8 border-t border-slate-700">
          <p>🚀 Powered by Gemini AI • 効率的な店舗視察をサポート</p>
        </div>
      </div>
    </div>
  );
}

export default App;