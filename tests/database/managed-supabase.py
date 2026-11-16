#!/usr/bin/env python3
"""CI-only real Auth/PostgREST/Storage acceptance with generated local credentials."""
import json, os, secrets, subprocess, urllib.request, urllib.error, time
from pathlib import Path
url=os.environ.get('API_URL')
if url!='http://127.0.0.1:54321' or os.environ.get('CAREERDEV_MANAGED_CI')!='synthetic-local-only':
    raise SystemExit('Refusing nonlocal or undesignated API')
container='supabase_db_careerdev-baseline-ci'
if subprocess.check_output(['docker','inspect','--format','{{.Name}}',container],text=True).strip()!='/'+container:
    raise SystemExit('Wrong local database')
service=os.environ['SERVICE_ROLE_KEY']; anon=os.environ['ANON_KEY']
sqlbase=['docker','exec','-i',container,'psql','-XqAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(body):
    r=subprocess.run(sqlbase,input=body,text=True,capture_output=True)
    if r.returncode: raise RuntimeError('Local SQL failed: '+r.stderr[:800])
    return r.stdout.strip()
if sql('select count(*) from auth.users')!='0': raise SystemExit('Refusing populated Auth database')
results=[]
def request(path,token=None,method='GET',data=None,content_type='application/json'):
    payload=(json.dumps(data).encode() if isinstance(data,(dict,list)) else data)
    req=urllib.request.Request(url+path,data=payload,method=method,headers={'apikey':anon,'Authorization':'Bearer '+(token or anon),'Content-Type':content_type})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
def expect(name,ok):
    results.append({'case':name,'status':'PASS' if ok else 'FAIL'})
    if not ok: raise RuntimeError('Acceptance failed: '+name)
users=[]
for n in range(1,7):
    uid=f'11111111-1111-4111-8111-{n:012d}';email=f'fixture-{n}@example.test';password=secrets.token_urlsafe(32)
    status,body=request('/auth/v1/admin/users',service,'POST',{'id':uid,'email':email,'password':password,'email_confirm':True})
    expect('Auth creates synthetic identity '+str(n),status in (200,201) and json.loads(body).get('id')==uid)
    status,body=request('/auth/v1/token?grant_type=password',method='POST',data={'email':email,'password':password})
    payload=json.loads(body);expect('Password login '+str(n),status==200 and payload.get('user',{}).get('id')==uid and bool(payload.get('access_token')))
    users.append((uid,payload['access_token']))
seed=Path('tests/database/synthetic-seed.sql').read_text()
a=seed.index('INSERT INTO auth.users');b=seed.index('INSERT INTO public.profiles',a)
sql(seed[:a]+seed[b:])
sql(Path('supabase/baseline/candidates/marketplace-and-isolation.sql').read_text())
sql(Path('supabase/baseline/candidates/coach-semantic-invalidation.sql').read_text())
sql("NOTIFY pgrst, 'reload schema';")
# Schema reload is asynchronous; no provider/network readiness assumption.
for attempt in range(10):
    status,body=request('/rest/v1/profiles?select=id',users[0][1])
    if status==200:break
    time.sleep(0.5)
for n,(uid,token) in enumerate(users,1):
    status,body=request('/auth/v1/user',token)
    expect('Auth validates session '+str(n),status==200 and json.loads(body).get('id')==uid)
for n,count in [(1,1),(2,1),(3,1),(4,0),(5,2)]:
    status,body=request('/rest/v1/career_profile_versions?select=client_id',users[n-1][1])
    expect('JWT assignment/ownership scope '+str(n),status==200 and len(json.loads(body))==count)
for rpc in ['get_public_coach_directory','get_public_service_directory']:
    status,body=request('/rest/v1/rpc/'+rpc,method='POST',data={})
    expect('Anonymous approved-only '+rpc,status==200 and len(json.loads(body))==1)
status,body=request('/rest/v1/rpc/get_public_coach_matching_candidates',method='POST',data={})
expect('Anonymous matching evidence denied',status in (401,403))
coach='22222222-2222-4222-8222-000000000003'
status,body=request('/rest/v1/coaches?id=eq.'+coach,users[2][1],'PATCH',{'professional_title':'Synthetic JWT profile edit'})
expect('Authenticated coach profile edit',status in (200,204))
expect('API edit invalidates derived cache',sql("select embedding is null and source_text like '%Synthetic JWT profile edit%' from public.coach_semantic_profiles where coach_id='"+coach+"'")=='t')
status,body=request('/rest/v1/coaches?id=eq.22222222-2222-4222-8222-000000000006',users[5][1],'PATCH',{'application_status':'approved'})
expect('Pending JWT cannot approve itself',status==403)
uid,token=users[0];path='/storage/v1/object/client-documents/'+uid+'/actual-synthetic.txt'
status,body=request(path,token,'POST',b'Synthetic acceptance file only','text/plain')
expect('Actual Storage owner upload',status in (200,201))
status,body=request(path,token)
expect('Actual Storage owner download',status==200 and body==b'Synthetic acceptance file only')
status,body=request(path,users[1][1])
expect('Actual Storage unrelated client denied',status in (400,401,403,404) and b'Synthetic acceptance file only' not in body)
status,body=request(path)
expect('Actual Storage anonymous denied',status in (400,401,403,404))
out={'environment':'ephemeral CI local Supabase; recovered application schema; six real synthetic Auth logins; no provider calls','passed':len(results),'failed':0,'results':results,'limits':['Not browser acceptance','Not Calendly/Paystack/embedding provider acceptance','Managed version/configuration may differ from production','Storage physical backup restoration not verified']}
Path('/tmp/managed-supabase-result.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
