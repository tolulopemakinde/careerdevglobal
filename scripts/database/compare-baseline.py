#!/usr/bin/env python3
import argparse,json,hashlib
from pathlib import Path

def canonical(rows,section):
 rows=json.loads(json.dumps(rows or []))
 if section=='columns':
  groups={}
  for row in rows:groups.setdefault((row['schema'],row['table']),[]).append(row)
  for group in groups.values():
   for index,row in enumerate(sorted(group,key=lambda r:r['ordinal']),1):row['ordinal']=index
 if section=='functions':
  for row in rows:
   row.pop('md5',None);row.pop('acl',None)
 if section in ('relations','schemas'):
  for row in rows:row.pop('acl',None)
 return {json.dumps(row,sort_keys=True).replace('extensions.vector','vector') for row in rows}

def compare(expected,actual):
 sections=['enums','relations','columns','constraints','indexes','functions','policies','triggers','grants','function_grants','default_grants']
 result={}
 for section in sections:
  e=canonical(expected[section],section);a=canonical(actual[section],section)
  result[section]={'source_count':len(expected[section] or []),'restored_count':len(actual[section] or []),'missing':len(e-a),'extra':len(a-e)}
 return {'application_schema_pass':all(r['missing']==0 and r['extra']==0 for r in result.values()),'sections':result,'normalization':['extension vector type qualification','dropped-column physical ordinal gaps','function source MD5 excluded because bootstrap identity is redacted; function definitions compared','relation ACL text ordering ignored; expanded effective grants compared'],'source_version':expected['server_version'],'local_version':actual['server_version'],'managed_service_parity':False,'limitations':['Managed Auth/Storage are explicit minimal adapters, not service acceptance','Four managed/observability extensions not installed; local pgcrypto/uuid/vector/btree_gist versions may differ','Original bootstrap identity intentionally redacted; original hash retained in provenance']}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('expected',type=Path);p.add_argument('actual',type=Path);p.add_argument('report',type=Path);a=p.parse_args();r=compare(json.loads(a.expected.read_text()),json.loads(a.actual.read_text()));a.report.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2));raise SystemExit(0 if r['application_schema_pass'] else 1)
