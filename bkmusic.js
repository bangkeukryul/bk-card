/*!
 * music.js — BK쇼츠 기본 음악 (BK톡톡과 같은 연주 엔진: 프로그램이 직접 연주해서 저작권 걱정 없음)
 */
(function (g) {
'use strict';
function makeVerb(ac,out){
 const len=Math.round(ac.sampleRate*2.4),ir=ac.createBuffer(2,len,ac.sampleRate);
 for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3)}
 const v=ac.createConvolver();v.buffer=ir;const w=ac.createGain();w.gain.value=.35;v.connect(w);w.connect(out);return v;
}
const mtof=m=>440*Math.pow(2,(m-69)/12);
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function note(bus,m,time,len,kind,vol){
 const ac=bus.context,f=mtof(m),g=ac.createGain();g.connect(bus);
 const P={box:[['sine',1,1],['sine',4.0,.18],['triangle',2,.12]],piano:[['triangle',1,1],['sine',2,.25],['sine',3,.08]],
  harp:[['sine',1,1],['sine',2,.35],['sine',3,.12],['sine',4,.05]],bell:[['sine',1,1],['sine',2.76,.4],['sine',5.4,.2],['sine',8.93,.08]]}[kind];
 const atk={box:.004,piano:.012,harp:.003,bell:.002}[kind];
 g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(vol,time+atk);g.gain.exponentialRampToValueAtTime(.0008,time+len);
 P.forEach(([type,r,a])=>{const o=ac.createOscillator(),og=ac.createGain();o.type=type;o.frequency.value=f*r;og.gain.value=a;o.connect(og);og.connect(g);o.start(time);o.stop(time+len+.05)});
}
const KS=new WeakMap();
function ksBuf(ac,m,len,damp){
 let c=KS.get(ac);if(!c){c={};KS.set(ac,c)}const key=m+'_'+damp;if(c[key])return c[key];
 const sr=ac.sampleRate,n=Math.floor(sr*len),b=ac.createBuffer(1,n,sr),d=b.getChannelData(0),p=Math.max(2,Math.round(sr/mtof(m))),r=rng(m*97+7);
 const w=new Float32Array(p);for(let i=0;i<p;i++)w[i]=r()*2-1;let k=0;
 for(let i=0;i<n;i++){const a=w[k],nx=w[(k+1)%p];d[i]=a;w[k]=damp*.5*(a+nx);k=(k+1)%p}
 return c[key]=b;
}
function pluck(bus,m,time,vol,o){
 o=o||{};const ac=bus.context,len=o.len||2.2,s=ac.createBufferSource();s.buffer=ksBuf(ac,m,len,o.damp||.996);
 const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=o.tone||3200;
 const g=ac.createGain();g.gain.setValueAtTime(vol,time);g.gain.setValueAtTime(vol,time+len-.25);g.gain.linearRampToValueAtTime(0,time+len);
 if(o.bend){s.detune.setValueAtTime(0,time);s.detune.setValueAtTime(0,time+.18);s.detune.linearRampToValueAtTime(o.bend,time+.38);s.detune.linearRampToValueAtTime(0,time+.62)}
 s.connect(lp);lp.connect(g);g.connect(bus);s.start(time);s.stop(time+len);
}
function pad(bus,ms,time,len,vol){
 const ac=bus.context,lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1300;lp.Q.value=.4;
 const g=ac.createGain();g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(vol,time+.6);g.gain.setValueAtTime(vol,time+Math.max(.6,len-.5));g.gain.linearRampToValueAtTime(0,time+len+.3);
 lp.connect(g);g.connect(bus);
 ms.forEach(m=>[-7,7].forEach(dt=>{const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=dt;const og=ac.createGain();og.gain.value=.5/ms.length;o.connect(og);og.connect(lp);o.start(time);o.stop(time+len+.4)}));
}
const NZ=new WeakMap();
function shaker(bus,time,vol){
 const ac=bus.context;let b=NZ.get(ac);
 if(!b){const n=Math.floor(ac.sampleRate*.08);b=ac.createBuffer(1,n,ac.sampleRate);const d=b.getChannelData(0),r=rng(5);for(let i=0;i<n;i++)d[i]=(r()*2-1)*Math.pow(1-i/n,2);NZ.set(ac,b)}
 const s=ac.createBufferSource();s.buffer=b;const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=6500;const g=ac.createGain();g.gain.value=vol;
 s.connect(hp);hp.connect(g);g.connect(bus);s.start(time);
}
function strum(bus,ch,time,vol,up,o){(up?ch.slice().reverse():ch).forEach((m,i)=>pluck(bus,m,time+i*.016,vol,o))}
function organ(bus,ms,time,len,vol){
 const ac=bus.context,g=ac.createGain();g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(vol,time+.05);g.gain.setValueAtTime(vol,time+Math.max(.06,len-.08));g.gain.linearRampToValueAtTime(0,time+len+.12);g.connect(bus);
 ms.forEach(m=>[[1,1],[2,.45],[4,.18],[.5,.25]].forEach(([r,a])=>{const o=ac.createOscillator();o.type='sine';o.frequency.value=mtof(m)*r;const og=ac.createGain();og.gain.value=a/ms.length;o.connect(og);og.connect(g);o.start(time);o.stop(time+len+.2)}));
}
const HC={G:[[55,59,62],43],C:[[52,55,60],48],D:[[54,57,62],50],Em:[[55,59,64],52],A:[[52,57,61],45],F:[[57,60,65],41],Bb:[[58,62,65],46],Dm:[[57,62,65],50]};
function seq(ns,ds,cs){return{mel:ns.map((m,i)=>[m,ds[i]]),ch:cs.map((c,i)=>[ds[i],c])}}
const HYMNS={
 h_grace:{beat:.68,lead:'piano',lv:.17,ov:.06,
  mel:[[62,1],[67,2],[71,.5],[67,.5],[71,2],[69,1],[67,2],[64,1],[62,2],[62,1],[67,2],[71,.5],[67,.5],[71,2],[69,1],[74,2],[71,1],[74,2],[71,.5],[67,.5],[71,2],[69,1],[67,2],[64,1],[62,2],[62,1],[67,2],[71,.5],[67,.5],[71,2],[69,1],[67,3]],
  ch:[[1,null],[3,'G'],[3,'G'],[3,'C'],[3,'G'],[3,'G'],[3,'D'],[3,'D'],[3,'G'],[3,'G'],[3,'C'],[3,'G'],[3,'G'],[3,'D'],[3,'G']]},
 h_doxology:(()=>{const d=[1,1,1,1,1,1,1,2];const P=[[67,67,66,64,62,67,69,71],[71,71,71,69,67,72,71,69],[67,69,71,69,67,64,66,67],[74,71,67,69,72,71,69,67]];
  const C=[['G','G','D','C','G','Em','D','G'],['G','Em','G','D','Em','C','G','D'],['G','D','G','D','Em','C','D','G'],['G','G','Em','D','C','G','D','G']];
  const o={beat:.62,lead:'piano',lv:.16,ov:.07,mel:[],ch:[]};P.forEach((p,i)=>{const s=seq(p,d,C[i]);o.mel.push(...s.mel);o.ch.push(...s.ch)});return o})(),
 h_joy:{beat:.46,lead:'piano',lv:.17,ov:.06,
  mel:[[66,1],[66,1],[67,1],[69,1],[69,1],[67,1],[66,1],[64,1],[62,1],[62,1],[64,1],[66,1],[66,1.5],[64,.5],[64,2],[66,1],[66,1],[67,1],[69,1],[69,1],[67,1],[66,1],[64,1],[62,1],[62,1],[64,1],[66,1],[64,1.5],[62,.5],[62,2]],
  ch:[[2,'D'],[2,'D'],[2,'D'],[2,'A'],[2,'D'],[2,'D'],[2,'D'],[2,'A'],[2,'D'],[2,'D'],[2,'D'],[2,'A'],[2,'D'],[2,'D'],[2,'A'],[2,'D']]},
 bday:{beat:.44,lead:'piano',lv:.18,ov:.05,
  mel:[[67,.75],[67,.25],[69,1],[67,1],[72,1],[71,2],[67,.75],[67,.25],[69,1],[67,1],[74,1],[72,2],[67,.75],[67,.25],[79,1],[76,1],[72,1],[71,1],[69,1],[77,.75],[77,.25],[76,1],[72,1],[74,1],[72,3]],
  ch:[[1,null],[3,'C'],[3,'G'],[3,'G'],[3,'C'],[3,'C'],[3,'F'],[2,'C'],[1,'G'],[3,'C']]},
 jingle:{beat:.27,lead:'bell',lv:.16,ov:.045,
  mel:[[76,1],[76,1],[76,2],[76,1],[76,1],[76,2],[76,1],[79,1],[72,1.5],[74,.5],[76,4],[77,1],[77,1],[77,1.5],[77,.5],[77,1],[76,1],[76,1],[76,.5],[76,.5],[76,1],[74,1],[74,1],[76,1],[74,2],[79,2],[76,1],[76,1],[76,2],[76,1],[76,1],[76,2],[76,1],[79,1],[72,1.5],[74,.5],[76,4],[77,1],[77,1],[77,1.5],[77,.5],[77,1],[76,1],[76,1],[76,.5],[76,.5],[79,1],[79,1],[77,1],[74,1],[72,4]],
  ch:[[4,'C'],[4,'C'],[4,'C'],[4,'C'],[4,'F'],[4,'C'],[4,'D'],[4,'G'],[4,'C'],[4,'C'],[4,'C'],[4,'C'],[4,'F'],[4,'C'],[4,'G'],[4,'C']]},
 auld:{beat:.52,lead:'piano',lv:.17,ov:.06,
  mel:[[60,1],[65,1.5],[65,.5],[65,1],[69,1],[67,1.5],[65,.5],[67,1],[69,.5],[67,.5],[65,1.5],[65,.5],[69,1],[72,1],[74,3],[74,1],[72,1.5],[69,.5],[69,1],[65,1],[67,1.5],[65,.5],[67,1],[69,.5],[67,.5],[65,1.5],[62,.5],[62,1],[60,1],[65,3]],
  ch:[[1,null],[4,'F'],[4,'C'],[4,'F'],[4,'Bb'],[4,'F'],[4,'C'],[2,'Dm'],[2,'C'],[3,'F']]},
 h_silent:{beat:.29,lead:'harp',lv:.15,ov:.05,
  mel:[[67,1.5],[69,.5],[67,1],[64,3],[67,1.5],[69,.5],[67,1],[64,3],[74,2],[74,1],[71,3],[72,2],[72,1],[67,3],[69,2],[69,1],[72,1.5],[71,.5],[69,1],[67,1.5],[69,.5],[67,1],[64,3],[69,2],[69,1],[72,1.5],[71,.5],[69,1],[67,1.5],[69,.5],[67,1],[64,3],[74,2],[74,1],[77,1.5],[74,.5],[71,1],[72,3],[76,3],[72,1.5],[67,.5],[64,1],[67,1.5],[65,.5],[62,1],[60,6]],
  ch:[[6,'C'],[6,'C'],[6,'G'],[6,'C'],[6,'F'],[6,'C'],[6,'F'],[6,'C'],[6,'G'],[6,'C'],[3,'C'],[3,'G'],[6,'C']]}
};
function hymn(bus,t0,end,H){
 let t=t0+.15;
 while(t<end-.3){
  let tm=t;for(const[m,b]of H.mel){if(tm>=end-.25)break;const d=b*H.beat;note(bus,m,tm,Math.max(1.1,d*1.6),H.lead,H.lv);tm+=d}
  let tc=t;for(const[b,c]of H.ch){if(tc>=end-.25)break;const d=b*H.beat;if(c){const[ms,bs]=HC[c];organ(bus,ms,tc,d,H.ov);note(bus,bs,tc,Math.max(1.5,d*1.5),'piano',.09)}tc+=d}
  t=tm+H.beat*2;
 }
}

