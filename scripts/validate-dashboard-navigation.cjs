const fs=require('fs');
const config=fs.readFileSync('app/components/dashboard-navigation.ts','utf8');
const items=[...config.matchAll(/id: '([^']+)'/g)].map(x=>x[1]);
for(const role of ['client','coach']) {
 const ids=config.split(`${role}: [`)[1].split('],')[0].matchAll(/id: '([^']+)'/g);
 const source=fs.readdirSync(`app/${role}-dashboard`).filter(p=>p.endsWith('.tsx')).map(p=>fs.readFileSync(`app/${role}-dashboard/${p}`,'utf8')).join('\n');
 for(const [,id] of ids)if(!source.includes(`id="${id}"`))throw Error(`${role}: missing target ${id}`);
 console.log(`${role}: every navigation destination resolves to an existing segment`);
}
