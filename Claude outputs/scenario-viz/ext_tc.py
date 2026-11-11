import re,json,sys
src=open(sys.argv[1]).read();rs=json.load(open(sys.argv[2]))
libfns=set(rs.keys())
def lineof(p):return src.count('\n',0,p)+1
# fn bodies
fns={}
for m in re.finditer(r'^fn\s+([a-z0-9_]+)\s*(?:<[^>]*>)?\(',src,re.M):
    j=src.find('{',m.end());
    # skip signature braces in params? signatures have no braces mostly except impl FnOnce
    k=j+1;d=1;ins=False;esc=False
    while d and k<len(src):
        c=src[k]
        if ins:
            if esc:esc=False
            elif c=='\\':esc=True
            elif c=='"':ins=False
        else:
            if c=='"':ins=True
            elif c=='/' and src[k+1]=='/':k=src.find('\n',k);continue
            elif c=='{':d+=1
            elif c=='}':d-=1
        k+=1
    fns[m.group(1)]=(m.start(),k)
reg=re.findall(r'\("([A-Z][0-9a-z]*)",\s*"([^"]*)",\s*([a-z0-9_]+)\)',src)
tfn=set(fns)
CASEFNS={r[2] for r in reg}
READERS={'tag','tag_reason','tag_hist_count','trig','status_of','hval','fval','approval','rect','qi','qs','qrows','ex','result_row','item','hf','ff','mf','has_hf'}
# helper -> lib commands (transitive, ordered)
memo={}
def helper_calls(n,seen=()):
    if n in memo:return memo[n]
    if n in seen:return []
    s,e=fns[n];b=src[s:e];out=[]
    for m in re.finditer(r'\b([a-z_][a-z0-9_]*)\s*\(',b):
        x=m.group(1)
        if x==n:continue
        if x in libfns and rs[x]['cmd']:
            if x not in out:out.append(x)
        elif x in tfn and x not in('probe',):
            for y in helper_calls(x,seen+(n,)):
                if y not in out:out.append(y)
    memo[n]=out;return out
SQLT=r'(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_]+)'
def helper_reads(n):
    s,e=fns[n];return sorted(set(re.findall(SQLT,src[s:e])))
cases={}
for cid,ttl,fname in reg:
    if fname=='ui_only':cases[cid]={'t':ttl,'ui':True,'ev':[]};continue
    s,e=fns[fname];b=src[s:e];ev=[]
    # statement-wise scan: split on ';\n' roughly by lines
    pos=s
    first=True
    for line in b.split('\n'):
        ln=lineof(pos);pos+=len(line)+1
        if first:first=False;continue
        st=line.strip()
        if not st or st.startswith('//'):continue
        mode='call'
        m=re.search(r't\.(refused|accepted|ok|eq|info|matrix)\(\s*"([^"]*)"',st)
        if m:mode=m.group(1);label=m.group(2)
        else:
            m2=re.search(r't\.(refused|accepted|ok|eq|info|matrix)\(\s*&?format!\(\s*"([^"]*)"',st)
            label=m2.group(2) if m2 else None
            if m2:mode=m2.group(1)
        needle=None
        if mode=='refused':
            mm=re.findall(r'"([^"]*)"\s*\)\s*;?\s*$',st);needle=mm[-1] if mm else None
        probe='probe(' in st
        calls=[]
        for mm in re.finditer(r'\b([a-z_][a-z0-9_]*)\s*\(',st):
            x=mm.group(1)
            if x in libfns and rs[x]['cmd']:calls.append([x,None])
            elif x in tfn and x not in('probe',) and x not in CASEFNS and x not in READERS:
                for y in helper_calls(x):calls.append([y,x])
        reads=[]
        for mm in re.finditer(r'\b([a-z_][a-z0-9_]*)\s*\(',st):
            x=mm.group(1)
            if x in tfn and x in('tag','tag_reason','tag_hist_count','trig','status_of','hval','fval','approval','rect','qi','qs','qrows','ex','result_row'):
                if x in('qi','qs','qrows','ex'):reads+=re.findall(SQLT,st)
                else:reads+=helper_reads(x)
        if calls or mode!='call' or reads:
            ev.append({'ln':ln,'mode':mode,'label':label if mode!='call' else None,'needle':needle,'probe':probe,'calls':calls,'reads':sorted(set(reads))})
    cases[cid]={'t':ttl,'fn':fname,'l':lineof(s),'ev':ev}
json.dump(cases,open(sys.argv[3],'w'))
print(len(cases))