function arrange(kind,bus,t0,end){
 if(HYMNS[kind]){hymn(bus,t0,end,HYMNS[kind]);return}
 if(kind==='pop'){popBeat(bus,t0,end);return}
 if(kind==='lofi'){lofi(bus,t0,end);return}
 const R=rng(kind.length*131+17);let t=t0,i=0;
 if(kind==='piano'){
  const CH=[[60,64,67,72],[57,60,64,69],[53,57,60,65],[55,59,62,67]],pat=[0,2,1,3];
  while(t<end-.3){const ch=CH[Math.floor(i/4)%4];note(bus,ch[pat[i%4]],t,2.6,'piano',.15);if(i%4===0){note(bus,ch[0]-12,t,3.2,'piano',.12);note(bus,ch[2]-12,t,3,'piano',.06)}t+=.5;i++}
 }else if(kind==='harp'){
  const CH=[[62,66,69],[59,62,66],[55,59,62],[57,61,64]];
  while(t<end-.3){const c=CH[Math.floor(i/8)%4],seq=[c[0],c[1],c[2],c[0]+12,c[1]+12,c[2]+12,c[0]+24,c[2]+12];note(bus,seq[i%8],t,2.4,'harp',.1);if(i%8===0)note(bus,c[0]-12,t,3.2,'harp',.11);t+=.25;i++}
 }else if(kind==='guitar'){
  const CH=[[55,59,62,67,71],[50,57,62,66,69],[52,59,64,67,71],[48,55,60,64,67]],pat=[[0,1],[1,.5],[0,.8],[1,.5]];
  while(t<end-.3){const c=CH[Math.floor(i/4)%4],[up,v]=pat[i%4];if(i%4===0)pluck(bus,c[0]-12,t,.16,{len:2.4,tone:1800});strum(bus,c,t,.075*v,up,{len:1.8,tone:2600});t+=.5;i++}
 }else if(kind==='strings'){
  const CH=[[53,57,60,65],[48,55,60,64],[50,57,62,65],[46,53,58,62]];
  while(t<end-.3){const c=CH[i%4];pad(bus,c,t,2.5,.22);pad(bus,[c[0]-12],t,2.5,.12);
   note(bus,c[3]+12,t+.05,2.2,'piano',.06);note(bus,c[1+(R()*3|0)]+12,t+1.25,2,'piano',.05);t+=2.5;i++}
 }else if(kind==='bells'){
  const CH=[[60,64,67],[53,57,60],[55,59,62],[60,64,67]],mel=[[76,79,84,79],[77,81,84,81],[79,74,77,74],[76,72,79,84]];
  while(t<end-.3){const b=Math.floor(i/4)%4,c=CH[b];note(bus,mel[b][i%4],t,3,'bell',.075);if(i%4===0){note(bus,c[0]-12,t,4,'bell',.05);pad(bus,c,t,2,.07)}if(i%2===1)note(bus,c[2]+12,t+.25,1.2,'bell',.025);t+=.5;i++}
 }else if(kind==='bright'){
  const CH=[[60,64,67,72],[55,59,62,67],[57,60,64,69],[53,57,60,65]],acc=[1,0,1,1,0,1,1,0];
  while(t<end-.2){const c=CH[Math.floor(i/8)%4];if(acc[i%8])strum(bus,c.map(m=>m+12),t,.05,i%2===1,{len:1.2,tone:4200,damp:.993});
   shaker(bus,t,i%2?.05:.09);if(i%4===0)pluck(bus,c[0]-12,t,.15,{len:1.6,tone:1400});t+=.25;i++}
 }
}
/* ── 새 반주: 팝 비트 · 로파이 (직접 만든 곡, 저작권 걱정 없음) ── */
function kick(bus,time,vol){const ac=bus.context,o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(130,time);o.frequency.exponentialRampToValueAtTime(42,time+.16);
 g.gain.setValueAtTime(vol,time);g.gain.exponentialRampToValueAtTime(.001,time+.32);o.connect(g);g.connect(bus);o.start(time);o.stop(time+.35)}
