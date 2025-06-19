// Service Worker を完全に無効化
self.addEventListener('install', (event) => {
    console.log('Service Worker: 無効化');
    self.skipWaiting();
  });
  
  self.addEventListener('activate', (event) => {
    console.log('Service Worker: 無効化');
    event.waitUntil(self.clients.claim());
  });
  
  // fetchイベントを処理しない（CORSエラーの原因を除去）