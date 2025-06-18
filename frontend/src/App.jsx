// App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Play, Pause, Trash2, Plus, Settings, FileText, Upload, Download, Brain, MessageCircle, Lightbulb, TrendingUp } from 'lucide-react';
import * as XLSX from 'xlsx';

const StoreInspectionApp = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [inspectionData, setInspectionData] = useState({});
  const [categories, setCategories] = useState([
    {
      name: '価格情報',
      description: '商品の価格、特売情報、価格比較に関する情報',
      items: []
    },
    {
      name: '売り場情報',
      description: '売り場のレイアウト、面積、陳列方法に関する情報',
      items: []
    },
    {
      name: '客層・混雑度',
      description: '来店客の年齢層、混雑状況、客動線に関する情報',
      items: []
    },
    {
      name: '商品構成',
      description: '品揃え、欠品状況、プライベートブランドに関する情報',
      items: []
    },
    {
      name: '店舗環境',
      description: '立地、アクセス、店舗設備、清潔感に関する情報',
      items: []
    }
  ]);
  const [storeName, setStoreName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [apiEndpoint, setApiEndpoint] = useState('/api/transcribe');
  const [aiInsights, setAiInsights] = useState('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [qaPairs, setQaPairs] = useState([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [showAiFeatures, setShowAiFeatures] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      // モバイル対応のオーディオ制約
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // モバイル用の追加設定
          channelCount: 1,
          sampleRate: 44100
        }
      };

      // HTTPS確認
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        throw new Error('HTTPSが必要です。セキュアな接続でアクセスしてください。');
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // モバイル対応のMIMEタイプ検出
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/wav';
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
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
        await processAudioWithBackend(audioBlob);
        setAudioChunks([]);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setAudioChunks(chunks);
    } catch (error) {
      console.error('録音開始エラー:', error);
      
      // より詳細なエラーメッセージ
      let errorMessage = 'マイクアクセスに失敗しました。';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'マイクの許可が必要です。ブラウザの設定でマイクアクセスを許可してください。';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'マイクが見つかりません。デバイスにマイクが接続されているか確認してください。';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'このブラウザでは音声録音がサポートされていません。';
      } else if (error.message.includes('HTTPS')) {
        errorMessage = 'HTTPSが必要です。セキュアな接続でアクセスしてください。';
      }
      
      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  };

  const processAudioWithBackend = async (audioBlob) => {
    setIsProcessing(true);
    
    try {
      console.log('音声ファイル情報:', {
        size: audioBlob.size,
        type: audioBlob.type
      });

      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('categories', JSON.stringify(categories));
      
      console.log('APIエンドポイント:', apiEndpoint);
      console.log('送信するカテゴリ数:', categories.length);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData
      });

      console.log('レスポンスステータス:', response.status);
      console.log('レスポンスヘッダー:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('APIエラーレスポンス:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('API成功レスポンス:', result);
      
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
      console.error('音声処理エラー（詳細）:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // より詳細なエラーメッセージを表示
      let userMessage = '音声処理中にエラーが発生しました。';
      
      if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        userMessage = 'ネットワークエラーです。インターネット接続を確認してください。';
      } else if (error.message.includes('413')) {
        userMessage = 'ファイルサイズが大きすぎます。短い音声で試してください。';
      } else if (error.message.includes('400')) {
        userMessage = '音声ファイルの形式に問題があります。';
      } else if (error.message.includes('500')) {
        userMessage = 'サーバーエラーです。しばらく時間をおいて再試行してください。';
      } else {
        userMessage = `エラー詳細: ${error.message}`;
      }
      
      alert(userMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      await processAudioWithBackend(file);
    } else {
      alert('音声ファイルを選択してください。');
    }
  };

  const clearData = () => {
    setTranscript('');
    setCategories(prevCategories => 
      prevCategories.map(cat => ({ ...cat, items: [] }))
    );
    setAiInsights('');
    setQaPairs([]);
  };

  const addCategory = () => {
    if (newCategory.name && newCategory.description) {
      setCategories(prev => [...prev, {
        name: newCategory.name,
        description: newCategory.description,
        items: []
      }]);
      setNewCategory({ name: '', description: '' });
    }
  };

  const removeCategory = (index) => {
    setCategories(prev => prev.filter((_, i) => i !== index));
  };

  const generateReport = () => {
    let report = `# 店舗視察レポート\n\n`;
    report += `**店舗名:** ${storeName || '未設定'}\n`;
    report += `**視察日時:** ${new Date().toLocaleString()}\n\n`;
    
    categories.forEach(category => {
      if (category.items.length > 0) {
        report += `## ${category.name}\n\n`;
        category.items.forEach(item => {
          const confidence = item.confidence ? ` (信頼度: ${Math.round(item.confidence * 100)}%)` : '';
          report += `- **${item.timestamp}:** ${item.text}${confidence}\n`;
        });
        report += '\n';
      }
    });
    
    if (aiInsights) {
      report += `## AI分析結果\n\n${aiInsights}\n\n`;
    }
    
    if (qaPairs.length > 0) {
      report += `## Q&A履歴\n\n`;
      qaPairs.forEach(qa => {
        report += `**Q:** ${qa.question}\n`;
        report += `**A:** ${qa.answer}\n\n`;
      });
    }
    
    report += `## 音声ログ全文\n\n${transcript}`;
    
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `店舗視察_${storeName || '未設定'}_${new Date().getTime()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateExcelReport = () => {
    const workbook = XLSX.utils.book_new();
    
    // サマリーシート
    const summaryData = [
      ['店舗視察レポート'],
      [''],
      ['店舗名', storeName || '未設定'],
      ['視察日時', new Date().toLocaleString()],
      [''],
      ['カテゴリ別データ数'],
      ...categories.map(cat => [cat.name, cat.items.length])
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'サマリー');
    
    // カテゴリ別シート
    categories.forEach(category => {
      if (category.items.length > 0) {
        const categoryData = [
          [category.name],
          [''],
          ['時刻', '内容', '信頼度'],
          ...category.items.map(item => [
            item.timestamp,
            item.text,
            item.confidence ? `${Math.round(item.confidence * 100)}%` : '-'
          ])
        ];
        
        const categorySheet = XLSX.utils.aoa_to_sheet(categoryData);
        categorySheet['!cols'] = [
          { width: 12 },
          { width: 60 },
          { width: 10 }
        ];
        
        XLSX.utils.book_append_sheet(workbook, categorySheet, category.name);
      }
    });
    
    // AI分析シート
    if (aiInsights || qaPairs.length > 0) {
      const aiData = [
        ['AI分析結果'],
        [''],
        ['自動インサイト'],
        [aiInsights || 'なし'],
        [''],
        ['Q&A履歴'],
        ['質問', '回答', '時刻'],
        ...qaPairs.map(qa => [qa.question, qa.answer, qa.timestamp])
      ];
      
      const aiSheet = XLSX.utils.aoa_to_sheet(aiData);
      aiSheet['!cols'] = [{ width: 30 }, { width: 60 }, { width: 12 }];
      XLSX.utils.book_append_sheet(workbook, aiSheet, 'AI分析');
    }
    
    // 音声ログシート
    const logData = [
      ['音声ログ全文'],
      [''],
      ...transcript.split('\n').map(line => [line])
    ];
    
    const logSheet = XLSX.utils.aoa_to_sheet(logData);
    logSheet['!cols'] = [{ width: 100 }];
    XLSX.utils.book_append_sheet(workbook, logSheet, '音声ログ');
    
    const fileName = `店舗視察_${storeName || '未設定'}_${new Date().getTime()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const generateAIInsights = async () => {
    setIsGeneratingInsights(true);
    
    try {
      const analysisData = {
        storeName: storeName || '未設定',
        categories: categories.filter(cat => cat.items.length > 0).map(cat => ({
          name: cat.name,
          items: cat.items.map(item => item.text)
        })),
        transcript: transcript
      };

      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysisData)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      setAiInsights(result.insights);
      
    } catch (error) {
      console.error('インサイト生成エラー:', error);
      alert(`インサイト生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsGeneratingInsights(false);
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

      const response = await fetch('/api/ask-question', {
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

  return (
    <div className="max-w-6xl mx-auto p-6 bg-gradient-to-br from-slate-900 to-gray-900 min-h-screen">
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-8 mb-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">店舗視察AI</h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAiFeatures(!showAiFeatures)}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 text-white rounded-xl hover:from-cyan-700 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Brain size={20} />
              AI分析
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-5 py-3 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 hover:text-white transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Settings size={20} />
              設定
            </button>
            <button
              onClick={generateReport}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <FileText size={20} />
              レポート出力
            </button>
            <button
              onClick={generateExcelReport}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Download size={20} />
              Excel出力
            </button>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-300 mb-3">店舗名</label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="視察店舗名を入力"
            className="w-full px-4 py-3 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-700/50 backdrop-blur-sm text-gray-100 placeholder-gray-400"
          />
        </div>

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
            onClick={clearData}
            disabled={isProcessing}
            className="flex items-center gap-3 px-6 py-4 bg-slate-700 text-gray-300 rounded-xl hover:bg-slate-600 hover:text-white transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-105"
          >
            <Trash2 size={20} />
            データクリア
          </button>
        </div>

        {isRecording && (
          <div className="mb-8 p-5 bg-gradient-to-r from-red-900/30 to-pink-900/30 border border-red-700/50 rounded-xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg"></div>
              <span className="font-medium">録音中...</span>
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="mb-8 p-5 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 border border-cyan-700/50 rounded-xl">
            <div className="flex items-center gap-3 text-cyan-400">
              <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="font-medium">Gemini 1.5 Flashで音声を解析中...</span>
            </div>
          </div>
        )}
      </div>

      {showAiFeatures && (
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-100 mb-6 flex items-center gap-3">
            <Brain className="text-cyan-400" size={28} />
            AI分析機能
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* AI インサイト生成 */}
            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Lightbulb className="text-yellow-400" size={20} />
                自動インサイト生成
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                収集したデータからAIが自動で改善提案や競合分析を生成します
              </p>
              <button
                onClick={generateAIInsights}
                disabled={isGeneratingInsights || categories.every(cat => cat.items.length === 0)}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isGeneratingInsights ? '分析中...' : 'インサイトを生成'}
              </button>
              
              {aiInsights && (
                <div className="mt-4 p-4 bg-slate-800/70 rounded-lg border border-slate-600">
                  <h4 className="font-medium text-gray-200 mb-2">AI分析結果:</h4>
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{aiInsights}</p>
                </div>
              )}
            </div>

            {/* AI Q&A */}
            <div className="bg-slate-700/50 rounded-xl p-6 border border-slate-600">
              <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <MessageCircle className="text-green-400" size={20} />
                データ質問応答
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                視察データについて自然言語で質問してAIが回答します
              </p>
              
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="例: この店舗の強みは何ですか？"
                  className="flex-1 px-3 py-2 bg-slate-800/70 border border-slate-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
                />
                <button
                  onClick={askQuestion}
                  disabled={isAnswering || !questionInput.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 transition-all duration-200"
                >
                  {isAnswering ? '...' : '質問'}
                </button>
              </div>
              
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {qaPairs.map((qa, index) => (
                  <div key={index} className="p-3 bg-slate-800/70 rounded-lg border border-slate-600">
                    <div className="text-cyan-400 font-medium text-sm mb-1">Q: {qa.question}</div>
                    <div className="text-gray-300 text-sm">{qa.answer}</div>
                    <div className="text-gray-500 text-xs mt-1">{qa.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-100 mb-6">設定</h2>
          
          <div className="mb-8 p-6 bg-slate-700/50 rounded-xl border border-slate-600">
            <h3 className="font-semibold text-gray-200 mb-4">APIエンドポイント</h3>
            <input
              type="text"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="/api/transcribe"
              className="w-full px-4 py-3 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100"
            />
            <p className="text-sm text-gray-400 mt-2">
              Renderの環境変数でGEMINI_API_KEYを設定してください
            </p>
          </div>
          
          <div className="mb-8 p-6 bg-slate-700/50 rounded-xl border border-slate-600">
            <h3 className="font-semibold text-gray-200 mb-4">新しいカテゴリを追加</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                placeholder="カテゴリ名"
                className="w-full px-4 py-3 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100"
              />
              <input
                type="text"
                value={newCategory.description}
                onChange={(e) => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
                placeholder="カテゴリの説明"
                className="w-full px-4 py-3 border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-800/70 text-gray-100"
              />
              <button
                onClick={addCategory}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl hover:from-cyan-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <Plus size={16} />
                追加
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-200">現在のカテゴリ</h3>
            {categories.map((category, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-slate-700/50 rounded-xl border border-slate-600 shadow-sm hover:bg-slate-700/70 transition-all duration-200">
                <div>
                  <span className="font-semibold text-gray-100">{category.name}</span>
                  <div className="text-sm text-gray-400 mt-1">
                    {category.description}
                  </div>
                </div>
                <button
                  onClick={() => removeCategory(index)}
                  className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors duration-200"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-6">
          <h2 className="text-2xl font-bold text-gray-100 mb-6">音声ログ</h2>
          <div className="bg-slate-900/60 p-6 rounded-xl h-64 overflow-y-auto border border-slate-700">
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
              {transcript || '音声認識を開始するか、音声ファイルをアップロードしてください...'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {categories.map((category, index) => (
            <div key={index} className="bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-6">
              <h3 className="text-xl font-bold text-gray-100 mb-4 flex items-center justify-between">
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  {category.name}
                </span>
                <span className="text-sm font-normal bg-slate-700 text-gray-300 px-3 py-1 rounded-full">
                  {category.items.length}件
                </span>
              </h3>
              <div className="space-y-3 max-h-32 overflow-y-auto">
                {category.items.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">データなし</p>
                ) : (
                  category.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="p-4 bg-slate-900/40 rounded-xl text-sm border border-slate-700 hover:bg-slate-900/60 transition-all duration-200">
                      <div className="flex justify-between items-start">
                        <span className="text-gray-300 leading-relaxed flex-1">{item.text}</span>
                        <div className="text-xs text-gray-500 ml-4 text-right flex-shrink-0">
                          <div className="font-medium">{item.timestamp}</div>
                          {item.confidence && (
                            <div className="text-cyan-400 font-semibold mt-1">
                              {Math.round(item.confidence * 100)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StoreInspectionApp;