const SN=new WeakMap();
function snare(bus,time,vol){const ac=bus.context;let b=SN.get(ac);
 if(!b){const n=Math.floor(ac.sampleRate*.22);b=ac.createBuffer(1,n,ac.sampleRate);const d=b.getChannelData(0),r=rng(9);for(let i=0;i<n;i++)d[i]=(r()*2-1)*Math.pow(1-i/n,3);SN.set(ac,b)}
 const s=ac.createBufferSource();s.buffer=b;const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1900;bp.Q.value=.7;const g=ac.createGain();g.gain.value=vol;
 s.connect(bp);bp.connect(g);g.connect(bus);s.start(time);
 const o=ac.createOscillator(),og=ac.createGain();o.type='triangle';o.frequency.value=190;og.gain.setValueAtTime(vol*.5,time);og.gain.exponentialRampToValueAtTime(.001,time+.12);o.connect(og);og.connect(bus);o.start(time);o.stop(time+.14)}
function popBeat(bus,t0,end){
 const beat=60/112,R=rng(77);
 const CH=[[60,64,67],[55,59,62],[57,60,64],[53,57,60]],ROOT=[48,43,45,41];
 let bar=0,t=t0+.1;
 while(t<end-.4){
  const c=CH[bar%4],r=ROOT[bar%4];
  for(let q=0;q<4;q++){const tq=t+q*beat;if(tq>=end-.3)break;
   if(q===0||q===2)kick(bus,tq,.55);if(q===1||q===3)snare(bus,tq,.22);
   shaker(bus,tq,.05);shaker(bus,tq+beat/2,.035);
   pluck(bus,r,tq,.16,{len:.9,tone:900,damp:.99});pluck(bus,r+12,tq+beat/2,.08,{len:.6,tone:1100,damp:.99});
   c.forEach(m=>note(bus,m+12,tq+beat/2,.45,'piano',.045));}
  if(bar%2===1||R()<.6){const mel=[c[2]+12,c[1]+12,c[0]+24,c[2]+12];for(let j=0;j<4;j++){const tm=t+j*beat;if(tm<end-.4)note(bus,mel[(j+bar)%4],tm,.9,'bell',.05)}}
  t+=4*beat;bar++;}
}
function lofi(bus,t0,end){
 const beat=60/78,sw=beat*.58;
 const CH=[[62,65,69,72],[55,59,62,65],[60,64,67,71],[57,60,64,67]],ROOT=[38,43,36,45];
 let bar=0,t=t0+.1;
 while(t<end-.4){
  const c=CH[bar%4],r=ROOT[bar%4];
  c.forEach((m,i)=>note(bus,m,t+i*.02,beat*3.6,'piano',.07));
  note(bus,r,t,beat*3.5,'piano',.12);
  for(let q=0;q<4;q++){const tq=t+q*beat;if(tq>=end-.3)break;
   if(q===0)kick(bus,tq,.35);if(q===2)kick(bus,tq+sw*.5,.28);if(q===1||q===3)snare(bus,tq,.12);
   shaker(bus,tq,.03);shaker(bus,tq+sw,.022);}
  if(bar%2===1)[c[3]+12,c[2]+12,c[1]+12].forEach((m,j)=>note(bus,m,t+beat*(1.5+j),1.4,'harp',.05));
  t+=4*beat;bar++;}
}

