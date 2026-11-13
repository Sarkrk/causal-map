
const D=window.__D;
const CN={Real_Economy:'실물경제',Inflation_Labor:'물가·고용',Policy:'정책·규제',Financial_Market:'금융·자산',External_Sector:'대외부문',Industry_AI:'산업·AI',Other:'기타'};
const CC={Real_Economy:'#e0af68',Inflation_Labor:'#f7768e',Policy:'#9ece6a',Financial_Market:'#7aa2f7',External_Sector:'#2ac3de',Industry_AI:'#bb9af7',Other:'#a9b1d6'};
const GC={A:'#e5484d',B:'#5b8def',C:'#6f6f6f',D:'#9a9a9a'};
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');let W,H,DPR;
function rs(){DPR=Math.min(window.devicePixelRatio||1,3);W=innerWidth;H=innerHeight;cv.width=W*DPR;cv.height=H*DPR}
const N=D.nodes.map((n,i)=>({...n,x:0,y:0,z:0,vx:0,vy:0,vz:0,deg:0,fx:null,fy:null,fz:null,ph:i*2.399,sx:0,sy:0,sf:1,sz:0,fog:1})),BY={};N.forEach(n=>BY[n.name]=n);
const L=D.edges.filter(e=>BY[e.src]&&BY[e.dst]).map(e=>({...e,a:BY[e.src],b:BY[e.dst],k:'c'}));
const CR=(D.cors||[]).filter(e=>BY[e.src]&&BY[e.dst]).map(e=>({...e,a:BY[e.src],b:BY[e.dst],k:'r'}));
L.forEach(l=>{l.a.deg++;l.b.deg++});N.forEach(n=>n.rad=3.5+Math.sqrt(n.deg)*1.9);
const CK=Object.keys(CN).filter(k=>N.some(n=>n.cat===k));
const CP={};CK.forEach((k,i)=>{const y=1-(i+.5)/CK.length*2,r=Math.sqrt(1-y*y),a=i*2.399;CP[k]=[Math.cos(a)*r*170,y*170,Math.sin(a)*r*170]});
let flatAll=false;let lvOn=new Set(['A','B','C','D']),catOn=new Set(CK),thr=0,showNR=true,showCor=false,labAll=false,hideOrph=true,autoSpin=true,wobble=true,hop=1;
let cam={cx:0,cy:0,cz:0,k:1,yaw:.5,pitch:-.3,px:0,py:0},spin={y:0,p:0},sel=null,alpha=1,tab='in',lastAct=-1e9,fly=null;
const F=650,T0=performance.now();
function rot(x,y,z){x-=cam.cx;y-=cam.cy;z-=cam.cz;const c1=Math.cos(cam.yaw),s1=Math.sin(cam.yaw),c2=Math.cos(cam.pitch),s2=Math.sin(cam.pitch);const x1=x*c1+z*s1,z1=-x*s1+z*c1;return [x1,y*c2-z1*s2,y*s2+z1*c2]}
function unrot(x1,y1,z2){const c1=Math.cos(cam.yaw),s1=Math.sin(cam.yaw),c2=Math.cos(cam.pitch),s2=Math.sin(cam.pitch);const y=y1*c2+z2*s2,z1=-y1*s2+z2*c2;return [x1*c1-z1*s1+cam.cx,y+cam.cy,x1*s1+z1*c1+cam.cz]}
function project(){const t=(performance.now()-T0)/1000,a=wobble?4:0;
 N.forEach(n=>{if(!VN.has(n))return;const [x,y,z]=rot(n.x+a*Math.sin(t*.7+n.ph),n.y+a*Math.cos(t*.53+n.ph*1.3),n.z+a*Math.sin(t*.61+n.ph*.7));
  const f=F/(F+Math.max(z,-F*.8));n.sx=W/2+cam.px+x*f*cam.k;n.sy=H/2+cam.py+y*f*cam.k;n.sf=f;n.sz=z;n.fog=Math.max(.28,Math.min(1,1-z/480))})}
