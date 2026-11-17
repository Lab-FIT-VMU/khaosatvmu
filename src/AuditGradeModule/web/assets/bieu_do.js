/* Thư viện biểu đồ SVG dùng chung (lấy từ mockup đã duyệt GATE 1).
   Tooltip qua thuộc tính data-tip; cỡ chữ tự hiệu chỉnh theo bề rộng thật (fitCharts). */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length/2)]:0};
const vi=(v,d=1)=>Number(v).toLocaleString('vi',{minimumFractionDigits:d,maximumFractionDigits:d});
const viInt=v=>Number(v).toLocaleString('vi');
let CW=1000;
function layout(){const pad=innerWidth<=640?16:24;CW=$('#content').clientWidth-2*pad}
const cardIn=()=>CW-(innerWidth<=640?32:48);
const wide=()=>Math.max(300,Math.round(cardIn()));
// trừ thêm phần khung viền + đệm của ô biểu đồ trong lưới 2 cột (.card .grid.g-2>div)
const half=()=>innerWidth>1023?Math.round((CW-16)/2-58):wide()-34;
const trunc=(t,px,cw=9)=>t.length*cw>px?t.slice(0,Math.max(3,Math.floor(px/cw)-1))+'…':t;

const svg=(w,h,inner,label)=>`<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${inner}</svg>`;
const buocTron=v=>{const e=Math.pow(10,Math.floor(Math.log10(v))),f=v/e;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e};
// số chữ số lẻ vừa đủ để ghi đúng một bước trục (0,025 cần 3 chữ số, không làm tròn thành 0,03)
const soLeBuoc=b=>{let d=0;while(d<6&&Math.abs(b*Math.pow(10,d)-Math.round(b*Math.pow(10,d)))>1e-7)d++;return d};
/* seg: nhãn trên từng đoạn nối [{txt, manh}] (đoạn i nối điểm i và i+1); marks: điểm được đánh dấu [true/false].
   fmt(v,d): định dạng với d chữ số lẻ; nd: số chữ số lẻ thường dùng của nhãn. Vạch trục luôn là số tròn, không nhỏ hơn đơn vị của nhãn,
   để chênh lệch nhỏ hơn đơn vị đó không bị phóng đại. Hai giá trị khác nhau mà ghi ra như nhau thì nhãn thêm tối đa 2 chữ số lẻ. */
