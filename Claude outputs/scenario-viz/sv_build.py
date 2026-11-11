"""Builds DATA.sv for the Test Scenarios view.
Inputs (cd/sv/):
  mri_test_matrix.html  - the MR-I Test Matrix page (authoritative scenarios; CASES and GROUPS are copied unchanged)
  matrix_results/*.json - results recorded in the Test Matrix (snapshot of its database)
  rs.json   - lib.rs functions: line, params, SQL ops per table, Err texts, calls, permission checks
  fe.json   - frontend invoke() sites, hook usages
  tc.json   - parsed tests/mri_matrix_backend.rs: per case, the command calls in order with refused/accepted branches
  src.json  - lib.rs source of the functions the scenarios touch
  phase1_backend.json, phase2_ui.json, results.json - observed results of the e2e run (7 Nov 2026)
Re-run after reading a newer Test Matrix: new scenarios appear automatically (as Partial/Unmapped until mapped)."""
import json,os,re,glob
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'sv')
J=lambda f:json.load(open(os.path.join(D,f)))
s=open(os.path.join(D,'mri_test_matrix.html')).read()
i=s.index('const CASES = ')+len('const CASES = ');cases,_=json.JSONDecoder().raw_decode(s[i:])
g=re.search(r'const GROUPS = (\{.*?\n\});',s,re.S).group(1)
groups={}
for m in re.finditer(r'\b([A-Z]):\{t:"((?:[^"\\]|\\.)*)",n:"((?:[^"\\]|\\.)*)"\}',g):groups[m.group(1)]={'t':m.group(2),'n':m.group(3)}
rev=re.search(r'Test Script (Rev [0-9.]+)',s).group(1)
rs=J('rs.json');fe=J('fe.json');tc=J('tc.json');src=J('src.json')
p1={c['id']:c for c in J('phase1_backend.json')['cases']}
p1meta=J('phase1_backend.json');p2=J('phase2_ui.json')['cases'];res={r['id']:r for r in J('results.json')}
mres={}
for f in glob.glob(os.path.join(D,'matrix_results','*.json')):
    r=json.load(open(f));k=os.path.basename(f)[:-5]
    mres[k]={'s':r.get('status',''),'at':(r.get('testedAt') or r.get('at') or '')[:10],'src':'Claude Code' if r.get('src')=='claude-code' or r.get('ccRun') else 'Tester','n':(r.get('notes') or '')[:400],'d':(r.get('defect') or '')[:300]}
# ---- code facts (lean) ----
SKIP={'get_connection','chrono_now'}
code={}
for n,v in rs.items():
    ops={}
    for op,t,l in v['ops']:
        o=ops.setdefault(t,{'o':'','l':l});
        c={'SELECT':'S','INSERT':'I','UPDATE':'U','DELETE':'D'}[op]
        if c not in o['o']:o['o']+=c
        o['l']=min(o['l'],l)
    code[n]={'l':v['l'],'el':v['el'],'c':1 if v['cmd'] else 0,'p':v['p'],'r':v['r'],'ops':[[t,o['o'],o['l']] for t,o in ops.items()],
             'errs':v['errs'],'calls':[c for c in v['calls'] if c[0] not in SKIP],'perms':v['perms'],'tx':1 if v['tx'] else 0}
inv={}
for c,f,l,h,e in fe['inv']:inv.setdefault(c,[]).append([h,f,l])
use={}
for h,f,l,c in fe['use']:
    if f.endswith('.ts') and '/hooks/' in f:continue
    use.setdefault(h,[]).append([f,l,c])