const lvis=l=>l.k==='c'?(lvOn.has(l.level)&&(l.r==null?showNR:Math.abs(l.r)>=thr)&&catOn.has(l.a.cat)&&catOn.has(l.b.cat)):(showCor&&catOn.has(l.a.cat)&&catOn.has(l.b.cat));
let VL=[],VN=new Set();
function recompute(){VL=L.filter(lvis).concat(CR.filter(lvis));const has=new Set();VL.forEach(l=>{has.add(l.a);has.add(l.b)});
 VN=new Set(N.filter(n=>catOn.has(n.cat)&&(!hideOrph||has.has(n)||n===sel)));
 document.getElementById('stat').textContent=`노드 ${VN.size} · 인과 ${VL.filter(l=>l.k==='c').length}${showCor?' · 상관 '+VL.filter(l=>l.k==='r').length:''}`;alpha=Math.max(alpha,.5)}
function seed(){N.forEach(n=>{const c=CP[n.cat]||[0,0,0];n.x=c[0]+(Math.random()-.5)*140;n.y=c[1]+(Math.random()-.5)*140;n.z=c[2]+(Math.random()-.5)*140;n.vx=n.vy=n.vz=0})}
function tick(){const A=[...VN];
 for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const a=A[i],b=A[j];let dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,d2=dx*dx+dy*dy+dz*dz+.01;if(d2>200000)continue;
  const d=Math.sqrt(d2),f=1700/d2*alpha*(1+(a.rad+b.rad)/12);dx/=d;dy/=d;dz/=d;a.vx+=dx*f;a.vy+=dy*f;a.vz+=dz*f;b.vx-=dx*f;b.vy-=dy*f;b.vz-=dz*f}
 VL.forEach(l=>{if(!VN.has(l.a)||!VN.has(l.b))return;const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,dz=l.b.z-l.a.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,len=l.k==='r'?120:85,f=(d-len)/d*(l.k==='r'?.006:.02)*alpha;
  l.a.vx+=dx*f;l.a.vy+=dy*f;l.a.vz+=dz*f;l.b.vx-=dx*f;l.b.vy-=dy*f;l.b.vz-=dz*f});
 A.forEach(n=>{const c=CP[n.cat]||[0,0,0];n.vx+=((c[0]-n.x)*.004-n.x*.0015)*alpha;n.vy+=((c[1]-n.y)*.004-n.y*.0015)*alpha;n.vz+=((c[2]-n.z)*.004-n.z*.0015)*alpha;
  if(n.fx!=null){n.x=n.fx;n.y=n.fy;n.z=n.fz;n.vx=n.vy=n.vz=0}else{n.vx*=.6;n.vy*=.6;n.vz*=.6;n.x+=n.vx;n.y+=n.vy;n.z+=n.vz}});
 alpha*=.985}
function nbr(n,h){const s=new Set([n]);for(let i=0;i<h;i++){const add=[];VL.forEach(l=>{if(s.has(l.a))add.push(l.b);if(s.has(l.b))add.push(l.a)});add.forEach(x=>s.add(x))}return s}
function arrow(x1,y1,x2,y2,r,col){const a=Math.atan2(y2-y1,x2-x1),ex=x2-Math.cos(a)*(r+2),ey=y2-Math.sin(a)*(r+2),s=Math.max(4,6*Math.min(cam.k,1.6));
 ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-s*Math.cos(a-.42),ey-s*Math.sin(a-.42));ctx.lineTo(ex-s*Math.cos(a+.42),ey-s*Math.sin(a+.42));ctx.fill()}