function lineChart(vals,{w=half(),h=260,fmt=v=>v,nd=1,label='',color='var(--b-4)',name='',labels=[],labelsFull=[],seg=null,marks=null,markTxt='',tips=null}={}){
  const lo=Math.min(...vals),hi=Math.max(...vals),bt=Math.max(buocTron((hi-lo||Math.abs(hi)*0.1||0.1)/2),Math.pow(10,-nd));
  let mn=Math.floor(lo/bt+1e-9)*bt,mx=Math.ceil(hi/bt-1e-9)*bt;
  if(mx-mn<bt/2){mn-=bt;mx+=bt}
  if(lo>=0&&mn<0)mn=0;
  let dv=nd;while(dv<nd+2&&vals.some(a=>vals.some(b=>a!==b&&fmt(a,dv)===fmt(b,dv))))dv++;
  const p={l:72,r:52,t:30,b:40},dt=soLeBuoc(bt),nv=Math.round((mx-mn)/bt);
  const ip=40,x=i=>vals.length<2?(p.l+w-p.r)/2:p.l+ip+i*(w-p.l-p.r-2*ip)/(vals.length-1),y=v=>h-p.b-(v-mn)/(mx-mn||1)*(h-p.t-p.b);
  let g='';for(let i=0;i<=nv;i++){const v=mn+i*bt;g+=`<line class="grid" x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${p.l-8}" y="${y(v)+5}" text-anchor="end">${fmt(v,dt)}</text>`}
  g+=`<polyline fill="none" stroke="${color}" stroke-width="3" points="${vals.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>`;
  const halo='paint-order:stroke;stroke:#fff;stroke-width:5px';
  if(seg)seg.forEach((s,i)=>{if(!s||i+1>=vals.length)return;const xm=(x(i)+x(i+1))/2+(vals[i+1]<vals[i]?26:vals[i+1]>vals[i]?-26:0),ym=(y(vals[i])+y(vals[i+1]))/2;   // lệch sang phía trên đường nối, không đè lên đường
    g+=`<text x="${xm}" y="${ym-12}" text-anchor="middle" class="${s.manh?'t-b':'t-sm'}" style="${halo};fill:${s.manh?'var(--brand-900)':'var(--text-2)'}">${esc(s.txt)}</text>`});
  vals.forEach((v,i)=>{const d=i?v-vals[i-1]:null,lb=labels[i]||'',lf=labelsFull[i]||lb,mk=marks&&marks[i];
    const tip=tips&&tips[i]?tips[i]:`${name}\n${lf}: ${fmt(v,dv)}${d===null?'':`\nSo với kỳ trước: ${d>0?'tăng':'giảm'} ${fmt(Math.abs(d),dv)}`}`;
    g+=`<circle cx="${x(i)}" cy="${y(v)}" r="${mk?10:7}" fill="${mk?'var(--b-5)':'#fff'}" stroke="${mk?'#fff':color}" stroke-width="3" data-tip="${esc(tip)}"/>${mk?`<circle cx="${x(i)}" cy="${y(v)}" r="14" fill="none" stroke="var(--b-5)" stroke-width="2"/>`:''}<text x="${x(i)}" y="${y(v)-(mk?20:14)}" text-anchor="middle" class="t-b" style="${halo}">${fmt(v,dv)}</text>${mk&&markTxt?`<text x="${x(i)}" y="${y(v)+34}" text-anchor="middle" class="t-sm t-b" style="${halo};fill:var(--b-5)">${esc(markTxt)}</text>`:''}<text x="${x(i)}" y="${h-10}" text-anchor="middle">${lb}</text>`});
  return svg(w,h,g,label)}
