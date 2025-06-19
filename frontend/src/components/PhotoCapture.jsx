import React, { useState } from 'react';
import { Camera, Download, Eye, X, MapPin } from 'react-feather';
import JSZip from 'jszip';

// ファイルサイズのフォーマット関数
const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

const PhotoCapture = ({ 
  onPhotoAdded, 
  categories, 
  setCategories, 
  isProcessing, 
  storeName,
  photos,
  setPhotos
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

  // downloadPhoto関数
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
        <div className="flex gap-2">
          {photos.length > 0 && (
            <button
              onClick={downloadAllPhotos}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 shadow-sm transition-all duration-200 text-sm font-medium active:bg-green-600"
              title={`${photos.length}枚の写真をZIPでダウンロード`}
            >
              <Download size={16} />
              <span>全保存</span>
            </button>
          )}
        </div>
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

export default PhotoCapture; 