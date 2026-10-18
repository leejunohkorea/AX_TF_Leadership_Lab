/* Firebase integration: participant identity and administrator identity are isolated. */
const axAdmin = new URLSearchParams(location.search).has('admin');
let axBackend, axSending=false, axRows=[], axCursor=null, axFilter='';
const axEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function axStatus(t){const n=document.getElementById('cloud-status');if(n)n.textContent=t;}
async function axConnect(){
 if(axBackend)return axBackend;
 axBackend=(async()=>{
 const c=window.AX_FIREBASE_CONFIG;
 if(!c?.apiKey||!c?.projectId)throw Error('Firebase 설정 전입니다. 리포트 PDF는 저장할 수 있습니다.');
 const base='https://www.gstatic.com/firebasejs/11.10.0/';
 const [app,a,f]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
 const instance=app.initializeApp(c,axAdmin?'ax-admin':'ax-participant');
 const auth=a.getAuth(instance);await a.setPersistence(auth,axAdmin?a.browserSessionPersistence:a.browserLocalPersistence);await auth.authStateReady();
 if(!axAdmin&&!auth.currentUser)await a.signInAnonymously(auth);
 return {a,f,auth,db:f.getFirestore(instance)};
 })();
 try{return await axBackend}catch(e){axBackend=null;throw e}
}
async function axSubmit(){
 if(axAdmin||S.stage!==4||axSending)return;
 if(!S.session){const v=prompt('결과를 제출할 교육 회차를 입력하세요.');if(!v?.trim())return;S.session=v.trim().slice(0,80);save();}
 axSending=true;axStatus('제출 중… 네트워크가 복구되면 완료됩니다.');
 try{
 const {f,auth,db}=await axConnect();
 const record=JSON.parse(JSON.stringify(makeRecord()));
 const docId=auth.currentUser.uid+'_'+S.id;
 await f.setDoc(f.doc(db,'axResults',docId),{ownerUid:auth.currentUser.uid,session:S.session,name:S.name,mode:S.mode||'team',record,updatedAt:f.serverTimestamp()});
 S.cloudSubmitted=true;save();axStatus('✓ 진행자에게 제출 완료');
 }catch(e){axStatus('제출 실패 · 다시 제출을 눌러주세요. '+e.message)}finally{axSending=false}
}
function axLoadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('PDF 구성 요소를 불러오지 못했습니다.'))};document.head.append(s)})}
async function axPDF(){
 if(S.stage!==4)return;
 let report;
 try{
 toast('PDF를 만들고 있습니다. 잠시 기다려주세요.');
 if(!window.html2pdf)await axLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
 await document.fonts.ready;
 report=document.createElement('div');report.style.cssText='width:760px;padding:20px;background:#f1f0e9;color:#10262e';
 report.innerHTML='<p>GOOD INSIGHT · '+axEsc(S.session||'개인 실습')+'</p>'+finalView();
 report.querySelectorAll('.noprint,.actions').forEach(n=>n.remove());
 report.querySelectorAll('details').forEach(n=>n.open=true);
 report.querySelectorAll('[data-count]').forEach(n=>n.textContent=n.dataset.count);
 report.querySelectorAll('[data-w]').forEach(n=>n.style.width=n.dataset.w+'%');
 report.querySelectorAll('.scene,.epi article,.scoreline,.archetype').forEach(n=>n.style.breakInside='avoid');
 document.body.append(report);
 await html2pdf().set({margin:10,filename:'AX_리포트_'+S.name.replace(/[^가-힣\w-]/g,'_')+'.pdf',image:{type:'jpeg',quality:.97},html2canvas:{scale:2,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['.scene','.epi article','.scoreline']}}).from(report).save();
 }catch(e){toast(e.message+' 인쇄 / PDF 저장 버튼을 이용해주세요.')}finally{report?.remove()}
}
function axLoginUI(msg=''){
 document.querySelector('header.top .row').innerHTML='<a href="./index.html" style="color:white">교육생 화면</a>';
 document.getElementById('app').innerHTML=`<section class="panel" style="max-width:540px;margin:40px auto"><div class="eyebrow">FACILITATOR</div><h1>진행자 결과실</h1><p>등록된 진행자 계정으로 로그인하세요.</p><form id="ax-login"><label>이메일<input type="email" id="ax-email" required autocomplete="username" style="width:100%;padding:12px"></label><label class="spacing">비밀번호<input type="password" id="ax-password" required autocomplete="current-password" style="width:100%;padding:12px"></label><button class="primary spacing">로그인</button></form><p role="status" id="ax-admin-status">${axEsc(msg)}</p></section>`;
 document.getElementById('ax-login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const {a,auth}=await axConnect();await a.signInWithEmailAndPassword(auth,document.getElementById('ax-email').value.trim(),document.getElementById('ax-password').value);await axAuthorize()}catch(err){document.getElementById('ax-admin-status').textContent='로그인 실패: 계정·권한·연결 설정을 확인하세요. '+err.code}finally{button.disabled=false}};
}
async function axAuthorize(){const {f,db,auth,a}=await axConnect();if(!auth.currentUser)return axLoginUI();const grant=await f.getDoc(f.doc(db,'axAdmins',auth.currentUser.uid));if(!grant.exists()){await a.signOut(auth);return axLoginUI('진행자 권한이 없는 계정입니다.')}axDashboard();await axFetch(true)}
function axDashboard(){document.getElementById('app').innerHTML=`<div class="eyebrow">FACILITATOR DASHBOARD</div><h1>교육 결과 모아보기</h1><section class="panel"><div class="row"><input type="text" id="ax-session" placeholder="회차명 정확히 입력 · 비우면 전체" style="max-width:360px"><button id="ax-search" class="primary">조회 / 새로고침</button><button id="ax-csv">CSV 내려받기</button><button id="ax-logout">로그아웃</button></div><p class="tiny muted">최신 100건씩 불러옵니다. 요약·CSV는 현재 불러온 결과 기준입니다. 개인전과 팀전은 구분해서 해석하세요.</p><p id="ax-summary"></p><p id="ax-admin-status" role="status"></p><div class="tablewrap"><table><thead><tr><th>회차</th><th>이름</th><th>방식</th><th>종합</th><th>성과</th><th>과제</th><th>균형</th><th>성장</th><th>상세</th></tr></thead><tbody id="ax-body"></tbody></table></div><button id="ax-more" class="spacing">100건 더 보기</button></section>`;
 document.getElementById('ax-search').onclick=()=>axFetch(true);
 document.getElementById('ax-more').onclick=()=>axFetch(false);
 document.getElementById('ax-csv').onclick=axCSV;
 document.getElementById('ax-logout').onclick=async()=>{const {a,auth}=await axConnect();await a.signOut(auth);axRows=[];axLoginUI('로그아웃했습니다.')};
}
async function axFetch(reset){
 const status=document.getElementById('ax-admin-status');status.textContent='조회 중…';
 const buttons=['ax-search','ax-more'].map(id=>document.getElementById(id));buttons.forEach(b=>b.disabled=true);
 try{const {f,db}=await axConnect();if(reset){axRows=[];axCursor=null;axFilter=document.getElementById('ax-session').value.trim()}
 const clauses=[];if(axFilter)clauses.push(f.where('session','==',axFilter));clauses.push(f.orderBy('updatedAt','desc'));if(axCursor)clauses.push(f.startAfter(axCursor));clauses.push(f.limit(100));
 const snap=await f.getDocs(f.query(f.collection(db,'axResults'),...clauses));axCursor=snap.docs.at(-1)||axCursor;axRows.push(...snap.docs.map(d=>({docId:d.id,...d.data()})));axRenderRows();status.textContent=snap.size<100?'현재 조건의 결과를 모두 불러왔습니다.':'더 보기를 눌러 다음 결과를 확인하세요.';buttons[1].hidden=snap.size<100;
 }catch(e){status.textContent='조회 실패: '+e.message}finally{buttons.forEach(b=>b.disabled=false)}
}
function axRenderRows(){
 const num=v=>Number.isFinite(v)?v.toFixed(1):'—';
 document.getElementById('ax-body').innerHTML=axRows.map((r,i)=>`<tr><td>${axEsc(r.session)}</td><td>${axEsc(r.name)}</td><td>${r.mode==='solo'?'개인':'팀'}</td>${['total','mission','tasks','balance','learning'].map(k=>`<td>${num(r.record?.scores?.[k])}</td>`).join('')}<td><button class="small" data-detail="${i}">선택 기록</button></td></tr>`).join('')||'<tr><td colspan="9">제출된 결과가 없습니다.</td></tr>';
 document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>axDetail(axRows[Number(b.dataset.detail)]));
 document.getElementById('ax-summary').textContent=['solo','team'].map(mode=>{const rows=axRows.filter(r=>r.mode===mode);return (mode==='solo'?'개인':'팀')+' '+rows.length+'건 · 평균 '+(rows.length?num(rows.reduce((s,r)=>s+(Number(r.record?.scores?.total)||0),0)/rows.length):'—')}).join(' / ');
}
function axDetail(r){const v=r.record;showModal(`<h2>${axEsc(r.name)} · 선택 기록</h2><p>${axEsc(r.session)} / ${axEsc(v.outcome)}</p><p>리더 유형: ${axEsc(LEADERS[v.leaderType]?.n||v.leaderType)} · 패턴: ${axEsc(ARCH[v.archetype]?.n||v.archetype)}</p><p>팀원: ${axEsc(v.team?.join(', '))}</p><p>첫 메시지: ${axEsc(v.kickMsg)}</p>${(v.choices||[]).map(c=>`<section class="panel spacing-s"><b>${Number(c.round)}라운드 · ${axEsc(c.pick)} · ${axEsc(ROUNDS[c.round-1]?.options['ABC'.indexOf(c.pick)]?.title||'')}</b><p>${axEsc(c.headline)}</p><p>개입: ${axEsc(c.ivs?.map(k=>IV[k]?.n||k).join(', '))}</p><p>판단 근거: ${axEsc(c.note||'미작성')}</p></section>`).join('')}`)}
function axCSV(){const safe=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';const rows=[['회차','이름','방식','종합','성과','과제','균형','성장','결과'],...axRows.map(r=>[r.session,r.name,r.mode,...['total','mission','tasks','balance','learning'].map(k=>r.record?.scores?.[k]),r.record?.outcome])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='AX_교육결과.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
if(axAdmin){axLoginUI('연결 확인 중…');axAuthorize().catch(e=>axLoginUI(e.message))}else if(S.stage===4){axStatus(S.cloudSubmitted?'이전에 제출한 결과입니다. 필요하면 다시 제출하세요.':'아직 제출되지 않았습니다. 결과 다시 제출을 눌러주세요.');}
window.addEventListener('online',()=>{if(!axAdmin&&S.stage===4&&!S.cloudSubmitted)axSubmit()});