# ---- manual mappings (static analysis, not executed) for cases without a backend replay ----
M={
 'S0':[{'u':'Run the installer, start Sprint MMS','fn':'resolve_db_path','note':'Tauri setup() runs resolve_db_path before any command; first start copies resources/beta-start.db to %LOCALAPPDATA%\\com.sprintogs.mms\\assets.db. Not a command: no frontend call.'},{'u':'First window opens','fn':'open_and_migrate_connection','note':'First command opens the database and runs the schema migration.'}],
 'S1':[{'u':'Administration > Data Tools > Backup > Export','comp':'DataBackup','cmd':'export_full_backup'}],
 'S1a':[{'u':'Data Tools > Purging > Clean Slate, then Clean slate','comp':'DataPurging','cmd':'clean_slate_mri'},{'u':'Asset Registry lamps','comp':'AssetRegistry','cmd':'get_assets'},{'u':'Tag history','comp':'AssetRegistry','cmd':'get_asset_tag_history'},{'u':'MR-II triggers','cmd':'get_asset_triggers'}],
 'S3':[{'u':'Templates (MR-I) list','comp':'MriTemplates','cmd':'get_mri_templates'},{'u':'Open a template: header fields','cmd':'get_template_header_fields'},{'u':'Mid fields','cmd':'get_template_mid_fields'},{'u':'Footer fields','cmd':'get_template_footer_fields'},{'u':'Checklist items','cmd':'get_template_checklist_items'}],
 'S7':[{'u':'User picker, pick a user','comp':'UserPickerGate','cmd':'get_app_users'},{'u':'Title bar text','comp':'WindowTitle','note':'WindowTitle sets the window title from the signed-in user; no backend call.'}],
 'E1':[{'u':'IT inserts a cached job number (SQL)','sql':['open_job_numbers','I'],'note':'Direct SQL by IT, outside the app.'},{'u':'Job number is checked on the report','cmd':'check_job_number'}],
 'G7':[{'u':'Edit a header value','comp':'ReportWizard','cmd':'set_mri_report_header_value'},{'u':'IT reads the who/when stamps (SQL)','sql':['mri_report_header_values','S'],'note':'Direct SQL by IT.'}],
 'H7':[{'u':'Login screen tier labels','comp':'UserPickerGate','cmd':'get_app_users'}],
 'H8':[{'u':'App start runs migrations','fn':'open_and_migrate_connection'},{'u':'IT reads app_migrations (SQL)','sql':['app_migrations','S'],'note':'Direct SQL by IT.'}],
 'I1':[{'u':'Asset Registry cards','comp':'AssetRegistry','cmd':'get_assets'}],
 'I2':[{'u':'Card actions and opening an asset','comp':'AssetRegistry','cmd':'get_assets'},{'u':'Save the asset form','comp':'AssetRegistry','cmd':'update_asset'}],
 'I3':[{'u':'MR-I Templates cards','comp':'MriTemplates','cmd':'get_mri_templates'}],
 'I4':[{'u':'Text boxes on every screen','note':'Styling only (CSS); no command or table involved.'}],
 'I5':[{'u':'My Reports: a Draft has no Show flow','comp':'MyReportsQueue','cmd':'get_my_open_mri_reports'}],
 'I6':[{'u':'My Reports > Show flow','comp':'MyReportsQueue','cmd':'get_my_open_mri_reports'},{'u':'Document flow opens','comp':'ReportFlow','cmd':'get_report_flow'}],
 'I12':[{'u':'Permissions of the signed-in user','comp':'ReportFlow','cmd':'get_effective_permissions'},{'u':'Document flow buttons by permission','comp':'ReportFlow','cmd':'get_report_flow'}],
 'I7':[{'u':'Reports to Review > Show flow','comp':'ReportReviewQueue','cmd':'get_reports_needing_supervisor_action'},{'u':'Document flow','comp':'ReportFlow','cmd':'get_report_flow'}],
 'I8':[{'u':'Flow of Report 2 (five faults)','comp':'ReportFlow','cmd':'get_report_flow'}],
 'I9':[{'u':'Carried-forward fault on the next report','comp':'ReportFlow','cmd':'get_report_flow'},{'u':'Carried-forward list','cmd':'get_carried_forward_faults'}],
 'I10':[{'u':'Flow of the ASSET1 Critical report','comp':'ReportFlow','cmd':'get_report_flow'}],
 'I11':[{'u':'Click a box: its screen opens','comp':'ReportFlow','note':'Navigation inside ReportFlow (frontend routing); no extra command.'}],
 'I13':[{'u':'Flow shows the MOC exemption','comp':'ReportFlow','cmd':'get_report_flow'}],
 'J5':[{'u':'Data Tools > Backup: Export','comp':'DataBackup','cmd':'export_full_backup'},{'u':'Import','comp':'DataBackup','cmd':'import_full_backup'},{'u':'Buttons by permission','comp':'DataBackup','cmd':'get_effective_permissions'}],
 'J1':[{'u':'Asset card > Show flow','comp':'AssetRegistry','cmd':'get_assets'},{'u':'Asset history flow','comp':'AssetFlow','cmd':'get_asset_flow'}],
 'J3':[{'u':'Asset flow','comp':'AssetFlow','cmd':'get_asset_flow'},{'u':'Open a report flow from it','comp':'ReportFlow','cmd':'get_report_flow'}],
 'J4':[{'u':'Asset flow: Open report','comp':'AssetFlow','cmd':'get_mri_report'},{'u':'Open triggers','cmd':'get_asset_triggers'}],
 'J8':[{'u':'Dashboard asset history','comp':'Dashboard','cmd':'get_assets_with_mri_history_summary'},{'u':'Show flow','comp':'AssetFlow','cmd':'get_asset_flow'}],
 'L1':[{'u':'Asset Registry tag lamps','comp':'AssetRegistry','cmd':'get_assets'},{'u':'Lamp component','comp':'TagLamp','note':'components/Instruments.tsx TagLamp draws the Red/Yellow/Green lamp from assets.tag_status.'}],
 'L2':[{'u':'Select Asset For Report lamps','comp':'SelectAssetForReport','cmd':'get_assets'},{'u':'Dashboard cards','comp':'Dashboard','cmd':'get_assets_with_mri_history_summary'}],
 'L3':[{'u':'Dashboard stat cards','comp':'Dashboard','cmd':'get_assets_with_mri_history_summary'}],
 'L4':[{'u':'Main Menu KPIs','comp':'MainMenu','cmd':'get_assets'},{'u':'Open defects count','comp':'MainMenu','cmd':'get_pending_mri_fault_rectifications'}],
 'L5':[{'u':'Lamps and cards in each theme','comp':'TagLamp','note':'Theme colours come from lib/theme.ts (VISIBLE_THEMES); styling only.'}],
 'L6':[{'u':'Gauges at a small window','comp':'Gauge','note':'components/Instruments.tsx Gauge; layout only.'}],
}
for k in ['K1','K2','K3','K4','K5','K6','K7','K8','K9','K10','K11']:
    M[k]=[{'u':'Theme picker and theme colours','comp':'VISIBLE_THEMES','note':'lib/theme.ts holds the themes; the choice is kept in the browser (frontend only). No command or table involved.'}]