function scatter(pts,{w=560,h=400,label='',xl='',yl='',showLbl=false,dense=false,refX=null,refY=null,refTen='',qLbl=null}={}){
  const coRef=refX!=null&&refY!=null,cx=coRef?refX:median(pts.map(d=>d.x)),cy=coRef?refY:median(pts.map(d=>d.y));
  const rx=Math.max(...pts.map(d=>d.x),refX??0,0.05)*1.04,ry=Math.max(...pts.map(d=>d.y),refY??0,0.05)*1.04,sx=buocTron(rx/4),sy=buocTron(ry/4);
  const p={l:92,r:20,t:20,b:76},mx=Math.ceil(rx/sx)*sx,my=Math.ceil(ry/sy)*sy,nd=Math.max(1,soLeBuoc(sx)),ndy=Math.max(1,soLeBuoc(sy));
  const x=v=>p.l+v/mx*(w-p.l-p.r),y=v=>h-p.b-v/my*(h-p.t-p.b);
  let g='';
  for(let vx=0;vx<=mx+1e-9;vx+=sx){g+=`<line class="grid" x1="${x(vx)}" x2="${x(vx)}" y1="${p.t}" y2="${h-p.b}"/>`;if(!(coRef&&Math.abs(x(vx)-x(cx))<46))g+=`<text x="${x(vx)}" y="${h-p.b+24}" text-anchor="middle">${vi(vx,nd)}</text>`}
  for(let vy=0;vy<=my+1e-9;vy+=sy){g+=`<line class="grid" x1="${p.l}" x2="${w-p.r}" y1="${y(vy)}" y2="${y(vy)}"/>`;if(!(coRef&&Math.abs(y(vy)-y(cy))<20))g+=`<text x="${p.l-10}" y="${y(vy)+6}" text-anchor="end">${vi(vy,ndy)}</text>`}
  if(coRef)g+=`<text x="${x(cx)}" y="${h-p.b+24}" text-anchor="middle" class="t-b" style="fill:var(--ref-line)">${vi(cx,2)}</text><text x="${p.l-10}" y="${y(cy)+6}" text-anchor="end" class="t-b" style="fill:var(--ref-line)">${vi(cy,2)}</text>`;
  g+=`<line x1="${x(cx)}" x2="${x(cx)}" y1="${p.t}" y2="${h-p.b}" stroke="var(--ref-line)" stroke-width="2.5" stroke-dasharray="9 5"/><line x1="${p.l}" x2="${w-p.r}" y1="${y(cy)}" y2="${y(cy)}" stroke="var(--ref-line)" stroke-width="2.5" stroke-dasharray="9 5"/>`;
  const ge=coRef?((a,b)=>a>=b):((a,b)=>a>b),sub=pts.some(d=>!d.hi),q=[0,0,0,0];(sub?pts.filter(d=>d.hi):pts).forEach(d=>{q[(ge(d.x,cx)?1:0)+(ge(d.y,cy)?2:0)]++});
  const qt=(xx,yy,anc,n,t)=>`<text x="${xx}" y="${yy}" text-anchor="${anc}" class="t-b" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${n} học phần</text><text x="${xx}" y="${yy+20}" text-anchor="${anc}" class="t-sm" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${t}</text>`;
  const ord=[...pts].sort((a,b)=>(a.hi?1:0)-(b.hi?1:0));
  const top=new Set([...pts].filter(d=>d.hi&&d.short).sort((a,b)=>(b.x/mx+b.y/my)-(a.x/mx+a.y/my)).slice(0,6)),placed=[];
  ord.forEach(d=>{g+=`<circle cx="${x(d.x)}" cy="${y(d.y)}" r="${dense?4.5:(d.hi?7:6)}" fill="${d.zero?'#fff':d.col}" fill-opacity="${d.zero?1:dense?(d.hi?(sub?.9:.6):.35):(d.hi?.9:.55)}" stroke="${d.zero?d.col:'#fff'}" stroke-width="${d.zero?1.8:1}" data-tip="${esc(`${d.lbl?d.lbl+'\n':''}Chênh lệch điểm quá trình giữa các lớp: ${vi(d.x,2)}${d.zx?' (không phát hiện chênh lệch)':''}\nChênh lệch điểm thi giữa các lớp: ${vi(d.y,2)}${d.zy?' (không phát hiện chênh lệch)':''}`)}"/>`;
    if(showLbl&&top.has(d)){const lx=x(d.x),ly=y(d.y),left=lx>w*0.6,bx=left?lx-200:lx;
      if(!placed.some(([px,py])=>Math.abs(px-bx)<200&&Math.abs(py-ly)<22)&&ly>p.t+46&&ly<h-p.b-44){placed.push([bx,ly]);g+=`<text x="${left?lx-10:lx+10}" y="${ly+5}" text-anchor="${left?'end':'start'}" class="t-sm t-b" style="paint-order:stroke;stroke:#fff;stroke-width:4px">${esc(trunc(d.short,(left?lx-p.l:w-p.r-lx)-14,8.5))}</text>`}}});
  const sm=w<520,Q=qLbl||[['các lớp tương đối đồng đều','đồng đều'],['chủ yếu chênh lệch điểm quá trình','chênh điểm QT'],['chủ yếu chênh lệch điểm thi','chênh điểm thi'],['các lớp chênh lệch cả hai loại điểm','chênh cả hai']],L=i=>Q[i][sm?1:0];
  g+=qt(w-p.r-8,p.t+20,'end',q[3],L(3))+qt(p.l+10,p.t+20,'start',q[2],L(2))+qt(w-p.r-8,h-p.b-30,'end',q[1],L(1))+qt(p.l+10,h-p.b-30,'start',q[0],L(0));
  g+=`<text x="${(w+p.l)/2}" y="${h-10}" text-anchor="middle" class="t-ax">${xl}</text><text transform="translate(24 ${(h-p.b)/2}) rotate(-90)" text-anchor="middle" class="t-ax">${yl}</text>`;
  return svg(w,h,g,label)}