const LEVEL={piano:1,guitar:3,strings:1.9,harp:1.4,bells:1.5,bright:3.2,pop:1.6,lofi:1.6,h_grace:1.3,h_doxology:1.2,h_joy:1.2,h_silent:1.15,bday:1.25,jingle:1.2,auld:1.15};
const LIST=[
 ['기본 음악',[['piano','🎹 따뜻한 피아노'],['guitar','🎸 어쿠스틱 기타'],['strings','🎻 감성 스트링'],['harp','🪕 맑은 하프'],['bells','🔔 반짝이는 벨'],['bright','☀️ 밝고 경쾌하게']]],
 ['팝 느낌 반주',[['pop','🎧 팝 비트 (신나게)'],['lofi','☕ 로파이 (잔잔하게)']]],
 ['찬송가 (저작권이 끝난 옛 찬송가)',[['h_grace','🙏 나 같은 죄인 살리신'],['h_doxology','🙌 만복의 근원 하나님'],['h_joy','🎶 기뻐하며 경배하세'],['h_silent','🎄 고요한 밤 거룩한 밤']]],
 ['이벤트 음악 (저작권이 끝난 옛 노래)',[['bday','🎂 생일 축하 노래'],['jingle','🔔 징글벨'],['auld','🎍 올드 랭 사인']]]
];
function label(k){for(const gr of LIST)for(const [kk,l] of gr[1])if(kk===k)return l;return k}
async function render(kind,sec){
 const OAC=g.OfflineAudioContext||g.webkitOfflineAudioContext,sr=44100,len=Math.ceil(sr*sec);
 const ac=new OAC(2,len,sr),bus=ac.createGain();bus.connect(ac.destination);bus.connect(makeVerb(ac,ac.destination));
 const lv=ac.createGain();lv.gain.value=LEVEL[kind]||1;lv.connect(bus);
 arrange(kind,lv,0,sec);
 const buf=await new Promise((res,rej)=>{ac.oncomplete=e=>res(e.renderedBuffer);const p=ac.startRendering();if(p&&p.then)p.then(res,rej)});
 // 너무 크거나 작은 소리 맞추기
 let pk=0;for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i+=7)pk=Math.max(pk,Math.abs(d[i]))}
 if(pk>0){const k=Math.min(3,.85/pk);for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=k}}
 return buf;
}
g.BKMUSIC={LIST,label,render};
})(window);
