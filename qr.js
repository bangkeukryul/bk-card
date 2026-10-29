/*! BK QR — 프로그램마다 'QR 보여주기' (BK톡톡 · BK쇼츠 · BK영상 공용)
 * 인터넷 없이도 휴대폰 안에서 QR을 직접 만들어요. 찍으면 지금 보고 있는 프로그램 화면이 바로 열려요.
 * 이 파일 하나만 고치면 모든 화면의 QR 버튼이 함께 바뀌어요.
 */
(function(){
'use strict';

/* ═════════ QR 만들기 (바이트 모드 · 오류 보정 M · 1~40형) ═════════ */
var ECC_M=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
var BLK_M=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
function rawModules(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
function dataCodewords(v){return Math.floor(rawModules(v)/8)-ECC_M[v]*BLK_M[v]}
function gfMul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&255}
function rsDivisor(deg){var r=[];for(var i=0;i<deg-1;i++)r.push(0);r.push(1);var root=1;
 for(var i=0;i<deg;i++){for(var j=0;j<r.length;j++){r[j]=gfMul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=gfMul(root,2)}return r}
function rsRemainder(data,div){var r=div.map(function(){return 0});
 data.forEach(function(b){var f=b^r.shift();r.push(0);div.forEach(function(c,i){r[i]^=gfMul(c,f)})});return r}
function alignPos(v,size){if(v===1)return [];var n=Math.floor(v/7)+2,step=v===32?26:Math.ceil((v*4+4)/(n*2-2))*2,r=[6];
 for(var p=size-7;r.length<n;p-=step)r.splice(1,0,p);return r}

function encode(text){
 var bytes=Array.prototype.slice.call(new TextEncoder().encode(text)),v,cap;
 for(v=1;v<=40;v++){cap=dataCodewords(v)*8;if(4+(v<10?8:16)+bytes.length*8<=cap)break}
 if(v>40)throw new Error('주소가 너무 길어요');
 /* 데이터 비트 */
 var bits=[];function put(val,len){for(var i=len-1;i>=0;i--)bits.push((val>>>i)&1)}
 put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(function(b){put(b,8)});
 put(0,Math.min(4,cap-bits.length));put(0,(8-bits.length%8)%8);
 for(var pad=0xEC;bits.length<cap;pad^=0xEC^0x11)put(pad,8);
 var data=[];for(var i=0;i<bits.length;i+=8){var b=0;for(var j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b)}
 /* 오류 보정 + 섞기 */
 var nb=BLK_M[v],el=ECC_M[v],raw=Math.floor(rawModules(v)/8),nShort=nb-raw%nb,sLen=Math.floor(raw/nb),div=rsDivisor(el),blocks=[],k=0;
 for(var i=0;i<nb;i++){var d=data.slice(k,k+sLen-el+(i<nShort?0:1));k+=d.length;var e=rsRemainder(d,div);if(i<nShort)d.push(0);blocks.push(d.concat(e))}
 var cw=[];for(var i=0;i<blocks[0].length;i++)for(var j=0;j<nb;j++)if(i!==sLen-el||j>=nShort)cw.push(blocks[j][i]);
 /* 판 그리기 */
 var size=v*4+17,M=[],F=[];for(var y=0;y<size;y++){M.push(new Array(size).fill(false));F.push(new Array(size).fill(false))}
 function fn(x,y,dark){M[y][x]=dark;F[y][x]=true}
 for(var i=0;i<size;i++){fn(6,i,i%2===0);fn(i,6,i%2===0)}
 [[3,3],[size-4,3],[3,size-4]].forEach(function(c){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var x=c[0]+dx,y=c[1]+dy,dist=Math.max(Math.abs(dx),Math.abs(dy));
  if(x>=0&&x<size&&y>=0&&y<size)fn(x,y,dist!==2&&dist!==4)}});
 var ap=alignPos(v,size);ap.forEach(function(a,i){ap.forEach(function(b,j){if((i===0&&j===0)||(i===0&&j===ap.length-1)||(i===ap.length-1&&j===0))return;
  for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)fn(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)})});
 function formatBits(mask){var d=(0<<3)|mask,r=d;for(var i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);var b=((d<<10)|r)^0x5412;
  function g(i){return ((b>>>i)&1)!==0}
  for(var i=0;i<=5;i++)fn(8,i,g(i));fn(8,7,g(6));fn(8,8,g(7));fn(7,8,g(8));for(var i=9;i<15;i++)fn(14-i,8,g(i));
  for(var i=0;i<8;i++)fn(size-1-i,8,g(i));for(var i=8;i<15;i++)fn(8,size-15+i,g(i));fn(8,size-8,true)}
 formatBits(0);
 if(v>=7){var r=v;for(var i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);var vb=(v<<12)|r;
  for(var i=0;i<18;i++){var bit=((vb>>>i)&1)!==0,a=size-11+i%3,c=Math.floor(i/3);fn(a,c,bit);fn(c,a,bit)}}
 var n=0;for(var right=size-1;right>=1;right-=2){if(right===6)right=5;
  for(var vert=0;vert<size;vert++)for(var j=0;j<2;j++){var x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;
   if(!F[y][x]&&n<cw.length*8){M[y][x]=((cw[n>>>3]>>>(7-(n&7)))&1)!==0;n++}}}
 /* 가리개 8가지 중 가장 읽기 좋은 것 */
 function maskOn(m,x,y){switch(m){case 0:return (x+y)%2===0;case 1:return y%2===0;case 2:return x%3===0;case 3:return (x+y)%3===0;
  case 4:return (Math.floor(x/3)+Math.floor(y/2))%2===0;case 5:return x*y%2+x*y%3===0;case 6:return (x*y%2+x*y%3)%2===0;default:return ((x+y)%2+x*y%3)%2===0}}
 function apply(m){for(var y=0;y<size;y++)for(var x=0;x<size;x++)if(!F[y][x]&&maskOn(m,x,y))M[y][x]=!M[y][x]}
 function runPen(a){var p=0,run=1;for(var i=1;i<a.length;i++){if(a[i]===a[i-1])run++;else{if(run>=5)p+=run-2;run=1}}if(run>=5)p+=run-2;return p}
 function penalty(){var p=0,dark=0;
  for(var i=0;i<size;i++){p+=runPen(M[i]);p+=runPen(M.map(function(r){return r[i]}))}
  for(var y=0;y<size-1;y++)for(var x=0;x<size-1;x++){var c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3}
  for(var y=0;y<size;y++)for(var x=0;x<size;x++)if(M[y][x])dark++;
  return p+Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10}
 var best=0,bestP=Infinity;for(var m=0;m<8;m++){apply(m);formatBits(m);var pp=penalty();if(pp<bestP){bestP=pp;best=m}apply(m)}
 apply(best);formatBits(best);
 return {size:size,version:v,dark:function(x,y){return M[y][x]}}}

if(typeof document==='undefined'){if(typeof module!=='undefined')module.exports={encode:encode};return}
window.BKQR={encode:encode};

/* ═════════ 어떤 프로그램인지 ═════════ */
var APPS={
 'bk-card/index':['BK톡톡','인사 카드 · 이벤트 카드 · 홍보 · 이모티콘'],
 'bk-card/card':['감성 인사 카드','고객 · 지인에게 보내는 계절 인사 카드'],
 'bk-card/event':['이벤트 카드','생일 · 새해 · 결혼기념일 · 개업 축하 카드'],
 'bk-card/profile':['가게·개인 홍보','가게 광고 · 잡지 표지 · SNS 카드'],
 'bk-card/fc':['보험설계사 프로필','시상식 · 인증서 스타일 + 명함'],
 'bk-card/faith':['말씀·법문 카드','성경 말씀 · 불교 경전 구절 카드'],
 'bk-card/emoji':['나만의 이모티콘','내 사진으로 이모티콘 만들기'],
 'bk-card/motion':['움직이는 카드','꽃잎 · 단풍 · 눈 효과 + 음악 영상'],
 'bk-card/moim':['모임공지 카드','동기회 · 정기모임 · 행사 안내'],
 'bk-card/music':['BK뮤직','AI로 나만의 노래 만들기'],
 'bk-card/analysis':['보장분석 도우미','보험증권으로 보장 공백 정리'],
 'bk-shorts/index':['BK쇼츠','사진 + 글귀 + 음악 → 쇼츠 영상'],
 'bk-studio/index':['BK영상','대본 · 내 목소리로 쇼츠 영상 만들기']
};
var parts=location.pathname.split('/').filter(Boolean),repo=parts[0]||'',last=parts.length>1?parts[parts.length-1]:'',
 file=/\.html?$/i.test(last)?last.replace(/\.html?$/i,''):'index';
var info=APPS[repo+'/'+file]||[(document.title||'BK').replace(/\s*[|·-].*$/,''),''];
var NAME=info[0],DESC=info[1];
var URL_=location.origin+location.pathname.replace(/index\.html?$/i,'');   /* ?bkadmin · #라이선스 같은 뒤쪽은 빼고 */
var FONT='"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif';

/* ═════════ 화면 ═════════ */
var css='.bkqr-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}'+
 '.bkqr-row.end{justify-content:flex-end}.bkqr-row>a{margin:0!important}'+
 '.bkqr-pill{display:inline-flex;align-items:center;gap:4px;padding:7px 14px;border-radius:999px;background:#fff;border:1px solid #dce3ee;color:#174782;font:700 .9rem/1.3 '+FONT+';cursor:pointer;white-space:nowrap}'+
 '.bkqr-fixed{position:fixed;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:2147480000;box-shadow:0 4px 14px #0002}'+
 '#bkQr{position:fixed;inset:0;z-index:2147483000;background:#0f172acc;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'+FONT+'}'+
 '#bkQr[hidden],#bkQr [hidden]{display:none!important}#bkQr *{box-sizing:border-box;text-transform:none;letter-spacing:normal}#bkQr .bkqr-tip,#bkQr .bkqr-url,#bkQr .bkqr-msg{border:0;background:none;padding:0;box-shadow:none}'+
 '#bkQr .bkqr-bx{background:#fff;border-radius:22px;width:100%;max-width:380px;max-height:100%;overflow:auto;text-align:center;box-shadow:0 20px 50px #0005}'+
 '#bkQr .bkqr-hd{background:#174782;color:#fff;padding:18px 16px 14px;border-radius:22px 22px 0 0}'+
 '#bkQr .bkqr-hd b{display:block;font-size:1.45rem;line-height:1.3;word-break:keep-all}#bkQr .bkqr-hd span{display:block;font-size:.88rem;color:#cfe0ff;margin-top:2px;word-break:keep-all}'+
 '#bkQr canvas{display:block;width:min(70vw,260px);height:auto;margin:16px auto 6px;image-rendering:pixelated}'+
 '#bkQr .bkqr-tip{font-weight:800;color:#174782;font-size:1.05rem;margin:4px 12px 0}'+
 '#bkQr .bkqr-lk{display:inline-block;margin:6px 0 0;padding:2px 10px;border-radius:999px;background:#fee2e2;color:#b91c1c;font-size:.8rem;font-weight:800}'+
 '#bkQr .bkqr-url{font-size:.74rem;color:#94a3b8;margin:8px 14px 0;word-break:break-all}'+
 '#bkQr .bkqr-bt{padding:12px 14px 16px}#bkQr button{display:block;width:100%;border:0;border-radius:12px;padding:12px;margin-top:8px;font:800 .98rem '+FONT+';cursor:pointer}'+
 '#bkQr .bkqr-b1{background:#174782;color:#fff}#bkQr .bkqr-b2{background:#e8eef8;color:#174782}#bkQr .bkqr-b3{background:transparent;color:#64748b}'+
 '#bkQr .bkqr-msg{min-height:1.2em;font-size:.85rem;font-weight:800;color:#059669;margin-top:6px}';

var locked=false;
function checkLock(){var L=window.BKLIC,p=window.BK_PROG;if(!L||!p||!L.loadCfg||!L.isLocked)return Promise.resolve(false);
 return L.loadCfg().then(function(c){return !!L.isLocked(p,c)}).catch(function(){return false})}

function drawQR(cv,px){var q=encode(URL_),quiet=4,n=q.size+quiet*2,cell=Math.max(1,Math.floor(px/n));
 cv.width=cv.height=cell*n;var g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);g.fillStyle='#111827';
 for(var y=0;y<q.size;y++)for(var x=0;x<q.size;x++)if(q.dark(x,y))g.fillRect((x+quiet)*cell,(y+quiet)*cell,cell,cell);return cv}

