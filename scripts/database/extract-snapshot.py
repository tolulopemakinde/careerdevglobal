import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
text=a.input.read_text()
if 'ERROR:' in text:raise SystemExit('Database rehearsal failed; inspect private log')
rows=[x for x in text.splitlines() if x.startswith('{')]
if len(rows)!=1:raise SystemExit('Expected one complete catalog snapshot')
s=json.loads(rows[0]);a.output.write_text(json.dumps(s,indent=2)+'\n')
