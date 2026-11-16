#!/usr/bin/env python3
"""Real local Edge Runtime gte-small execution; no paid provider/API credentials."""
import json,os,urllib.request,urllib.error,time,math
from pathlib import Path
assert os.environ.get('CAREERDEV_MANAGED_CI')=='synthetic-local-only'
assert os.environ.get('API_URL')=='http://127.0.0.1:54321'
url='http://127.0.0.1:54321/functions/v1/careerdev-coach-matching'
headers={'apikey':os.environ['ANON_KEY'],'Authorization':'Bearer '+os.environ['ANON_KEY'],'Content-Type':'application/json','Origin':'http://localhost:3000'}
results=[]
def call(body,origin=None,method='POST'):
 h=dict(headers)
 if origin:h['Origin']=origin
 r=urllib.request.Request(url,headers=h,data=json.dumps(body).encode() if method=='POST' else None,method=method)
 try:
  with urllib.request.urlopen(r,timeout=120) as x:return x.status,x.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
for attempt in range(20):
 try:status,body=call({},method='OPTIONS')
 except urllib.error.URLError:status=0
 if status==200:break
 time.sleep(1)
assert status==200,'Local Edge function not ready'
def check(name,ok):
 results.append({'case':name,'status':'PASS' if ok else 'FAIL'})
 if not ok:raise RuntimeError(name)
status,body=call({'goal':'Develop a clearer career strategy and interview confidence','mode':'Any format','signals':['Career development']})
if status!=200:raise RuntimeError('Native matching failed: HTTP '+str(status)+' '+body.decode()[:300])
payload=json.loads(body)
check('Reviewed Edge function runs native gte-small',payload.get('model')=='gte-small' and payload.get('engine')=='07B.92')
check('Approved eligible coach only',len(payload.get('matches',[]))==1 and len(payload.get('available_coaches',[]))==1 and payload['matches'][0]['coach_id']=='22222222-2222-4222-8222-000000000003')
check('Invalidated cache uses native semantic fallback',payload.get('fallback') is True)
check('Native embedding yields finite numeric scores',all(isinstance(payload['matches'][0].get(k),(float,int)) and math.isfinite(payload['matches'][0][k]) for k in ['semantic_score','combined_score']))
check('Public response excludes private evidence',all(k not in item for item in payload['matches']+payload['available_coaches'] for k in ['source_text','email','credentials','embedding']))
status,body=call({'goal':'','mode':'Any format','signals':[]});check('Invalid matching input rejected',status==400)
status,body=call({'goal':'Career strategy','mode':'Any format','signals':[]},origin='https://untrusted.example.invalid');check('Untrusted browser origin rejected',status==403)
out={'environment':'local Supabase Edge Runtime and native gte-small model; reviewed #48 source with recovered schema candidates','passed':len(results),'failed':0,'results':results,'limits':['Local emergency rate limiter explicitly configured for fixture; production distributed quota not exercised','No paid model/provider API invoked','Not frontend matching UI acceptance']}
Path('/tmp/matching-runtime-result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
