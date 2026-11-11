import re,json,sys
src=open(sys.argv[1]).read();L=src.split('\n')
def lineof(pos):return src.count('\n',0,pos)+1
# find fns
fnre=re.compile(r'^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(<[^>]*>)?\s*\(',re.M)
fns=[]
for m in fnre.finditer(src):
    if m.group(1)!='' and len(m.group(1))>4: continue
    # params
    i=m.end();depth=1
    while depth and i<len(src):
        c=src[i];depth+= c=='(';depth-= c==')';i+=1
    params=src[m.end():i-1]
    j=src.find('{',i);sig_tail=src[i:j]
    if ';' in sig_tail: continue
    # body brace match ignoring strings roughly
    k=j+1;d=1;instr=False;esc=False;raw=False
    while d and k<len(src):
        c=src[k]
        if instr:
            if esc:esc=False
            elif c=='\\' and not raw:esc=True
            elif c=='"':
                instr=False
        else:
            if c=='"':instr=True;raw=src[k-1]=='r'
            elif c=='/' and src[k+1]=='/':
                k=src.find('\n',k);continue
            elif c=='{':d+=1
            elif c=='}':d-=1
        k+=1
    pre=src[max(0,m.start()-80):m.start()]
    fns.append(dict(n=m.group(2),s=m.start(),e=k,l=lineof(m.start()),el=lineof(k),cmd='#[tauri::command]' in pre.split('\n}')[-1] if '#[tauri::command]' in pre else False,params=re.sub(r'\s+',' ',params).strip(),ret=re.sub(r'\s+',' ',sig_tail.replace('->','').strip())))
names={f['n'] for f in fns}
# remove nested duplicates (keep outermost) -- fns inside other fns rare
out={}
tbl=r'([a-z_][a-z0-9_]*)'
for f in fns:
    b=src[f['s']:f['e']];base=f['s']
    ops=[]
    for rx,op in [(r'INSERT\s+(?:OR\s+\w+\s+)?INTO\s+'+tbl,'INSERT'),(r'UPDATE\s+'+tbl+r'\s+SET','UPDATE'),(r'DELETE\s+FROM\s+'+tbl,'DELETE'),(r'(?:FROM|JOIN)\s+'+tbl,'SELECT')]:
        for m in re.finditer(rx,b):
            t=m.group(1)
            if t in ('the','a','an','sqlite_master','pragma_table_info','json_each'):continue
            if op=='SELECT':
                # skip DELETE FROM
                if re.search(r'DELETE\s+$',b[max(0,m.start()-8):m.start()]):continue
            ops.append([op,t,lineof(base+m.start())])
    # dynamic DELETE FROM {} list (clean slate)
    errs=[]
    for m in re.finditer(r'Err\(\s*(?:format!\(\s*)?"((?:[^"\\]|\\.)*)"',b):
        errs.append([m.group(1),lineof(base+m.start())])
    for m in re.finditer(r'return Err\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)',b):pass
    calls=[]
    for m in re.finditer(r'\b([a-z_][a-z0-9_]*)\s*\(',b):
        n=m.group(1)
        if n in names and n!=f['n'] and n not in [c[0] for c in calls]:
            calls.append([n,lineof(base+m.start())])
    perms=[[m.group(1),lineof(base+m.start())] for m in re.finditer(r'user_has_permission\([^"]*"([a-z_.]+)"',b)]
    tx=bool(re.search(r'transaction\(|BEGIN|SAVEPOINT',b))
    rec=dict(l=f['l'],el=f['el'],cmd=f['cmd'],p=f['params'][:300],r=f['ret'][:120],ops=ops,errs=errs,calls=calls,perms=perms,tx=tx)
    if f['n'] in out: continue
    out[f['n']]=rec
json.dump(out,open(sys.argv[2],'w'))
print(len(out),sum(1 for v in out.values() if v['cmd']))
# patch: dynamic DELETE FROM {} over a literal table list
for f in fns:
    b=src[f['s']:f['e']]
    if 'DELETE FROM {}' in b:
        m=re.search(r'for\s+\w+\s+in\s+\[(.*?)\]',b,re.S)
        if m:
            for t in re.finditer(r'"([a-z_]+)"',m.group(1)):
                out[f['n']]['ops'].append(['DELETE',t.group(1),lineof(f['s']+m.start()+t.start())])
json.dump(out,open(sys.argv[2],'w'))
