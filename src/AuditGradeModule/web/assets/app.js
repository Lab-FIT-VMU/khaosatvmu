/* Ứng dụng phân tích kết quả học phần – đọc dữ liệu từ data/*.json (do xu_ly/kho.py xuất).
   Chạy bằng `python chay.py` thì có thêm nạp học kỳ và tham số (qua /api); trên GitHub Pages chỉ xem. */

/* ================= TẬP CÂU MẪU (data/van_ban.json, xuất từ Data/Bo luat/van_ban_giao_dien.json) =================
   Mọi tiêu đề, mô tả, khung giải thích và chú thích của báo cáo lấy từ tập câu mẫu; trang chỉ điền số liệu vào chỗ trống. */
let VB={};
const _lay=k=>k.split('.').reduce((a,p)=>a==null?a:a[p],VB);
// V: câu mẫu dạng HTML – **x** chữ đậm, !!x!! số nổi bật; VT: câu mẫu dạng chữ thường (chú thích di chuột, nhãn trong biểu đồ).
const _dien=(t,o)=>t.replace(/\{(\w+)\}/g,(m,n)=>o[n]!==undefined&&o[n]!==null?o[n]:m);
function V(k,o={}){const t=_lay(k);if(typeof t!=='string'){console.warn('Thiếu câu mẫu:',k);return `[${k}]`}
  return _dien(t.replace(/!!(.+?)!!/g,'<b>$1</b>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'),o)}
function VT(k,o={}){const t=_lay(k);if(typeof t!=='string'){console.warn('Thiếu câu mẫu:',k);return `[${k}]`}
  return _dien(t.replace(/!!(.+?)!!/g,'$1').replace(/\*\*(.+?)\*\*/g,'$1'),o)}
const VA=k=>_lay(k)||[];                                   // mảng/đối tượng trong tập câu mẫu
const VMd=(t,o={})=>_dien(t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'),o);   // dùng cho phần tử của mảng câu mẫu

/* ================= TỪ ĐIỂN THUẬT NGỮ (gán sau khi đọc tập câu mẫu) ================= */
let IND={},FLAG={},SIGN={},REPEAT=['',''],KHOA_TEN={},TS_TEN={},TS_NHOM={},AX_OPTS=[],I9_LOAI={},GP_TEN={};
const FL_CODES=['H1','H2','H3','H4','H5','H6'];
const SIGN_CHIEU={D1:'up',D2:'down',D3:'',D4:'',D5:'',D6:'up good',D7:'down'};   // lớp CSS, không phải câu chữ
function ganTuDien(){const t=VB.tu_dien||{};
  IND=t.chi_so||{};FLAG=t.diem_luu_y||{};REPEAT=t.lap_lai||['',''];KHOA_TEN=t.khoa||{};TS_TEN=t.tham_so||{};TS_NHOM=t.nhom_tham_so||{};GP_TEN=t.nhan_ngan_lien_quan||{};
  SIGN=Object.fromEntries(Object.entries(t.dac_diem||{}).map(([c,[n,d]])=>[c,[n,SIGN_CHIEU[c]||'',d]]));
  AX_OPTS=Object.entries(t.thang_do||{});
  I9_LOAI={x:[(t.loai_diem||{}).x,'H1'],y:[(t.loai_diem||{}).y,'H2']}}

const fl=c=>`<span class="flag" data-tip="${esc(FLAG[c][1])}">${FLAG[c][0]}</span>`;
const sg=c=>`<span class="flag ${SIGN[c][1]}" data-tip="${esc(SIGN[c][2])}">${SIGN[c][0]}</span>`;
const OD_CODES=['O1','O2','O3','O4','O5','O6'];
const odTen=c=>(D.lk.ten_od||{})[c]||[c,'',''];
const odMoTa=c=>odTen(c)[1].replace('{d3_r_hp}',vi(TS('d3_r_hp')??0.4,2));
const od=c=>`<span class="flag ok" data-tip="${esc(odMoTa(c))}">${odTen(c)[0]}</span>`;
const cdl=c=>`<span class="flag" data-tip="${esc((D.lk.chua_du_du_lieu||{}).mo_ta||'')}">${(D.lk.chua_du_du_lieu||{})[c]||c}</span>`;
const odList=(a,b)=>(a&&a.length)||(b&&b.length)?(a||[]).map(od).join('')+(b||[]).map(cdl).join(''):`<span style="color:var(--text-3)">${V('chung.chua_xac_dinh_on_dinh')}</span>`;
// Đặc điểm lặp lại: đủ số kỳ và chiếm đủ tỷ lệ trong số kỳ giảng viên dạy học phần (tính trong các kỳ đang xét).
// Bảng hai chiều: mỗi dòng là một cặp điểm lưu ý H – trạng thái ổn định O ngược với nó, đếm trên cùng tập học phần.
const haiChieu=(hps,pham_vi)=>{const n=hps.length;if(!n)return '';
  const o=(k,c)=>hps.filter(h=>(h[k]||[]).includes(c)).length;
  // Tỷ lệ tính trên các học phần so sánh được của từng dòng, không tính trên toàn bộ học phần.
  const rows=OD_CODES.map((c,j)=>{const H=FL_CODES[j],a=o('co',H),b=o('od',c),d=o('cdl',c),m=a+b+d,ph=x=>`${viInt(x)} <span class="hc-pct">(${pct(m?x/m:0,0)}%)</span>`;return `<tr><td>${fl(H)}</td><td class="r num">${ph(a)}</td><td>${od(c)}</td><td class="r num">${ph(b)}</td><td class="r num" style="color:var(--text-2)">${ph(d)}</td><td class="r num" style="color:var(--text-2)">${viInt(n-m)}</td></tr>`}).join('');
  const C=VA('hai_chieu.cot');
  return `<section class="card"><div class="card-head"><h2>${V('hai_chieu.tieu_de')}</h2><div class="sub">${V('hai_chieu.mo_ta',{pham_vi,n:viInt(n)})}</div></div>
    ${explainT('hai_chieu.giai_thich',{r_thap:vi(TS('h3_r_hp')??0.3,2),r_cao:vi(TS('d3_r_hp')??0.4,2)})}
    <div class="table-wrap" style="max-height:none"><table class="hai-chieu"><thead><tr>${th(C[0],{sort:false})}${th(C[1],{cls:'r w-num',sort:false})}${th(C[2],{sort:false})}${th(C[3],{cls:'r w-num',sort:false})}${th(C[4],{cls:'r w-num',sort:false})}${th(C[5],{cls:'r w-num',sort:false})}</tr></thead><tbody>${rows}</tbody></table></div></section>`};
const flagList=a=>a&&a.length?a.map(fl).join(''):`<span style="color:var(--text-3)">${V('chung.khong_co_diem_luu_y')}</span>`;
/* Khung “Biểu đồ/Bảng này cho biết gì?”: khóa trỏ tới nhóm {y_nghia, dung_de, cach_doc} trong tập câu mẫu.
   Có thể thay từng phần bằng câu mẫu khác qua o.y_nghia / o.dung_de / o.cach_doc (đã điền sẵn). */
const _khung=(tieu,k,o={})=>{const g=_lay(k)||{},p=n=>o['_'+n]!==undefined?o['_'+n]:(g[n]?V(k+'.'+n,o):'');
  const a=p('y_nghia'),b=p('dung_de'),c=p('cach_doc');
  return `<details class="explain"><summary>${V(tieu)}</summary><dl>${a?`<dt>${V('chung.y_nghia')}</dt><dd>${a}</dd>`:''}${b?`<dt>${V('chung.dung_de')}</dt><dd>${b}</dd>`:''}${c?`<dt>${V('chung.cach_doc')}</dt><dd>${c}</dd>`:''}</dl></details>`};
const explain=(k,o)=>_khung('chung.giai_thich_bieu_do',k,o);
const explainT=(k,o)=>_khung('chung.giai_thich_bang',k,o);
const pct=(v,d=1)=>v==null?'—':vi(v*100,d);
const sgn=(v,d=2)=>v==null?'—':(v>0?'+':'')+vi(v,d);

/* ================= DỮ LIỆU ================= */
const D={ds:[],dm:{khoa:{},bm:{},hp:{}},lk:null,ts:null,ky:{},local:false};
const st={ky:null,khoa:null,bm:null,hp:null,f:{}};
async function getJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw new Error(u+': '+r.status);return r.json()}
async function taiChung(){
  const [ds,dm,lk,ts,vb]=await Promise.all(['danh_sach_ky','danh_muc','lien_ky','tham_so','van_ban'].map(n=>getJSON(`data/${n}.json`).catch(()=>null)));
  VB=vb||{};ganTuDien();
  D.ds=ds||[];D.dm=dm||{khoa:{},bm:{},hp:{}};D.lk=lk||{ky:[],xu_huong:{},co_hp:{},de_thi:{},gv_hp:[]};D.ts=ts;D.ky={};
}
async function taiKy(ky){if(!D.ky[ky])D.ky[ky]=await getJSON(`data/ky/${ky}.json`);return D.ky[ky]}
const TS=k=>{if(!D.ts)return null;for(const[n,g]of Object.entries(D.ts.ts)){if(!n.startsWith('_')&&g[k])return g[k].gia_tri}return null};
const KYS=()=>D.ds.map(x=>x.ky);
const kyInfo=k=>D.ds.find(x=>x.ky===k)||{nhan:k,nhan_ngan:k};
const tenKhoa=m=>KHOA_TEN[m]||D.dm.khoa[m]||('Khoa '+m);
const tenBm=m=>(D.dm.bm[m]||{}).ten||('Bộ môn '+m);
const khoaList=()=>Object.keys({...D.dm.khoa,...Object.fromEntries(Object.values(D.dm.bm).map(b=>[b.khoa,1]))}).filter(m=>Object.values(D.dm.bm).some(b=>b.khoa===m)).sort();
const bmList=k=>Object.entries(D.dm.bm).filter(([,b])=>b.khoa===k).map(([m])=>m).sort();
const kyTruoc=k=>{const i=KYS().indexOf(k);return i>0?KYS()[i-1]:null};
const kyDen=k=>KYS().slice(0,KYS().indexOf(k)+1);
const sig=q=>q!=null&&q<(TS('fdr_q')??0.05);

/* ================= ĐIỀU KHIỂN CHUNG ================= */
function store(k,v){try{if(v!==undefined)localStorage.setItem(k,v);return localStorage.getItem(k)}catch(e){return null}}
function fillSelects(){
  $('#selKy').innerHTML=KYS().map(k=>`<option value="${k}" ${k===st.ky?'selected':''}>${kyInfo(k).nhan}</option>`).join('')||'<option>Chưa có học kỳ</option>';
  const ks=khoaList();if(!ks.includes(st.khoa))st.khoa=ks.includes('17')?'17':ks[0];
  $('#selKhoa').innerHTML=ks.map(k=>`<option value="${k}" ${k===st.khoa?'selected':''}>${tenKhoa(k)}</option>`).join('');
  const bs=st.khoa?bmList(st.khoa):[];if(!bs.includes(st.bm))st.bm=bs[0];
  $('#selBm').innerHTML=bs.map(b=>`<option value="${b}" ${b===st.bm?'selected':''}>${tenBm(b)}</option>`).join('');
}
$('#selKy').onchange=e=>{st.ky=e.target.value;store('ky',st.ky);render()};
$('#selKhoa').onchange=e=>{st.khoa=e.target.value;st.hp=null;fillSelects();render()};
$('#selBm').onchange=e=>{st.bm=e.target.value;st.hp=null;render()};
$('#menuBtn').onclick=()=>{const o=$('#side').classList.toggle('open');$('#menuBtn').setAttribute('aria-expanded',o)};
function setMini(m){$('#app').classList.toggle('mini',m);$('#collapseBtn').setAttribute('aria-expanded',!m);$('#collapseBtn').querySelector('span').textContent=m?'Mở rộng':'Thu gọn menu';document.querySelectorAll('[data-tipnav]').forEach(a=>m?a.setAttribute('data-tip',a.dataset.tipnav):a.removeAttribute('data-tip'));store('mini',m?'1':'0');if(window.__ready)setTimeout(render,230)}
$('#collapseBtn').onclick=()=>setMini(!$('#app').classList.contains('mini'));
document.addEventListener('click',e=>{if(e.target.closest('.nav a'))$('#side').classList.remove('open')});
const tip=$('#tip');
function placeTip(e){const pad=14,r=tip.getBoundingClientRect();let x=e.clientX+pad,y=e.clientY+pad;if(x+r.width>innerWidth-8)x=e.clientX-r.width-pad;if(y+r.height>innerHeight-8)y=e.clientY-r.height-pad;tip.style.left=x+'px';tip.style.top=y+'px'}
document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(!t){tip.style.display='none';return}tip.textContent=t.dataset.tip;tip.style.display='block';placeTip(e)});
document.addEventListener('mousemove',e=>{if(tip.style.display==='block')placeTip(e)});
document.addEventListener('scroll',()=>{tip.style.display='none'},true);
document.addEventListener('click',e=>{const th=e.target.closest('th[data-sort]');if(!th)return;const tb=th.closest('table').tBodies[0],i=[...th.parentNode.children].indexOf(th),dir=th.dataset.dir==='desc'?'asc':'desc';
  th.parentNode.querySelectorAll('th').forEach(x=>delete x.dataset.dir);th.dataset.dir=dir;
  const val=td=>{const s=(td?.dataset.v??td?.textContent??'').trim();const n=parseFloat(s.replace(/\./g,'').replace(',','.').replace(/[^\d.+-]/g,''));return isNaN(n)?s.toLowerCase():n};
  [...tb.rows].sort((a,b)=>{const A=val(a.cells[i]),B=val(b.cells[i]);if(typeof A!==typeof B)return typeof A==='number'?-1:1;return (A>B?1:A<B?-1:0)*(dir==='asc'?1:-1)}).forEach(r=>tb.appendChild(r))});
