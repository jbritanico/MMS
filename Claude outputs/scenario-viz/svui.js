/* Test Scenarios: friendlier drawing, plain-word popups and the narration bar. */
const SV_EPLAIN={event:'click',request:'ask',IPC:'send',call:'start',validate:'check rules','Err(…)':'stop',' Ok(…)':'answer','Ok(…)':'answer',render:'show',calls:'side job',SELECT:'read',INSERT:'save',UPDATE:'change',DELETE:'delete',check:'confirm','':''};
const SV_ICON={ /* 16x16 line icons */
 ui:'M2 3h12v8H2z M6 14h4 M8 11v3',
 fe:'M5 4L1.5 8 5 12 M11 4l3.5 4L11 12 M9.5 3l-3 10',
 ipc:'M2 4h12v8H2z M2 4l6 5 6-5',
 be:'M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2 M3.4 3.4l1.4 1.4 M11.2 11.2l1.4 1.4 M3.4 12.6l1.4-1.4 M11.2 4.8l1.4-1.4 M8 5a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
 rule:'M8 1.5L14.5 8 8 14.5 1.5 8z M6 8l1.5 1.5L10.5 6.5',
 helper:'M10.5 2.5a3 3 0 0 0-3.6 3.9L2.5 10.8l2.7 2.7 4.4-4.4a3 3 0 0 0 3.9-3.6l-1.9 1.9-1.6-.4-.4-1.6z',
 db:'M3 4c0-1.4 10-1.4 10 0v8c0 1.4-10 1.4-10 0z M3 4c0 1.4 10 1.4 10 0 M3 8c0 1.4 10 1.4 10 0',
 dbmore:'M3 4c0-1.4 10-1.4 10 0v8c0 1.4-10 1.4-10 0z M3 4c0 1.4 10 1.4 10 0'
};
function svIcon(k,x,y,s){const g=S('g',{class:'svico svico-'+k,transform:`translate(${x},${y}) scale(${s/16})`});g.append(S('path',{d:SV_ICON[k]||SV_ICON.be}));return g}
function svPlainText(n){/* [title, sub] for Plain words mode */
  if(n.kind==='be'){const p=plainCmd(n.cmd);return [p[0]+(n.t.includes('×')?' '+n.t.slice(n.t.indexOf('×')):''),'MMS engine']}
  if(n.kind==='helper')return [plainCmd(n.cmd)[0],'Side job'];
  if(n.kind==='ipc')return ['Ask the engine: '+plainCmd(n.cmd)[0].toLowerCase(),'Message'];
  if(n.kind==='fe')return [n.fe&&/^use[A-Z]/.test(n.fe.hook)?'Prepare: '+plainCmd(n.feCmd||'')[0].toLowerCase():'Screen: '+n.t,'Screen logic'];
  if(n.kind==='db'){const p=plainTbl(n.table);return [p[0],(n.ops||'').split('').map(c=>P_OPS[c]).join(' · ')+(n.verify?' · test confirms':n.direct?' · by IT':'')]}
  if(n.kind==='dbmore')return [n.t,'More saved data'];
  if(n.kind==='rule')return [n.branch==='no'?n.t:'All rules pass',n.branch==='no'?'Stops here':n.t.replace(/check(s?)/,'rule$1')+' checked'];
  return [n.t,n.sub]}