function draw(){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.clearRect(0,0,W,H);project();
 const hs=sel?nbr(sel,hop):null,k=cam.k,zk=Math.max(.7,Math.min(k,2.2));
 const isOn=l=>hs&&hs.has(l.a)&&hs.has(l.b)&&(hop>1||l.a===sel||l.b===sel);
 VL.filter(l=>VN.has(l.a)&&VN.has(l.b)).sort((u,v)=>(isOn(u)-isOn(v))||((v.a.sz+v.b.sz)-(u.a.sz+u.b.sz))).forEach(l=>{const on=isOn(l),col=l.k==='r'?'#3fb6c9':GC[l.level],fog=Math.min(l.a.fog,l.b.fog);
  ctx.globalAlpha=hs?(on?.95:.03):(l.k==='r'?.35:l.level==='C'?.25:.6)*fog;
  ctx.strokeStyle=col;ctx.lineWidth=(l.level==='A'?2:l.level==='B'?1.4:1)*(on?1.7:1)*Math.min(1.4,Math.max(.6,k))*Math.min(l.a.sf,l.b.sf);
  ctx.setLineDash(l.k==='r'?[2,4]:l.level==='D'?[5,4]:[]);ctx.beginPath();ctx.moveTo(l.a.sx,l.a.sy);ctx.lineTo(l.b.sx,l.b.sy);ctx.stroke();ctx.setLineDash([]);
  if(l.k==='c'&&(on||(!hs&&k>1.2)))arrow(l.a.sx,l.a.sy,l.b.sx,l.b.sy,l.b.rad*l.b.sf*zk,col)});
 const lab=[];
 [...VN].sort((u,v)=>((hs?hs.has(u):1)-(hs?hs.has(v):1))||(v.sz-u.sz)).forEach(n=>{const r=n.rad*n.sf*zk,inH=!hs||hs.has(n);
  if(hs&&inH){ctx.globalAlpha=n===sel?.35:.2;ctx.fillStyle=CC[n.cat];ctx.beginPath();ctx.arc(n.sx,n.sy,r*(n===sel?2.1:1.7)+3,0,6.283);ctx.fill()}
  ctx.globalAlpha=hs?(inH?1:.06):n.fog;ctx.fillStyle=CC[n.cat];ctx.beginPath();ctx.arc(n.sx,n.sy,hs&&!inH?r*.7:r,0,6.283);ctx.fill();
  if(n===sel){ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(n.sx,n.sy,r+4,0,6.283);ctx.stroke()}
  const la=labAll?1:hs?(inH?1:0):Math.max(0,Math.min(1,(k*n.sf*(.55+n.deg/22)-.55)/.35));if(la>.02)lab.push([n,n.sx,n.sy+r+12,la*(hs?1:n.fog)])});
 ctx.font='12px -apple-system,"Noto Sans KR",sans-serif';ctx.textAlign='center';
 lab.sort((u,v)=>(v[0]===sel)-(u[0]===sel)||(u[0].sz-v[0].sz)*.02+(v[0].deg-u[0].deg));const box=[];
 lab.forEach(([n,x,y,a])=>{const w=ctx.measureText(n.name).width/2+3,bb=[x-w,y-11,x+w,y+3];
  if(n!==sel&&box.some(o=>bb[0]<o[2]&&bb[2]>o[0]&&bb[1]<o[3]&&bb[3]>o[1]))return;box.push(bb);
  ctx.globalAlpha=a;ctx.lineWidth=3;ctx.strokeStyle='#1e1e1e';ctx.strokeText(n.name,x,y);ctx.fillStyle=n===sel?'#fff':'#c9c9c9';ctx.fillText(n.name,x,y)});ctx.globalAlpha=1}
function loop(){const now=performance.now();if(alpha>.004)tick();if(fly)stepFly();
 if(!g){cam.yaw+=spin.y;cam.pitch+=spin.p;spin.y*=.93;spin.p*=.93;
  if(autoSpin&&now-lastAct>2500&&Math.abs(spin.y)<.002)cam.yaw+=.0018}
 cam.pitch=Math.max(-1.45,Math.min(1.45,cam.pitch));draw();requestAnimationFrame(loop)}
