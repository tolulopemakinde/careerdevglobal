import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
assert.equal(process.env.CAREERDEV_BROWSER_FIXTURE,'synthetic-local-only');
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL,'http://127.0.0.1:54321');
const users=JSON.parse(readFileSync('/tmp/careerdev-synthetic-browser.json','utf8'));
const results=[], blockedProduction=[];
const browser=await chromium.launch({headless:true});
function pass(name){results.push({case:name,status:'PASS'});}
async function context(){
  const ctx=await browser.newContext();
  await ctx.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname.endsWith('.supabase.co')||u.hostname.endsWith('.vercel.app'))blockedProduction.push(u.hostname);
    if(['127.0.0.1','localhost'].includes(u.hostname)&&['3000','54321'].includes(u.port))return route.continue();
    return route.abort();
  });
  return ctx;
}
async function login(ctx,n,role){
  const page=await ctx.newPage();
  await page.goto('http://127.0.0.1:3000/'+role+'/login');
  await page.getByLabel('Email address',{exact:true}).fill(users[n-1].email);
  await page.getByLabel('Password',{exact:true}).fill(users[n-1].password);
  await page.getByRole('button',{name:'Log In',exact:true}).click();
  return page;
}
function sql(query){return execFileSync('docker',['exec','supabase_db_careerdev-baseline-ci','psql','-XqAt','-U','postgres','-d','postgres','-c',query],{encoding:'utf8'}).trim();}
try{
  const client=await context(); const cp=await login(client,1,'client');
  await cp.waitForURL('**/client-dashboard');
  await cp.getByRole('heading',{name:'Your career journey',exact:true}).waitFor();pass('Client login renders authenticated dashboard');
  await cp.getByLabel('Full name',{exact:true}).fill('Synthetic Browser Client');
  await cp.getByRole('button',{name:/Save account changes|Save profile/i}).click();
  await cp.getByText('Profile updated successfully.',{exact:true}).waitFor();
  assert.equal(sql("select full_name from public.profiles where id='11111111-1111-4111-8111-000000000001'"),'Synthetic Browser Client');pass('Client UI save persists owned profile');
  await cp.reload();await cp.getByLabel('Full name',{exact:true}).waitFor();assert.equal(await cp.getByLabel('Full name',{exact:true}).inputValue(),'Synthetic Browser Client');pass('Client profile persists after reload');
  await cp.goto('http://127.0.0.1:3000/book-coaching');
  await cp.getByRole('heading',{name:'Synthetic coach 3',exact:true}).waitFor();pass('Recovered public coach directory renders eligible coach');
  await cp.goto('http://127.0.0.1:3000/book-service');
  await cp.getByRole('heading',{name:'Synthetic fixture only',exact:true}).waitFor();pass('Recovered service directory renders eligible offering');
  await cp.goto('http://127.0.0.1:3000/coach-matching');
  await cp.locator('#goal').fill('Develop a clear career strategy and interview confidence');
  const matchingResponse=cp.waitForResponse(r=>r.url().includes('/functions/v1/careerdev-coach-matching')&&r.request().method()==='POST',{timeout:120000});
  await cp.getByRole('button',{name:'Find matching coaches',exact:true}).click();
  const matchResponse=await matchingResponse;assert.equal(matchResponse.status(),200);
  assert.equal((await matchResponse.json()).matches.length,1);
  await cp.getByRole('heading',{name:'Synthetic coach 3',exact:true}).first().waitFor();pass('Browser matching executes native Edge model and renders eligible result');
  await cp.goto('http://127.0.0.1:3000/admin');
  await cp.getByText('This account does not have Staff/Admin permissions.',{exact:true}).waitFor();pass('Client denied administrator workspace');
  const coach=await context();const hp=await login(coach,3,'coach');
  await hp.waitForURL('**/coach-dashboard');await hp.getByRole('heading',{name:'Manage your coaching practice',exact:true}).waitFor();pass('Coach login renders owned dashboard');
  await hp.getByLabel('Professional title',{exact:true}).fill('Synthetic Browser Coach');
  await hp.getByRole('button',{name:'Save account changes',exact:true}).click();
  await hp.getByText('Profile updated successfully.',{exact:true}).waitFor();
  assert.equal(sql("select professional_title from public.coaches where profile_id='11111111-1111-4111-8111-000000000003'"),'Synthetic Browser Coach');
  assert.equal(sql("select embedding is null from public.coach_semantic_profiles where coach_id='22222222-2222-4222-8222-000000000003'"),'t');pass('Coach UI save persists and invalidates embedding');
  const admin=await context();const ap=await login(admin,5,'admin');
  await ap.waitForURL('**/admin');await ap.getByRole('heading',{name:'Platform Administration',exact:true}).waitFor();
  await ap.getByText('Full platform administration',{exact:true}).waitFor();pass('Admin login loads authorized administration data');
  await ap.getByRole('button',{name:'Sign out',exact:true}).click();await ap.waitForURL('**/admin/login');pass('Admin sign out returns to login');
  assert.deepEqual(blockedProduction,[]);pass('Browser never attempts production backend/deployment access');
  const out={environment:'Chromium against pinned #49 frontend and recovered local Supabase schema; synthetic logins only',passed:results.length,failed:0,results,limits:['Bounded role login/profile/admin journeys only','No provider transaction or live embedding UI flow']};
  writeFileSync('/tmp/browser-acceptance-result.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
}finally{await browser.close();}