function fitFont(g,text,weight,max,width){var s=max;do{g.font=weight+' '+s+'px '+FONT;s-=2}while(g.measureText(text).width>width&&s>20);return g.font}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
/* 카톡으로 보내기 좋은 QR 카드 이미지 (1080×1440) */
function cardImage(){var W=1080,H=1440,c=document.createElement('canvas');c.width=W;c.height=H;var g=c.getContext('2d');
 g.fillStyle='#f3f6fb';g.fillRect(0,0,W,H);g.fillStyle='#174782';g.fillRect(0,0,W,300);g.textAlign='center';g.textBaseline='alphabetic';
 g.fillStyle='#fff';fitFont(g,NAME,900,120,960);g.fillText(NAME,W/2,170);
 if(DESC){g.fillStyle='#cfe0ff';fitFont(g,DESC,700,50,960);g.fillText(DESC,W/2,250)}
 g.fillStyle='#fff';g.strokeStyle='#dce3ee';g.lineWidth=3;rr(g,140,340,800,800,36);g.fill();g.stroke();
 var qc=drawQR(document.createElement('canvas'),720);g.imageSmoothingEnabled=false;g.drawImage(qc,140+(800-qc.width)/2,340+(800-qc.height)/2);
 g.fillStyle='#174782';g.font='800 54px '+FONT;g.fillText('휴대폰 카메라로 찍어 주세요',W/2,1225);
 g.fillStyle=locked?'#b91c1c':'#475569';g.font='600 36px '+FONT;g.fillText(locked?'🔒 라이선스가 있어야 열려요':'찍으면 바로 열려요',W/2,1290);
 g.fillStyle='#94a3b8';g.font='500 30px '+FONT;g.fillText('BK Agent · 비케이',W/2,1385);return c}