function svDrawNode(gn,n,plain){
  const cls='nd svn svn-'+n.kind+(n.gap?' svgap':'')+(n.unknown?' svunk':'')+(n.skipped||n.rolled?' svskip':'')+(n.branch?' svbr-'+n.branch:'');
  const tt=plain?svPlainText(n):[n.t,n.sub];
  const g=S('g',{class:cls,'data-id':n.id,transform:`translate(${n.x},${n.y})`,tabindex:0,role:'button','aria-label':tt[0]+'. Click to learn more.'});
  if(n.kind==='db'||n.kind==='dbmore'){g.append(S('path',{class:'b',filter:'url(#svsh)',d:`M0,8 C0,-2 ${n.w},-2 ${n.w},8 L${n.w},${n.h-8} C${n.w},${n.h+2} 0,${n.h+2} 0,${n.h-8} Z`}),S('path',{class:'svcyl',d:`M0,8 C0,17 ${n.w},17 ${n.w},8`}))}
  else g.append(S('rect',{class:'b',width:n.w,height:n.h,rx:12,filter:'url(#svsh)'}));
  g.append(S('rect',{class:'svbar',x:0,y:n.kind==='db'?10:6,width:4,height:n.h-(n.kind==='db'?20:12),rx:2}));
  g.append(S('circle',{class:'svicb',cx:24,cy:n.h/2,r:13}),svIcon(n.kind==='dbmore'?'db':n.kind,16,n.h/2-8,16));
  const tl=wrap(tt[0],Math.floor((n.w-52)/6.3)).slice(0,2);if(wrap(tt[0],Math.floor((n.w-52)/6.3)).length>2)tl[1]=tl[1].replace(/.{0,2}$/,'…');
  const sub=tt[1]?wrap(tt[1],Math.floor((n.w-52)/5.4))[0]:'';const total=tl.length*14+(sub?13:0);let y=(n.h-total)/2+1;
  tl.forEach((l,i)=>g.append(S('text',{class:'ttl',x:44,y:y+i*14,'dominant-baseline':'hanging'},l)));
  if(sub)g.append(S('text',{class:'sub',x:44,y:y+tl.length*14+2,'dominant-baseline':'hanging'},sub));
  if(n.tx)g.append(S('text',{x:n.w-8,y:n.kind==='db'?20:14,'text-anchor':'end',class:'svtx'},plain?'all-or-nothing':'TX'));
  gn.append(g);return g}

/* ---------- popup explainer ---------- */
function svClosePop(){const p=$('.svpop');if(p)p.remove();document.removeEventListener('keydown',svPopKey,true)}
function svPopKey(e){if(e.key==='Escape'){e.stopPropagation();svClosePop()}}
function svPop(ev,o){if(!o)return;svClosePop();const main=$('.svmain')||document.body;const r=main.getBoundingClientRect();
  const pop=H('div',{class:'svpop',role:'dialog','aria-label':o.title});
  const head=H('div',{class:'svpoph'},o.k?H('span',{class:'svpopk svlg-'+o.k},(P_KIND[o.k]||[o.k])[0]):'',H('button',{class:'svpopx','aria-label':'Close',onclick:svClosePop},'×'));
  pop.append(head,H('h4',{},o.title),H('p',{},o.text));
  if(o.inTest)pop.append(H('div',{class:'svpopt'},H('b',{},'In this test: '),o.inTest));
  if(o.extra)pop.append(o.extra);
  const act=H('div',{class:'svpopa'});(o.actions||[]).forEach(a=>act.append(H('button',{class:'svbtn',onclick:()=>{svClosePop();a[1]()}},a[0])));if(act.children.length)pop.append(act);
  main.append(pop);
  const cx=(ev&&ev.clientX!=null&&ev.clientX)?ev.clientX:r.left+r.width/2,cy=(ev&&ev.clientY)?ev.clientY:r.top+120;
  const pw=pop.offsetWidth,ph=pop.offsetHeight;let x=cx-r.left+14,y=cy-r.top+14;if(x+pw>r.width-8)x=Math.max(8,cx-r.left-pw-14);if(y+ph>r.height-8)y=Math.max(8,r.height-ph-8);
  pop.style.left=x+'px';pop.style.top=y+'px';
  setTimeout(()=>{const off=e=>{if(!pop.contains(e.target)&&!e.target.closest('.nd,.svel,.svehit,.svlaneh,.svlg,.svrowb,.svq')){svClosePop();document.removeEventListener('pointerdown',off,true)}};document.addEventListener('pointerdown',off,true)},0);
  document.addEventListener('keydown',svPopKey,true);const x_=pop.querySelector('.svpopx');if(x_)x_.focus({preventScroll:true})}