function fit(anim){const A=[...VN];if(!A.length)return;const c=[0,0,0];A.forEach(n=>{c[0]+=n.x;c[1]+=n.y;c[2]+=n.z});c.forEach((v,i)=>c[i]=v/A.length);
 let R=0;A.forEach(n=>R=Math.max(R,Math.hypot(n.x-c[0],n.y-c[1],n.z-c[2])));
 const t={cx:c[0],cy:c[1],cz:c[2],px:0,py:0,k:Math.min(W,H-150)/(2*R*1.3+40)};anim?flyTo(t):Object.assign(cam,t)}
function flyTo(t){fly={f:{...cam},t,s:performance.now()}}
function stepFly(){const p=Math.min(1,(performance.now()-fly.s)/450),e=1-Math.pow(1-p,3);for(const key in fly.t)cam[key]=fly.f[key]+(fly.t[key]-fly.f[key])*e;if(p>=1)fly=null}
function zoomAt(f,sx,sy){const k2=Math.max(.15,Math.min(6,cam.k*f)),X=(sx-W/2-cam.px)/cam.k,Y=(sy-H/2-cam.py)/cam.k;cam.px=sx-W/2-X*k2;cam.py=sy-H/2-Y*k2;cam.k=k2}
function hit(sx,sy){let best=null,bd=1e9;N.forEach(n=>{if(!VN.has(n))return;const d=Math.hypot(n.sx-sx,n.sy-sy),r=Math.max(16,n.rad*n.sf*cam.k+8),sc=d+n.sz*.02;if(d<r&&sc<bd){bd=sc;best=n}});return best}
// 포인터: 한 손가락 = 회전(점 위면 점 끌기), 두 손가락 = 확대·이동
const P=new Map();let g=null;
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);P.set(e.pointerId,{x:e.clientX,y:e.clientY});closeSug();lastAct=performance.now();spin={y:0,p:0};fly=null;
 if(P.size===1){const n=hit(e.clientX,e.clientY);g={t:performance.now(),x0:e.clientX,y0:e.clientY,lx:e.clientX,ly:e.clientY,lt:performance.now(),node:n,moved:false,pan:e.pointerType==='mouse'&&(e.shiftKey||e.button===2)}}
 else if(P.size===2){if(g&&g.node){g.node.fx=g.node.fy=g.node.fz=null}const [a,b]=[...P.values()];g={pinch:true,d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2,moved:true}}});
