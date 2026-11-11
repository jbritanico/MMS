import re,json,os,sys
root=sys.argv[1];res={'inv':[],'hooks':{},'use':[]}
files=[]
for dp,dn,fn in os.walk(root):
    if 'node_modules' in dp or '/mock' in dp:continue
    for f in fn:
        if f.endswith(('.ts','.tsx')) and not f.endswith('.d.ts'):files.append(os.path.join(dp,f))
def enclosing(src,pos):
    best=None
    for m in re.finditer(r'(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:useCallback\()?(?:async\s*)?\(?[^=;]*?\)?\s*=>',src[:pos]):
        best=m.group(1) or m.group(2)
    return best
top={}
for p in files:
    src=open(p,encoding='utf8',errors='ignore').read();rel=os.path.relpath(p,root).replace('\\','/')
    # top-level exported function names (hooks and components)
    for m in re.finditer(r'^export\s+(?:default\s+)?function\s+([A-Za-z0-9_]+)|^function\s+([A-Za-z0-9_]+)|^export\s+const\s+([A-Za-z0-9_]+)\s*=',src,re.M):
        n=m.group(1) or m.group(2) or m.group(3);top.setdefault(n,[]).append([rel,src.count('\n',0,m.start())+1])
    for m in re.finditer(r'\binvoke(?:<[^>(]*(?:<[^>]*>)?[^>(]*>)?\(\s*["\']([a-z_0-9]+)["\']',src):
        line=src.count('\n',0,m.start())+1
        # nearest top-level function above
        tl=None
        for mm in re.finditer(r'^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_]+)|^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=',src[:m.start()],re.M):tl=mm.group(1) or mm.group(2)
        res['inv'].append([m.group(1),rel,line,tl,enclosing(src,m.start())])
hooknames={i[3] for i in res['inv'] if i[3]}
for p in files:
    src=open(p,encoding='utf8',errors='ignore').read();rel=os.path.relpath(p,root).replace('\\','/')
    for h in hooknames:
        for m in re.finditer(r'\b'+re.escape(h)+r'\s*\(',src):
            pre=src[max(0,m.start()-30):m.start()]
            if re.search(r'function\s+$',pre):continue
            line=src.count('\n',0,m.start())+1
            tl=None
            for mm in re.finditer(r'^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_]+)|^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=',src[:m.start()],re.M):tl=mm.group(1) or mm.group(2)
            res['use'].append([h,rel,line,tl])
res['top']=top
json.dump(res,open(sys.argv[2],'w'))
print(len(res['inv']),len(hooknames),len(res['use']))
