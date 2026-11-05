// 成長シミュレーター：オフライン対応
// 開くたびに最新版を取りに行く。ただし 4 秒たっても取れなければ、保存してある版でそのまま起動する。
const CACHE='growth-sim-v1.7.0';
const WAIT_MS=4000;
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
const tell=async(type)=>{try{const cs=await self.clients.matchAll({includeUncontrolled:true,type:'window'});cs.forEach(c=>c.postMessage({type}))}catch(e){}};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const stash=(req,r)=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{})}return r};
const fromCache=(req)=>caches.match(req,{ignoreSearch:true}).then(h=>h||caches.match('./index.html')).then(h=>h||caches.match('./'));
// ネット優先(時間制限つき): 取れればそれを使い、遅い・つながらないときは保存分で起動する
function netFirst(e,req){
  const net=fetch(req).then(r=>stash(req,r));
  const wait=new Promise(res=>setTimeout(()=>res('timeout'),WAIT_MS));
  const job=Promise.race([net.then(r=>r,()=>'fail'),wait]).then(async r=>{
    if(r&&r!=='timeout'&&r!=='fail')return r;
    const hit=await fromCache(req);
    if(!hit)return net;            // 保存分がまだ無い(初回)ときは、取れるまで待つ
    e.waitUntil(new Promise(done=>setTimeout(()=>{tell('offline');done()},1500)));
    if(r==='timeout')net.then(()=>tell('updated'),()=>{});   // 遅れて取れたら、次回から最新版
    return hit;
  });
  e.waitUntil(net.catch(()=>{}));
  return job;
}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  const font=/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if(url.origin!==location.origin&&!font)return;
  if(req.mode==='navigate'||url.pathname.endsWith('.html')){e.respondWith(netFirst(e,req));return}
  if(url.hostname==='fonts.googleapis.com'){
    // フォントの定義: 保存分優先。無ければ 3 秒だけ待ち、だめなら空で返す(ゲームの表示を止めない)
    e.respondWith(caches.match(req).then(hit=>hit||Promise.race([fetch(req).then(r=>stash(req,r)),new Promise(res=>setTimeout(()=>res(new Response('',{headers:{'Content-Type':'text/css'}})),3000))]).catch(()=>new Response('',{headers:{'Content-Type':'text/css'}}))));return}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>stash(req,r))));
});