var box=null;
function open(){if(!box)build();var msg=box.querySelector('.bkqr-msg');msg.textContent='';
 drawQR(box.querySelector('canvas'),Math.round(260*Math.min(3,Math.max(2,window.devicePixelRatio||1))));
 checkLock().then(function(l){locked=l;box.querySelector('.bkqr-lk').hidden=!l});
 box.hidden=false;document.documentElement.style.overflow='hidden'}
function close(){if(box)box.hidden=true;document.documentElement.style.overflow=''}
function say(t,bad){var m=box.querySelector('.bkqr-msg');m.style.color=bad?'#b91c1c':'#059669';m.textContent=t}
function save(){var c=cardImage(),fname=NAME.replace(/[\\/:*?"<>|\s]+/g,'')+'_QR.png';
 c.toBlob(function(blob){if(!blob){say('이미지를 만들지 못했어요.',true);return}
  var f=null;try{f=new File([blob],fname,{type:'image/png'})}catch(e){}
  if(f&&navigator.canShare&&navigator.canShare({files:[f]})){navigator.share({files:[f],title:NAME+' QR'}).then(function(){say('✅ 보냈어요')}).catch(function(){});return}
  var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=fname;document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(u)},4000);say('✅ 사진이 다운로드 폴더에 저장됐어요')},'image/png')}
