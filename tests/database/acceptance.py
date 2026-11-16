#!/usr/bin/env python3
import argparse,subprocess,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--stage',choices=['baseline','candidate','restored','semantic-restored','semantic-rollback'],required=True);p.add_argument('--database',choices=['careerdev_acceptance','careerdev_restore','careerdev_semantic_restore'],default='careerdev_acceptance');a=p.parse_args()
container='careerdev-phase1-db'
label=subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "careerdev.acceptance"}}',container],text=True).strip()
assert label=='phase1-disposable'
base=['docker','exec','-i',container,'psql','-XqAt','-U','postgres','-d',a.database,'-v','ON_ERROR_STOP=1','-c']
results=[]
def check(name,sql,expected,user=None,role='authenticated',denied=False):
 claims=("set local role "+role+";set local request.jwt.claim.role='"+role+"';")
 if user:claims+="set local request.jwt.claim.sub='11111111-1111-4111-8111-"+str(user).zfill(12)+"';"
 r=subprocess.run(base+['begin;'+claims+sql+';rollback;'],capture_output=True,text=True)
 actual='denied' if r.returncode else r.stdout.strip()
 ok=(r.returncode!=0 if denied else r.returncode==0 and actual==expected)
 results.append({'case':name,'status':'PASS' if ok else 'FAIL','expected':'denied' if denied else expected,'actual':actual,'error':r.stderr.strip()[:400] if r.returncode and not denied else None})
check('client sees own profile only','select count(*) from public.profiles','1',1)
check('client sees own career profile','select count(*) from public.career_intelligence_profiles','1',1)
check('client cannot update another profile',"with x as(update public.career_intelligence_profiles set updated_at=now() where profile_id='11111111-1111-4111-8111-000000000002' returning 1)select count(*) from x",'0',1)
check('unassigned coach cannot read client versions','select count(*) from public.career_profile_versions','0',4)
check('assigned coach sees assigned client versions only','select count(*) from public.career_profile_versions','1',3)
check('unassigned coach cannot read comparisons','select count(*) from public.career_profile_comparisons','0',4)
check('unassigned coach cannot read quality runs','select count(*) from public.career_profile_quality_runs','0',4)
check('admin review scope sees both client versions','select count(*) from public.career_profile_versions','2',5)
check('client cannot self-promote',"update public.profiles set role='admin' where id=auth.uid()",None,1,denied=True)
check('storage path owner sees one object','select count(*) from storage.objects','1',1)
check('anonymous cannot read storage metadata','select count(*) from storage.objects',None,role='anon',denied=True)
check('public coach directory approved only','select count(*) from public.get_public_coach_directory()','1',role='anon')
check('public service directory approved only','select count(*) from public.get_public_service_directory()','1',role='anon')
check('raw matching evidence stays private','select public.get_public_coach_matching_candidates()',None,role='anon',denied=True)
check('server matching candidate eligible only',"select jsonb_array_length(public.get_public_coach_matching_candidates())",'1',role='service_role')
check('service role vector retrieval valid verification status',"select jsonb_array_length(public.find_public_coach_matches((ARRAY[1::real]||array_fill(0::real,ARRAY[383]))::extensions.vector))",'1',role='service_role')
check('safe coach profile update succeeds',"update public.coaches set professional_title='Synthetic updated coach' where profile_id=auth.uid();select professional_title from public.coaches where profile_id=auth.uid()",'Synthetic updated coach',3)
out={'stage':a.stage,'environment':'network-disabled local PostgreSQL17; managed adapters, not live Auth/Storage','results':results,'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results)}
Path('docs/database/phase1/acceptance-'+a.stage+'.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2));raise SystemExit(1 if out['failed'] else 0)
