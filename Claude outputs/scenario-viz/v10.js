/* ================= Test Scenarios: animated full-stack execution of each MR-I test case =================
   Data: DATA.sv (built by sv_build.py)
     cases  – MR-I Test Matrix scenarios, copied unchanged (authoritative)
     tc     – parsed backend replay (tests/mri_matrix_backend.rs): command calls in order, refused / accepted branches
     man    – static mappings for cases without a replay (marked Partial)
     code   – lib.rs facts per function: line, params, SQL ops per table, Err texts, calls, permission checks
     inv/use/comp – frontend: command -> hook (file:line) -> components that use the hook
     p1/p2/mres – observed results: backend replay run, UI run, results recorded in the Test Matrix
   Diagrams are generated from these at run time; nothing is drawn by hand per case. */
const SV=DATA.sv;
const SVC={};SV.cases.forEach(c=>SVC[c.id]=c);
const SVS={};SV.scen.forEach(s=>SVS[s.id]=s);
const SV_LANES=[['ui','User / screen'],['fe','Frontend (React)'],['ipc','Tauri IPC'],['be','Rust command'],['rule','Rules and helpers'],['db','Database (SQLCipher)']];
const SV_TRIVIAL=/^(valid_|get_header_field_value$|template_has_header_field$|get_compliance_stage$|sqlite_value|json_|row_to_|map_)/;
const SV_OPN={S:'SELECT',I:'INSERT',U:'UPDATE',D:'DELETE'};
const svState={id:null,mode:lsGet('cd.sv.mode')||'expected',speed:+(lsGet('cd.sv.speed')||1),frame:-1,playing:false,follow:lsGet('cd.sv.follow')!=='0',timer:null,trace:null,filters:{q:'',g:'',cat:'',st:'',map:''},pos:{}};

/* ---------- step model ---------- */
function svFeOf(cmd){/* [{hook,file,line,users:[[file,line,comp]]}] */
  return (SV.inv[cmd]||[]).map(([h,f,l])=>({hook:h,file:f,line:l,users:(SV.use[h]||[])}))}
