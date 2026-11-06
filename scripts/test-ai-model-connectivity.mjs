import test from "node:test";
import assert from "node:assert/strict";
import {checkPilotModelCatalogue,ModelConnectivityError} from "../lib/ai/pilot/model-connectivity.mjs";

const base=(extra={})=>({
  provider:"groq",pilotKey:"test-key-do-not-use",approvedModel:"openai/gpt-oss-120b",
  isolatedProjectRef:"yyevuwvtrktrzwuzeddo",
  enabled:true,synthetic:true,
  fetchImpl:async()=>({ok:true,status:200,
    text:async()=>JSON.stringify({data:[{id:"openai/gpt-oss-120b",active:true}]})}),
  ...extra,
});
test("preflight refuses production or non-isolated projects",async()=>{
  for(const change of [
    {enabled:false},{synthetic:false},
    {isolatedProjectRef:"ufmhrmzumqkjvaezrmxf"},{isolatedProjectRef:"unknown"},
  ]){
    await assert.rejects(()=>checkPilotModelCatalogue(base(change)),
      e=>e instanceof ModelConnectivityError && e.code==="ISOLATED_PREFLIGHT_DISABLED");
  }
});
test("preflight refuses unsupported provider and missing pilot key",async()=>{
  await assert.rejects(()=>checkPilotModelCatalogue(base({provider:"other"})),
    e=>e.code==="UNAPPROVED_PROVIDER");
  await assert.rejects(()=>checkPilotModelCatalogue(base({pilotKey:""})),
    e=>e.code==="DEDICATED_PILOT_KEY_MISSING");
});
test("Groq preflight uses read-only authenticated GET with no query body",async()=>{
  let request=null;
  const r=await checkPilotModelCatalogue(base({fetchImpl:async(url,init)=>{
    request={url,init};
    return {ok:true,status:200,text:async()=>JSON.stringify({data:[{id:"openai/gpt-oss-120b"}]})};
  }}));
  assert.equal(request.url,"https://api.groq.com/openai/v1/models");
  assert.equal(request.init.method,"GET");
  assert.equal(request.init.body,undefined);
  assert.equal(request.init.headers.Authorization,"Bearer test-key-do-not-use");
  assert.deepEqual(r,{provider:"groq",connected:true,approvedModelFound:true,httpStatus:200});
});
test("OpenAI preflight uses its own model catalogue",async()=>{
  let endpoint="";
  const r=await checkPilotModelCatalogue(base({
    provider:"openai",approvedModel:"synthetic-model",
    fetchImpl:async(url)=>{endpoint=url;return {ok:true,text:async()=>JSON.stringify({data:[{id:"synthetic-model"}]})};},
  }));
  assert.equal(endpoint,"https://api.openai.com/v1/models");
  assert.equal(r.approvedModelFound,true);
});
test("missing model is reported but not invented",async()=>{
  const r=await checkPilotModelCatalogue(base({approvedModel:"other-model"}));
  assert.equal(r.connected,true);
  assert.equal(r.approvedModelFound,false);
});
test("unauthorized response reports only status",async()=>{
  const r=await checkPilotModelCatalogue(base({fetchImpl:async()=>({ok:false,status:401})}));
  assert.deepEqual(r,{provider:"groq",connected:false,approvedModelFound:false,httpStatus:401});
  assert.equal(JSON.stringify(r).includes("test-key"),false);
});
test("network failure never returns provider secrets",async()=>{
  await assert.rejects(()=>checkPilotModelCatalogue(base({
    fetchImpl:async()=>{throw new Error("private credentials appeared here");},
  })),e=>e.message==="PROVIDER_NETWORK_UNAVAILABLE");
});
test("malformed, inactive and oversized catalogues fail closed",async()=>{
  for(const data of ["bad JSON",JSON.stringify({data:{wrong:true}}),"Z".repeat(500001)]){
    await assert.rejects(()=>checkPilotModelCatalogue(base({
      fetchImpl:async()=>({ok:true,text:async()=>data}),
    })),e=>e.code==="INVALID_MODEL_CATALOGUE");
  }
  const r=await checkPilotModelCatalogue(base({
    fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({data:[{id:"openai/gpt-oss-120b",active:false}]})}),
  }));
  assert.equal(r.approvedModelFound,false);
});