function copy(){function ok(){say('✅ 주소를 복사했어요')}
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(URL_).then(ok).catch(old)}else old();
 function old(){var t=document.createElement('textarea');t.value=URL_;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();
  try{document.execCommand('copy');ok()}catch(e){say('복사가 안 돼요. 주소를 길게 눌러 복사해 주세요.',true)}t.remove()}}
function build(){box=document.createElement('div');box.id='bkQr';box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-label',NAME+' QR');
 box.innerHTML='<div class="bkqr-bx"><div class="bkqr-hd"><b></b><span></span></div><canvas aria-label="QR 코드"></canvas>'+
  '<div class="bkqr-tip">휴대폰 카메라로 찍어 주세요</div><span class="bkqr-lk" hidden>🔒 라이선스가 있어야 열려요</span><div class="bkqr-url"></div>'+
  '<div class="bkqr-bt"><button type="button" class="bkqr-b1" data-a="save">🖼️ QR 사진으로 보내기 · 저장</button><button type="button" class="bkqr-b2" data-a="copy">📋 주소 복사</button>'+
  '<button type="button" class="bkqr-b3" data-a="close">닫기</button><div class="bkqr-msg"></div></div></div>';
 box.querySelector('.bkqr-hd b').textContent=NAME;box.querySelector('.bkqr-hd span').textContent=DESC||'';box.querySelector('.bkqr-url').textContent=URL_;
 box.addEventListener('click',function(e){if(e.target===box){close();return}var b=e.target.closest&&e.target.closest('button[data-a]');if(!b)return;
  var a=b.getAttribute('data-a');if(a==='close')close();else if(a==='save')save();else if(a==='copy')copy()});
 document.addEventListener('keydown',function(e){if(e.key==='Escape')close()});
 document.body.appendChild(box)}

