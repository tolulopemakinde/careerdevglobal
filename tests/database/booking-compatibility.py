import subprocess,json,sys,hashlib
from pathlib import Path
container='careerdev-phase1-db'
assert subprocess.check_output(['docker','inspect','--format','{{index .Config.Labels "careerdev.acceptance"}}',container],text=True).strip()=='phase1-disposable'
base=['docker','exec','-i',container,'psql','-XqAt','-U','postgres','-d','careerdev_restore','-v','ON_ERROR_STOP=1']
query="""begin;set local role authenticated;set local request.jwt.claim.sub='11111111-1111-4111-8111-000000000001';
select public.create_marketplace_booking_request('33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000003','55555555-5555-4555-8555-000000000003',null,'2090-01-02T10:00Z','2090-01-02T10:30Z','Africa/Lagos','Synthetic only')->>'booking_status';rollback;"""
def run():
 r=subprocess.run(base+['-c',query],capture_output=True,text=True);return {'success':r.returncode==0,'actual':r.stdout.strip(),'error':r.stderr.strip()[:800]}
before=run()
# Exact existing #48 candidate, no reimplementation and no hosted project.
if len(sys.argv)!=2: raise SystemExit('Usage: booking-compatibility.py /path/to/reviewed/PR48/booking-request.sql')
source=Path(sys.argv[1]).resolve()
r=subprocess.run(base,input=source.read_text(),capture_output=True,text=True)
after=run() if r.returncode==0 else {'success':False,'error':r.stderr[:800]}
result={'environment':'local restored database; no provider calls','source_pr':48,'source_candidate':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'baseline':before,'candidate':after,'fixture_rollback':'Each booking attempt is wrapped in a transaction and rolled back'}
Path('docs/database/phase1/booking-compatibility-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
