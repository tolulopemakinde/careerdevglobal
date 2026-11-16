#!/usr/bin/env python3
"""Render the captured current-state catalog; never invent historical migrations.
Only public/private application objects are reconstructed over a clean local Supabase.
"""
import argparse,json,re,hashlib
from pathlib import Path

def qi(s): return '"'+s.replace('"','""')+'"'
def qn(x): return qi(x['schema'])+'.'+qi(x.get('table',x.get('name')))
def lit(s): return "'"+s.replace("'","''")+"'"
def render(s):
 if s['other_types'] or s['sequences']:raise ValueError('Unsupported types/sequences: use reviewed pg_dump, do not omit objects')
 if any(r['kind'] not in ('r','v') for r in s['relations']):raise ValueError('Unsupported relation kind')
 if any(c['identity'] or c['generated'] or c['acl'] for c in s['columns']):raise ValueError('Unsupported identity/generated/column ACL')
 lines=['-- Current-state application snapshot. NOT a historical migration or production patch.',
 '-- Local disposable Supabase only; restore driver verifies empty target and local container.',
 'BEGIN;','SET LOCAL check_function_bodies=off;','SET LOCAL search_path=pg_catalog,public,extensions;']
 for n in ['extensions','private','vault']:lines.append('CREATE SCHEMA IF NOT EXISTS '+qi(n)+';')
 # Runtime extension configuration and existing managed schemas are supplied by local Supabase.
 for e in s['extensions']:
  if e['name'] in ('plpgsql','pg_cron','pg_net','pg_stat_statements','supabase_vault'):continue
  lines.append('CREATE EXTENSION IF NOT EXISTS '+qi(e['name'])+' WITH SCHEMA '+qi(e['schema'])+';')
 for e in s['enums']:lines.append('CREATE TYPE '+qn(e)+' AS ENUM ('+','.join(map(lit,e['labels']))+');')
 for r in s['relations']:
  if r['kind']!='r':continue
  cols=[c for c in s['columns'] if (c['schema'],c['table'])==(r['schema'],r['name'])]
  colsql=[qi(c['name'])+' '+c['type']+(' COLLATE '+c['collation'] if c['collation'] else '')+(' NOT NULL' if c['not_null'] else '') for c in cols]
  lines.append('CREATE '+('UNLOGGED ' if r['persistence']=='u' else '')+'TABLE '+qn(r)+' ('+',\n'.join(colsql)+');')
 for c in s['constraints']:
  if c['type'] in ('p','u','x'):lines.append('ALTER TABLE '+qn(c)+' ADD CONSTRAINT '+qi(c['name'])+' '+c['definition']+';')
 deferred=[]
 views={r['name'] for r in s['relations'] if r['kind']=='v'}
 for f in s['functions']:
  if any(re.search(r'RETURNS (?:SETOF )?(?:public\.)?'+re.escape(v)+r'\b',f['definition']) for v in views):deferred.append(f);continue
  lines.append(f['definition'].rstrip().rstrip(';')+';')
 for c in s['columns']:
  if c['default'] and any(r['name']==c['table'] and r['kind']=='r' for r in s['relations']):lines.append('ALTER TABLE '+qn(c)+' ALTER COLUMN '+qi(c['name'])+' SET DEFAULT '+c['default']+';')
 for c in s['constraints']:
  if c['type'] not in ('p','u','x'):lines.append('ALTER TABLE '+qn(c)+' ADD CONSTRAINT '+qi(c['name'])+' '+c['definition']+';')
 for i in s['indexes']:
  if not i['valid'] or not i['ready']:raise ValueError('Invalid/unready source index: '+i['name'])
  if not i['constraint_backed']:lines.append(i['definition']+';')
 pending={(v['schema'],v['name']):v for v in s['relations'] if v['kind']=='v'}
 while pending:
  ready=[k for k in pending if not any((d['depends_schema'],d['depends']) in pending for d in s['view_dependencies'] if (d['schema'],d['view'])==k)]
  if not ready:raise ValueError('Unresolved view dependency cycle')
  for k in ready:
   v=pending.pop(k);opts=' WITH ('+','.join(v['options'])+')' if v['options'] else ''
   lines.append('CREATE VIEW '+qn(v)+opts+' AS '+v['definition'].rstrip(';')+';')
 lines.extend(f['definition'].rstrip().rstrip(';')+';' for f in deferred)
 for t in s['triggers']:
  lines.append(t['definition']+';')
  action={'D':'DISABLE','R':'ENABLE REPLICA','A':'ENABLE ALWAYS','O':'ENABLE'}[t['enabled']]
  if t['enabled']!='O':lines.append('ALTER TABLE '+qn(t)+' '+action+' TRIGGER '+qi(t['name'])+';')
 for r in s['relations']:
  if r['kind']=='r':
   if r['rls']:lines.append('ALTER TABLE '+qn(r)+' ENABLE ROW LEVEL SECURITY;')
   if r['force_rls']:lines.append('ALTER TABLE '+qn(r)+' FORCE ROW LEVEL SECURITY;')
 for p in s['policies']:
  lines.append('CREATE POLICY '+qi(p['name'])+' ON '+qn(p)+' AS '+p['permissive']+' FOR '+p['cmd']+' TO '+','.join('PUBLIC' if x=='public' else qi(x) for x in p['roles'])+(' USING ('+p['using']+')' if p['using'] else '')+(' WITH CHECK ('+p['with_check']+')' if p['with_check'] else '')+';')
 roles=['PUBLIC','anon','authenticated','service_role']
 for r in s['relations']:
  lines.append('ALTER '+('VIEW ' if r['kind']=='v' else 'TABLE ')+qn(r)+' OWNER TO '+qi(r['owner'])+';')
  lines.append('REVOKE ALL ON TABLE '+qn(r)+' FROM '+','.join('PUBLIC' if a=='PUBLIC' else qi(a) for a in roles)+';')
 for g in s['grants']:lines.append('GRANT '+g['privilege']+' ON TABLE '+qn(g)+' TO '+('PUBLIC' if g['grantee']=='PUBLIC' else qi(g['grantee']))+(' WITH GRANT OPTION' if g['grantable'] else '')+';')
 for f in s['functions']:
  ident=qi(f['schema'])+'.'+qi(f['name'])+'('+f['args']+')'
  lines.append('ALTER FUNCTION '+ident+' OWNER TO '+qi(f['owner'])+';')
  lines.append('REVOKE ALL ON FUNCTION '+ident+' FROM '+','.join('PUBLIC' if a=='PUBLIC' else qi(a) for a in roles)+';')
 for g in s['function_grants']:lines.append('GRANT '+g['privilege']+' ON FUNCTION '+qi(g['schema'])+'.'+qi(g['name'])+'('+g['args']+') TO '+('PUBLIC' if g['grantee']=='PUBLIC' else qi(g['grantee']))+(' WITH GRANT OPTION' if g['grantable'] else '')+';')
 # Preserve source schema ACLs explicitly; no blanket public/private table grants.
 for schema in s['schemas']:
  lines.append('REVOKE ALL ON SCHEMA '+qi(schema['name'])+' FROM PUBLIC,postgres,anon,authenticated,service_role;')
  if schema['acl'] is None:raise ValueError('Missing explicit source schema ACL')
  for acl in schema['acl'].strip('{}').split(','):
   who,rights=acl.split('=',1);rights=rights.split('/')[0]
   if any(c not in 'UC' for c in rights):raise ValueError('Unsupported schema ACL')
   perms=[{'U':'USAGE','C':'CREATE'}[c] for c in rights]
   if perms:lines.append('GRANT '+','.join(perms)+' ON SCHEMA '+qi(schema['name'])+' TO '+(qi(who) if who else 'PUBLIC')+';')
 for owner in sorted({g['owner'] for g in s['default_grants']}):
  for schema in ('public','private'):
   for typ in ('TABLES','FUNCTIONS','SEQUENCES','TYPES'):
    lines.append('ALTER DEFAULT PRIVILEGES FOR ROLE '+qi(owner)+' IN SCHEMA '+qi(schema)+' REVOKE ALL ON '+typ+' FROM PUBLIC,anon,authenticated,service_role;')
 for g in s['default_grants']:
  typ={'r':'TABLES','f':'FUNCTIONS','S':'SEQUENCES','T':'TYPES','n':'SCHEMAS'}.get(g['object_type'])
  if not typ:raise ValueError('Unsupported default ACL')
  lines.append('ALTER DEFAULT PRIVILEGES FOR ROLE '+qi(g['owner'])+(' IN SCHEMA '+qi(g['schema']) if g['schema'] else '')+' GRANT '+g['privilege']+' ON '+typ+' TO '+('PUBLIC' if g['grantee']=='PUBLIC' else qi(g['grantee']))+(' WITH GRANT OPTION' if g['grantable'] else '')+';')
 lines.append('COMMIT;')
 return '\n'.join(lines)+'\n'

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('output',type=Path);a=p.parse_args();s=json.loads(a.snapshot.read_text());a.output.write_text(render(s));print('Rendered current-state snapshot',hashlib.sha256(a.output.read_bytes()).hexdigest())