function barsH(rows,{w=half(),label='',fmt=v=>vi(v)+'%',color='var(--b-4)',lw=220,tip=r=>'',rw=64}={}){
  lw=Math.min(lw,Math.round(w*0.48));const p={l:lw,r:rw,t:6,b:6},bh=42,h=p.t+p.b+rows.length*bh,mx=Math.max(...rows.map(r=>r.v),1)*1.05;
  let g='';rows.forEach((r,i)=>{const yy=p.t+i*bh,ww=r.v/mx*(w-p.l-p.r);g+=`<text x="${p.l-12}" y="${yy+bh/2+6}" text-anchor="end">${trunc(r.lbl,lw-16)}</text><rect x="${p.l}" y="${yy+6}" width="${Math.max(ww,2)}" height="${bh-14}" rx="5" fill="${r.col||color}" data-tip="${esc(tip(r)||`${r.lbl}: ${fmt(r.v)}`)}"/><text x="${p.l+ww+10}" y="${yy+bh/2+6}" class="t-b">${r.txt??fmt(r.v)}</text>`});
  return svg(w,h,g,label)}
/* Biểu đồ "quả tạ": mỗi lớp 1 dòng, chấm xanh = điểm QT TB, chấm mòng két = điểm thi TB */
function dumbbell(rows,{w=1100,label='',avgX,avgY}={}){
  const lo=Math.max(0,Math.floor(Math.min(...rows.map(r=>Math.min(r.x,r.y))))-1);
  const p={l:Math.min(330,w*0.4),r:30,t:40,b:64},rh=42,h=p.t+p.b+rows.length*rh,x=v=>p.l+(v-lo)/(10-lo)*(w-p.l-p.r);
  let g='';rows.forEach((r,i)=>{if(i%2===0)g+=`<rect x="0" y="${p.t+rh*i}" width="${w}" height="${rh}" fill="#F4F7FC"/>`});
  for(let v=lo;v<=10;v+=1){g+=`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${p.t-6}" y2="${h-p.b}"/><text x="${x(v)}" y="${h-p.b+24}" text-anchor="middle">${v}</text>`}
  // Hai đường trung bình chung: đứt dài = điểm quá trình, đứt ngắn = điểm thi; nhãn đặt về hai phía để không chồng nhau.
  const sm=w<640,xQ=x(avgX),xT=x(avgY),qPhai=xQ>=xT;
  const nhan=(xx,phai,mau,txt)=>`<text x="${phai?xx+6:xx-6}" y="${p.t-16}" text-anchor="${phai?'start':'end'}" class="t-sm t-b" style="fill:${mau};paint-order:stroke;stroke:#fff;stroke-width:4px">${txt}</text>`;
  g+=`<line x1="${xQ}" x2="${xQ}" y1="${p.t-10}" y2="${h-p.b}" stroke="var(--score-qt)" stroke-width="2" stroke-dasharray="8 5"/>`;
  g+=`<line x1="${xT}" x2="${xT}" y1="${p.t-10}" y2="${h-p.b}" stroke="var(--score-thi)" stroke-width="2" stroke-dasharray="2 4"/>`;
  g+=nhan(xQ,qPhai&&xQ<w-150||!qPhai&&xQ<p.l+150,'var(--score-qt)',`${sm?'TB QT':'TB điểm quá trình'}: ${vi(avgX)}`);
  g+=nhan(xT,!qPhai&&xT<w-150||qPhai&&xT<p.l+150,'var(--score-thi)',`${sm?'TB thi':'TB điểm thi'}: ${vi(avgY)}`);
  rows.forEach((r,i)=>{const yy=p.t+rh*i+rh/2;
    g+=`<text x="${p.l-14}" y="${yy+6}" text-anchor="end">${esc(trunc(r.lbl,p.l-22,8.6))}</text><line x1="${x(r.y)}" x2="${x(r.x)}" y1="${yy}" y2="${yy}" stroke="#AEB8C8" stroke-width="5" stroke-linecap="round"/>`;
    const t=`${r.full}\nĐiểm quá trình TB: ${vi(r.x)}\nĐiểm thi TB: ${vi(r.y)}\nChênh lệch: ${r.x-r.y>0?'+':''}${vi(r.x-r.y)} điểm`;
    g+=`<rect x="${x(r.y)-8}" y="${yy-8}" width="16" height="16" rx="2" fill="var(--score-thi)" data-tip="${esc(t)}"/><circle cx="${x(r.x)}" cy="${yy}" r="9" fill="var(--score-qt)" data-tip="${esc(t)}"/>`});
  g+=`<text x="${(w+p.l)/2}" y="${h-10}" text-anchor="middle" class="t-ax">Điểm (thang 10)</text>`;
  return svg(w,h,g,label)+`<div class="legend"><span><i class="dot" style="background:var(--score-qt)"></i>Hình tròn: điểm quá trình trung bình của lớp</span><span><i style="background:var(--score-thi)"></i>Hình vuông: điểm thi trung bình của lớp</span><span>Đường đứt dài / đứt ngắn: trung bình chung của học phần (điểm quá trình / điểm thi)${lo>0?` · Trục điểm bắt đầu từ ${lo} để các chấm tách rõ`:''}</span></div>`}