const th=(label,{unit='',cls='',sort=true}={})=>`<th class="${cls}" ${sort?'data-sort title="Bấm để sắp xếp"':''}>${label}${sort?'<span class="arrow"></span>':''}${unit?`<span class="unit">${unit}</span>`:''}</th>`;
function toast(msg,ms=4000){const t=$('#toast');t.textContent=msg;t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.display='none',ms)}

const route=()=>(location.hash||'#bgh').slice(1);
const head=(crumb,title,desc,right='')=>`<div class="page-head"><div><div class="crumb">${crumb}</div><h1>${title}</h1><p>${desc}</p></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${right}</div></div>`;
const hpCell=(ten,ma)=>`<span class="hp-name">${esc(ten)}</span><span class="hp-code">Mã học phần ${ma}</span>`;
const sel=(id,label,opts,val)=>`<div class="field"><label for="${id}">${label}</label><select id="${id}" data-f="${id}">${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(val)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const filters=inner=>`<div class="filters"><span class="ftitle"><svg><use href="#i-filter"/></svg>Bộ lọc</span>${inner}</div>`;
const trong=(tieu_de,noi_dung,nut='')=>`<div class="empty"><svg><use href="#i-upload"/></svg><h3>${tieu_de}</h3><p>${noi_dung}</p>${nut}</div>`;
const chuaCoKy=()=>head('Báo cáo','Chưa có dữ liệu','')+`<section class="card">${trong(V('chung.chua_co_ky_tieu_de'),D.local?V('chung.chua_co_ky_tren_may'):V('chung.chua_co_ky_github'),D.local?'<a class="btn btn-primary" href="#nap"><svg><use href="#i-upload"/></svg>Nạp học kỳ đầu tiên</a>':'')}</section>`;
const lopTen=l=>`${l.ten} (${l.nhom})`;

/* ================= BẢN ĐỒ HỌC PHẦN (dùng chung cấp trường và cấp khoa) ================= */
function banDo(hps,{ax='icc',on=()=>true,col=()=>'var(--b-4)',lbl=()=> '',short=()=>'',dense=false,showLbl=false,label=''}){
  const pts=hps.map(h=>{const zx=h.tau_x===0,zy=h.tau_y===0,o=on(h);return {x:ax==='icc'?h.icc_x:h.tau_x,y:ax==='icc'?h.icc_y:h.tau_y,zx,zy,zero:zx||zy,hi:o,col:o?col(h):'#B8C2D3',lbl:lbl(h),short:short(h)}});
  const sm=innerWidth<640,nx=pts.filter(d=>d.zx).length,ny=pts.filter(d=>d.zy).length;
  let opt;
  if(ax==='icc')opt={refX:TS('h1_icc_x'),refY:TS('h2_icc_y'),refTen:VT('ban_do.moc_nguong'),qLbl:VA('ban_do.vung')};
  else{const mx=pts.filter(d=>!d.zx).map(d=>d.x),my=pts.filter(d=>!d.zy).map(d=>d.y);opt={refX:mx.length?median(mx):0,refY:my.length?median(my):0,refTen:VT('ban_do.moc_trung_vi')}}
  const chart=pts.length?scatter(pts,{w:wide(),h:sm?400:500,dense,showLbl,label,...opt,xl:VT(sm?'ban_do.truc_x_ngan':'ban_do.truc_x'),yl:VT(sm?'ban_do.truc_y_ngan':'ban_do.truc_y')}):'';
  const moc=ax==='icc'?V('ban_do.ghi_chu_nguong',{x:vi(opt.refX,2),y:vi(opt.refY,2)}):V('ban_do.ghi_chu_trung_vi');
  const note=`<p class="table-note">${moc} ${V('ban_do.ghi_chu_cham_rong',{nx,ny})}</p>`;
  return {pts,chart,note};
}
/* R4: gộp I9 qua nhiều học phần = trung vị τ̂, ICC trên HP đủ điều kiện so sánh, kèm tỷ lệ HP có H1 (X) / H2 (Y). */
function gopI9(hps,pre){const xs=hps.filter(h=>h.du_dk&&h['tau_'+pre]!=null),co=pre==='x'?'H1':'H2';
  return xs.length?{n:xs.length,tau:median(xs.map(h=>h['tau_'+pre])),icc:median(xs.map(h=>h['icc_'+pre])),tl:xs.filter(h=>h.co.includes(co)).length/xs.length}:null}
const docBanDo=ax=>V(ax==='icc'?'ban_do.cach_doc_nguong':'ban_do.cach_doc_trung_vi');

/* ================= MÀN HÌNH: CẤP BAN GIÁM HIỆU ================= */
const S={};
S.bgh=async()=>{
  if(!st.ky)return chuaCoKy();
  const d=await taiKy(st.ky),kt=kyTruoc(st.ky),dt=kt?await taiKy(kt):null,T=d.tong,Tt=dt?.tong;
  const f=st.f;f.kh=f.kh||'all';f.ax=f.ax||'icc';f.fc=f.fc||'any';f.fpv=f.fpv||'all';
  const nBm=new Set(d.hp.map(h=>h.bm)).size,nKhoa=new Set(d.hp.map(h=>h.khoa)).size;
  const delta=(a,b,dv)=>Tt?V('chung.thay_doi_so_voi',{chieu:V(a>=b?'chung.tang':'chung.giam'),so:viInt(Math.abs(a-b)),don_vi:dv,ky:kyInfo(kt).nhan}):V('chung.ngoai_kho_ky_dau');
  const kys=kyDen(st.ky),xh=kys.map(k=>D.lk.xu_huong[k]||{});
  const TR=[['I1',x=>x.i1*100,(v,d)=>vi(v,d)+'%',1],['I2',x=>x.i2*100,(v,d)=>vi(v,d)+'%',1],['I5',x=>x.i5,(v,d)=>vi(v,d),2],['I6',x=>x.i6,(v,d)=>vi(v,d),2]];
  const hps=d.hp.filter(h=>h.du_dk&&h.tau_x!=null&&h.tau_y!=null);
  const bd=banDo(hps,{ax:f.ax,on:h=>f.kh==='all'||h.khoa===f.kh,dense:true,label:VT('bgh.ban_do.tieu_de')}),pts=bd.pts;
  const kh=[...new Set(d.hp.map(h=>h.khoa))].sort();
  // Tách học phần đủ điều kiện so sánh (từ 2 lớp được thống kê) và chưa đủ (dưới 2 lớp) – điểm lưu ý về chênh lệch giữa các lớp chỉ có ở nhóm đủ điều kiện.
  const coCb=h=>f.fc==='any'?h.co.length>0:h.co.includes(f.fc),sm=innerWidth<640;
  const demCb=xs=>{const dk=xs.filter(h=>h.du_dk),cd=xs.filter(h=>!h.du_dk);return {dk:dk.length,ndk:dk.filter(coCb).length,cd:cd.length,ncd:cd.filter(coCb).length}};
  const flagRows=kh.map(k=>{const xs=d.hp.filter(h=>h.khoa===k),c=demCb(xs),tot=f.fpv==='dk'?c.dk:xs.length,n=f.fpv==='dk'?c.ndk:c.ndk+c.ncd;if(!tot)return null;const v=n/tot*100;
    const tach=VT(f.fpv==='dk'?'bgh.ty_le_co.nhan_thanh_du_dk':'bgh.ty_le_co.nhan_thanh_tat_ca',c);
    return {lbl:tenKhoa(k),v,n,tot,c,txt:sm?vi(v)+'%':`${vi(v)}% · ${tach}`}}).filter(Boolean).sort((a,b)=>b.v-a.v);
  const cT=demCb(d.hp),nT=f.fpv==='dk'?cT.ndk:cT.ndk+cT.ncd,totT=f.fpv==='dk'?cT.dk:d.hp.length;
  const chiDk=['H1','H2','H4'].includes(f.fc);
  f.i9p=f.i9p||'x';f.i9a=f.i9a||'icc';const P=f.i9p,A=f.i9a,[tenDiem,maCo]=I9_LOAI[P];
  const fmtI9=v=>v==null?'—':A==='icc'?vi(v,2):vi(v,2)+' điểm';
  const i9T=gopI9(d.hp,P),i9Tt=dt?gopI9(dt.hp,P):null;
  const i9Rows=kh.map(k=>{const g=gopI9(d.hp.filter(h=>h.khoa===k),P);if(!g)return null;const gt=dt?gopI9(dt.hp.filter(h=>h.khoa===k),P):null,m=g[A],dd=gt?m-gt[A]:null;
    return {lbl:tenKhoa(k),v:m,col:'var(--b-3)',txt:innerWidth<640?`${vi(m,2)} · ${pct(g.tl,0)}%`:VT('bgh.i9.nhan_thanh',{gt:fmtI9(m),tl:pct(g.tl,0)}),tipT:VT('bgh.i9.goi_y',{khoa:tenKhoa(k),loai_diem:tenDiem,ten_a:VT(A==='icc'?'bgh.i9.ten_icc':'bgh.i9.ten_tau'),gt_a:fmtI9(m),n:g.n,ten_b:VT(A==='icc'?'bgh.i9.ten_tau':'bgh.i9.ten_icc'),gt_b:A==='icc'?vi(g.tau,2)+' điểm':vi(g.icc,2),ten_co:FLAG[maCo][0],tl:pct(g.tl),ky_truoc:dd!=null?VT('bgh.i9.goi_y_ky_truoc',{ky:kyInfo(kt).nhan,chieu:VT(dd>0?'chung.tang_thuong':'chung.giam_thuong'),so:vi(Math.abs(dd),2)}):''})}}).filter(Boolean).sort((a,b)=>b.v-a.v);
  const i9Trend=kys.map(k=>(D.lk.xu_huong[k]||{}).i9||{});
  // đặc điểm lặp lại tính đến kỳ đang xem
  const nLap=Math.max(2,TS('g1_so_ky_lap')||2),tap=new Set(kys);
  const demLap=ky=>{const c={},dg={};let tong=0;D.lk.gv_hp.forEach(g=>{const m=g.g1_ky?.[ky];if(!m)return;tong++;Object.entries(m).forEach(([dh,v])=>{c[dh]=(c[dh]||0)+1;if(v.dang)dg[dh]=(dg[dh]||0)+1})});return {c,dg,tong}};
  const lap=demLap(st.ky),lapT=kt?demLap(kt):null,luot=Object.values(lap.c).reduce((a,b)=>a+b,0),luotDang=Object.values(lap.dg).reduce((a,b)=>a+b,0),nnLap=D.lk.g1_ngau_nhien?.[st.ky],cuaSo=TS('g1_cua_so_ky')??4;
  const repRows=Object.keys(SIGN).map(c=>({lbl:SIGN[c][0],v:lap.c[c]||0,dang:lap.dg[c]||0,txt:innerWidth<640?viInt(lap.c[c]||0):VT('bgh.lap_lai.nhan_thanh',{n:viInt(lap.c[c]||0),dang:viInt(lap.dg[c]||0)}),col:SIGN[c][1].startsWith('up')?'var(--dir-up)':SIGN[c][1]==='down'?'var(--dir-down)':'var(--b-4)',c}));
  return head(V('bgh.duong_dan'),V('bgh.tieu_de'),V('bgh.mo_ta',{ky:kyInfo(st.ky).nhan}),`<button class="btn btn-secondary" onclick="window.print()"><svg><use href="#i-download"/></svg>${V('bgh.nut_in')}</button>`)+`
  <div class="grid g-4">
    <div class="card kpi"><div class="ico ico-blue"><svg><use href="#i-book"/></svg></div><div><div class="lbl">${V('bgh.the.so_hp')}</div><div class="val num">${viInt(T.so_hp)}</div><div class="delta">${V('bgh.the.so_hp_phu',{khoa:nKhoa,bm:nBm})}</div></div></div>
    <div class="card kpi"><div class="ico ico-teal"><svg><use href="#i-layers"/></svg></div><div><div class="lbl">${V('bgh.the.so_lop')}</div><div class="val num">${viInt(T.so_lop)}</div><div class="delta">${delta(T.so_lop,Tt?.so_lop,V('bgh.the.don_vi_lop'))}</div></div></div>
    <div class="card kpi"><div class="ico ico-violet"><svg><use href="#i-users"/></svg></div><div><div class="lbl">${V('bgh.the.luot_sv')}</div><div class="val num">${viInt(T.luot_sv)}</div><div class="delta">${delta(T.luot_sv,Tt?.luot_sv,V('bgh.the.don_vi_luot'))}</div></div></div>
    <div class="card kpi"><div class="ico ico-indigo"><svg><use href="#i-filter"/></svg></div><div><div class="lbl">${V('bgh.the.khong_tk')}</div><div class="val num">${viInt(T.q1)}</div><div class="delta">${V('bgh.the.khong_tk_phu',{n:TS('so_sv_toi_thieu_lop')})}${T.q1_mat_tc?V('bgh.the.khong_tk_mat_tc',{n:viInt(T.q1_mat_tc)}):''}</div></div></div>
  </div>
  ${haiChieu(d.hp,V('hai_chieu.pham_vi_truong',{ky:kyInfo(st.ky).nhan}))}
  <section class="card"><div class="card-head"><h2>${V('bgh.xu_huong.tieu_de')}</h2><div class="sub">${V('bgh.xu_huong.mo_ta',{ky:kyInfo(st.ky).nhan})}</div></div>
    ${explain('bgh.xu_huong.giai_thich')}
    ${kys.length<2?`<div class="alert alert-info"><svg><use href="#i-info"/></svg><div>${V('bgh.xu_huong.mot_ky')}</div></div>`:''}
    <div class="grid g-2" style="margin-top:12px">${TR.map(([c,get,fmt,nd],j)=>`<div><div class="chart-title">${IND[c][0]}</div><p class="chart-desc">${IND[c][1]}</p>${lineChart(xh.map(x=>get(x)??0),{fmt,nd,label:IND[c][0],name:IND[c][0],labels:kys.map(k=>kyInfo(k).nhan_ngan),labelsFull:kys.map(k=>kyInfo(k).nhan),color:['var(--acc-blue)','var(--acc-violet)','var(--acc-teal)','var(--acc-indigo)'][j]})}</div>`).join('')}</div></section>
  <section class="card"><div class="card-head"><h2>${V('bgh.ban_do.tieu_de')}</h2><div class="sub">${V('bgh.ban_do.mo_ta',{n_lop:TS('so_lop_toi_thieu_hp'),n:pts.length,n_le:viInt(T.q2)})}</div></div>
    ${explain('bgh.ban_do.giai_thich',{_cach_doc:docBanDo(f.ax)})}
    ${filters(sel('ax',VT('bgh.ban_do.loc_thang_do'),AX_OPTS,f.ax)+sel('kh',VT('bgh.ban_do.loc_khoa'),[['all',VT('bgh.ban_do.loc_khoa_tat_ca')],...kh.map(k=>[k,tenKhoa(k)])],f.kh))}
    ${bd.chart||`<p>${V('chung.chua_du_dk_so_sanh')}</p>`}
    <div class="legend"><span><i class="dot" style="background:var(--b-4)"></i>${f.kh==='all'?V('bgh.ban_do.chu_giai_hp'):V('bgh.ban_do.chu_giai_hp_khoa',{khoa:tenKhoa(f.kh)})}</span><span><i class="dot" style="background:#fff;border:2px solid var(--b-4)"></i>${V('ban_do.chu_giai_khong_phat_hien')}</span>${f.kh==='all'?'':`<span><i class="dot" style="background:#B8C2D3"></i>${V('bgh.ban_do.chu_giai_khac')}</span></div><p class="table-note">${V('bgh.ban_do.ghi_chu_khoa',{khoa:tenKhoa(f.kh)})}</p><div>`}</div>${bd.note}</section>
  <section class="card"><div class="card-head"><h2>${V('bgh.ty_le_co.tieu_de')}</h2><div class="sub">${f.fpv==='dk'?V('bgh.ty_le_co.mo_ta_du_dk',{n:viInt(nT),tong:viInt(totT),pct:pct(totT?nT/totT:0,0)}):V('bgh.ty_le_co.mo_ta_tat_ca',{n:viInt(nT),tong:viInt(totT),pct:pct(totT?nT/totT:0,0),ndk:viInt(cT.ndk),dk:viInt(cT.dk),ncd:viInt(cT.ncd),cd:viInt(cT.cd)})}</div></div>
    ${explain('bgh.ty_le_co.giai_thich')}
    ${filters(sel('fc',VT('bgh.ty_le_co.loc_loai'),[['any',VT('bgh.ty_le_co.loc_loai_tat_ca')],...FL_CODES.map(c=>[c,FLAG[c][0]])],f.fc)+sel('fpv',VT('bgh.ty_le_co.loc_pham_vi'),[['all',VT('bgh.ty_le_co.pham_vi_tat_ca')],['dk',VT('bgh.ty_le_co.pham_vi_du_dk')]],f.fpv))}
    ${chiDk&&f.fpv==='all'?`<div class="alert alert-info" style="margin-bottom:12px"><svg><use href="#i-info"/></svg><div>${V('bgh.ty_le_co.nhac_chon_du_dk')}</div></div>`:''}
    ${barsH(flagRows,{w:wide(),lw:340,rw:sm?70:f.fpv==='dk'?280:300,label:VT('bgh.ty_le_co.tieu_de'),tip:r=>VT('bgh.ty_le_co.goi_y',{khoa:r.lbl,n:r.n,tong:r.tot,pct:vi(r.v),ndk:r.c.ndk,dk:r.c.dk,pct_dk:r.c.dk?` (${vi(r.c.ndk/r.c.dk*100)}%)`:'',ncd:r.c.ncd,cd:r.c.cd,pct_cd:r.c.cd?` (${vi(r.c.ncd/r.c.cd*100)}%)`:''})+(f.fpv==='dk'?VT('bgh.ty_le_co.goi_y_dang_du_dk'):'')})}</section>
  <section class="card"><div class="card-head"><h2>${V('bgh.i9.tieu_de')}</h2><div class="sub">${V('bgh.i9.mo_ta')}</div></div>
    ${explain('bgh.i9.giai_thich',{_y_nghia:V(P==='x'?'bgh.i9.giai_thich.y_nghia_x':'bgh.i9.giai_thich.y_nghia_y')})}
    ${filters(sel('i9p',VT('bgh.i9.loc_loai_diem'),[['x',VT('bgh.i9.loai_x')],['y',VT('bgh.i9.loai_y')]],P)+sel('i9a',VT('bgh.i9.loc_thang_do'),AX_OPTS,A))}
    ${i9T?`<p class="lead" style="font-size:16.5px">${V('bgh.i9.toan_truong',{n:i9T.n,loai_diem:tenDiem,icc:vi(i9T.icc,2),tau:vi(i9T.tau,2),tl:pct(i9T.tl),ten_co:FLAG[maCo][0],ky_truoc:i9Tt?V('bgh.i9.toan_truong_ky_truoc',{gt:vi(i9Tt[A],2)+(A==='tau'?' điểm':''),tl:pct(i9Tt.tl)}):''})}</p>`:''}
    ${i9Rows.length?barsH(i9Rows,{w:wide(),lw:340,rw:innerWidth<640?96:300,fmt:v=>vi(v,2),label:VT('bgh.i9.tieu_de'),tip:r=>r.tipT}):`<p>${V('chung.chua_du_dk_so_sanh')}</p>`}
    <div class="grid g-2" style="margin-top:16px">
      <div><div class="chart-title">${V('bgh.i9.bd_trung_vi',{ten:V(A==='icc'?'bgh.i9.ten_icc':'bgh.i9.ten_tau_diem')})}</div><p class="chart-desc">${V('bgh.i9.bd_trung_vi_mo_ta',{loai_diem:tenDiem})}</p>${lineChart(i9Trend.map(x=>x[(A==='icc'?'icc_':'tau_')+P]??0),{fmt:(v,d)=>vi(v,d),nd:2,label:VT('bgh.i9.bd_trung_vi',{ten:VT(A==='icc'?'bgh.i9.ten_icc':'bgh.i9.ten_tau_diem')}),name:VT(A==='icc'?'bgh.i9.ten_icc':'bgh.i9.ten_tau'),labels:kys.map(k=>kyInfo(k).nhan_ngan),labelsFull:kys.map(k=>kyInfo(k).nhan),color:'var(--acc-blue)'})}</div>
      <div><div class="chart-title">${V('bgh.i9.bd_ty_le',{ten_co:FLAG[maCo][0]})}</div><p class="chart-desc">${V('bgh.i9.bd_ty_le_mo_ta')}</p>${lineChart(i9Trend.map(x=>(x['ty_le_'+maCo.toLowerCase()]??0)*100),{fmt:(v,d)=>vi(v,d)+'%',nd:1,label:VT('bgh.i9.bd_ty_le',{ten_co:FLAG[maCo][0]}),name:VT('bgh.i9.bd_ty_le',{ten_co:FLAG[maCo][0]}),labels:kys.map(k=>kyInfo(k).nhan_ngan),labelsFull:kys.map(k=>kyInfo(k).nhan),color:'var(--acc-violet)'})}</div>
    </div></section>
  <section class="card"><div class="card-head"><h2>${REPEAT[0]}</h2><div class="sub">${V('bgh.lap_lai.mo_ta')}</div></div>
    ${kys.length<nLap?trong(V('bgh.lap_lai.chua_du_tieu_de'),V('bgh.lap_lai.chua_du',{n:nLap})):`
    <p class="lead">${V('bgh.lap_lai.tom_tat',{ky:kyInfo(st.ky).nhan,cua_so:cuaSo,n:viInt(lap.tong),nlap:nLap,ky_truoc:lapT&&kyDen(kt).length>=nLap?V('bgh.lap_lai.tom_tat_ky_truoc',{n:viInt(lapT.tong)}):''})}</p>
    <p class="help">${V('bgh.lap_lai.tom_tat_trang_thai',{luot:viInt(luot),dang:viInt(luotDang),truoc:viInt(luot-luotDang)})}${nnLap!=null?V('bgh.lap_lai.tom_tat_ngau_nhien',{nn:vi(nnLap,0)}):''}</p>
    ${explain('bgh.lap_lai.giai_thich',{_y_nghia:esc(REPEAT[1])})}
    ${barsH(repRows,{w:wide(),lw:380,rw:innerWidth<640?64:290,fmt:v=>viInt(v)+' '+VT('bgh.lap_lai.don_vi'),label:REPEAT[0],tip:r=>VT('bgh.lap_lai.goi_y',{ten:SIGN[r.c][0],mo_ta:SIGN[r.c][2],n:r.v,dang:r.dang})})}`}</section>`};

/* ================= MÀN HÌNH: CẤP KHOA ================= */
S.khoa=async()=>{
  if(!st.ky)return chuaCoKy();
  const d=await taiKy(st.ky),k=st.khoa,kys=kyDen(st.ky);
  const hs=d.hp.filter(h=>h.khoa===k),ls=d.lop.filter(l=>l.khoa===k);
  const f=st.f;f.kbm=f.kbm||'all';f.konly=f.konly||'0';f.kax=f.kax||'icc';
  const bms=[...new Set(hs.map(h=>h.bm))].sort();
  const bmCol=b=>`var(--cat-${(bms.indexOf(b)%6)+1})`;
  const on=h=>(f.kbm==='all'||h.bm===f.kbm)&&(f.konly==='0'||h.co.length);
  const bd=banDo(hs.filter(h=>h.du_dk&&h.tau_x!=null&&h.tau_y!=null),{ax:f.kax,on,col:h=>bmCol(h.bm),showLbl:true,label:VT('khoa.ban_do.tieu_de'),lbl:h=>`${h.ten} (${h.ma})\n${VT('khoa.ban_do.goi_y_bm',{bm:tenBm(h.bm)})}${h.co.length?'\n'+VT('khoa.ban_do.goi_y_co',{ds:h.co.map(c=>FLAG[c][0]).join('; ')}):''}`,short:h=>h.co.length?h.ten:''}),pts=bd.pts;
  const flagged=hs.filter(h=>h.co.length&&(f.kbm==='all'||h.bm===f.kbm));
  const soKyCo=ma=>kys.filter(ky=>(D.lk.co_hp[ma]||{})[ky]).length;
  const nLap=Math.max(2,TS('g1_so_ky_lap')||2),tap=new Set(kys);
  const g1=[];D.lk.gv_hp.filter(g=>g.khoa===k).forEach(g=>Object.entries(g.g1_ky?.[st.ky]||{}).forEach(([dh,v])=>g1.push({...g,d:dh,kys:v.ky,dang:v.dang})));
  g1.sort((a,b)=>b.dang-a.dang);
  if(!hs.length)return head(V('khoa.duong_dan'),tenKhoa(k),kyInfo(st.ky).nhan)+`<section class="card">${trong(V('khoa.trong_tieu_de'),V('khoa.trong_noi_dung'))}</section>`;
  return head(V('khoa.duong_dan'),tenKhoa(k),V('khoa.mo_ta',{ky:kyInfo(st.ky).nhan,bm:bms.length,hp:hs.length,lop:ls.length}))+`
  ${haiChieu(hs,V('hai_chieu.pham_vi_khoa',{khoa:tenKhoa(k),ky:kyInfo(st.ky).nhan}))}
  <section class="card"><div class="card-head"><h2>${V('khoa.bang_bm.tieu_de')}</h2><div class="sub">${V('khoa.bang_bm.mo_ta')}</div></div>
    ${explainT('khoa.bang_bm.giai_thich')}
    <div class="table-wrap"><table class="chia chia-bm"><thead><tr>${th('Bộ môn',{cls:'sticky-col w-mid'})}${th('Số học phần',{cls:'r w-num'})}${th('Số lớp',{cls:'r w-num'})}${th('Học phần có từ 2 lớp',{cls:'r w-num',unit:'đủ điều kiện so sánh'})}${th('Học phần có điểm lưu ý',{cls:'r w-num'})}${th('Điểm lưu ý gặp nhiều nhất',{cls:'w-wide',sort:false})}${th(IND.I1[0],{cls:'r w-num',unit:'%'})}${th(IND.I2[0],{cls:'r w-num',unit:'%'})}${th(IND.I6[0],{cls:'r w-num',unit:'0 đến 1'})}${th('Tỷ lệ phương sai giữa các lớp – điểm quá trình',{cls:'r w-num',unit:'trung vị'})}${th('Chênh lệch giữa các lớp – điểm quá trình',{cls:'r w-num',unit:'trung vị, điểm'})}${th('Học phần có điểm lưu ý chênh lệch điểm quá trình',{cls:'r w-num',unit:'%'})}${th('Tỷ lệ phương sai giữa các lớp – điểm thi',{cls:'r w-num',unit:'trung vị'})}${th('Chênh lệch giữa các lớp – điểm thi',{cls:'r w-num',unit:'trung vị, điểm'})}${th('Học phần có điểm lưu ý chênh lệch điểm thi',{cls:'r w-num',unit:'%'})}</tr></thead>
    <tbody>${bms.map(b=>{const x=hs.filter(h=>h.bm===b),fx=x.filter(h=>h.co.length),lx=ls.filter(l=>l.bm===b&&l.tk),cnt={};fx.forEach(h=>h.co.forEach(c=>cnt[c]=(cnt[c]||0)+1));const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0]);
      const nd=lx.reduce((s,l)=>s+l.n_diem,0),nm=lx.reduce((s,l)=>s+l.n_mat,0),np=lx.reduce((s,l)=>s+l.n_p,0),nf=lx.reduce((s,l)=>s+(l.i2||0)*l.n_p,0),rs=lx.map(l=>l.r).filter(v=>v!=null),gx=gopI9(x,'x'),gy=gopI9(x,'y');
      return `<tr><td class="sticky-col"><b>${esc(tenBm(b))}</b></td><td class="r num">${x.length}</td><td class="r num">${x.reduce((s,h)=>s+h.so_lop,0)}</td><td class="r num">${x.filter(h=>h.du_dk).length}</td><td class="r num" data-v="${fx.length}">${fx.length} (${vi(x.length?fx.length/x.length*100:0,0)}%)</td><td>${flagList(top)}</td><td class="r num">${nd?vi(nm/nd*100):'—'}</td><td class="r num">${np?vi(nf/np*100):'—'}</td><td class="r num">${rs.length?vi(median(rs),2):'—'}</td>${[gx,gy].map(g=>g?`<td class="r num">${vi(g.icc,2)}</td><td class="r num">${vi(g.tau,2)}</td><td class="r num">${pct(g.tl,0)}</td>`:'<td class="r">—</td><td class="r">—</td><td class="r">—</td>').join('')}</tr>`}).join('')}</tbody></table></div><p class="table-note">${V('khoa.bang_bm.ghi_chu')}</p></section>
  <section class="card"><div class="card-head"><h2>${V('khoa.ban_do.tieu_de')}</h2><div class="sub">${V('khoa.ban_do.mo_ta',{n:pts.length})}</div></div>
    ${explain('khoa.ban_do.giai_thich',{_cach_doc:V('khoa.ban_do.giai_thich.cach_doc_mo_dau')+' '+docBanDo(f.kax)})}
    ${filters(sel('kax',VT('bgh.ban_do.loc_thang_do'),AX_OPTS,f.kax)+sel('kbm',VT('khoa.ban_do.loc_bm'),[['all',VT('khoa.ban_do.loc_bm_tat_ca')],...bms.map(b=>[b,tenBm(b)])],f.kbm)+sel('konly',VT('khoa.ban_do.loc_hien'),[['0',VT('khoa.ban_do.hien_tat_ca')],['1',VT('khoa.ban_do.hien_co')]],f.konly))}
    ${bd.chart||`<p>${V('khoa.ban_do.trong')}</p>`}
    <div class="legend">${bms.map(b=>`<span><i class="dot" style="background:${bmCol(b)}"></i>${esc(tenBm(b))}</span>`).join('')}<span><i class="dot" style="background:#fff;border:2px solid var(--text-3)"></i>${V('ban_do.chu_giai_khong_phat_hien')}</span></div>${bd.note}</section>
  <section class="card"><div class="card-head"><h2>${V('khoa.ds_co.tieu_de')}</h2><div class="sub">${V('khoa.ds_co.mo_ta',{n:flagged.length})}</div></div>
    ${explainT('khoa.ds_co.giai_thich')}
    <div class="table-wrap"><table><thead><tr>${th('Học phần',{cls:'w-wide'})}${th('Bộ môn',{cls:'w-mid'})}${th('Điểm lưu ý trong học kỳ này',{cls:'w-wide',sort:false})}${th('Số học kỳ có điểm lưu ý',{cls:'r w-num',unit:'trên số kỳ đã nạp'})}</tr></thead><tbody>
    ${flagged.map(h=>{const n=soKyCo(h.ma);return `<tr><td><a href="#bomon" data-hp="${h.ma}" data-bm="${h.bm}" style="text-decoration:none;color:inherit">${hpCell(h.ten,h.ma)}</a></td><td>${esc(tenBm(h.bm))}</td><td>${flagList(h.co)}</td><td class="r num" data-v="${n}">${n} / ${kys.length}</td></tr>`}).join('')||`<tr><td colspan="4">${V('khoa.ds_co.trong')}</td></tr>`}</tbody></table></div></section>
  <section class="card"><div class="card-head"><h2>${V('khoa.lap_lai.tieu_de',{ten:REPEAT[0]})}</h2><div class="sub">${V('khoa.lap_lai.mo_ta',{n:g1.length,dang:g1.filter(g=>g.dang).length,cua_so:TS('g1_cua_so_ky')??4,ky:kyInfo(st.ky).nhan})}</div></div>
    ${explainT('khoa.lap_lai.giai_thich',{_y_nghia:esc(REPEAT[1])})}
    ${kys.length<nLap?`<p>${V('khoa.lap_lai.chua_du',{n:nLap})}</p>`:`<div class="table-wrap"><table><thead><tr>${th('Giảng viên',{cls:'w-mid'})}${th('Học phần',{cls:'w-wide'})}${th('Lặp lại qua nhiều học kỳ',{cls:'w-wide'})}${th('Các học kỳ có đặc điểm',{cls:'w-mid',sort:false})}${th('Trạng thái',{cls:'w-mid',sort:false})}${th('',{sort:false})}</tr></thead><tbody>
    ${g1.map(g=>`<tr><td class="nw">${esc(g.gv)}</td><td>${hpCell(g.ten,g.goc)}</td><td>${sg(g.d)}</td><td>${g.kys.map(z=>kyInfo(z).nhan).join(', ')}</td><td>${V(g.dang?'chung.g1_dang':'chung.g1_truoc')}</td><td class="nw"><a href="#truyvet" data-bm="${g.bm}" data-tabgo="gv">${V('khoa.lap_lai.xem_dien_bien')}</a></td></tr>`).join('')||`<tr><td colspan="6">${V('khoa.lap_lai.trong')}</td></tr>`}</tbody></table></div>`}</section>`};

/* ================= MÀN HÌNH: CẤP BỘ MÔN ================= */
/* Lớp liên quan và Hồ sơ một lớp: câu nhận xét do bộ xử lý ghép sẵn theo bộ luật E (mau_nhan_xet.json);
   trang chỉ hiển thị. Dữ liệu hồ sơ tách theo bộ môn: data/ho_so/<kỳ>/<mã bộ môn>.json. */
const keyL=l=>l.ma+'|'+l.nhom;
const dam=t=>esc(t).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
const HS_CACHE={};
async function taiHoSo(ky,bm){const k=ky+'/'+bm;if(!(k in HS_CACHE))HS_CACHE[k]=await getJSON(`data/ho_so/${ky}/${bm}.json`).catch(()=>null);return HS_CACHE[k]}
function hienHoSo(hs,meta,bm){
  const T=meta.tieu_de,buoc=(n,c)=>`<div style="border-left:4px solid var(--brand-700);padding:4px 0 4px 16px;margin-top:18px"><h3 style="margin-bottom:8px">${V('bomon.ho_so.buoc',{n,ten:esc(T[n-1])})}</h3>${c}</div>`;
  const b1=hs.b1.length?`<ul style="margin:0;padding-left:20px">${hs.b1.map(t=>`<li>${dam(t)}</li>`).join('')}</ul>`:`<p>${dam(hs.b1_trong||'')}</p>`;
  const C2=VA('bomon.ho_so.cot_b2');
  const b2=`<div class="table-wrap" style="max-height:none"><table><thead><tr>${th(C2[0],{cls:'w-wide',sort:false})}${th(C2[1],{cls:'r w-num',sort:false})}${th(C2[2],{cls:'r w-num',sort:false})}${th(C2[3],{cls:'r w-mid',unit:V('bomon.ho_so.don_vi_khoang'),sort:false})}${th(C2[4],{cls:'w-mid',sort:false})}</tr></thead><tbody>${hs.b2.map(d=>`<tr><td>${esc(d[0])}</td><td class="r num"><b>${esc(d[1])}</b></td><td class="r num">${esc(d[2])}</td><td class="r num">${esc(d[3])}</td><td>${dam(d[4])}</td></tr>`).join('')}</tbody></table></div>`;
  const c=hs.b3_chuoi,p3=hs.b3.map(t=>`<p style="margin-top:8px">${dam(t)}</p>`);
  const b3=(p3[0]||'')+(c&&c.gt.length?lineChart(c.gt,{w:Math.min(wide(),720),h:220,fmt:(v,d)=>sgn(v,d),nd:2,label:VT('bomon.ho_so.bd_b3'),name:IND.I7[0],labels:c.nhan,labelsFull:c.nhan_day_du}):'')+p3.slice(1).join('')+`<p class="help" style="margin-top:8px">${V('bomon.ho_so.ghi_chu_b3',{lien_ket:`<a href="#truyvet" data-bm="${esc(bm)}" data-tabgo="gv">${V('bomon.ho_so.lien_ket_b3')}</a>`})}</p>`;
  const b4=`<ol style="margin:0;padding-left:22px">${hs.b4.map(t=>`<li style="margin-bottom:6px">${dam(t)}</li>`).join('')}</ol><p class="help" style="margin-top:8px">${esc(meta.luu_y)}</p>`;
  const b4Gon=`<div style="border-left:4px solid var(--brand-700);padding:4px 0 4px 16px;margin-top:18px"><details class="buoc-gon"><summary><h3>${V('bomon.ho_so.buoc',{n:4,ten:esc(T[3])})}</h3><span class="buoc-mo">${V('bomon.ho_so.so_cau_hoi',{n:hs.b4.length})}</span></summary><div style="margin-top:8px">${b4}</div></details></div>`;
  return buoc(1,b1)+buoc(2,b2)+buoc(3,b3)+b4Gon;
}

S.bomon=async()=>{
  if(!st.ky)return chuaCoKy();
  const d=await taiKy(st.ky),b=st.bm,hs=d.hp.filter(h=>h.bm===b).sort((x,y)=>x.ten.localeCompare(y.ten,'vi'));
  if(!hs.length)return head(V('bomon.duong_dan'),V('bomon.tieu_de',{bm:esc(tenBm(b))}),kyInfo(st.ky).nhan)+`<section class="card">${trong(V('bomon.trong_tieu_de'),V('bomon.trong_noi_dung'))}</section>`;
  if(!st.hp||!hs.find(h=>h.ma===st.hp))st.hp=(hs.find(h=>h.du_dk)||hs[0]).ma;
  const h=hs.find(x=>x.ma===st.hp),n15=TS('so_sv_toi_thieu_lop');
  const lops=d.lop.filter(l=>l.goc===h.ma).sort((a,b)=>a.nhom.localeCompare(b.nhom)||a.ma.localeCompare(b.ma));
  const f=st.f;f.bshow=f.bshow||'all';f.bsort=f.bsort||'gap';
  const inS=lops.filter(l=>l.tk),view=lops.filter(l=>f.bshow==='all'||l.tk);
  const GP=h.gp||{},tagL={},theoKey=Object.fromEntries(inS.map(l=>[keyL(l),l]));f.hl=f.hl&&theoKey[f.hl]?f.hl:null;inS.forEach(l=>tagL[keyL(l)]=l.gp_tag||[]);
  const HS=await taiHoSo(st.ky,b);
  const diem=l=>(tagL[keyL(l)]||[]).length*2+l.dh.length+(Math.abs(l.i7||0));
  const hl=inS.find(l=>keyL(l)===f.hl)||[...inS].sort((a,b)=>diem(b)-diem(a))[0];
  const rows=inS.map(l=>({...l,lbl:innerWidth<640?l.nhom:`Nhóm ${l.nhom}${l.ma!==h.ma?' ('+l.ma+')':''} – ${l.gv}`,full:`Lớp ${lopTen(l)}${l.ma!==h.ma?' – mã '+l.ma:''}\nGiảng viên: ${l.gv}`,x:l.x_tb,y:l.y_tb}));
  const sorted=[...rows].sort((a,b)=>f.bsort==='gap'?(b.x-b.y)-(a.x-a.y):f.bsort==='x'?b.x-a.x:a.nhom.localeCompare(b.nhom));
  const fr=sorted.filter(l=>l.i7!=null&&l.i7_lo!=null).map(l=>({...l,v:l.i7,lo:l.i7_lo,hi:l.i7_hi,sig:sig(l.i7_q)}));
  return head(V('bomon.duong_dan'),V('bomon.tieu_de',{bm:esc(tenBm(b))}),V('bomon.mo_ta',{ky:kyInfo(st.ky).nhan,khoa:tenKhoa(st.khoa)}))+`
  <section class="card" style="padding:16px 24px"><div style="display:flex;flex-wrap:wrap;gap:16px 32px;align-items:flex-end">
    <div class="field" style="flex:1 1 440px"><label for="selHp">${V('bomon.chon_hp',{n:hs.length})}</label><select id="selHp">${hs.map(x=>`<option value="${x.ma}" ${x.ma===h.ma?'selected':''}>${esc(x.ten)} – mã ${x.ma}${x.co.length?VT('bomon.chon_hp_co'):''}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">${V('bomon.nhan_co')}</span><div style="padding-top:4px">${flagList(h.co)}</div></div><div class="field"><span class="lbl">${V('bomon.nhan_od')}</span><div style="padding-top:4px">${odList(h.od,h.cdl)}</div></div></div>${h.hai_he?`<p class="sub" style="margin-top:10px">${V('bomon.ghi_hai_he')}</p>`:''}${h.ky_truoc?`<p class="sub" style="margin-top:6px">${V('bomon.ghi_h6_ky',{ky:kyInfo(h.ky_truoc).nhan,thang:h.thang_truoc})}</p>`:''}${h.h5_ly_do==='lich_su'?`<p class="sub" style="margin-top:6px">${V('bomon.ghi_h5_lich_su',{i2:vi((h.i2||0)*100,1),i0:vi((h.i2_lich_su||0)*100,1)})}</p>`:''}</section>
  ${h.co.length?`<section class="card"><div class="card-head"><h2>${V('bomon.lien_quan.tieu_de')}</h2><div class="sub">${V('bomon.lien_quan.mo_ta')}</div></div>
    <details class="explain"><summary>${V('bomon.lien_quan.hoi')}</summary><dl>${VA('bomon.lien_quan.giai_thich').map(([t,d])=>`<dt>${VMd(t)}</dt><dd>${VMd(d,{d1:vi(TS('d1_d2_lech_x')??1,1)})}</dd>`).join('')}</dl></details>
    <div class="table-wrap" style="max-height:none"><table><thead><tr>${th(VA('bomon.lien_quan.cot')[0],{cls:'w-wide',sort:false})}${th(VA('bomon.lien_quan.cot')[1],{cls:'w-wide',sort:false})}</tr></thead><tbody>
    ${h.co.map(c=>{const g=GP[c];return `<tr><td>${fl(c)}</td><td>${g&&g.ds.length?`<ul style="margin:0;padding-left:18px">${g.ds.map(x=>`<li><b>${esc(h.ten)} (${esc(x.nhom)})</b>${x.ma!==h.ma?' – mã '+esc(x.ma):''} – ${esc(x.gv||'')}: ${esc(x.txt)}</li>`).join('')}</ul>`:''}${g&&g.ghi?`<div class="help" style="margin-top:4px">${esc(g.ghi)}</div>`:''}${!g?`<span class="help">${V('bomon.lien_quan.khong_du')}</span>`:''}</td></tr>`}).join('')}</tbody></table></div></section>`:''}
  <section class="card"><div class="card-head"><h2>${V('bomon.lop.tieu_de',{hp:esc(h.ten)})}</h2><div class="sub">${V('bomon.lop.mo_ta',{n:lops.length,n_ktk:lops.length-inS.length,gop:h.ds_ma.length>1?V('bomon.lop.mo_ta_gop',{ds:h.ds_ma.join(', ')}):''})}</div></div>
    ${explainT('bomon.lop.giai_thich',{n:n15})}
    ${filters(sel('bshow',VT('bomon.lop.loc_hien'),[['all',VT('bomon.lop.hien_tat_ca')],['ok',VT('bomon.lop.hien_tk')]],f.bshow))}
    <div class="table-wrap"><table class="chia chia-lop"><thead><tr>${th('Lớp học phần',{cls:'sticky-col w-wide'})}${th('Giảng viên',{cls:'w-mid'})}${th('Sĩ số',{cls:'r w-num'})}${th('Số SV đủ tư cách dự thi',{cls:'r w-num'})}${th('Tỷ lệ mất tư cách',{cls:'r w-num',unit:'%'})}${th('Tỷ lệ trượt do điểm thi',{cls:'r w-num',unit:'%'})}${th('Điểm quá trình trung bình',{cls:'r w-num'})}${th('Điểm thi trung bình',{cls:'r w-num'})}${th('Điểm quá trình so với kỳ vọng',{cls:'r w-num',unit:'điểm'})}${th('Liên quan đến điểm lưu ý',{cls:'w-wide',sort:false})}${th('Đặc điểm lớp',{cls:'w-wide',sort:false})}${th('Ghi chú',{cls:'w-mid',sort:false})}</tr></thead>
    <tbody>${view.map(l=>`<tr><td class="sticky-col">${l.tk?`<a class="lop-link" role="button" tabindex="0" data-hoso="${keyL(l)}" data-tip="${VT('bomon.lop.mo_ho_so')}"><b>${esc(lopTen(l))}</b></a>`:`<b>${esc(lopTen(l))}</b>`}${l.ma!==h.ma?`<span class="hp-code">Mã ${l.ma}</span>`:''}</td><td class="nw">${esc(l.gv)||'—'}</td><td class="r num">${l.si_so}</td><td class="r num">${l.n_p}</td><td class="r num">${pct(l.i1)}</td><td class="r num">${pct(l.i2)}</td><td class="r num">${l.x_tb!=null?vi(l.x_tb):'—'}</td><td class="r num">${l.y_tb!=null?vi(l.y_tb):'—'}</td><td class="r num" data-v="${l.i7??-99}">${sgn(l.i7)}</td><td>${(tagL[keyL(l)]||[]).map(([c,t])=>`<span class="flag" data-tip="${esc(FLAG[c][0]+': '+t)}">${GP_TEN[c]}</span>`).join('')||'—'}</td><td>${l.dh.map(sg).join('')||'—'}</td><td>${!l.tk?`<span class="tag">${V('bomon.lop.nhan_ktk')}</span>`:l.tct?`<span class="tag">${V('bomon.lop.nhan_tct')}</span>`:''}${l.co.includes('CHUA_CO_DIEM')?` <span class="tag">${V('bomon.lop.nhan_chua_diem')}</span>`:''}</td></tr>`).join('')}</tbody></table></div></section>
  ${hl?`<section class="card" id="hoso"><div class="card-head"><h2>${V('bomon.ho_so.tieu_de',{lop:esc(lopTen(hl))})}</h2><div class="sub">${V('bomon.ho_so.mo_ta')}</div></div>
    ${filters(sel('hl',VT('bomon.ho_so.chon_lop'),inS.map(l=>[keyL(l),`${lopTen(l)} – ${l.gv}${(tagL[keyL(l)]||[]).length||l.dh.length?VT('bomon.ho_so.chon_lop_co'):''}`]),keyL(hl)))}
    ${HS&&HS.lop[keyL(hl)]?hienHoSo(HS.lop[keyL(hl)],HS,b):`<p>${V('bomon.ho_so.trong')}</p>`}</section>`:''}
  <section class="card"><div class="card-head"><h2>${V('bomon.dumbbell.tieu_de')}</h2><div class="sub">${V('bomon.dumbbell.mo_ta')}</div></div>
    ${explain('bomon.dumbbell.giai_thich')}
    ${filters(sel('bsort',VT('bomon.dumbbell.loc_sap_xep'),[['gap',VT('bomon.dumbbell.sx_chenh')],['x',VT('bomon.dumbbell.sx_x')],['name',VT('bomon.dumbbell.sx_ten')]],f.bsort))}
    ${sorted.length?dumbbell(sorted,{w:wide(),label:VT('bomon.dumbbell.tieu_de'),avgX:mean(sorted.map(l=>l.x)),avgY:mean(sorted.map(l=>l.y))}):`<p>${V('bomon.dumbbell.trong')}</p>`}</section>
  <section class="card"><div class="card-head"><h2>${V('bomon.forest.tieu_de',{ten:IND.I7[0]})}</h2><div class="sub">${V(h.du_dk?'bomon.forest.mo_ta_du':'bomon.forest.mo_ta_khong_du')}${h.dp_x?V('bomon.forest.mo_ta_du_phong'):''}</div></div>
    ${explain('bomon.forest.giai_thich',{_y_nghia:esc(IND.I7[1])})}
    ${fr.length?forest(fr,{w:wide(),label:VT('bomon.forest.tieu_de',{ten:IND.I7[0]})}):`<p>${V('bomon.forest.trong')}</p>`}</section>`};

/* ================= MÀN HÌNH: TRUY VẾT ================= */
S.truyvet=async()=>{
  if(!st.ky)return chuaCoKy();
  const k=st.khoa,f=st.f;f.tq=f.tq||'';f.tf=f.tf||'any';f.tr2=f.tr2||'1';f.tab=f.tab||'hp';const kys=kyDen(st.ky);   // chỉ các kỳ đến kỳ đang xem
  const hpK=Object.entries(D.dm.hp).filter(([,v])=>v.khoa===k).map(([ma,v])=>({ma,...v}));
  const rows=hpK.map(h=>({h,fl:kys.map(z=>(D.lk.co_hp[h.ma]||{})[z]||[])})).filter(x=>{
    const n=x.fl.filter(a=>f.tf==='any'?a.length:a.includes(f.tf)).length;
    return n>=(f.tr2==='1'?2:1)&&(!f.tq||(x.h.ten+x.h.ma).toLowerCase().includes(f.tq.toLowerCase()))}).sort((a,b)=>b.fl.filter(x=>x.length).length-a.fl.filter(x=>x.length).length);
  const gv=D.lk.gv_hp.filter(g=>g.bm===st.bm&&kys.some(z=>g.i7[z]!=null)).sort((a,b)=>a.gv.localeCompare(b.gv,'vi')||a.ten.localeCompare(b.ten,'vi'));
  const E0=TS('vung_gan_0')??0.05,E1=TS('d1_d2_lech_x')??1;
  const tron=(a,b,t)=>'#'+[0,2,4].map(i=>Math.round(parseInt(a.substr(i+1,2),16)*(1-t)+parseInt(b.substr(i+1,2),16)*t).toString(16).padStart(2,'0')).join('');
  const dirCol=v=>{if(v==null)return ['#fff','var(--text-3)'];if(Math.abs(v)<=E0)return ['#E6E6E6','var(--text)'];
    const t=0.2+0.8*Math.min(1,(Math.abs(v)-E0)/Math.max(E1-E0,0.01));return [v>0?tron('#FFFFFF','#2A8C8C',t):tron('#FFFFFF','#7A6BB0',t),t>0.55?'#fff':'var(--text)']};
  const dhKy=(g,z)=>Object.entries(g.dh||{}).filter(([,ks])=>ks.includes(z)).map(([c])=>c);
  const gvKy=g=>{const z=kys.filter(q=>g.theo_ky?.[q]).pop();return z?g.theo_ky[z]:{}};
  const deHp=hpK.filter(h=>kys.filter(z=>(D.lk.de_thi[h.ma]||{})[z]!=null).length>=2);
  const NG6=TS('h6_lech_y_giua_ky')??1,kyH6=ma=>kys.filter(z=>((D.lk.co_hp[ma]||{})[z]||[]).includes('H6'));
  if(!deHp.some(h=>h.ma===f.dhp))f.dhp=(deHp.find(h=>kyH6(h.ma).length)||deHp[0]||{}).ma;
  const dh=deHp.find(h=>h.ma===f.dhp);
  return head(V('dien_bien.duong_dan'),V('dien_bien.tieu_de'),V('dien_bien.mo_ta',{khoa:tenKhoa(k),n:kys.length}))+`
  <div class="tabs" role="tablist">${['hp','gv','de'].map(v=>[v,V('dien_bien.the.'+v)]).map(([v,t])=>`<button role="tab" data-tab="${v}" aria-selected="${f.tab===v}">${t}</button>`).join('')}</div>
  ${f.tab==='hp'?`<section class="card"><div class="card-head"><h2>${V('dien_bien.hp.tieu_de')}</h2><div class="sub">${V('dien_bien.hp.mo_ta',{n:rows.length})}</div></div>
    ${explainT('dien_bien.hp.giai_thich')}
    ${filters(`<div class="field"><label for="tq">${V('dien_bien.hp.loc_tim')}</label><input id="tq" data-f="tq" type="text" value="${esc(f.tq)}" placeholder="${VT('dien_bien.hp.loc_tim_goi_y')}"></div>`+sel('tf',VT('bgh.ty_le_co.loc_loai'),[['any',VT('bgh.ty_le_co.loc_loai_tat_ca')],...FL_CODES.map(c=>[c,FLAG[c][0]])],f.tf)+sel('tr2',VT('dien_bien.hp.loc_lap'),[['1',VT('dien_bien.hp.lap_2')],['0',VT('dien_bien.hp.lap_1')]],f.tr2))}
    <div class="table-wrap"><table><thead><tr>${th('Học phần',{cls:'sticky-col w-wide'})}${th('Bộ môn',{cls:'w-mid'})}${kys.map(z=>th(kyInfo(z).nhan,{cls:'w-wide'+(z===st.ky?' ky-chon':''),sort:false})).join('')}${th('Số học kỳ có điểm lưu ý',{cls:'r w-num',unit:'bất kỳ loại nào'})}${th('Số học kỳ theo từng loại điểm lưu ý',{cls:'w-wide',sort:false})}</tr></thead>
    <tbody>${rows.map(x=>`<tr><td class="sticky-col">${hpCell(x.h.ten,x.h.ma)}</td><td>${esc(tenBm(x.h.bm))}</td>${x.fl.map((a,j)=>`<td class="${kys[j]===st.ky?'ky-chon':''}">${a.length?a.map(fl).join(''):'—'}</td>`).join('')}<td class="r num"><b>${x.fl.filter(a=>a.length).length}</b></td><td>${FL_CODES.map(c=>[c,x.fl.filter(a=>a.includes(c)).length]).filter(([,n])=>n).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<span class="flag" data-tip="${esc(FLAG[c][1])}">${V('dien_bien.hp.so_ky_loai',{ten:FLAG[c][0],n})}</span>`).join('')}</td></tr>`).join('')||`<tr><td colspan="${kys.length+4}"><div class="empty" style="padding:20px"><h3>${V('dien_bien.hp.trong_tieu_de')}</h3><p>${V('dien_bien.hp.trong_noi_dung')}</p></div></td></tr>`}</tbody></table></div></section>`:''}
  ${f.tab==='gv'?`<section class="card"><div class="card-head"><h2>${V('dien_bien.gv.tieu_de',{ten:IND.I7[0]})}</h2><div class="sub">${V('dien_bien.gv.mo_ta',{bm:esc(tenBm(st.bm)),n:gv.length})}</div></div>
    ${explainT('dien_bien.gv.giai_thich')}
    ${gv.length?`<div class="table-wrap"><table class="hm"><thead><tr>${th('Giảng viên',{cls:'w-mid',sort:false})}${th('Học phần',{cls:'w-wide',sort:false})}${kys.map(z=>th(kyInfo(z).nhan_ngan,{cls:'w-num'+(z===st.ky?' ky-chon':''),sort:false})).join('')}${th('Xu hướng qua các học kỳ',{cls:'w-wide',unit:'câu nhận xét theo bộ luật E',sort:false})}${th('Lặp lại qua nhiều học kỳ',{cls:'w-mid',sort:false})}</tr></thead>
    <tbody>${gv.map(g=>`<tr><td style="text-align:left;font-family:var(--font);font-weight:500">${esc(g.gv)}</td><td style="text-align:left;font-family:var(--font)">${hpCell(g.ten,g.goc)}</td>${kys.map(z=>{const v=g.i7[z],[bg,c]=dirCol(v),ds=dhKy(g,z);return `<td class="${z===st.ky?'ky-chon':''}" style="background:${bg};color:${c}" ${v!=null?`data-tip="${esc(VT('dien_bien.gv.goi_y_o',{gv:g.gv,hp:g.ten,ky:kyInfo(z).nhan,muc:VT(Math.abs(v)<=E0?'dien_bien.gv.muc_gan_0':v>0?'dien_bien.gv.muc_cao':'dien_bien.gv.muc_thap',{so:vi(Math.abs(v),2)})})+(ds.length?VT('dien_bien.gv.goi_y_dac_diem',{ds:ds.map(d=>SIGN[d][0]).join('; ')}):''))}"`:''}>${v!=null?sgn(v)+(ds.length?' ◆':''):''}</td>`}).join('')}<td style="font-family:var(--font);text-align:left;font-size:14px;min-width:280px">${dam(gvKy(g).xu_huong||'—')}${gvKy(g).tuong_duong?`<div style="margin-top:4px"><span class="flag ok" data-tip="${esc(VT('tu_dien.tuong_duong_gv.1',{vung:vi(E0,2)}))}">${VT('tu_dien.tuong_duong_gv.0')}</span></div>`:''}</td><td style="font-family:var(--font);text-align:left">${Object.entries(g.g1_ky?.[st.ky]||{}).map(([d,v])=>sg(d)+`<span class="hp-code">${V(v.dang?'chung.g1_dang':'chung.g1_truoc')}</span>`).join('')||'—'}</td></tr>`).join('')}</tbody></table></div>
    <div class="legend"><span><i style="background:linear-gradient(90deg,${tron('#FFFFFF','#2A8C8C',0.2)},#2A8C8C)"></i>${V('dien_bien.gv.chu_giai_cao',{e1:vi(E1,1)})}</span><span><i style="background:#E6E6E6;border:1px solid var(--border)"></i>${V('dien_bien.gv.chu_giai_gan_0',{e0:vi(E0,2)})}</span><span><i style="background:linear-gradient(90deg,${tron('#FFFFFF','#7A6BB0',0.2)},#7A6BB0)"></i>${V('dien_bien.gv.chu_giai_thap')}</span><span>${V('dien_bien.gv.chu_giai_dac_diem')}</span><span><i style="background:#fff;border:3px solid var(--brand-700)"></i>${V('dien_bien.gv.chu_giai_ky_chon')}</span></div><p class="table-note">${V('dien_bien.gv.ghi_chu')}</p>`:`<p>${V('dien_bien.gv.trong')}</p>`}</section>`:''}
  ${f.tab==='de'?`<section class="card"><div class="card-head"><h2>${V('dien_bien.de.tieu_de')}</h2><div class="sub">${V('dien_bien.de.mo_ta',{n:deHp.length,khoa:tenKhoa(k),ng:vi(NG6,2)})}</div></div>
    ${explain('dien_bien.de.giai_thich',{_y_nghia:esc(FLAG.H6[1]),ng:vi(NG6,2)})}
    ${deHp.length?filters(sel('dhp',VT('bgh.ban_do.chu_giai_hp'),deHp.map(h=>{const c=kyH6(h.ma);return [h.ma,`${h.ten} – mã ${h.ma}${c.length?VT('dien_bien.de.chon_hp_thay_doi',{ds:c.map(z=>kyInfo(z).nhan_ngan).join(', ')}):''}`]}),f.dhp))+(dh?(()=>{
      const ks=kys.filter(z=>D.lk.de_thi[dh.ma][z]!=null),L=D.lk.de_thi_lech?.[dh.ma]||{},vs=ks.map(z=>D.lk.de_thi[dh.ma][z]);
      const seg=ks.slice(1).map(z=>{const e=L[z];return e?{txt:`${sgn(e.lech)}${e.h6?' ◆':''}`,manh:Math.abs(e.lech)>=NG6}:null});
      const marks=ks.map(z=>!!L[z]?.h6);
      const tips=ks.map((z,j)=>{const e=L[z];return VT('dien_bien.de.goi_y',{hp:dh.ten,ky:kyInfo(z).nhan,gt:vi(vs[j],2)})+(e?VT('dien_bien.de.goi_y_so_sanh',{ky:kyInfo(e.ky_truoc).nhan,thang:e.thang,chieu:VT(e.lech>0?'chung.tang_thuong':'chung.giam_thuong'),so:vi(Math.abs(e.lech),2)})+(e.h6?VT('dien_bien.de.goi_y_h6'):Math.abs(e.lech)>=NG6?VT('dien_bien.de.goi_y_dat_chua_y_nghia'):VT('dien_bien.de.goi_y_duoi',{ng:vi(NG6,2)})):VT('dien_bien.de.goi_y_ky_dau'))});
      const CD=VA('dien_bien.de.cot');
      const bang=`<div class="table-wrap" style="max-height:none;margin-top:12px"><table><thead><tr>${th(CD[0],{cls:'w-mid',sort:false})}${th(CD[1],{cls:'r w-num',sort:false})}${th(CD[5],{cls:'w-mid',sort:false})}${th(CD[2],{cls:'r w-num',unit:'điểm',sort:false})}${th(VMd(CD[3],{ng:vi(NG6,2)}),{cls:'w-mid',sort:false})}${th(CD[4],{cls:'w-mid',sort:false})}</tr></thead><tbody>${ks.map((z,j)=>{const e=L[z];return `<tr class="${z===st.ky?'':''}"><td class="${z===st.ky?'ky-chon':''}"><b>${kyInfo(z).nhan}</b></td><td class="r num">${vi(vs[j],2)}</td><td>${e?`${kyInfo(e.ky_truoc).nhan_ngan}, cách ${e.thang} tháng`:'—'}</td><td class="r num">${e?sgn(e.lech):'—'}</td><td>${e?(Math.abs(e.lech)>=NG6?V('dien_bien.de.dat_nguong'):V('dien_bien.de.duoi_nguong',{so:vi(NG6-Math.abs(e.lech),2)})):V('dien_bien.de.ky_dau')}</td><td>${e&&e.h6?fl('H6'):'—'}</td></tr>`}).join('')}</tbody></table></div>`;
      return `<div class="chart-title">${esc(dh.ten)}</div><p class="chart-desc">${V('dien_bien.de.mo_ta_bd',{ma:dh.ma})}</p>${lineChart(vs,{w:wide(),h:300,fmt:(v,d)=>vi(v,d),nd:1,label:IND.I4[0]+' – '+dh.ten,name:IND.I4[0]+' – '+dh.ten,labels:ks.map(z=>kyInfo(z).nhan_ngan),labelsFull:ks.map(z=>kyInfo(z).nhan),seg,marks,markTxt:VT('dien_bien.de.dau_bd'),tips})}
      <div class="legend"><span><i class="dot" style="background:var(--b-5)"></i>${V('dien_bien.de.chu_giai_h6')}</span><span>${V('dien_bien.de.chu_giai_dam',{ng:vi(NG6,2)})}</span><span>${V('dien_bien.de.chu_giai_thuong')}</span></div>${bang}`})():''):`<p>${V('dien_bien.de.trong')}</p>`}</section>`:''}`};

/* ================= MÀN HÌNH: NẠP HỌC KỲ ================= */
const nap={buoc:1,doi_soat:null,dang:false,ky:''};
async function pollCongViec(id,onTick){
  for(;;){await new Promise(r=>setTimeout(r,1200));const r=await getJSON('api/cong-viec?id='+id);
    if(r.trang_thai==='xong')return r.ket_qua;if(r.trang_thai==='loi')throw new Error(r.loi);onTick&&onTick()}}
S.nap=async()=>{
  if(!D.local)return head('Dữ liệu','Nạp và quản lý học kỳ','')+`<section class="card">${trong('Chức năng này chỉ có khi chạy trên máy','Bản xem trên GitHub chỉ để đọc báo cáo. Để nạp dữ liệu, hãy chạy <code>python chay.py</code> trên máy có dữ liệu.')}</section>`;
  const ds=nap.doi_soat,b=nap.buoc;
  const bang=(t,x)=>`<div class="table-wrap" style="max-height:none"><table><thead><tr>${th('Nội dung bị loại khỏi tính toán',{cls:'w-wide',sort:false})}${th('Số dòng',{cls:'r w-num',sort:false})}${th('Tỷ lệ',{cls:'r w-num',unit:'% tổng số dòng',sort:false})}</tr></thead><tbody>${x.loai.map(l=>`<tr><td>${esc(l.mo_ta)}</td><td class="r num">${viInt(l.so)}</td><td class="r num">${vi(l.so/x.goc*100)}</td></tr>`).join('')||'<tr><td colspan="3">Không có dòng nào bị loại.</td></tr>'}<tr style="font-weight:700"><td>Còn lại sau khi lọc</td><td class="r num">${viInt(x.giu)}</td><td class="r num">${vi(x.giu/x.goc*100)}</td></tr></tbody></table></div>`;
  return head('Dữ liệu','Nạp và quản lý học kỳ','Mỗi lần nạp một học kỳ gồm 3 bước: chọn file, kiểm tra kết quả đối soát, rồi xác nhận. Sau khi xác nhận, hệ thống tính toàn bộ chỉ số của học kỳ đó và cập nhật lại phần so sánh qua các học kỳ.')+`
  <section class="card" aria-labelledby="t-nap">
    <div class="card-head"><h2 id="t-nap">${nap.ky&&KYS().includes(nap.ky)&&b===1?'Nạp lại học kỳ '+kyInfo(nap.ky).nhan:'Nạp học kỳ mới'}</h2><div class="sub">Bước ${b} trên 3.</div></div>
    <ol class="stepper"><li class="${b>1?'done':'cur'}"><span>${b>1?'<svg width="14" height="14"><use href="#i-check"/></svg>':'1'}</span>Chọn file</li><li class="${b>2?'done':b===2?'cur':''}"><span>${b>2?'<svg width="14" height="14"><use href="#i-check"/></svg>':'2'}</span>Kiểm tra đối soát</li><li class="${b===3?'cur':''}"><span>3</span>Xác nhận và tính chỉ số</li></ol>
    ${b===1?`<form id="fNap" class="form-grid" novalidate>
      <div class="field"><label for="maKy">Mã học kỳ</label><input id="maKy" name="ky" type="text" value="${esc(nap.ky)}" placeholder="Ví dụ 2627_HK1" aria-describedby="maKyHelp" required><span class="help" id="maKyHelp">Theo dạng NNNN_HKx, ví dụ 2627_HK1 là học kỳ 1 năm học 2026–2027.</span><span class="err-text hide" id="maKyErr"></span></div>
      <div class="field"><label for="fLop">File danh sách lớp học phần (.xlsx)</label><input id="fLop" name="file_lop" type="file" accept=".xlsx" required><span class="help">Sheet Thongke: Mã HP, Học phần, Nhóm, TCHT, Sĩ số, Bộ môn, Khoa, Giảng viên, Email, Mã BM.</span></div>
      <div class="field"><label for="fDiem">File điểm học tập của sinh viên (.xlsx)</label><input id="fDiem" name="file_diem" type="file" accept=".xlsx" required><span class="help">16 cột f_nhhk, f_masv, … f_loptc.</span></div>
      <div style="grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px"><span class="err-text hide" id="fileErr" style="align-self:center"></span><button class="btn btn-primary" type="submit">Kiểm tra dữ liệu</button></div></form>
      <div id="napBusy"></div>`:''}
    ${b>=2&&ds?`<dl class="kv" style="margin-bottom:14px"><dt>Học kỳ</dt><dd><b>${ds.nhan}</b> (${ds.ky})${ds.ky_da_co?' – <b>đã có trong kho, sẽ được thay thế</b>':''}</dd><dt>File lớp</dt><dd>${esc(ds.file_lop)}</dd><dt>File điểm</dt><dd>${esc(ds.file_diem)}</dd><dt>Thời gian đọc</dt><dd>${vi(ds.thoi_gian_doc)} giây</dd></dl>
      ${ds.canh_bao.map(c=>`<div class="alert alert-warn" style="margin-bottom:10px" role="alert"><svg><use href="#i-alert"/></svg><div><b>Cần xem:</b> ${esc(c)}</div></div>`).join('')}
      <div class="alert alert-ok" style="margin-bottom:12px"><svg><use href="#i-check"/></svg><div><b>Đọc file thành công.</b> Ghép được ${viInt(ds.ghep.so_dong)} dòng điểm với danh sách lớp.</div></div>
      <div class="grid g-2"><div><h3 style="margin-bottom:8px">File danh sách lớp: ${viInt(ds.lop.goc)} lớp</h3>${bang('lop',ds.lop)}</div><div><h3 style="margin-bottom:8px">File điểm: ${viInt(ds.diem.goc)} dòng</h3>${bang('diem',ds.diem)}</div></div>
      ${ds.ghep.so_lop_thieu?`<div class="alert alert-warn" style="margin-top:12px"><svg><use href="#i-alert"/></svg><div><b>Cần xem: ${viInt(ds.ghep.so_lop_thieu)} lớp (${viInt(ds.ghep.so_dong_thieu)} dòng điểm) có trong file điểm nhưng không có trong danh sách lớp.</b> Hệ thống không xác định được giảng viên nên các dòng này không được đưa vào thống kê.
        <details style="margin-top:6px"><summary style="cursor:pointer;font-weight:600">Xem danh sách</summary><ul style="margin:6px 0 0;padding-left:20px">${ds.ghep.ds_thieu.map(t=>`<li>${esc(t.ten_hp)} – mã ${t.ma_hp}, nhóm ${esc(t.nhom)}: ${t.so_dong} dòng</li>`).join('')}</ul></details></div></div>`:''}
      ${ds.ghep.so_lop_chua_co_diem?`<div class="alert alert-info" style="margin-top:12px"><svg><use href="#i-info"/></svg><div><b>${viInt(ds.ghep.so_lop_chua_co_diem)} lớp trong danh sách chưa có dòng điểm nào.</b> Các lớp này vẫn được giữ, ghi chú “chưa có điểm”.</div></div>`:''}
      <div id="napBusy" style="margin-top:12px"></div>
      ${b===2?`<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap"><button class="btn btn-secondary" id="napBack">Quay lại chọn file</button><button class="btn btn-primary" id="napOk">Xác nhận và tính chỉ số</button></div>`:''}`:''}
  </section>
  <section class="card"><div class="card-head"><h2>Các học kỳ đã nạp</h2><div class="sub">Danh sách sắp theo thời gian của học kỳ, không theo thứ tự nạp. “Nạp lại” dùng khi dữ liệu của kỳ được sửa; “Gỡ” xóa kỳ khỏi kho và tính lại phần so sánh qua các kỳ.</div></div>
    ${D.ds.length?`<div class="table-wrap"><table><thead><tr>${th('Học kỳ',{cls:'w-mid',sort:false})}${th('Ngày nạp',{sort:false})}${th('Số dòng điểm',{cls:'r w-num',sort:false})}${th('Số lớp học phần',{cls:'r w-num',sort:false})}${th('Số học phần',{cls:'r w-num',sort:false})}${th('Bộ tham số',{cls:'w-num',sort:false})}${th('File đã nạp',{cls:'w-wide',sort:false})}${th('Thao tác',{sort:false})}</tr></thead>
      <tbody>${D.ds.map((k,i)=>`<tr><td class="nw"><b>${k.nhan}</b><span class="hp-code">${k.ky}</span></td><td class="num nw">${k.ngay_nap||'—'}</td><td class="r num">${k.so_dong!=null?viInt(k.so_dong):'—'}</td><td class="r num">${viInt(k.so_lop)}</td><td class="r num">${viInt(k.so_hp)}</td><td>Phiên bản ${k.phien_ban_ts}</td><td style="font-size:14px">${esc(k.file_lop||'')}<br>${esc(k.file_diem||'')}</td><td class="nw"><button class="btn btn-ghost" data-napl="${k.ky}">Nạp lại</button><button class="btn btn-ghost" data-go="${k.ky}">Gỡ</button></td></tr>`).join('')}</tbody></table></div>`:trong('Chưa có học kỳ nào được nạp','Hãy nạp học kỳ đầu tiên ở khung phía trên. Phần so sánh qua các học kỳ (đặc điểm lặp lại, điểm thi thay đổi so với kỳ trước) chỉ có từ học kỳ thứ hai.')}</section>`};

function ganNap(){
  const busy=(msg)=>{const el=$('#napBusy');if(el)el.innerHTML=msg?`<div class="busy"><div class="spinner"></div><div>${msg}</div></div>`:''};
  const f=$('#fNap');
  if(f)f.onsubmit=async e=>{e.preventDefault();const ky=$('#maKy').value.trim().toUpperCase().replace('HK','HK');nap.ky=ky;
    const ok=/^\d{4}_HK[12]$/.test(ky);$('#maKy').setAttribute('aria-invalid',!ok);$('#maKyErr').classList.toggle('hide',ok);$('#maKyErr').textContent='Mã học kỳ chưa đúng dạng, ví dụ 2627_HK1.';
    const fl=$('#fLop').files[0],fd=$('#fDiem').files[0];$('#fileErr').classList.toggle('hide',!!(fl&&fd));$('#fileErr').textContent='Hãy chọn đủ hai file.';
    if(!ok||!fl||!fd)return;
    const fdta=new FormData();fdta.append('ky',ky);fdta.append('file_lop',fl);fdta.append('file_diem',fd);
    f.querySelectorAll('input,button').forEach(x=>x.disabled=true);busy('Đang đọc và kiểm tra hai file theo bộ luật A, B… (thường mất 15–30 giây)');
    try{const r=await (await fetch('api/nap/chuan-bi',{method:'POST',body:fdta})).json();if(r.loi)throw new Error(r.loi);
      nap.doi_soat=await pollCongViec(r.id);nap.buoc=2;render()}
    catch(err){busy('');f.querySelectorAll('input,button').forEach(x=>x.disabled=false);$('#fileErr').classList.remove('hide');$('#fileErr').textContent=err.message}};
  const back=$('#napBack');if(back)back.onclick=()=>{nap.buoc=1;nap.doi_soat=null;render()};
  const okb=$('#napOk');if(okb)okb.onclick=async()=>{okb.disabled=true;back.disabled=true;nap.buoc=3;busy('Đang tính chỉ số của học kỳ và cập nhật phần so sánh qua các kỳ… (khoảng 1 phút, đừng đóng trang)');
    try{const r=await (await fetch('api/nap/xac-nhan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:nap.doi_soat.token})})).json();if(r.loi)throw new Error(r.loi);
      const kq=await pollCongViec(r.id);await taiChung();st.ky=kq.ky;store('ky',st.ky);fillSelects();toast(`Đã nạp xong ${kyInfo(kq.ky).nhan}.`);nap.buoc=1;nap.doi_soat=null;nap.ky='';render()}
    catch(err){toast(err.message,8000);nap.buoc=2;render()}};
  document.querySelectorAll('[data-napl]').forEach(x=>x.onclick=()=>{nap.ky=x.dataset.napl;nap.buoc=1;nap.doi_soat=null;render();setTimeout(()=>$('#fLop')?.focus(),50)});
  document.querySelectorAll('[data-go]').forEach(x=>x.onclick=async()=>{const k=x.dataset.go;if(!confirm(`Gỡ ${kyInfo(k).nhan} khỏi kho? Dữ liệu sạch và kết quả của kỳ này sẽ bị xóa; phần so sánh qua các kỳ được tính lại.`))return;
    x.disabled=true;toast('Đang gỡ học kỳ và tính lại…',60000);
    try{const r=await (await fetch('api/go-ky',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ky:k})})).json();await pollCongViec(r.id);await taiChung();if(!KYS().includes(st.ky))st.ky=KYS().at(-1)||null;fillSelects();toast(`Đã gỡ ${k}.`);render()}
    catch(err){toast(err.message,8000)}});
}

/* ================= MÀN HÌNH: THAM SỐ ================= */
S.thamso=async()=>{
  if(!D.ts)return head('Dữ liệu','Tham số ngưỡng','')+'<section class="card"><p>Chưa đọc được bộ tham số.</p></section>';
  const md=D.ts.mac_dinh,cur=D.ts.ts,diff=[];
  Object.entries(cur).forEach(([g,ds])=>{if(g.startsWith('_')||g==='mau_sac'||g==='pham_vi')return;Object.entries(ds).forEach(([k,v])=>{if(JSON.stringify(v.gia_tri)!==JSON.stringify(md[g]?.[k]?.gia_tri))diff.push([k,md[g]?.[k]?.gia_tri,v.gia_tri])})});
  const ro=!D.local;
  return head('Dữ liệu','Tham số ngưỡng',`Giá trị khởi điểm lấy theo bộ quy tắc thống kê. Khi đổi tham số, hệ thống tính lại <b>toàn bộ</b> ${D.ds.length} học kỳ đã nạp để các kỳ luôn so sánh được với nhau. Bộ tham số hiện tại: phiên bản ${D.ts.phien_ban}.`,ro?'':`<button class="btn btn-secondary" id="tsReset">Khôi phục mặc định</button><button class="btn btn-primary" id="tsSave">Lưu và tính lại ${D.ds.length} học kỳ</button>`)+`
  ${ro?'<div class="alert alert-info"><svg><use href="#i-info"/></svg><div>Bản xem trên GitHub chỉ hiển thị tham số; muốn sửa hãy chạy trên máy.</div></div>':''}
  ${diff.length?`<div class="alert alert-info"><svg><use href="#i-info"/></svg><div><b>Có ${diff.length} tham số khác giá trị mặc định:</b> ${diff.map(([k,a,b])=>`${(TS_TEN[k]||[k])[0]} (${a} → ${b})`).join('; ')}.</div></div>`:''}
  <div class="alert alert-info"><svg><use href="#i-info"/></svg><div>Định hướng chung là khoảng 5–10% học phần có điểm lưu ý. Học kỳ đang xem có ${st.ky&&D.lk.xu_huong[st.ky]?`${pct(D.lk.xu_huong[st.ky].so_hp_co/D.lk.xu_huong[st.ky].so_hp,0)}%`:'—'} học phần có điểm lưu ý.</div></div>
  <div id="tsBusy"></div><div class="err-text hide" id="tsErr" role="alert"></div>
  ${Object.entries(cur).filter(([g])=>!g.startsWith('_')&&g!=='mau_sac'&&g!=='pham_vi').map(([g,ds])=>`<section class="card"><div class="card-head"><h2>${TS_NHOM[g]||g}</h2></div>
    <div class="param-row" style="font-size:14.5px;font-weight:700;padding-top:0" aria-hidden="true"><span>Tham số</span><span>Giá trị đang dùng</span><span class="def">Mặc định</span></div>
    ${Object.entries(ds).map(([k,v])=>{const df=md[g]?.[k]?.gia_tri,[n,dsc]=TS_TEN[k]||[k,v.mo_ta];return `<div class="param-row ${JSON.stringify(df)!==JSON.stringify(v.gia_tri)?'changed':''}"><label for="p-${k}"><span class="pname">${n}</span><span class="pdesc">${dsc}</span><span class="pcode">${k}</span></label><input id="p-${k}" data-ts="${k}" type="number" step="any" value="${v.gia_tri}" ${ro?'disabled':''}><span class="def num">${df}</span></div>`}).join('')}</section>`).join('')}`};
function ganThamSo(){
  const busy=m=>{const el=$('#tsBusy');if(el)el.innerHTML=m?`<div class="busy"><div class="spinner"></div><div>${m}</div></div>`:''};
  const err=m=>{const el=$('#tsErr');el.textContent=m||'';el.classList.toggle('hide',!m)};
  const run=async(url,body)=>{document.querySelectorAll('#tsSave,#tsReset,[data-ts]').forEach(x=>x.disabled=true);err('');busy(`Đang tính lại ${D.ds.length} học kỳ với bộ tham số mới… (khoảng ${D.ds.length} phút, đừng đóng trang)`);
    try{const r=await (await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})).json();if(r.loi)throw new Error(r.loi);await pollCongViec(r.id);await taiChung();toast('Đã lưu tham số và tính lại xong.');render()}
    catch(e){busy('');err(e.message);document.querySelectorAll('#tsSave,#tsReset,[data-ts]').forEach(x=>x.disabled=false)}};
  const s=$('#tsSave');if(s)s.onclick=()=>{const g={};let bad=null;document.querySelectorAll('[data-ts]').forEach(i=>{const v=parseFloat(i.value);i.setAttribute('aria-invalid',isNaN(v));if(isNaN(v))bad=i;else g[i.dataset.ts]=v});if(bad){err('Có ô chưa nhập số hợp lệ.');bad.focus();return}run('api/tham-so',{gia_tri:g})};
  const r=$('#tsReset');if(r)r.onclick=()=>{if(confirm('Khôi phục toàn bộ tham số về giá trị mặc định và tính lại?'))run('api/tham-so/mac-dinh')};
}

/* ================= TRỢ GIÚP ================= */
S.thuatngu=async()=>head(V('thuat_ngu.duong_dan'),V('thuat_ngu.tieu_de'),V('thuat_ngu.mo_ta'))+`
  <section class="card"><div class="card-head"><h2>${V('thuat_ngu.co_ban_tieu_de')}</h2></div><div class="gloss">
    ${VA('thuat_ngu.co_ban').map(([n,d])=>`<div><b>${VMd(n)}</b><span>${VMd(d,{n:TS('so_sv_toi_thieu_lop')??15})}</span></div>`).join('')}
  </div></section>
  <section class="card"><div class="card-head"><h2>${V('thuat_ngu.chi_so_tieu_de')}</h2></div><div class="gloss">${Object.entries(IND).map(([c,[n,d]])=>`<div><b>${n} <span class="hp-code" style="display:inline">(${c})</span></b><span>${d}</span></div>`).join('')}</div></section>
  <section class="card"><div class="card-head"><h2>${V('thuat_ngu.diem_luu_y_tieu_de')}</h2><div class="sub">${V('thuat_ngu.diem_luu_y_mo_ta')}</div></div><div class="gloss">${Object.entries(FLAG).map(([c,[n,d]])=>`<div><b>${n} <span class="hp-code" style="display:inline">(${c})</span></b><span>${d}</span></div>`).join('')}</div></section>
  <section class="card"><div class="card-head"><h2>${V('thuat_ngu.on_dinh_tieu_de')}</h2><div class="sub">${V('thuat_ngu.on_dinh_mo_ta')}</div></div><div class="gloss">${OD_CODES.map(c=>`<div><b>${odTen(c)[0]} <span class="hp-code" style="display:inline">(${V('thuat_ngu.nguoc_voi',{ten:FLAG[odTen(c)[2]]?.[0]||''})})</span></b><span>${odMoTa(c)}</span></div>`).join('')}<div><b>${V('tu_dien.tuong_duong_gv.0')}</b><span>${V('tu_dien.tuong_duong_gv.1',{vung:vi(TS('vung_gan_0')??0.05,2)})}</span></div></div></section>
  <section class="card"><div class="card-head"><h2>${V('thuat_ngu.dac_diem_tieu_de')}</h2></div><div class="gloss">${Object.entries(SIGN).map(([c,[n,,d]])=>`<div><b>${n} <span class="hp-code" style="display:inline">(${c})</span></b><span>${d}</span></div>`).join('')}<div><b>${REPEAT[0]} <span class="hp-code" style="display:inline">(G1)</span></b><span>${REPEAT[1]}</span></div></div></section>`;
S.ds=async()=>{const sw=(n,v)=>`<div class="swatch"><i style="background:var(${v})"></i><b>${n}</b><span class="code">${v}</span></div>`;
  return head('Thiết kế','Design System','Tokens màu, chữ và các thành phần dùng chung (đã duyệt GATE 1). Màu số liệu tuân thủ quy tắc M1–M5: không dùng đỏ, cam, xanh lá để biểu thị số liệu.')+`
  <section class="card"><div class="card-head"><h2>Nhận diện và giao diện</h2></div><div class="sw-grid">${sw('VMU 900','--brand-900')+sw('VMU 800','--brand-800')+sw('VMU 700','--brand-700')+sw('VMU 100','--brand-100')+sw('Nhấn xanh','--acc-blue')+sw('Nhấn mòng két','--acc-teal')+sw('Nhấn tím','--acc-violet')+sw('Nhấn chàm','--acc-indigo')}</div></section>
  <section class="card"><div class="card-head"><h2>Màu số liệu</h2><div class="sub">Độ lớn (M2) · Chiều lệch (M3) · Phân loại (M4) · Hai loại điểm</div></div><div class="sw-grid">${['--b-1','--b-2','--b-3','--b-4','--b-5'].map((v,i)=>sw('Mức '+(i+1),v)).join('')}${sw('Trên kỳ vọng','--dir-up')+sw('Giữa','--dir-mid')+sw('Dưới kỳ vọng','--dir-down')}${[1,2,3,4,5,6].map(i=>sw('Nhóm '+i,'--cat-'+i)).join('')}${sw('Điểm quá trình','--score-qt')+sw('Điểm thi','--score-thi')}</div></section>
  <section class="card"><div class="card-head"><h2>Thành phần</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary">Nút chính</button><button class="btn btn-secondary">Nút phụ</button><button class="btn btn-ghost">Liên kết</button><button class="btn btn-primary" disabled>Vô hiệu</button></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">${fl('H1')}${sg('D6')}${sg('D2')}<span class="tag">Ít sinh viên – đọc thận trọng</span><span class="tag">Không đưa vào thống kê</span></div></section>`};

/* ================= RENDER ================= */
const TITLES={nap:'Nạp học kỳ',thamso:'Tham số',bgh:'Cấp Ban giám hiệu',khoa:'Cấp khoa / viện',bomon:'Cấp bộ môn',truyvet:'Diễn biến qua các học kỳ',thuatngu:'Thuật ngữ',ds:'Design System'};
let renderId=0;
async function render(){
  const id=++renderId,r=S[route()]?route():'bgh';
  document.querySelectorAll('.nav a').forEach(a=>{a.getAttribute('href')==='#'+r?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});
  $('#fKy').classList.toggle('hide',['nap','thamso','ds','thuatngu'].includes(r)||!KYS().length);
  $('#fKhoa').classList.toggle('hide',!['khoa','bomon','truyvet'].includes(r)||!KYS().length);
  $('#fBm').classList.toggle('hide',!['bomon','truyvet'].includes(r)||!KYS().length);
  tip.style.display='none';layout();
  const c=$('#content');
  if(st.ky&&!D.ky[st.ky]&&['bgh','khoa','bomon'].includes(r))c.innerHTML='<div class="loading-page"><div class="spinner"></div>Đang tải số liệu của học kỳ…</div>';
  let html;try{html=await S[r]()}catch(e){console.error(e);html=`<section class="card"><div class="alert alert-warn"><svg><use href="#i-alert"/></svg><div><b>Không tải được dữ liệu.</b> ${esc(e.message)}</div></div></section>`}
  if(id!==renderId)return;
  c.innerHTML=html;
  const hp=$('#selHp');if(hp)hp.onchange=e=>{st.hp=e.target.value;render()};
  document.querySelectorAll('[data-f]').forEach(el=>el.addEventListener('change',e=>{st.f[el.dataset.f]=e.target.value;render()}));
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{st.f.tab=b.dataset.tab;render()});
  document.querySelectorAll('[data-hp]').forEach(a=>a.onclick=()=>{st.bm=a.dataset.bm;st.hp=a.dataset.hp;fillSelects()});
  document.querySelectorAll('[data-hoso]').forEach(a=>{const go=()=>{st.f.hl=a.dataset.hoso;render().then(()=>{const e=document.querySelector('#hoso');if(e)window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-70)})};a.onclick=go;a.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});
  document.querySelectorAll('[data-tabgo]').forEach(a=>a.onclick=()=>{st.bm=a.dataset.bm;fillSelects();setTimeout(()=>{st.f.tab=a.dataset.tabgo;render()},0)});
  if(r==='nap')ganNap();if(r==='thamso')ganThamSo();
  fitCharts();
  document.title=TITLES[r]+' – Phân tích kết quả học phần – Trường ĐH Hàng hải Việt Nam';
}
let rsz,lastW=innerWidth;window.addEventListener('resize',()=>{clearTimeout(rsz);rsz=setTimeout(()=>{if(Math.abs(innerWidth-lastW)>20){lastW=innerWidth;render()}else fitCharts()},150)});
window.addEventListener('hashchange',()=>{const keep=st.f.tab&&route()==='truyvet'?{tab:st.f.tab}:{};st.f=keep;render().then(()=>{$('#content').focus({preventScroll:true});window.scrollTo(0,0)})});

(async function khoiDong(){
  setMini(store('mini')==='1');
  try{const t=await fetch('api/trang-thai',{cache:'no-store'});D.local=t.ok&&(await t.json()).tren_may===true}catch(e){D.local=false}
  document.querySelectorAll('[data-local]').forEach(a=>a.classList.toggle('hide',!D.local&&a.getAttribute('href')==='#nap'));
  $('#modeTag').textContent=D.local?'Chế độ: trên máy (nạp được dữ liệu)':'Chế độ: chỉ xem';
  $('#modeTag').setAttribute('data-tip',D.local?'Đang chạy bằng python chay.py: có thể nạp học kỳ và sửa tham số.':'Bản xem (ví dụ trên GitHub Pages): chỉ đọc báo cáo đã tính sẵn.');
  try{await taiChung()}catch(e){console.error(e)}
  st.ky=KYS().at(-1)||null;                       // mới mở trang: luôn chọn học kỳ mới nhất
  fillSelects();$('#kyFoot').textContent=KYS().length?`Kho có ${KYS().length} học kỳ: ${KYS().map(k=>kyInfo(k).nhan_ngan).join(', ')}.`:'';
  window.__ready=true;await render();
})();