function svErrMatch(cmd,needle){const c=SV.code[cmd];if(!c||!needle)return null;const n=needle.toLowerCase();
  return c.errs.find(e=>e[0].replace(/\{\}/g,'').toLowerCase().includes(n))||c.errs.find(e=>n.includes(e[0].split('{}')[0].trim().toLowerCase().slice(0,30)))||
    c.errs.find(e=>{/* template with {} placeholders: literal words must be in the text, the rest may fill placeholders */const holes=(e[0].match(/\{\}/g)||[]).length;if(!holes)return false;
      const words=e[0].toLowerCase().split(/[^a-z0-9#]+/);const nw=n.split(/[^a-z0-9#]+/).filter(Boolean);const lit=nw.filter(w=>words.includes(w)).length;return lit>0&&nw.length-lit<=holes})||null}
function svSteps(id){
  const t=SV.tc[id],man=SV.man[id];const steps=[];let checks=[];
  if(t&&t.ev&&t.ev.some(e=>e.calls.length)){
    let last=null,segStart=0;
    t.ev.forEach(e=>{
      e.calls.forEach(([cmd,via])=>{
        const mode=e.mode==='refused'?'refused':e.mode==='accepted'?'accepted':'call';
        if(mode==='call'&&!e.probe){/* plain set-up calls: merge with the same command earlier in this segment */
          for(let k=steps.length-1;k>=segStart;k--){const x=steps[k];if(x.cmd===cmd&&x.mode==='call'&&!x.probe){x.n++;x.lines.push(e.ln);last=x;return}}}
        last={kind:'cmd',cmd,via,mode,needle:e.needle,probe:e.probe,label:mode!=='call'?e.label:null,n:1,lines:[e.ln],checks:[],reads:e.reads||[]};steps.push(last);
        if(mode!=='call'||e.probe)segStart=steps.length});
      if(e.label){const ck={label:e.label,mode:e.mode,ln:e.ln,needle:e.needle};(last?last.checks:checks).push(ck)}
      else if(!e.calls.length&&e.reads&&e.reads.length&&last){last.reads=[...new Set(last.reads.concat(e.reads))]}
    });
    if(checks.length&&steps.length)steps[0].checks=checks.concat(steps[0].checks);
    return {src:'replay',fn:t.fn,l:t.l,steps}}
  if(man){man.forEach(m=>steps.push({kind:m.cmd?'cmd':m.fn?'fn':m.sql?'sql':'ui',cmd:m.cmd||m.fn||null,comp:m.comp,u:m.u,note:m.note,sql:m.sql,mode:'call',n:1,lines:[],checks:[],reads:[]}));
    return {src:'static',steps}}
  if(t)return {src:'replay-nocalls',fn:t.fn,l:t.l,steps:[{kind:'ui',u:t.ui?'Checked on screen only (UI run)':'Checked directly on stored data',mode:'call',n:1,lines:[],checks:(t.ev||[]).filter(e=>e.label).map(e=>({label:e.label,mode:e.mode,ln:e.ln})),reads:[...new Set((t.ev||[]).flatMap(e=>e.reads||[]))]}]};
  return {src:'none',steps:[]}}

/* ---------- graph ---------- */
function svGraph(id){
  const model=svSteps(id);const nodes=[],edges=[],frames=[];const W=176,H=54,GX=44,GY=26,X0=20;
  const colX=i=>X0+i*(W+GX);let y=60;
  const add=(o)=>{nodes.push(o);return o};
  const edge=(a,b,o)=>{const e=Object.assign({id:'e'+edges.length,a:a.id,b:b.id},o||{});edges.push(e);return e};
  const fr=(arr)=>frames.push(arr);
  model.steps.forEach((s,si)=>{
    const sid='s'+si;const rowNodes=[];const seq=si+1;
    const code=s.cmd?SV.code[s.cmd]:null;const fe=s.kind==='cmd'&&s.cmd?svFeOf(s.cmd):[];
    // UI node
    let uiT=s.u, uiSub='';
    if(!uiT){const comps=[...new Set(fe.flatMap(f=>f.users.map(u=>u[2])).filter(Boolean))];
      uiT=comps.length?'Screen: '+comps.slice(0,2).join(', ')+(comps.length>2?' +'+(comps.length-2):''):'No screen calls this';
      uiSub=s.label?s.label:(s.n>1?s.n+' calls in the replay':'')}
    else uiSub=s.comp?s.comp:'';
    const ui=add({id:sid+'ui',lane:0,t:uiT,sub:uiSub,kind:'ui',step:si,gap:!s.u&&!fe.length&&s.kind==='cmd'});
    rowNodes.push(ui);
    let feN=null,ipc=null,be=null,rule=null;const helpers=[],dbs=[];
    if((s.kind==='cmd'||s.kind==='fn')&&s.cmd){
      if(fe.length){const f=fe[0];feN=add({id:sid+'fe',lane:1,t:f.hook,sub:f.file.split('/').pop()+':'+f.line,kind:'fe',fe:f,step:si});
        ipc=add({id:sid+'ipc',lane:2,t:"invoke('"+s.cmd+"')",sub:code?code.p.slice(0,60):'',kind:'ipc',cmd:s.cmd,step:si})}
      else if(s.comp&&SV.comp[s.comp]){feN=add({id:sid+'fe',lane:1,t:s.comp,sub:SV.comp[s.comp][0].split('/').pop()+':'+SV.comp[s.comp][1],kind:'fe',fe:{hook:s.comp,file:SV.comp[s.comp][0],line:SV.comp[s.comp][1],users:[]},step:si})}
      be=add({id:sid+'be',lane:3,t:s.cmd+(s.n>1?' ×'+s.n:''),sub:code?'lib.rs:'+code.l+(code.c?'':' · setup function'):'not found in lib.rs',kind:'be',cmd:s.cmd,step:si,unknown:!code});
      if(code){
        if(s.mode==='refused'){const m=svErrMatch(s.cmd,s.needle);
          rule=add({id:sid+'rule',lane:4,t:m?m[0].replace(/\{\}/g,'…'):'Refused: '+(s.needle||'?'),sub:m?'lib.rs:'+m[1]+' · NO branch':'rule not located in lib.rs',kind:'rule',shape:'diamond',branch:'no',err:m,step:si,cmd:s.cmd,unknown:!m})}
        else if(code.errs.length||code.perms.length){rule=add({id:sid+'rule',lane:4,t:code.errs.length+' check'+(code.errs.length===1?'':'s')+(code.perms.length?' + permission':''),sub:'all pass · YES branch',kind:'rule',shape:'diamond',branch:'yes',step:si,cmd:s.cmd})}
        if(s.mode!=='refused')code.calls.filter(c=>!SV_TRIVIAL.test(c[0])&&SV.code[c[0]]).slice(0,2).forEach((c,k)=>helpers.push(add({id:sid+'h'+k,lane:4,t:c[0],sub:'lib.rs:'+SV.code[c[0]].l+' (called at '+c[1]+')',kind:'helper',cmd:c[0],step:si})));
        const ops=code.ops.slice().sort((a,b)=>(/[IUD]/.test(b[1])?1:0)-(/[IUD]/.test(a[1])?1:0));
        ops.slice(0,4).forEach((o,k)=>{const writes=/[IUD]/.test(o[1]);
          dbs.push(add({id:sid+'d'+k,lane:5,t:o[0],sub:o[1].split('').map(c=>SV_OPN[c]).join(' · '),kind:'db',table:o[0],ops:o[1],line:o[2],step:si,
            skipped:s.mode==='refused'&&writes,rolled:s.probe&&writes}))});
        if(ops.length>4)dbs.push(add({id:sid+'dm',lane:5,t:'+'+(ops.length-4)+' more tables',sub:ops.slice(4).map(o=>o[0]).join(', ').slice(0,60),kind:'dbmore',step:si,cmd:s.cmd}));
        if(code.tx&&dbs.length)dbs[0].tx=1;
      }
    } else if(s.kind==='sql'){dbs.push(add({id:sid+'d0',lane:5,t:s.sql[0],sub:SV_OPN[s.sql[1]]+' · direct SQL by IT',kind:'db',table:s.sql[0],ops:s.sql[1],step:si,direct:1}))}
    else if(s.kind==='ui'&&s.comp&&SV.comp[s.comp]){feN=add({id:sid+'fe',lane:1,t:s.comp,sub:SV.comp[s.comp][0].split('/').pop()+':'+SV.comp[s.comp][1],kind:'fe',fe:{hook:s.comp,file:SV.comp[s.comp][0],line:SV.comp[s.comp][1],users:[]},step:si})}
    if(s.reads&&s.reads.length&&s.kind!=='sql'){s.reads.filter(t=>!dbs.some(d=>d.table===t)).slice(0,3).forEach((t,k)=>dbs.push(add({id:sid+'v'+k,lane:5,t,sub:'SELECT · test verifies',kind:'db',table:t,ops:'S',verify:1,step:si})))}
    // place
    const stack={};let rowH=H;
    nodes.filter(n=>n.step===si).forEach(n=>{const k=n.lane;stack[k]=(stack[k]||0);n.x=colX(n.lane);n.y=y+stack[k]*(H+10);n.w=W;n.h=H;stack[k]++;rowH=Math.max(rowH,stack[k]*(H+10)-10)});
    nodes.filter(n=>n.step===si).forEach(n=>{const p=svState.pos[id+':'+n.id];if(p){n.x=p[0];n.y=p[1]}});
    const lab=(s.mode==='refused'?'refused':s.mode==='accepted'?'accepted':s.probe?'probe (rolled back)':'');
    // edges in execution order
    const chain=[ui,feN,ipc,be].filter(Boolean);const f=[];
    for(let i=1;i<chain.length;i++)f.push(edge(chain[i-1],chain[i],{seq,kind:i===chain.length-1&&!ipc&&!feN?'harness':'req',lab:i===1&&chain[i].kind==='fe'?'event':chain[i].kind==='ipc'?'request':chain[i].kind==='be'?(ipc?'IPC':'call'):''}));
    if(rule)f.push(edge(be,rule,{seq,kind:'eval',lab:'validate'}));
    if(rule&&rule.branch==='no'){const back=feN||ui;f.push(edge(rule,back,{seq,kind:'err',lab:'Err(…)',back:1}))}
    else{const from=rule||be;helpers.forEach(h=>f.push(edge(from,h,{seq,kind:'call',lab:'calls'})));
      dbs.forEach(d=>f.push(edge(d.direct?ui:(helpers.length&&d.table==='asset_tag_history'?helpers[0]:(rule||be||ui)),d,{seq,kind:d.verify?'verify':/[IUD]/.test(d.ops||'')?'write':'read',lab:d.verify?'check':(d.ops||'').length===1?SV_OPN[d.ops]:''})));
      if(be&&(feN||ui)&&(s.kind==='cmd'||s.kind==='fn'))f.push(edge(be,feN||ui,{seq,kind:'resp',lab:'Ok(…)',back:1}))}
    if(feN&&ui&&f.length)f.push(edge(feN,ui,{seq,kind:'show',lab:'render',back:1}));
    // frames: one per edge, nodes light up as reached
    f.forEach(e=>fr({step:si,edge:e.id}));
    s._row={y,h:rowH};y+=rowH+GY+16;
  });
  const w=colX(SV_LANES.length)-GX+20,h=Math.max(y+20,300);
  return {model,nodes,edges,frames,w,h}}

/* ---------- observed (actual) evidence ---------- */
function svObserved(id){
  const p1=SV.p1[id],p2=SV.p2[id],m=SV.mres[id];const out={rows:[],status:null,src:[]};
  if(p1){out.src.push('Backend replay run '+SV.p1at);p1.ch.forEach(c=>out.rows.push({src:'Backend',label:c[0],o:c[1],d:c[2]}));if(p1.e)out.rows.push({src:'Backend',label:'Run error',o:'FAIL',d:p1.e})}
  if(p2){out.src.push('UI run '+(p2.at||''));(p2.ch||[]).forEach(c=>{if(/^\[DB\]/.test(c[0]))return;out.rows.push({src:'UI',label:c[0],o:c[1],d:c[2]})});if(p2.e)out.rows.push({src:'UI',label:'Run error',o:'FAIL',d:String(p2.e).slice(0,240)})}
  if(m)out.status=m;return out}
function svCheckOutcome(id,label){const p1=SV.p1[id];if(!p1||!label)return null;const c=p1.ch.find(x=>x[0]===label);return c?{o:c[1],d:c[2]}:null}

/* ---------- related scenarios index (for cross-navigation) ---------- */
const SVREL={cmd:{},tbl:{},file:{},comp:{}};
(function(){const add=(m,k,id)=>{if(!k)return;(m[k]=m[k]||[]);if(!m[k].includes(id))m[k].push(id)};
  SV.cases.forEach(c=>{const md=svSteps(c.id);md.steps.forEach(s=>{
    if(s.cmd){add(SVREL.cmd,s.cmd,c.id);const code=SV.code[s.cmd];if(code){code.ops.forEach(o=>add(SVREL.tbl,o[0],c.id));code.calls.forEach(x=>add(SVREL.cmd,x[0],c.id))}
      svFeOf(s.cmd).forEach(f=>{add(SVREL.file,f.file,c.id);f.users.forEach(u=>{add(SVREL.file,u[0],c.id);add(SVREL.comp,u[2],c.id)})})}
    if(s.comp){add(SVREL.comp,s.comp,c.id);if(SV.comp[s.comp])add(SVREL.file,SV.comp[s.comp][0],c.id)}
    if(s.sql)add(SVREL.tbl,s.sql[0],c.id);(s.reads||[]).forEach(t=>add(SVREL.tbl,t,c.id))})})})();
function svRelated(title){if(!title)return null;const t=String(title).replace(/^fe:/,'');
  return SVREL.cmd[t]||SVREL.tbl[t]||SVREL.file[t]||SVREL.comp[t]||(Object.keys(SVREL.file).find(f=>f.endsWith('/'+t))?SVREL.file[Object.keys(SVREL.file).find(f=>f.endsWith('/'+t))]:null)}
(function(){const _i=inspect;inspect=function(o){_i(o);if(!o||!o.title||state.view==='scen')return;const ids=svRelated(o.title);if(!ids||!ids.length)return;
  const box=$('#insp');const sec=H('div',{class:'svrel'},H('h5',{},'Related test scenarios ('+ids.length+')'),H('div',{class:'chips'},ids.slice(0,40).map(id=>H('button',{class:'chip',title:SVC[id]?SVC[id].title:id,onclick:()=>go('scen',id)},id))));
  const j=box.querySelector('h5:last-of-type');box.append(sec)}})();
(function(){const _b=buildIndex;buildIndex=function(){_b();SV.cases.forEach(c=>INDEX.push({k:'scenario',l:c.id+' '+c.title,s:(SV.groups[c.g]||{}).t+' · '+SVS[c.id].st,v:'scen',f:c.id}))}})();

/* ---------- view ---------- */
GROUPS.splice(GROUPS.findIndex(g=>g[0]==='Behaviour')+1,0,['Testing',['scen']]);
if(typeof EXPLAIN!=='undefined')EXPLAIN.scen=['Every MR-I test case from the Test Matrix, replayed as an animated path from the screen through Tauri IPC and the Rust command down to the tables it reads and writes.',
 'Pick a case on the left. Lanes run left to right: user, frontend, IPC, Rust command, rules and helpers, database. Rows run top to bottom in execution order; numbers on the arrows give the order. A diamond is a rule: green YES means all checks passed, red NO means the command refused with that message. Dashed grey tables were not written because the call was refused or rolled back. Press Play, or step through. Expected follows the replay and the MR-I text; Actual colours each step by the observed run; Compare lists where they differ.',
 'Tracing a test case to the code that runs it, finding every test that touches a command, table or screen, and reviewing failures against the specification.'];
VIEWS.scen={label:'Test Scenarios',q:'Pick an MR-I test case and watch how MMS runs it, from the screen through the code to the database.',render(host,focus){
  if(focus&&SVC[focus])svState.id=focus;if(!svState.id)svState.id=SV.cases[0].id;
  svStop();svState.frame=-1;
  host.classList.add('svhost');
  const list=H('div',{class:'svlist'}),main=H('div',{class:'svmain'});host.append(list,main);
  svRenderList(list);svRenderMain(main);
}};

function svBadge(st){return H('span',{class:'svb svb-'+st.toLowerCase()},st)}
function svResBadge(id){const m=SV.mres[id];const s=m&&m.s?m.s:'';return H('span',{class:'svr svr-'+(s||'none')},s?({pass:'Pass',fail:'Fail',blocked:'Blocked'}[s]||s):'Not run')}
function svRenderList(list){
  list.innerHTML='';const f=svState.filters;
  const q=H('input',{type:'search',placeholder:'Search ID, title, command, table',value:f.q,'aria-label':'Search scenarios'});
  const sel=(k,opts,lab)=>{const s=H('select',{'aria-label':lab},H('option',{value:''},lab),opts.map(o=>H('option',{value:o[0],selected:f[k]===o[0]?'':null},o[1])));s.onchange=()=>{f[k]=s.value;draw()};return s};
  const gs=Object.keys(SV.groups).map(g=>[g,g+' · '+SV.groups[g].t]);
  const cats=[...new Set(SV.scen.map(s=>s.cat))].map(c=>[c,c]);
  list.append(H('div',{class:'svfilters'},q,sel('g',gs,'All modules'),sel('cat',cats,'All categories'),sel('st',[['pass','Pass'],['fail','Fail'],['blocked','Blocked'],['none','Not run']],'Any result'),sel('map',[['Complete','Complete'],['Partial','Partial'],['Unmapped','Unmapped']],'Any mapping')));
  const invb=H('button',{class:'svbtn svinvb','aria-pressed':String(!!svState.inv),onclick:()=>{svState.inv=!svState.inv;invb.setAttribute('aria-pressed',String(svState.inv));svRenderMain($('.svmain'))}},'Inventory of all scenarios');list.firstChild.append(invb);
  const cnt=H('div',{class:'svcount'});const ul=H('div',{class:'svitems',role:'listbox','aria-label':'MR-I test scenarios'});list.append(cnt,ul);
  q.oninput=()=>{f.q=q.value;draw()};
  function hay(c){const md=svSteps(c.id);return (c.id+' '+c.title+' '+c.who+' '+md.steps.map(s=>(s.cmd||'')+' '+(s.comp||'')+' '+(s.cmd&&SV.code[s.cmd]?SV.code[s.cmd].ops.map(o=>o[0]).join(' '):'')).join(' ')).toLowerCase()}
  const H_={};SV.cases.forEach(c=>H_[c.id]=hay(c));
  function draw(){ul.innerHTML='';let n=0,lastG='';
    SV.cases.forEach(c=>{const s=SVS[c.id];const r=(SV.mres[c.id]||{}).s||'none';
      if(f.g&&c.g!==f.g)return;if(f.cat&&s.cat!==f.cat)return;if(f.st&&r!==f.st)return;if(f.map&&s.st!==f.map)return;
      if(f.q&&!f.q.toLowerCase().split(/\s+/).every(t=>H_[c.id].includes(t)))return;
      if(c.g!==lastG){lastG=c.g;ul.append(H('div',{class:'svgrp'},c.g+' · '+(SV.groups[c.g]||{}).t))}
      n++;const b=H('button',{class:'svit','aria-selected':String(c.id===svState.id),role:'option',onclick:()=>{svState.id=c.id;svState.inv=false;const ib=$('.svinvb');if(ib)ib.setAttribute('aria-pressed','false');svState.frame=-1;svStop();$$('.svit',ul).forEach(x=>x.setAttribute('aria-selected','false'));b.setAttribute('aria-selected','true');svRenderMain($('.svmain'))}},
        H('span',{class:'svid'},c.id),H('span',{class:'svtt'},c.title),H('span',{class:'svmeta'},svBadge(s.st),svResBadge(c.id),H('span',{class:'svcat'},s.cat)));ul.append(b)});
    cnt.textContent=n+' of '+SV.cases.length+' scenarios · '+SV.rev;
    const cur=$('.svit[aria-selected="true"]',ul);if(cur)cur.scrollIntoView({block:'nearest'})}
  draw()}

let svG=null,svApi=null;
function svRenderMain(main){
  svStop();main.innerHTML='';if(svState.inv){svInventory(main);return}const id=svState.id,c=SVC[id],s=SVS[id];svG=svGraph(id);svState.frame=-1;
  // header
  const obs=svObserved(id);
  const hd=H('div',{class:'svhd'},
    H('div',{class:'svtitle'},H('b',{},c.id),' ',c.title,' ',H('small',{},c.asset&&c.asset!=='—'?c.asset:'')),
    H('div',{class:'svhdm'},svBadge(s.st),svResBadge(id),H('span',{class:'svcat'},(SV.groups[c.g]||{}).t),H('span',{class:'svcat'},s.cat),
      H('button',{class:'link',onclick:()=>svInspectScenario(id)},'Scenario text (MR-I)')));
  const modes=segmented([['expected','Expected'],['actual','Actual'],['compare','Compare']],svState.mode,v=>{svState.mode=v;lsSet('cd.sv.mode',v);svRenderMain(main)});
  const btn=(t,l,fn,k)=>H('button',{class:'svbtn',title:l,'aria-label':l,onclick:fn,'data-k':k||''},t);
  const ctr=H('div',{class:'svctl'},modes,
    btn('⏮','Reset',()=>{svStop();svGo(-1)}),btn('◀','Step back',()=>{svStop();svGo(svState.frame-1)}),
    btn('▶','Play',()=>svPlay(),'play'),btn('▶|','Step forward',()=>{svStop();svGo(svState.frame+1)}),
    (()=>{const sp=H('select',{'aria-label':'Playback speed'},[[0.5,'0.5×'],[1,'1×'],[2,'2×'],[4,'4×']].map(o=>H('option',{value:o[0],selected:svState.speed===o[0]?'':null},o[1])));sp.onchange=()=>{svState.speed=+sp.value;lsSet('cd.sv.speed',sp.value)};return sp})(),
    (()=>{const l=H('label',{class:'svfollow'},H('input',{type:'checkbox',checked:svState.follow?'':null,onchange:e=>{svState.follow=e.target.checked;lsSet('cd.sv.follow',svState.follow?'1':'0')}}),' Follow');return l})(),
    H('span',{class:'svpos',id:'svpos'},''),
    H('label',{class:'svbtn svimp',title:'Load a runtime trace JSON captured from MMS'},'Load trace',H('input',{type:'file',accept:'.json,application/json',hidden:'',onchange:e=>svLoadTrace(e.target.files[0])})),
    H('label',{class:'svbtn svimp',title:'Load the Test Matrix Export CSV to refresh results and add new scenarios'},'Load matrix CSV',H('input',{type:'file',accept:'.csv,text/csv',hidden:'',onchange:e=>svLoadCsv(e.target.files[0])})));
  main.append(hd,ctr);
  if(svState.mode==='compare'){main.append(svCompare(id));svInspectScenario(id);return}
  const why=H('div',{class:'svwhy'},H('b',{},s.st+': '),s.why,svG.model.src==='replay'?[' Replay: ',H('code',{},'mri_matrix_backend.rs:'+svG.model.l+' '+svG.model.fn+'()')]:'');
  main.append(why);
  const dg=H('div',{class:'svdg'});main.append(dg);
  const tl=H('div',{class:'svtl',id:'svtl'});main.append(tl);
  if(!svG.nodes.length){dg.append(H('p',{class:'empty',style:'padding:20px'},'No technical mapping yet for this scenario.'));svTimeline(tl);svInspectScenario(id);return}
  const svg=S('svg',{});arrowDefs(svg);
  const d=svg.querySelector('defs');[['arr','var(--red)'],['arg','var(--green)']].forEach(([i,cl])=>d.append(S('marker',{id:i,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},S('path',{d:'M0,0 L10,5 L0,10 z',fill:cl}))));
  // lane bands
  const bands=S('g',{class:'svlanes'});SV_LANES.forEach((l,i)=>{const x=20+i*220-12;bands.append(S('rect',{x,y:8,width:200,height:svG.h-12,rx:8,class:'svlane'}));bands.append(S('text',{x:x+100,y:22,'text-anchor':'middle',class:'svlanet'},l[1]))});svg.append(bands);
  svG.model.steps.forEach((st,si)=>{if(!st._row)return;svg.append(S('text',{x:4,y:st._row.y+14,class:'svrowno'},String(si+1)))});
  const ge=S('g',{}),gn=S('g',{});svg.append(ge,gn);
  const byId={};svG.nodes.forEach(n=>byId[n.id]=n);
  const anchor=(n,side)=>side==='r'?{x:n.x+n.w,y:n.y+n.h/2}:side==='l'?{x:n.x,y:n.y+n.h/2}:side==='b'?{x:n.x+n.w/2,y:n.y+n.h}:{x:n.x+n.w/2,y:n.y};
  function pathOf(e){const a=byId[e.a],b=byId[e.b];
    if(e.back){const p=anchor(a,'b'),q=anchor(b,'b');const dy=Math.max(p.y,q.y)+14;return `M${p.x},${p.y} C${p.x},${dy} ${q.x},${dy} ${q.x},${q.y}`}
    if(Math.abs(a.x-b.x)<5){const p=anchor(a,'b'),q=anchor(b,'t');return `M${p.x},${p.y} L${q.x},${q.y}`}
    const p=anchor(a,a.x<b.x?'r':'l'),q=anchor(b,a.x<b.x?'l':'r');return edgePath(p,q,{mode:'h'})}
  svG.edges.forEach(e=>{const p=S('path',{class:'edge sve sve-'+e.kind,d:pathOf(e),'marker-end':e.kind==='err'?'url(#arr)':'url(#ar)','data-e':e.id});e.el=p;ge.append(p);
    const lb=S('g',{class:'svel'});e.lb=lb;ge.append(lb)});
  function placeLabel(e){const L=e.el.getTotalLength();const q=e.el.getPointAtLength(L*0.5);e.lb.innerHTML='';
    e.lb.append(S('circle',{cx:q.x,cy:q.y,r:8,class:'svseq'}),S('text',{x:q.x,y:q.y+3.5,'text-anchor':'middle',class:'svseqt'},String(e.seq)));
    if(e.lab)e.lb.append(S('text',{x:q.x+11,y:q.y-5,class:'svelt'},e.lab))}
  svG.edges.forEach(placeLabel);
  svG.nodes.forEach(n=>{const cls='svn svn-'+n.kind+(n.gap?' svgap':'')+(n.unknown?' svunk':'')+(n.skipped?' svskip':'')+(n.rolled?' svskip':'')+(n.branch?' svbr-'+n.branch:'');
    const g=node(gn,{id:n.id,x:n.x,y:n.y,w:n.w,h:n.h,t:n.t,sub:n.sub,cls,shape:n.shape==='diamond'?'diamond':n.kind==='db'?null:null,subLines:2,onclick:ev=>{if(g._dragged){g._dragged=false;return}svSelectNode(n)}});
    if(n.kind==='db'){g.querySelector('rect.b').setAttribute('rx',14)}
    if(n.tx)g.append(S('text',{x:n.w-6,y:12,'text-anchor':'end',class:'svtx'},'TX'));
    n.el=g;
    // drag to reposition
    g.addEventListener('pointerdown',ev=>{ev.stopPropagation();const P=svApi.point(ev);const o={x:n.x,y:n.y,px:P.x,py:P.y};g.setPointerCapture(ev.pointerId);
      const mv=e2=>{const Q=svApi.point(e2);const dx=Q.x-o.px,dy=Q.y-o.py;if(Math.abs(dx)+Math.abs(dy)>3)g._dragged=true;n.x=o.x+dx;n.y=o.y+dy;g.setAttribute('transform',`translate(${n.x},${n.y})`);
        svG.edges.filter(e=>e.a===n.id||e.b===n.id).forEach(e=>{e.el.setAttribute('d',pathOf(e));placeLabel(e)})};
      const up=()=>{g.removeEventListener('pointermove',mv);g.removeEventListener('pointerup',up);if(g._dragged)svState.pos[svState.id+':'+n.id]=[n.x,n.y]};
      g.addEventListener('pointermove',mv);g.addEventListener('pointerup',up)})});
  svApi=mountSVG(dg,svg,svG.w,svG.h,{fitWidth:svG.h>svG.w*0.7});
  dg.append(H('div',{class:'svlegend'},[['ui','Screen'],['fe','Frontend'],['ipc','IPC'],['be','Command'],['rule','Rule'],['db','Table']].map(([k,l])=>H('span',{class:'svlg svlg-'+k},l)),H('span',{class:'svlg svlg-act'},'Running'),H('span',{class:'svlg svlg-fail'},'Refused / failed'),H('span',{class:'svlg svlg-skip'},'Not reached')));
  svTimeline(tl);svApplyFrame();svInspectScenario(id);
}

/* ---------- playback ---------- */
function svStop(){svState.playing=false;clearTimeout(svState.timer);const b=$('[data-k="play"]');if(b){b.textContent='▶';b.title='Play'}}
function svPlay(){if(svState.playing){svStop();return}if(!svG||!svG.frames.length)return;if(svState.frame>=svG.frames.length-1)svState.frame=-1;svState.playing=true;const b=$('[data-k="play"]');if(b){b.textContent='❚❚';b.title='Pause'}
  const tick=()=>{if(!svState.playing)return;if(svState.frame>=svG.frames.length-1){svStop();return}svGo(svState.frame+1);svState.timer=setTimeout(tick,900/svState.speed)};tick()}
const SV_RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
function svGo(f){if(!svG)return;svState.frame=Math.max(-1,Math.min(svG.frames.length-1,f));svApplyFrame()}
function svApplyFrame(){if(!svG)return;const f=svState.frame;const id=svState.id;const actual=svState.mode==='actual';
  const done=new Set(),act=new Set();const doneE=new Set();let curE=null;
  for(let i=0;i<=f;i++){const fr=svG.frames[i];const e=svG.edges.find(x=>x.id===fr.edge);if(i<f)doneE.add(e.id);else curE=e;done.add(e.a);if(i<f)done.add(e.b);else act.add(e.b)}
  const failStep=new Set(),okStep=new Set(),noObs=new Set();
  if(actual){svG.model.steps.forEach((s,si)=>{const outs=s.checks.map(c=>svCheckOutcome(id,c.label)).filter(Boolean);
    if(outs.some(o=>o.o==='FAIL'))failStep.add(si);else if(outs.length)okStep.add(si);else noObs.add(si);
    if(svState.trace&&svState.trace[id]){const tr=svState.trace[id];const hit=tr.find(x=>x.cmd===s.cmd);if(s.cmd&&!hit)failStep.add(si);else if(hit&&hit.ok===false&&s.mode!=='refused')failStep.add(si)}})}
  svG.nodes.forEach(n=>{const el=n.el;if(!el)return;el.classList.toggle('svact',act.has(n.id));el.classList.toggle('svdone',done.has(n.id)&&!act.has(n.id));el.classList.toggle('svpend',f>=0&&!done.has(n.id)&&!act.has(n.id));
    el.classList.toggle('svfail',(n.kind==='rule'&&n.branch==='no'&&(done.has(n.id)||act.has(n.id)||f<0))||(actual&&failStep.has(n.step)&&n.kind==='be'));
    el.classList.toggle('svobsok',actual&&okStep.has(n.step)&&n.kind==='be');el.classList.toggle('svnoobs',actual&&noObs.has(n.step)&&n.kind==='be')});
  svG.edges.forEach(e=>{e.el.classList.toggle('svedone',doneE.has(e.id));e.el.classList.toggle('sverun',curE===e);e.el.classList.toggle('svepend',f>=0&&!doneE.has(e.id)&&curE!==e);
    e.el.setAttribute('marker-end',e.kind==='err'?'url(#arr)':curE===e?'url(#arh)':'url(#ar)')});
  $$('.svdot').forEach(x=>x.remove());
  if(curE&&!SV_RM){const L=curE.el.getTotalLength();const dot=S('circle',{r:5,class:'svdot'});curE.el.parentNode.append(dot);const t0=performance.now(),dur=Math.max(250,800/svState.speed);
    const anim=t=>{if(!dot.isConnected)return;const k=Math.min(1,(t-t0)/dur);const q=curE.el.getPointAtLength(L*k);dot.setAttribute('cx',q.x);dot.setAttribute('cy',q.y);if(k<1)requestAnimationFrame(anim)};requestAnimationFrame(anim)}
  const pos=$('#svpos');if(pos)pos.textContent=f<0?'Ready · '+svG.frames.length+' moves':'Move '+(f+1)+' of '+svG.frames.length+' · step '+(svG.frames[f].step+1);
  $$('#svtl [data-si]').forEach(r=>r.classList.toggle('cur',f>=0&&+r.dataset.si===svG.frames[f].step));
  if(f>=0){const n=svG.nodes.find(x=>x.id===curE.b);if(n&&svApi&&svState.follow){const a=svG.nodes.find(x=>x.id===curE.a);svApi.focusOn((a.x+n.x+n.w)/2,(a.y+n.y+n.h)/2,svG.w/880)}if(n&&!svState.playing)svSelectNode(n,true)}
  const cur=$('#svtl .cur');if(cur)cur.scrollIntoView({block:'nearest'})}

/* ---------- timeline ---------- */
function svTimeline(tl){tl.innerHTML='';const id=svState.id;const md=svG.model;
  const hd=H('div',{class:'svtlh'},H('b',{},'Execution timeline'),H('span',{},md.src==='replay'?'Order from the backend replay':md.src==='static'?'Order inferred from the code (not replayed)':'No command sequence'),
    svState.mode==='actual'?H('span',{},'Observed: '+(svObserved(id).src.join(' · ')||'none for this case')+(svState.trace&&svState.trace[id]?' · runtime trace loaded':'')):'');
  tl.append(hd);const tb=H('div',{class:'svtlb'});tl.append(tb);
  const fIdx=si=>svG.frames.findIndex(x=>x.step===si);
  md.steps.forEach((s,si)=>{const code=s.cmd&&SV.code[s.cmd];
    let res='';if(s.mode==='refused'){const m=svErrMatch(s.cmd,s.needle);res='refused: '+(m?m[0].slice(0,90)+' (lib.rs:'+m[1]+')':s.needle)}
    else if(s.mode==='accepted')res='accepted';else if(s.probe)res='probe, rolled back';
    const tabs=code?code.ops.map(o=>o[0]+' '+o[1]).slice(0,4).join(', '):'';
    const row=H('div',{class:'svtlr','data-si':si,onclick:()=>{svStop();svGo(fIdx(si))}},H('span',{class:'svtln'},String(si+1)),
      H('span',{class:'svtlm'},H('b',{},s.cmd||s.u||'step'),s.n>1?' ×'+s.n:'',res?H('span',{class:'svtlres '+(s.mode==='refused'?'bad':'ok')},' '+res):'',tabs?H('small',{},' · '+tabs):'',s.lines.length?H('small',{},' · replay line '+s.lines[0]):''));
    tb.append(row);
    s.checks.forEach(ck=>{const ob=svCheckOutcome(id,ck.label);const o=ob?ob.o:null;
      tb.append(H('div',{class:'svtlc'+(svState.mode==='actual'&&o==='FAIL'?' bad':'')},H('span',{class:'svtln'},'✓'),H('span',{},ck.label,
        svState.mode==='actual'?H('span',{class:'svo svo-'+(o||'none').toLowerCase()},o?(o==='ok'?'observed ok':o==='MATRIX'?'matrix issue':o):'not observed'):'',
        svState.mode==='actual'&&ob&&ob.d?H('small',{},' '+ob.d):'')))})});
  if(svState.mode==='actual'){const ob=svObserved(id);const extra=ob.rows.filter(r=>r.src==='UI');if(extra.length){tb.append(H('div',{class:'svtlh'},H('b',{},'UI run checks')));extra.forEach(r=>tb.append(H('div',{class:'svtlc'+(r.o==='FAIL'?' bad':'')},H('span',{class:'svtln'},'▢'),H('span',{},r.label,H('span',{class:'svo svo-'+String(r.o).toLowerCase()},r.o),r.d?H('small',{},' '+r.d.slice(0,140)):''))))}
    if(svState.trace&&svState.trace[id]){tb.append(H('div',{class:'svtlh'},H('b',{},'Runtime trace')));svState.trace[id].forEach((x,i)=>tb.append(H('div',{class:'svtlc'+(x.ok===false?' bad':'')},H('span',{class:'svtln'},String(i+1)),H('span',{},H('b',{},x.cmd),' ',x.ok===false?'Err: '+(x.err||''):'ok',x.ms!=null?H('small',{},' · '+x.ms+' ms'):'',x.t?H('small',{},' · '+x.t):''))))}}
}

/* ---------- compare ---------- */
function svCompare(id){const c=SVC[id];const md=svSteps(id);const ob=svObserved(id);const wrap=H('div',{class:'svcmp'});
  const disc=[];
  md.steps.forEach((s,si)=>s.checks.forEach(ck=>{const o=svCheckOutcome(id,ck.label);if(!o)disc.push(['Not observed','Step '+(si+1)+' check: '+ck.label,'The replay defines this check but the run has no result for it.']);else if(o.o==='FAIL')disc.push(['Failed','Step '+(si+1)+': '+ck.label,o.d]);else if(o.o==='MATRIX')disc.push(['Spec differs from app',ck.label,o.d])}));
  ob.rows.filter(r=>r.src==='UI'&&r.o==='FAIL').forEach(r=>disc.push(['Failed (UI)',r.label,r.d]));
  if(svState.trace&&svState.trace[id]){const tr=svState.trace[id];const exp=md.steps.filter(s=>s.cmd&&s.kind==='cmd').map(s=>s.cmd);const got=tr.map(x=>x.cmd);
    exp.filter(x=>!got.includes(x)).forEach(x=>disc.push(['Missing step',x,'Expected by the mapping, not in the runtime trace']));got.filter(x=>!exp.includes(x)).forEach(x=>disc.push(['Unexpected step',x,'In the runtime trace, not in the mapping']));
    md.steps.forEach(s=>{if(s.mode==='refused'){const h=tr.find(x=>x.cmd===s.cmd);if(h&&h.ok!==false)disc.push(['Different branch',s.cmd,'Expected a refusal ('+(s.needle||'')+'), trace shows success'])}})}
  const m=ob.status;
  if(m&&m.s==='fail')disc.push(['Recorded result: Fail','Test Matrix',(m.n||'')+(m.d?' · Defect: '+m.d:'')]);
  if(SVS[id].st!=='Complete')disc.push(['Mapping '+SVS[id].st,'Technical mapping',SVS[id].why]);
  wrap.append(H('h4',{},'Discrepancies ('+disc.length+')'));
  wrap.append(disc.length?table(['Type','Where','Detail'],disc.map(d=>({cells:[{h:`<span class="svo svo-${/Fail|Missing|Unexpected|Different/.test(d[0])?'fail':/Spec/.test(d[0])?'matrix':'none'}">${esc(d[0])}</span>`},d[1],d[2]]}))):H('p',{},'No discrepancy found between the expected path and the observed results.'));
  wrap.append(H('h4',{},'Expected results (MR-I, unchanged)'),H('ul',{},c.exp.map(e=>H('li',{},e))));
  wrap.append(H('h4',{},'Observed'),H('p',{class:'svnote'},(ob.src.join(' · ')||'No observed run for this case.')+(m&&m.s?' · Recorded in the Test Matrix: '+m.s+(m.at?' ('+m.at+')':''):' · Not recorded in the Test Matrix')),
    ob.rows.length?table(['Run','Check','Outcome','Detail'],ob.rows.map(r=>({cells:[r.src,r.label,{h:`<span class="svo svo-${esc(String(r.o).toLowerCase())}">${esc(r.o)}</span>`},r.d]}))):H('p',{},'No observed checks.'));
  wrap.append(H('p',{class:'svnote'},'The observed results come from the end-to-end run of 7 Nov 2026 (commit 72671d2 era) and the results recorded in the MR-I Test Matrix. Code has changed since; re-run the harness or load a runtime trace for current behaviour. A diagram existing does not mean the case passed.'));
  return wrap}

/* ---------- inspector content ---------- */
function svFacts(rows){return rows.filter(r=>r[1]!=null&&r[1]!=='')}
const SV_REPO='C:/Users/JessBritanico/Documents/GitHub/MMS-fresh/src/desktop/';
function svOpen(path,line){const p=SV_REPO+path;return `<div class="svopen"><code>${esc(path)}${line?':'+line:''}</code> <a href="vscode://file/${encodeURI(p)}${line?':'+line:''}">Open in VS Code</a></div>`}
function svInspectScenario(id){const c=SVC[id],s=SVS[id];
  const steps=c.steps.map(x=>typeof x==='string'?`<li>${esc(x)}</li>`:`<li>${esc(x.t)}<ol type="a">${x.sub.map(y=>`<li>${esc(y)}</li>`).join('')}</ol></li>`).join('');
  const grid=(c.grids||[]).map(gd=>`<details><summary>${esc(gd.title)}</summary><div class="tw"><table class="t"><thead><tr>${gd.cols.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${gd.rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`).join('');
  inspect({kind:'MR-I scenario · original text',title:c.id+' '+c.title,
    facts:svFacts([['Module',(SV.groups[c.g]||{}).t],['Performed by',esc(c.who)],['Asset',esc(c.asset)],['Category',s.cat+' <small>(derived)</small>'],['Mapping',s.st],['Runner',esc(c.runner||'')]]),
    sections:[['Preconditions (group note)',`<p>${esc((SV.groups[c.g]||{}).n||'')}</p>`],['Test data',c.data&&c.data.length?'<dl class="facts">'+c.data.map(d=>`<dt>${esc(d[0])}</dt><dd>${esc(d[1])}</dd>`).join('')+'</dl>':'<p>None listed.</p>'],
      ['Steps',`<ol class="svsteps">${steps}</ol>`],['Expected result',`<ul>${c.exp.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`]].concat((c.gnotes||[]).length?[['Notes',`<ul>${c.gnotes.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`]]:[]).concat(grid?[['Data grids',grid]]:[])
      .concat([['Technical annotation (not part of MR-I)',`<p>${esc(s.why)}</p>`]]),
    links:[{label:'Traceability',go:()=>go('trace','test:'+c.id)}]})}
function svSelectNode(n,quiet){svG.nodes.forEach(x=>x.el&&x.el.classList.toggle('sel',x===n));const id=svState.id;const step=svG.model.steps[n.step];
  const prev=svG.edges.filter(e=>e.b===n.id).map(e=>svG.nodes.find(x=>x.id===e.a).t),next=svG.edges.filter(e=>e.a===n.id).map(e=>svG.nodes.find(x=>x.id===e.b).t);
  const seq=[['Step',String(n.step+1)+' of '+svG.model.steps.length],['Previous',esc(prev.join(', ')||'—')],['Next',esc(next.join(', ')||'—')]];
  const cr=f=>window._quiet=!!quiet;cr();
  try{
  if(n.kind==='be'||n.kind==='helper'||n.kind==='ipc'){const fn=n.cmd;const c=SV.code[fn];if(!c){inspect({kind:'Rust function',title:fn,body:'Not found in lib.rs. Unverified mapping.',facts:seq});return}
    const callers=Object.keys(SV.code).filter(k=>SV.code[k].calls.some(x=>x[0]===fn));const fe=svFeOf(fn);
    const rel=SVREL.cmd[fn]||[];
    inspect({kind:n.kind==='ipc'?'Tauri IPC request':c.c?'Tauri command (backend)':'Rust function',title:fn,
      facts:svFacts(seq.concat([['Source','lib.rs:'+c.l+'–'+c.el],['Parameters',`<code>${esc(c.p||'none')}</code>`],['Returns',`<code>${esc(c.r||'()')}</code>`],['Transaction',c.tx?'Yes (transaction / savepoint in body)':'No explicit transaction'],
        ['Branch in this step',step&&step.mode==='refused'?'Refused: '+esc(step.needle||''):step&&step.probe?'Accepted inside a probe (rolled back)':step&&step.mode==='accepted'?'Accepted':'Called'],['Calls in replay',step?String(step.n):''],['Replay line',step&&step.lines.length?'mri_matrix_backend.rs:'+step.lines.join(', '):'']])),
      sections:[['Source location',svOpen('src-tauri/src/lib.rs',c.l)],
        ['Input (request payload)',n.kind==='ipc'||c.c?`<p>Arguments sent by <code>invoke('${esc(fn)}', {…})</code>, with the Rust types:</p><p><code>${esc(c.p||'none')}</code></p><p class="svnote">Actual values are not captured by static analysis; load a runtime trace to see them. MR-I test data for this case is in the scenario text.</p>`:''],
        ['Output',`<p><code>${esc(c.r||'()')}</code> · Ok goes back to the frontend hook; Err(String) is shown to the user.</p>`],
        ['Business rules (Err returns)',c.errs.length?'<ul class="svrules">'+c.errs.map(e=>`<li class="${n.step!=null&&step&&step.mode==='refused'&&svErrMatch(fn,step.needle)===e?'hit':''}"><span>${esc(e[0])}</span> <small>lib.rs:${e[1]}</small></li>`).join('')+'</ul>':'<p>No Err returns in this function.</p>'],
        ['Permission checks',c.perms.length?'<ul>'+c.perms.map(p=>`<li><code>${esc(p[0])}</code> <small>lib.rs:${p[1]}</small></li>`).join('')+'</ul>':'<p>None in the backend. Screen access is gated in the frontend by permission codes.</p>'],
        ['Database operations',c.ops.length?'<ul>'+c.ops.map(o=>`<li><button class="link" data-tb="${esc(o[0])}">${esc(o[0])}</button> ${o[1].split('').map(x=>SV_OPN[x]).join(', ')} <small>first at lib.rs:${o[2]}</small></li>`).join('')+'</ul>':'<p>No SQL in this function.</p>'],
        ['Calls',c.calls.length?chips(c.calls.map(x=>x[0]),a=>`<button class="chip" data-fnx="${a}">${a}</button>`):'<p>No other lib.rs functions.</p>'],
        ['Called by',(callers.length?chips(callers,a=>`<button class="chip" data-fnx="${a}">${a}</button>`):'')+(fe.length?'<ul>'+fe.map(f=>`<li>${esc(f.hook)} · <button class="link" data-fe="${esc(f.file)}">${esc(f.file)}:${f.line}</button>${f.users.length?' · used in '+f.users.map(u=>esc(u[2]||'')+' ('+esc(u[0].split('/').pop())+':'+u[1]+')').join(', '):''}</li>`).join('')+'</ul>':'<p>No frontend file calls it (test harness or setup only).</p>')],
        ['Source code',SV.src[fn]?`<details><summary>Show lib.rs:${c.l} (${c.el-c.l+1} lines)</summary><pre class="svsrc">${esc(SV.src[fn])}</pre></details>`:'<p>Source excerpt not bundled.</p>'],
        ['Related test scenarios ('+rel.length+')','<div class="chips">'+rel.slice(0,40).map(x=>`<button class="chip" data-sc="${x}">${x}</button>`).join('')+'</div>']],
      links:[{label:'Code Explorer',go:()=>go('explorer',fn)},{label:'3D Codebase',go:()=>go('code3d','r:'+fn)},{label:'Architecture',go:()=>go('arch')}]})}
  else if(n.kind==='rule'){const c=SV.code[n.cmd];inspect({kind:'Business rule · '+(n.branch==='no'?'NO branch taken':'YES branch taken'),title:n.t,
      facts:svFacts(seq.concat([['Enforced in',n.cmd+(n.err?' · lib.rs:'+n.err[1]:'')],['Outcome',n.branch==='no'?'Command returns Err; no write happens after this check':'All checks passed; the command continues']])),
      sections:[['Why this branch',n.branch==='no'?`<p>The replay set the data so that this rule fails, and expects the refusal text <q>${esc(step&&step.needle||'')}</q>.</p>`:'<p>The replay supplied valid data (or the call is a read). Every Err return listed below was not triggered.</p>'],
        ['All checks in '+n.cmd,c&&c.errs.length?'<ul class="svrules">'+c.errs.map(e=>`<li class="${n.err===e?'hit':''}"><span>${esc(e[0])}</span> <small>lib.rs:${e[1]}</small></li>`).join('')+'</ul>':'<p>None.</p>'],
        ['Rules sheet','<p>See Business Rules for the manual reference of each control.</p>']],
      links:[{label:'Business Rules',go:()=>go('rules')},{label:'Code Explorer',go:()=>go('explorer',n.cmd)}]})}
  else if(n.kind==='db'){const T=DATA.tables[n.table];const rel=SVREL.tbl[n.table]||[];
    inspect({kind:'Database table · '+(n.ops||'').split('').map(x=>SV_OPN[x]).join(' / '),title:n.table,
      facts:svFacts(seq.concat([['Operation',(n.ops||'').split('').map(x=>SV_OPN[x]).join(', ')+(n.direct?' (direct SQL by IT)':n.verify?' (the test reads it to verify)':'')],['State in this step',n.skipped?'Not reached: the command refused before writing':n.rolled?'Written inside a probe, then rolled back':'Executed'],['First SQL at',n.line?'lib.rs:'+n.line:''],['Transaction',n.tx?'Inside a transaction':'']])),
      sections:[['Columns',T?'<div class="tw"><table class="t"><thead><tr><th>Field</th><th>Type</th><th>Key</th><th>Null</th></tr></thead><tbody>'+T.cols.map(c=>`<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td><td>${esc(c[2])}</td><td>${esc(c[3])}</td></tr>`).join('')+'</tbody></table></div>':'<p>Table not in the schema snapshot.</p>'],
        ['Before / after values','<p class="svnote">Row values are not captured by static analysis. The backend replay checks stored values for this case (see Actual mode). A runtime trace with row snapshots would show before and after.</p>'],
        ['Related test scenarios ('+rel.length+')','<div class="chips">'+rel.slice(0,40).map(x=>`<button class="chip" data-sc="${x}">${x}</button>`).join('')+'</div>']],
      links:[{label:'ERD',go:()=>go('erd',n.table)},{label:'3D Codebase',go:()=>go('code3d','t:'+n.table)},{label:'Data Lifecycle',go:()=>go('dataflow')}]})}
  else if(n.kind==='fe'){const f=n.fe;const rel=SVREL.file[f.file]||[];
    inspect({kind:'Frontend · React',title:f.hook,facts:svFacts(seq.concat([['File',esc(f.file)+':'+f.line]])),
      sections:[['Source location',svOpen('src/'+f.file,f.line)],['Used by',f.users&&f.users.length?'<ul>'+f.users.map(u=>`<li>${esc(u[2]||'')} · <button class="link" data-fe="${esc(u[0])}">${esc(u[0])}:${u[1]}</button></li>`).join('')+'</ul>':'<p>—</p>'],
        ['Data handling','<p>The hook wraps <code>invoke()</code> from <code>src/lib/ipc.ts</code> in a React Query query or mutation; on success it refreshes the cached queries so the screen re-renders.</p>'],
        ['Related test scenarios ('+rel.length+')','<div class="chips">'+rel.slice(0,40).map(x=>`<button class="chip" data-sc="${x}">${x}</button>`).join('')+'</div>']],
      links:[{label:'Code Explorer',go:()=>go('explorer','fe:'+f.file)},{label:'3D Codebase',go:()=>go('code3d','f:'+f.file)}]})}
  else if(n.kind==='ui'){svInspectScenario(id);return}
  else inspect({kind:n.kind,title:n.t,body:esc(n.sub||''),facts:seq});
  }finally{window._quiet=false}
  const box=$('#insp');$$('[data-tb]',box).forEach(b=>b.onclick=()=>go('erd',b.dataset.tb));$$('[data-fnx]',box).forEach(b=>b.onclick=()=>go('explorer',b.dataset.fnx));
  $$('[data-fe]',box).forEach(b=>b.onclick=()=>go('explorer','fe:'+b.dataset.fe));$$('[data-sc]',box).forEach(b=>b.onclick=()=>{svState.id=b.dataset.sc;go('scen',b.dataset.sc)})}

/* ---------- imports: runtime trace and Test Matrix CSV ---------- */
function svLoadTrace(file){if(!file)return;file.text().then(t=>{let j;try{j=JSON.parse(t)}catch(e){toast('Not valid JSON');return}
  /* expected: {cases:{ID:[{cmd,ok,err,ms,t}]}} or [{case,cmd,ok,err,ms,t}] */
  const m={};(Array.isArray(j)?j:Object.entries(j.cases||{}).flatMap(([k,v])=>v.map(x=>Object.assign({case:k},x)))).forEach(x=>{if(!x.case||!x.cmd)return;(m[x.case]=m[x.case]||[]).push({cmd:String(x.cmd),ok:x.ok!==false,err:x.err?String(x.err).slice(0,300):'',ms:x.ms,t:x.t})});
  svState.trace=m;toast('Trace loaded for '+Object.keys(m).length+' case(s)');svState.mode='actual';render()})}
function svCsvParse(t){const rows=[];let r=[],v='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){v+='"';i++}else q=false}else v+=c}else if(c==='"')q=true;else if(c===','){r.push(v);v=''}else if(c==='\n'){r.push(v);rows.push(r);r=[];v=''}else if(c!=='\r')v+=c}if(v||r.length){r.push(v);rows.push(r)}return rows}
function svLoadCsv(file){if(!file)return;file.text().then(t=>{const rows=svCsvParse(t);const hi=rows.findIndex(r=>r[0]==='ID'&&r.includes('Result'));if(hi<0){toast('Not a Test Matrix export');return}
  const h=rows[hi],ix=k=>h.indexOf(k);let upd=0,add=0;
  rows.slice(hi+1).forEach(r=>{const id=r[ix('ID')];if(!id)return;const res=(r[ix('Result')]||'').toLowerCase();const s={'pass':'pass','fail':'fail','blocked':'blocked'}[res]||'';
    SV.mres[id]={s,at:(r[ix('Date tested')]||'').slice(0,10),src:r[ix('Tested by')]||'',n:r[ix('Notes')]||'',d:r[ix('Defect')]||''};upd++;
    if(!SVC[id]){const c={id,g:r[ix('Group')]||'?',who:r[ix('Performed by')]||'',title:r[ix('Title')]||id,asset:r[ix('Asset')]||'',data:[['Data',r[ix('Data')]||'']],steps:[r[ix('Steps')]||''],exp:[r[ix('Expected')]||''],runner:''};
      SV.cases.push(c);SVC[id]=c;const sc={id,cat:'Workflow',st:'Unmapped',why:'Added from the Test Matrix CSV; not mapped to code yet. Re-run sv_build.py to map it.'};SV.scen.push(sc);SVS[id]=sc;if(!SV.groups[c.g])SV.groups[c.g]={t:'Group '+c.g,n:''};add++}});
  toast(upd+' results refreshed'+(add?', '+add+' new scenario(s) added':''));render()})}

/* ---------- scenario inventory (deliverable: complete MR-I inventory with technical mapping) ---------- */
function svInvRows(){return SV.cases.map(c=>{const s=SVS[c.id];const md=svSteps(c.id);
  const cmds=[...new Set(md.steps.map(x=>x.cmd).filter(Boolean))];const tbls=[...new Set(cmds.flatMap(k=>SV.code[k]?SV.code[k].ops.map(o=>o[0]):[]).concat(md.steps.flatMap(x=>x.sql?[x.sql[0]]:[])))];
  const comps=[...new Set(md.steps.flatMap(x=>x.comp?[x.comp]:(x.cmd?svFeOf(x.cmd).flatMap(f=>f.users.map(u=>u[2])).slice(0,2):[])).filter(Boolean))];
  const rules=md.steps.filter(x=>x.mode==='refused').map(x=>{const m=svErrMatch(x.cmd,x.needle);return m?m[0]+' (lib.rs:'+m[1]+')':x.needle});
  const steps=c.steps.map((x,i)=>(i+1)+'. '+(typeof x==='string'?x:x.t+' '+x.sub.map((y,k)=>String.fromCharCode(97+k)+') '+y).join(' '))).join(' ');
  return {id:c.id,title:c.title,module:(SV.groups[c.g]||{}).t||c.g,cat:s.cat,who:c.who,desc:(c.data||[]).map(d=>d[0]+': '+d[1]).join(' | '),pre:(SV.groups[c.g]||{}).n||'',steps,exp:c.exp.join(' '),
    screens:comps.join(', '),cmds:cmds.join(', '),tables:tbls.join(', '),rules:rules.join(' | '),status:s.st,result:((SV.mres[c.id]||{}).s||'not run')}})}
function svInventory(main){const rows=svInvRows();const wrap=H('div',{class:'svcmp'});
  const n={Complete:0,Partial:0,Unmapped:0};rows.forEach(r=>n[r.status]++);
  wrap.append(H('h4',{},'MR-I scenario inventory · '+rows.length+' scenarios · '+SV.rev),
    H('p',{class:'svnote'},'Complete '+n.Complete+' · Partial '+n.Partial+' · Unmapped '+n.Unmapped+'. Scenario text is copied unchanged from the MR-I Test Matrix; the Screens, Commands, Tables and Rules columns are technical annotations derived from the code.'),
    H('div',{style:'display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px'},H('button',{class:'svbtn',onclick:()=>svDownload('MR-I_scenario_inventory.csv',svCsv(rows),'text/csv')},'Download inventory (CSV)'),
      H('button',{class:'svbtn',onclick:()=>svDownload('MR-I_scenario_mapping.json',JSON.stringify(SV.cases.map(c=>({id:c.id,status:SVS[c.id].st,why:SVS[c.id].why,source:svSteps(c.id).src,steps:svSteps(c.id).steps.map(x=>({kind:x.kind,cmd:x.cmd||null,component:x.comp||null,mode:x.mode,refusal:x.needle||null,probe:!!x.probe,calls:x.n,replayLines:x.lines,checks:x.checks.map(k=>k.label)}))})),null,1),'application/json')},'Download mapping (JSON)')));
  wrap.append(table(['ID','Title','Module','Category','Screens','Commands','Tables','Rules exercised','Mapping','Result'],rows.map(r=>({cells:[{h:`<button class="link" data-sc="${r.id}">${r.id}</button>`},r.title,r.module,r.cat,r.screens,r.cmds,r.tables,r.rules,{h:`<span class="svb svb-${r.status.toLowerCase()}">${r.status}</span>`},r.result]}))));
  wrap.append(H('h4',{},'How this view is built'),H('div',{class:'svdoc',html:SV_DOC}));
  main.append(wrap);$$('[data-sc]',wrap).forEach(b=>b.onclick=e=>{e.stopPropagation();svState.inv=false;svState.id=b.dataset.sc;go('scen',b.dataset.sc)})}
function svCsv(rows){const cols=[['id','Scenario ID'],['title','Scenario Title'],['module','MMS Module'],['cat','Test Category (derived)'],['who','Performed by'],['desc','Description / test data'],['pre','Preconditions'],['steps','Test Steps'],['exp','Expected Result'],['screens','Screens (code)'],['cmds','Commands (code)'],['tables','Tables (code)'],['rules','Rules exercised (code)'],['status','Diagram Status'],['result','Recorded result']];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';return '﻿'+cols.map(c=>q(c[1])).join(',')+'\r\n'+rows.map(r=>cols.map(c=>q(r[c[0]])).join(',')).join('\r\n')}
async function svDownload(name,text,type){try{const ns=typeof dlReady!=='undefined'?await dlReady:null;if(ns){await ns.save({filename:name,data:new Blob([text],{type})});return}}catch(e){toast('Download was not completed');return}toast('Downloads are available in the published page')}

const SV_DOC=`<ol>
<li><b>Scenarios.</b> <code>sv_build.py</code> reads the MR-I Test Matrix page and copies <code>CASES</code> and <code>GROUPS</code> unchanged. New cases in the matrix appear here on the next build; between builds, <i>Load matrix CSV</i> adds them as Unmapped and refreshes results.</li>
<li><b>Code facts.</b> A static pass over <code>src-tauri/src/lib.rs</code> records, for every function: line range, parameters, return type, SQL operations per table, every <code>Err(…)</code> text with its line, calls to other functions and <code>user_has_permission</code> checks. A pass over <code>src/**/*.ts(x)</code> records every <code>invoke('…')</code> site, the hook that wraps it and the components that use the hook.</li>
<li><b>Execution order.</b> For 94 cases the order comes from <code>tests/mri_matrix_backend.rs</code>, which replays each case through the real command functions; refused calls name the expected error text, which is matched to the <code>Err</code> line in lib.rs. The other cases are mapped by reading the screens and hooks (Partial).</li>
<li><b>Observed results.</b> Backend replay run of ${esc(SV.p1at)}, the UI run (phase2_ui.json) and the results recorded in the Test Matrix. Nothing in Actual mode is predicted.</li>
<li><b>Not known statically.</b> Argument values, row values before and after, timings and the exact React handler that fires the hook. These need a runtime trace.</li>
</ol>
<h5>Runtime trace (recommended, not yet in the app)</h5>
<p>Every call from the frontend passes through <code>src/lib/ipc.ts</code>. A development-only wrapper there could record each call while the e2e harness runs a case, and the file can be loaded with <i>Load trace</i>:</p>
<pre class="svsrc">// src/lib/ipc.ts (proposal; dev builds only)
export async function invoke&lt;T&gt;(command: string, args?: Record&lt;string, unknown&gt;): Promise&lt;T&gt; {
  const t0 = performance.now();
  try { const r = await tauriInvoke&lt;T&gt;(command, args); log(command, true, '', t0); return r; }
  catch (e) { log(command, false, String(e), t0); throw e; }
}
// log() appends {case, cmd, ok, err, ms, t} to window.__mmsTrace when import.meta.env.DEV</pre>
<p>Trace file format: <code>{"cases": {"A4": [{"cmd":"submit_mri_report","ok":false,"err":"Compliance Stage is required…","ms":12,"t":"2026-11-10T09:00:00Z"}]}}</code>. Arguments are left out on purpose so no personal data or secrets are written.</p>`;
