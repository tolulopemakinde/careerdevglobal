#!/usr/bin/env python3
"""Transactional SQL integration checks. Never accepts a remote URL."""
import json, subprocess, argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--database',choices=['careerdev_acceptance','careerdev_semantic_restore'],default='careerdev_acceptance');args=p.parse_args()
container='careerdev-phase1-db'
for field,expected in [('{{index .Config.Labels "careerdev.acceptance"}}','phase1-disposable'),('{{.HostConfig.NetworkMode}}','none')]:
    if subprocess.check_output(['docker','inspect','--format',field,container],text=True).strip()!=expected:
        raise SystemExit('Refusing non-isolated fixture')
base=['docker','exec','-i',container,'psql','-XqAt','-U','postgres','-d',args.database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-c']
results=[]
coach='22222222-2222-4222-8222-000000000003'
pending='22222222-2222-4222-8222-000000000006'
def check(name,sql,expected=None,user=3,denied=False,setup='',verify=''):
    claims=f"set local role authenticated;set local request.jwt.claim.sub='11111111-1111-4111-8111-{user:012d}';set local request.jwt.claim.role='authenticated';"
    r=subprocess.run(base+['begin;'+setup+claims+sql+';'+('reset role;'+verify+';' if verify else '')+'rollback;'],text=True,capture_output=True)
    ok=(r.returncode!=0 and '42501' in r.stderr) if denied else (r.returncode==0 and r.stdout.strip()==expected)
    results.append({'case':name,'status':'PASS' if ok else 'FAIL','expected':'SQLSTATE 42501' if denied else expected,'actual':r.stderr.strip() if r.returncode else r.stdout.strip()})
check('owner edits invalidate vector and recompute source without changing model',f"update public.coaches set professional_title='Synthetic revised title' where id='{coach}'",'t',verify=f"select embedding is null and source_text=public.coach_semantic_source_text(coach_id) and source_text like '%Synthetic revised title%' and embedding_model='gte-small' from public.coach_semantic_profiles where coach_id='{coach}'")
check('invalidated vector excluded from SQL matches for native fallback',f"update public.coaches set professional_title='Synthetic stale cache' where id='{coach}'",'0',verify="select jsonb_array_length(public.find_public_coach_matches((ARRAY[1::real]||array_fill(0::real,ARRAY[383]))::extensions.vector))")
check('marketplace edit invalidates vector',f"update public.coach_marketplace_profiles set headline='Synthetic revised headline' where coach_id='{coach}'",'t',verify=f"select embedding is null and source_text like '%Synthetic revised headline%' from public.coach_semantic_profiles where coach_id='{coach}'")
check('only own semantic identifier visible','select count(coach_id) from public.coach_semantic_profiles','1')
check('semantic source cannot be read','select source_text from public.coach_semantic_profiles',denied=True)
check('vectors cannot be read','select embedding from public.coach_semantic_profiles',denied=True)
check('vectors cannot be planted',f"update public.coach_semantic_profiles set embedding=(ARRAY[1::real]||array_fill(0::real,ARRAY[383]))::extensions.vector,source_text=public.coach_semantic_source_text(coach_id),updated_at=now() where coach_id='{coach}'",denied=True)
check('forged matching source rejected',f"update public.coach_semantic_profiles set embedding=null,source_text='Invented credentials',updated_at=now() where coach_id='{coach}'",denied=True)
check('model changes rejected',f"update public.coach_semantic_profiles set embedding_model='tampered' where coach_id='{coach}'",denied=True)
check('identifier reassignment rejected',f"update public.coach_semantic_profiles set coach_id='{pending}' where coach_id='{coach}'",denied=True)
check('cannot invalidate another coach',f"with x as(update public.coach_semantic_profiles set embedding=null,source_text=public.coach_semantic_source_text(coach_id),updated_at=now() where coach_id='{pending}' returning coach_id)select count(*) from x",'0')
check('pending coach can edit biography',f"update public.coaches set professional_bio='Synthetic pending edit' where id='{pending}'",'t',user=6,verify=f"select embedding is null and source_text like '%Synthetic pending edit%' from public.coach_semantic_profiles where coach_id='{pending}'")
for field,value in [('application_status',"'approved'"),('verified_at','now()'),('approved_at','now()')]:
    check('pending coach cannot change '+field,f"update public.coaches set {field}={value} where id='{pending}'",user=6,denied=True)
for field,value in [('verification_status',"'verified'"),('marketplace_status',"'active'"),('profile_completion_pct','100')]:
    # Fixture has marketplace_status active already: force an actual transition first.
    check('pending coach cannot change '+field,f"update public.coach_marketplace_profiles set {field}={value} where coach_id='{pending}'",user=6,denied=True,setup=f"update public.coach_marketplace_profiles set marketplace_status='paused',verification_status='pending',profile_completion_pct=0 where coach_id='{pending}';")
check('inactive coach cannot edit',f"update public.coaches set professional_title='Inactive mutation' where id='{coach}'",denied=True,setup="update public.profiles set status='inactive' where id='11111111-1111-4111-8111-000000000003';")
check('client cannot read semantic identifiers','select count(coach_id) from public.coach_semantic_profiles','0',user=1)
check('authenticated receives no table-wide cache grants',"select has_table_privilege(current_user,'public.coach_semantic_profiles','SELECT') or has_table_privilege(current_user,'public.coach_semantic_profiles','UPDATE') or has_table_privilege(current_user,'public.coach_semantic_profiles','INSERT') or has_table_privilege(current_user,'public.coach_semantic_profiles','DELETE')",'f')
check('invalidation remains invoker',"select not prosecdef from pg_proc where oid='public.mark_coach_semantic_profile_stale()'::regprocedure",'t')
check('server cache refresh still allowed',f"reset role;set local role service_role;update public.coach_semantic_profiles set embedding=(ARRAY[1::real]||array_fill(0::real,ARRAY[383]))::extensions.vector where coach_id='{coach}'",'t',verify=f"select embedding is not null from public.coach_semantic_profiles where coach_id='{coach}'")
out={'environment':'network-disabled local PostgreSQL17, synthetic records and managed adapters only','database':args.database,'candidate':'coach-semantic-invalidation.sql','results':results,'passed':sum(x['status']=='PASS' for x in results),'failed':sum(x['status']=='FAIL' for x in results)}
Path('docs/database/phase1/semantic-invalidation-'+('restored' if args.database=='careerdev_semantic_restore' else 'result')+'.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2));raise SystemExit(bool(out['failed']))