function place(){if(document.getElementById('bkQrBtn'))return;
 var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
 var btn=document.createElement('button');btn.type='button';btn.id='bkQrBtn';btn.textContent='📱 QR 보여주기';btn.addEventListener('click',open);
 var top=document.querySelector('.top-act');
 if(top){btn.className='button ghost small';btn.textContent='📱 QR';btn.setAttribute('aria-label','QR 보여주기');               /* BK쇼츠 · BK영상 */
  /* 맨 위 줄에 자리가 모자라 앱 이름이 잘리면, 버튼을 바로 아래 줄 오른쪽으로 옮김 */
  var hdr=top.closest('header')||top.parentNode,row=document.createElement('div');row.className='bkqr-row end';row.style.margin='-4px 0 10px';
  var fit=function(){top.insertBefore(btn,top.firstChild);if(row.parentNode)row.remove();
   var h=hdr.querySelector('h1');if(h&&h.scrollWidth>h.clientWidth+1){var cs=getComputedStyle(hdr);row.style.padding='0 '+cs.paddingRight+' 0 '+cs.paddingLeft;row.appendChild(btn);hdr.parentNode.insertBefore(row,hdr.nextSibling)}};
  fit();window.addEventListener('resize',fit);window.addEventListener('load',fit);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);return}
 btn.className='bkqr-pill';
 var back=document.querySelector('main > a[href="./"]');
 if(back){var row=document.createElement('div');row.className='bkqr-row';back.parentNode.insertBefore(row,back);row.appendChild(back);row.appendChild(btn);return}  /* BK톡톡 프로그램 화면 */
 var main=document.querySelector('main');
 if(main){var r2=document.createElement('div');r2.className='bkqr-row end';r2.appendChild(btn);main.insertBefore(r2,main.firstChild);return}             /* BK톡톡 첫 화면 */
 btn.className='bkqr-pill bkqr-fixed';document.body.appendChild(btn)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',place);else place();
})();