function svWho(){const c=SVC[svState.id];return c?c.who.replace(/\s*\(.*?\)/g,''):'The tester'}
function svNodePop(n){const step=svG.model.steps[n.step];const tech=['Technical details',()=>{svSelectNode(n);const box=$('#insp');if(box&&(window.innerWidth<=1100||document.body.classList.contains('svwide')))box.classList.add('show')}];
  const k=n.kind==='dbmore'?'db':n.kind;
  if(n.kind==='ui'){const c=SVC[svState.id];return {k,title:n.t,text:P_KIND.ui[1],inTest:svWho()+(step&&step.u?': '+step.u+'.':' starts this step on the screen.')+(n.gap?' No screen in MMS calls this action directly; only the automatic test does.':''),actions:[['Read the test steps',()=>svInspectScenario(svState.id)]]}}
  if(n.kind==='fe')return {k,title:svPlainText(n)[0],text:P_KIND.fe[1],inTest:'It takes what was entered on the screen and hands it to the MMS engine.',actions:[tech]};
  if(n.kind==='ipc')return {k,title:'Message: '+plainCmd(n.cmd)[0],text:P_KIND.ipc[1],inTest:'The message asks the engine to "'+plainCmd(n.cmd)[0].toLowerCase()+'".',actions:[tech]};
  if(n.kind==='be'||n.kind==='helper'){const p=plainCmd(n.cmd);const rel=(SVREL.cmd[n.cmd]||[]).length;
    let it=step?(step.n>1?'Done '+step.n+' times in this step. ':''):'';
    if(n.kind==='be'&&step){if(step.mode==='refused')it+='Here the test breaks a rule on purpose, to prove MMS blocks it.';else if(step.probe)it+='MMS accepts it, and the test then undoes it so later tests are not affected.';else if(step.mode==='accepted')it+='MMS accepts it and saves the result.';else it+='MMS carries it out as part of setting up or checking the test.'}
    return {k,title:p[0],text:p[1]+' '+(n.kind==='be'?P_KIND.be[1]:P_KIND.helper[1]),inTest:it||null,extra:rel>1?H('p',{class:'svpopm'},'Used in '+rel+' of the '+SV.cases.length+' tests.'):null,actions:[tech]}}
  if(n.kind==='rule'){if(n.branch==='no')return {k,title:'MMS stops here',text:'This is one of the rules MMS checks before it does anything. The rule was not met, so MMS refuses and shows this message to the user:',extra:H('blockquote',{class:'svq'},n.t),inTest:'The test leaves something out on purpose to prove the rule works. Nothing is saved.',actions:[tech]};
    return {k,title:'All rules pass',text:P_KIND.rule[1],inTest:'MMS checked '+n.t.replace(/ \+ permission/,' rules and a permission')+'. Everything was in order, so it carries on.',actions:[tech]}}
  if(n.kind==='db'||n.kind==='dbmore'){if(n.kind==='dbmore')return {k,title:n.t,text:P_KIND.dbmore[1],actions:[tech]};const p=plainTbl(n.table);
    const ops=(n.ops||'').split('').map(c=>P_OPS[c].toLowerCase());
    let it='MMS will '+ops.join(' and ')+' here.';if(n.skipped)it='Not reached: a rule stopped the action before anything was saved.';else if(n.rolled)it='Saved for a moment, then undone by the test.';else if(n.verify)it='The test reads this to confirm the result is right.';else if(n.direct)it='IT reads or writes this directly with a database tool.';
    return {k,title:p[0],text:p[1],inTest:it,extra:(SVREL.tbl[n.table]||[]).length>1?H('p',{class:'svpopm'},'Touched in '+SVREL.tbl[n.table].length+' of the '+SV.cases.length+' tests.'):null,actions:[tech,['Show in the data diagram',()=>go('erd',n.table)]]}}
  return {title:n.t,text:n.sub||''}}