function forest(rows,{w=1100,label=''}={}){
  const p={l:Math.min(330,w*0.4),r:24,t:10,b:64},rh=42,h=p.t+p.b+rows.length*rh,x=v=>p.l+(v+2)/4*(w-p.l-p.r);
  let g='';[-2,-1.5,-1,-0.5,0,0.5,1,1.5,2].forEach(v=>{g+=`<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${p.t}" y2="${h-p.b}"/>`;if(v%1===0)g+=`<text x="${x(v)}" y="${h-p.b+24}" text-anchor="middle">${v>0?'+':''}${v}</text>`});
  g+=`<line x1="${x(0)}" x2="${x(0)}" y1="${p.t}" y2="${h-p.b}" stroke="var(--text)" stroke-width="2"/>`;
  rows.forEach((r,i)=>{const yy=p.t+rh*i+rh/2,col=r.sig?(r.v>0?'var(--dir-up)':'var(--dir-down)'):'#7C8696';
    const t=`${r.full}\nĐiểm quá trình ${r.v>0?'cao hơn':'thấp hơn'} kỳ vọng ${vi(Math.abs(r.v),2)} điểm\nKhoảng tin cậy 95%: ${vi(r.lo,2)} đến ${vi(r.hi,2)}\n${r.sig?'Khác biệt có ý nghĩa thống kê':'Khác biệt chưa có ý nghĩa thống kê'}`;
    g+=`<text x="${p.l-14}" y="${yy+6}" text-anchor="end">${esc(trunc(r.lbl,p.l-22,8.6))}</text><line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${yy}" y2="${yy}" stroke="${col}" stroke-width="4" stroke-linecap="round" data-tip="${esc(t)}"/><rect x="${x(r.v)-7}" y="${yy-7}" width="14" height="14" fill="${col}" transform="rotate(45 ${x(r.v)} ${yy})" data-tip="${esc(t)}"/>`});
  g+=`<text x="${w/2}" y="${h-6}" text-anchor="middle" class="t-ax">${innerWidth<640?"Chênh so với kỳ vọng":"Chênh so với mức kỳ vọng (điểm)"}</text>`;
  return svg(w,h,g,label)+`<div class="legend"><span><i style="background:var(--dir-up)"></i>Cao hơn kỳ vọng, có ý nghĩa thống kê</span><span><i style="background:var(--dir-down)"></i>Thấp hơn kỳ vọng, có ý nghĩa thống kê</span><span><i style="background:#7C8696"></i>Khác biệt chưa có ý nghĩa thống kê</span></div>`}

function fitCharts(){document.querySelectorAll('svg.chart').forEach(s=>{const w=s.clientWidth;if(w)s.style.setProperty('--k',Math.min(2,Math.max(.95,s.viewBox.baseVal.width/w)).toFixed(3))})}