M['K10'].insert(0,{'u':'User selection screen','comp':'UserPickerGate','cmd':'get_app_users'})
# components -> file
comp={}
for n,locs in fe['top'].items():comp[n]=locs[0]
# verify manual references exist
bad=[]
for k,steps in M.items():
    for st in steps:
        for key in ('cmd','fn'):
            if st.get(key) and st[key] not in rs:bad.append((k,st[key]))
        if st.get('comp') and st['comp'] not in comp:bad.append((k,st['comp']))
assert not bad,bad
# ---- per-case technical trace, status ----
def cat(c,t):
    if c['g'] in 'KL' or c['id']=='I4':return 'UI / visual'
    if c['g']=='S':return 'Setup'
    if c['g']=='G' or re.search(r'permission|View only|only the|Who sees',c['title'],re.I):return 'Permission'
    if t and any(e['mode']=='refused' for e in t.get('ev',[])) or re.search(r'refused|required|cannot|must|not offered|invalid',c['title'],re.I):return 'Validation'
    if c['g'] in 'IJ':return 'Document flow'
    return 'Workflow'
scen=[];stat={'Complete':0,'Partial':0,'Unmapped':0}
for c in cases:
    t=tc.get(c['id']);man=M.get(c['id'])
    calls=[x[0] for e in (t or {}).get('ev',[]) for x in e['calls']]
    if t and calls:st='Complete';why='Each call in the backend replay (tests/mri_matrix_backend.rs) runs the real command function; branches and tables come from lib.rs.'
    elif man:
        st='Partial';why='Mapped by static reading of the code (screens, hooks, commands); not replayed by a test, so the order is inferred.' if any(m.get('cmd') for m in man) else 'Frontend-only behaviour (styling or navigation): no command or table to trace.'
    elif t:st='Partial';why='The backend replay checks this case on stored data or marks it UI-only; no command call is recorded.'
    else:st='Unmapped';why='No replay and no static mapping yet.'
    stat[st]+=1
    scen.append({'id':c['id'],'cat':cat(c,t),'st':st,'why':why})
sv={'rev':rev,'groups':groups,'cases':cases,'scen':scen,'code':code,'inv':inv,'use':use,'comp':comp,'src':src,'tc':tc,'man':M,
    'p1':{k:{'s':v['status'],'ch':[[x['label'],x['outcome'],x['detail'][:240]] for x in v['checks']],'e':v.get('error')} for k,v in p1.items()},
    'p1at':p1meta['run_at_local'],
    'p2':{k:{'s':v.get('status'),'ch':[[x['label'],x['outcome'],(x.get('detail') or '')[:200]] for x in v.get('checks',[])],'shots':v.get('screenshots',[])[:8],'at':(v.get('date') or '')[:10],'e':v.get('error')} for k,v in p2.items()},
    'mres':mres}
json.dump(sv,open(os.path.join(D,'..','_sv_data.json'),'w'),separators=(',',':'))
print(len(cases),'scenarios',stat,'bytes',os.path.getsize(os.path.join(D,'..','_sv_data.json')))