cv.addEventListener('pointermove',e=>{if(!P.has(e.pointerId)||!g)return;P.set(e.pointerId,{x:e.clientX,y:e.clientY});lastAct=performance.now();
 if(g.pinch&&P.size>=2){const [a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;cam.px+=mx-g.mx;cam.py+=my-g.my;zoomAt(d/g.d,mx,my);g.d=d;g.mx=mx;g.my=my;return}
 if(Math.hypot(e.clientX-g.x0,e.clientY-g.y0)>7)g.moved=true;if(!g.moved)return;
 const dx=e.clientX-g.lx,dy=e.clientY-g.ly;
 if(g.node){const n=g.node,[x1,y1,z2]=rot(n.x,n.y,n.z),s=cam.k*n.sf,[wx,wy,wz]=unrot(x1+dx/s,y1+dy/s,z2);n.fx=n.x=wx;n.fy=n.y=wy;n.fz=n.z=wz;alpha=Math.max(alpha,.3)}
 else if(g.pan){cam.px+=dx;cam.py+=dy}
 else{const vy=-dx*.006,vp=dy*.006;cam.yaw+=vy;cam.pitch+=vp;spin={y:Math.max(-.05,Math.min(.05,vy*.45)),p:Math.max(-.04,Math.min(.04,vp*.45))}}
 g.lx=e.clientX;g.ly=e.clientY;g.lt=performance.now()});
function up(e){if(!P.has(e.pointerId))return;P.delete(e.pointerId);if(!g)return;
 if(!g.pinch&&!g.moved&&performance.now()-g.t<500){g.node?select(g.node):deselect()}
 if(g.node){g.node.fx=g.node.fy=g.node.fz=null}
 if(g.lt&&performance.now()-g.lt>90)spin={y:0,p:0};
 if(P.size===0)g=null;else if(P.size===1){const [p]=[...P.values()];g={t:0,x0:p.x,y0:p.y,lx:p.x,ly:p.y,node:null,moved:true}}}
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',e=>{e.preventDefault();lastAct=performance.now();zoomAt(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY)},{passive:false});
zi.onclick=()=>zoomAt(1.35,W/2,H/2);zo.onclick=()=>zoomAt(1/1.35,W/2,H/2);zf.onclick=()=>fit(true);
// 시트
const ns=document.getElementById('ns'),fs=document.getElementById('fs');
function sheet(el,st){[ns,fs].forEach(s=>{if(s!==el)s.className='sheet'});el.className='sheet'+(st?' '+st:'');
 zoombox.style.display=st==='open'?'none':'flex';zoombox.style.bottom=`calc(env(safe-area-inset-bottom) + ${16+(st==='peek'?132:st==='half'?innerHeight*.5:0)}px)`}
function dragSheet(hd,el){let y0=null;hd.addEventListener('pointerdown',e=>{y0=e.clientY;hd.setPointerCapture(e.pointerId)});
 hd.addEventListener('pointerup',e=>{if(y0==null)return;const dy=e.clientY-y0;y0=null;const open=el.classList.contains('open');
  if(el===ns){if(Math.abs(dy)<8){sheet(ns,open?'half':'open');return}
   if(dy<-30)sheet(ns,'open');else if(dy>30){if(open)sheet(ns,'half');else{sheet(ns,'');deselect()}}return}
  if(Math.abs(dy)<8){sheet(el,open?'':'open');return}
  if(dy<-30)sheet(el,'open');else if(dy>30)sheet(el,'')})}
dragSheet(nsh,ns);dragSheet(fsh,fs);
fb.onclick=()=>{fs.classList.contains('open')?sheet(fs,''):sheet(fs,'open')};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function select(n){sel=n;flatAll=false;if(!VN.has(n))recompute();spin={y:0,p:0};lastAct=performance.now();tab='map';render();sheet(ns,ns.classList.contains('open')?'open':'half');
 flyTo({cx:n.x,cy:n.y,cz:n.z,px:0,py:-H*.24,k:Math.max(cam.k,1.6)})}
function deselect(){sel=null;sheet(ns,'');if(hideOrph)recompute()}
function wrap(t,m){if(t.length<=m)return [t];let c=-1,best=1e9;for(let i=2;i<t.length-1;i++)if(' ·/()'.includes(t[i])&&Math.abs(i-t.length/2)<best){best=Math.abs(i-t.length/2);c=i}
 if(c<0||c>m+2)c=m;const a=t.slice(0,c+(t[c]===' '?0:(' ·/'.includes(t[c])?1:0))).trim(),b=t.slice(a.length).trim();return [a,b.length>m+2?b.slice(0,m+1)+'…':b]}
function flat(n){const E=L.filter(lvis),rk=l=>'ABCD'.indexOf(l.level)*10-Math.abs(l.r||0);
 const uq=a=>[...new Map(a.map(x=>[x.name,x])).values()];
 const inE=E.filter(l=>l.b===n&&l.a!==n).sort((x,y)=>rk(x)-rk(y)),outE=E.filter(l=>l.a===n&&l.b!==n).sort((x,y)=>rk(x)-rk(y));
 const C1=uq(inE.map(l=>l.a)),E1=uq(outE.map(l=>l.b)),cap=flatAll?99:8,c1=C1.slice(0,cap),e1=E1.slice(0,cap),more=C1.length+E1.length-c1.length-e1.length;let cols,links;
 if(hop===1){cols=[c1,[n],e1];links=inE.concat(outE)}
 else{const s1=new Set(c1),t1=new Set(e1);/*capped*/const i2=E.filter(l=>s1.has(l.b)&&l.a!==n&&!s1.has(l.a)).sort((x,y)=>rk(x)-rk(y)),o2=E.filter(l=>t1.has(l.a)&&l.b!==n&&!t1.has(l.b)).sort((x,y)=>rk(x)-rk(y));
  cols=[uq(i2.map(l=>l.a)).slice(0,flatAll?40:10),c1,[n],e1,uq(o2.map(l=>l.b)).slice(0,flatAll?40:10)];links=i2.concat(inE,outE,o2)}
 const nc=cols.length,bw=hop===1?Math.max(92,Math.floor((Math.min(innerWidth,520)-40-2*28)/3)):92,gap=hop===1?28:22,rh=42,bh=34;
 const Wd=nc*bw+(nc-1)*gap+12,mx=Math.max(1,...cols.map(c=>c.length)),Hd=mx*rh+12,pos=cols.map(()=>new Map());
 cols.forEach((c,i)=>{const off=(Hd-c.length*rh)/2;c.forEach((x,j)=>pos[i].set(x,[6+i*(bw+gap),off+j*rh+(rh-bh)/2]))});
 let sv='';const mid=Math.floor(nc/2),badge=[];
 for(let i=0;i<nc-1;i++)links.forEach(l=>{const A=pos[i].get(l.a),B=pos[i+1].get(l.b);if(!A||!B)return;const x1=A[0]+bw,y1=A[1]+bh/2,x2=B[0],y2=B[1]+bh/2,cx=(x1+x2)/2,col=GC[l.level];
  const on=(i===mid-1||i===mid);sv+=`<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2-4},${y2}" fill="none" stroke="${col}" stroke-opacity="${on?.85:.45}" stroke-width="${l.level==='A'?2.2:l.level==='B'?1.6:1.1}" ${l.level==='D'?'stroke-dasharray="4 3"':''} marker-end="url(#ar${l.level})"/>`;
  if(on)badge.push([i===mid-1?x1:x2,i===mid-1?y1:y2,col,l.sign])});
 badge.forEach(([x,y,col,sg])=>sv+=`<g><circle cx="${x}" cy="${y}" r="7.5" fill="#262626" stroke="${col}" stroke-width="1.2"/><text x="${x}" y="${y+3.6}" font-size="11" fill="${col}" text-anchor="middle" font-weight="700">${esc(sg)}</text></g>`);
 const bdg=badge.splice(0);cols.forEach((c,i)=>c.forEach(x=>{const [X,Y]=pos[i].get(x),me=x===n,ls=wrap(x.name,hop===1&&bw>100?Math.floor(bw/12):7),col=CC[x.cat];
  sv+=`<g class="bx" onclick="${me?'':`select(BY['${esc(x.name).replace(/'/g,"\\'")}'])`}"><rect x="${X}" y="${Y}" width="${bw}" height="${bh}" rx="8" fill="${me?col:col+'2e'}" stroke="${col}" stroke-width="${me?0:1.2}"/>`+
  ls.map((t,k)=>`<text x="${X+bw/2}" y="${Y+bh/2+(ls.length===1?4:k===0?-2:10)}" font-size="${me?12:11}" font-weight="${me?700:400}" fill="${me?'#111':'#e6e6e6'}" text-anchor="middle">${esc(t)}</text>`).join('')+`</g>`}));
 bdg.forEach(([x,y,col,sg])=>sv+=`<g><circle cx="${x}" cy="${y}" r="7.5" fill="#262626" stroke="${col}" stroke-width="1.2"/><text x="${x}" y="${y+3.6}" font-size="11" fill="${col}" text-anchor="middle" font-weight="700">${esc(sg)}</text></g>`);
 const mk=Object.entries(GC).map(([k,c])=>`<marker id="ar${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8z" fill="${c}"/></marker>`).join('');
 const hd=hop===1?['원인','',' 결과']:['2단계 원인','원인','','결과','2단계 결과'];
 return `<div class="flh"><span>← ${hd[0]} ${C1.length}</span><span>${hop}단계 · 표시 필터 적용</span><span>${hd[nc-1].trim()} ${E1.length} →</span></div>`+
  (c1.length+e1.length?`<div class="fl"><svg width="${hop===1?'100%':Wd}" ${hop===1?`style="min-width:${Wd}px"`:''} height="${Hd}" viewBox="0 0 ${Wd} ${Hd}" xmlns="http://www.w3.org/2000/svg"><defs>${mk}</defs>${sv}</svg></div>`:'<p class="sub">표시 중인 연결 없음(☰에서 등급·범주를 켜 보세요)</p>')+
  (more>0||flatAll?`<button class="chip" style="margin-top:6px" onclick="flatAll=!flatAll;render()">${flatAll?'핵심만 보기 (등급순 8개)':`나머지 ${more}개 더 보기`}</button>`:'')+
  `<p class="sub">칸을 누르면 그 노드로 이동 · 선 색 = 등급 · 원 안 기호 = 방향(+ 같이 / − 반대)</p>`}
function render(){const n=sel;if(!n)return;
 const inn=L.filter(l=>l.b===n),out=L.filter(l=>l.a===n),cr=CR.filter(l=>l.a===n||l.b===n);
 nt.innerHTML=`<span class="dot" style="background:${CC[n.cat]}"></span>${esc(n.name)}`;
 nsub.textContent=`${CN[n.cat]} · 원인 ${inn.length} · 결과 ${out.length} · 상관 ${cr.length} · 강조 ${hop}단계`;
 const ord=a=>a.slice().sort((x,y)=>x.level.localeCompare(y.level)||(Math.abs(y.r||0)-Math.abs(x.r||0)));
 const jn=o=>esc(o.name).replace(/'/g,"\\'");
 const item=(l,other,dir)=>`<div class="it" onclick="this.classList.toggle('x')"><div class="r1"><span class="g" style="background:${GC[l.level]}33;color:${l.level==='C'?'#bbb':GC[l.level]}">${l.level}</span><span class="sg">${esc(l.sign)}</span><span class="nm">${dir} ${esc(other.name)}</span><a class="go" onclick="event.stopPropagation();select(BY['${jn(other)}'])">이동 ›</a></div>
  <div class="meta">${l.id}${l.r!=null?` · r=${l.r}`:''}${l.status&&l.status!=='open'?' · '+l.status:''}${lvis(l)?'':' · 숨김'}</div><div class="note">${l.ev?'근거: '+esc(l.ev)+'<br>':''}${esc(l.note||'메모 없음')}</div></div>`;
 const cri=l=>{const o=l.a===n?l.b:l.a;return `<div class="it"><div class="r1"><span class="g" style="background:#3fb6c933;color:#3fb6c9">상관</span><span class="nm">${esc(o.name)}</span><a class="go" onclick="select(BY['${jn(o)}'])">이동 ›</a></div><div class="meta">r=${l.r} · n=${l.n||''} · 인과 아님</div></div>`};
 const T={map:['관계도',flat(n)],in:['← 원인',ord(inn).map(l=>item(l,l.a,'←')).join('')],out:['결과 →',ord(out).map(l=>item(l,l.b,'→')).join('')],cor:['상관',cr.map(cri).join('')]};
 nb.innerHTML=`<div class="tabs">${Object.entries(T).map(([k,v])=>`<button class="${k===tab?'on':''}" onclick="tab='${k}';render()">${v[0]}${k==='map'?'':' '+(k==='in'?inn.length:k==='out'?out.length:cr.length)}</button>`).join('')}<button style="margin-left:auto" onclick="hop=hop===1?2:1;render()">${hop}단계 ⇄</button></div>${T[tab][1]||'<p class="sub">없음</p>'}`;const fl=nb.querySelector('.fl');if(fl&&fl.scrollWidth>fl.clientWidth)fl.scrollLeft=(fl.scrollWidth-fl.clientWidth)/2}
// 필터
function chip(par,txt,on,fn,col){const b=document.createElement('button');b.className='chip'+(on?' on':'');b.textContent=txt;if(col)b.style.boxShadow=`inset 3px 0 0 ${col}`;b.onclick=()=>{fn();b.classList.toggle('on');recompute();if(sel)render()};par.appendChild(b)}
const cnt={};L.forEach(l=>cnt[l.level]=(cnt[l.level]||0)+1);
['A','B','C','D'].forEach(v=>chip(flv,`${v} ${cnt[v]||0}`,true,()=>lvOn.has(v)?lvOn.delete(v):lvOn.add(v),GC[v]));
CK.forEach(k=>chip(fcat,CN[k],true,()=>catOn.has(k)?catOn.delete(k):catOn.add(k),CC[k]));
const thrEl=document.getElementById('thr');thrEl.oninput=()=>{thr=+thrEl.value;thrv.textContent=thr.toFixed(2);recompute();if(sel)render()};
const tg=(id,fn)=>{const b=document.getElementById(id);b.onclick=()=>{fn();b.classList.toggle('on');recompute();if(sel)render()}};
tg('tnr',()=>showNR=!showNR);tg('tcor',()=>showCor=!showCor);tg('tlab',()=>labAll=!labAll);tg('torp',()=>hideOrph=!hideOrph);tg('tspin',()=>autoSpin=!autoSpin);tg('twob',()=>wobble=!wobble);
trel.onclick=()=>{seed();alpha=1;for(let i=0;i<250;i++)tick();fit(true)};
// 검색
const sug=document.getElementById('sug');function closeSug(){sug.style.display='none'}
q.oninput=()=>{const v=q.value.trim().toLowerCase();if(!v){closeSug();return}const m=N.filter(n=>n.name.toLowerCase().includes(v)).slice(0,8);
 sug.innerHTML=m.map(n=>`<div data-n="${esc(n.name)}"><span class="dot" style="display:inline-block;background:${CC[n.cat]};margin-right:8px"></span>${esc(n.name)} <span class="sub">${CN[n.cat]}</span></div>`).join('')||'<div class="sub">없음</div>';sug.style.display='block'};
sug.onclick=e=>{const d=e.target.closest('[data-n]');if(!d)return;const n=BY[d.dataset.n];q.value='';closeSug();q.blur();if(!catOn.has(n.cat)){catOn.add(n.cat);[...fcat.children].forEach((b,i)=>{if(CK[i]===n.cat)b.classList.add('on')})}select(n)};
addEventListener('resize',rs);rs();seed();recompute();for(let i=0;i<350;i++)tick();fit(false);loop();

// 상단 ⟳ 버튼: 설정 시트를 열고 바로 갱신 확인
(function(){const t=document.getElementById('top'),b=document.createElement('button');b.className='fab';b.id='fupd';b.textContent='⟳';b.setAttribute('aria-label','최신 데이터 받기');
 t.insertBefore(b,document.getElementById('fb'));b.onclick=()=>{sheet(fs,'open');document.getElementById('dupd').click()}})();
// 데이터 갱신(버튼을 누를 때만 graph.json 을 새로 받음)
(function(){const m=D.meta||{},el=document.getElementById('dver');
 el.innerHTML=`기준 <b>${m.generated||'?'}</b> · 버전 ${m.version||'?'}<br>노드 ${m.nodes||N.length} · 인과 ${m.edges||L.length} (A ${(m.levels||{}).A||0} / B ${(m.levels||{}).B||0} / C ${(m.levels||{}).C||0} / D ${(m.levels||{}).D||0})`;
 const b=document.getElementById('dupd'),msg=document.getElementById('dmsg');
 b.onclick=async()=>{b.disabled=true;msg.textContent='확인 중…';
  try{const r=await fetch('graph.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const x=await r.json();
   if(x.meta&&m.version===x.meta.version){msg.textContent=`이미 최신입니다 (${x.meta.generated})`;b.disabled=false;return}
   localStorage.setItem('cg_data',JSON.stringify(x));msg.textContent=`새 데이터 ${x.meta?x.meta.generated:''} 적용 중…`;setTimeout(()=>location.reload(),400)}
  catch(e){msg.textContent='받기 실패: '+e.message+' (인터넷 연결 확인)';b.disabled=false}}})();