function svEdgePop(e){const a=svG.nodes.find(x=>x.id===e.a),b=svG.nodes.find(x=>x.id===e.b);const pa=svPlainText(a)[0],pb=svPlainText(b)[0];
  const t=P_EDGE[e.lab]||(e.kind==='write'?P_EDGE.INSERT:e.kind==='read'?P_EDGE.SELECT:'One move in the order MMS works.');
  return {title:'Step '+e.seq+': '+(SV_EPLAIN[e.lab]||'move'),text:t,inTest:'From "'+pa+'" to "'+pb+'".',actions:[['Play from here',()=>{svStop();svGo(svG.frames.findIndex(f=>f.edge===e.id))}]]}}
function svStepPop(si){const s=svG.model.steps[si];const p=s.cmd?plainCmd(s.cmd):[s.u||'Step',''];
  let it=s.mode==='refused'?'A rule stops this action on purpose.':s.probe?'Tried, then undone.':s.mode==='accepted'?'Accepted.':'';
  return {title:'Step '+(si+1)+': '+p[0],text:p[1]||'',inTest:it||null,extra:s.checks.length?H('ul',{class:'svpopl'},s.checks.slice(0,6).map(c=>H('li',{},c.label))):null}}
function svBadgePop(key){const b=P_BADGE[key];return b?{title:b[0],text:b[1]}:null}

/* ---------- narration ---------- */
function svStory(f){const el=$('#svstory');if(!el)return;const bar=$('#svprog');
  if(!svG||!svG.frames.length){el.textContent='No steps to play for this test.';return}
  if(bar)bar.style.width=(f<0?0:(f+1)/svG.frames.length*100)+'%';
  if(f<0){el.innerHTML='';el.append(H('b',{},'Ready. '),'Press Play to watch '+svG.model.steps.length+' step'+(svG.model.steps.length===1?'':'s')+' of this test, or click anything in the picture to learn what it is.');return}
  const fr=svG.frames[f];const e=svG.edges.find(x=>x.id===fr.edge);const a=svG.nodes.find(x=>x.id===e.a),b=svG.nodes.find(x=>x.id===e.b);const pa=svPlainText(a)[0],pb=svPlainText(b)[0];
  const who=svWho().split(' ')[0];let s;
  switch(e.kind){
    case 'req':s=b.kind==='fe'?who+' uses the screen; the screen logic picks it up.':b.kind==='ipc'?'The screen logic sends a message to the MMS engine.':'The MMS engine starts: '+pb+'.';break;
    case 'harness':s='The automatic test asks the MMS engine directly: '+pb+'.';break;
    case 'eval':s=b.branch==='no'?'MMS checks its rules… one is not met.':'MMS checks its rules… all pass.';break;
    case 'err':s='MMS stops and tells the user: "'+a.t.slice(0,120)+'". Nothing is saved.';break;
    case 'call':s='Side job: '+pb.toLowerCase()+'.';break;
    case 'write':s='MMS saves to '+pb+' ('+svPlainText(b)[1].toLowerCase()+').';break;
    case 'read':s='MMS reads '+pb+'.';break;
    case 'verify':s='The test looks at '+pb+' to confirm the result.';break;
    case 'resp':s='The engine sends the answer back to the screen.';break;
    case 'show':s='The screen updates to show the result.';break;
    default:s=pa+' → '+pb}
  el.innerHTML='';el.append(H('span',{class:'svstn'},'Step '+(fr.step+1)),' '+s);
  if(f===svG.frames.length-1){const st=svG.model.steps;const rules=st.filter(x=>x.mode==='refused').length;const tbl=new Set(svG.nodes.filter(n=>n.kind==='db').map(n=>n.table)).size;
    el.append(H('span',{class:'svdone'},' ✓ Finished: '+st.length+' steps'+(rules?', '+rules+' rule stop'+(rules>1?'s':''):'')+', '+tbl+' kinds of saved data.'))}}
