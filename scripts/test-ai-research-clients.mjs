import test from "node:test";
import assert from "node:assert/strict";
import {runIsolatedResearchSearch,ResearchPilotError} from "../lib/ai/pilot/research-clients.mjs";
const fixture=(provider,extra={})=>({
  provider,query:"[SYNTHETIC] entry level career options Nigeria",
  apiKey:"test-key-not-real",enabled:true,environment:"isolated-test",
  synthetic:true,fetchedAt:"2026-11-04T10:00:00Z",
  fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({results:[{
    title:"Synthetic sample result",url:"https://example.org/careers",
    text:"Exa evidence",content:"Tavily evidence",publishedDate:"2026-10-20",
  }]})}),...extra,
});
test("search fails closed outside isolated synthetic mode",async()=>{
  for(const config of [fixture("exa",{enabled:false}),fixture("exa",{synthetic:false}),fixture("exa",{environment:"production"})]) {
    await assert.rejects(()=>runIsolatedResearchSearch(config),
      e=>e instanceof ResearchPilotError && e.code==="RESEARCH_PILOT_DISABLED");
  }
});
test("only Exa and Tavily are allowed",async()=>{
  await assert.rejects(()=>runIsolatedResearchSearch(fixture("google")),
    e=>e.code==="UNAPPROVED_SEARCH_PROVIDER");
});
test("queries are marked synthetic and bounded",async()=>{
  for(const query of ["recent jobs Lagos","[SYNTHETIC] x","[SYNTHETIC] "+"A".repeat(300)]) {
    await assert.rejects(()=>runIsolatedResearchSearch(fixture("exa",{query})),
      e=>e.code==="INVALID_SYNTHETIC_QUERY");
  }
});
test("Exa request uses fixed endpoint and normalized source",async()=>{
  let observed;
  const r=await runIsolatedResearchSearch(fixture("exa",{
    fetchImpl:async(url,init)=>{
      observed={url,init};
      return {ok:true,text:async()=>JSON.stringify({results:[{title:"Source",url:"https://example.org/career",text:"evidence"}]})};
    },
  }));
  assert.equal(observed.url,"https://api.exa.ai/search");
  assert.equal(observed.init.headers["x-api-key"],"test-key-not-real");
  assert.equal(JSON.parse(observed.init.body).numResults,5);
  assert.equal(r.sourceCount,1);
  assert.equal(r.sources[0].verifiedOpen,false);
});
test("Tavily request uses fixed endpoint and bounded output",async()=>{
  let observed;
  const r=await runIsolatedResearchSearch(fixture("tavily",{
    fetchImpl:async(url,init)=>{
      observed={url,init};
      return {ok:true,text:async()=>JSON.stringify({results:[{title:"Source",url:"https://example.org/career",content:"evidence"}]})};
    },
  }));
  assert.equal(observed.url,"https://api.tavily.com/search");
  assert.equal(observed.init.headers.Authorization,"Bearer test-key-not-real");
  assert.equal(JSON.parse(observed.init.body).include_answer,false);
  assert.equal(r.sources[0].verifiedOpen,false);
});
test("provider rejection has sanitized error",async()=>{
  await assert.rejects(()=>runIsolatedResearchSearch(fixture("exa",{fetchImpl:async()=>({ok:false,status:401})})),
    e=>e.message==="RESEARCH_PROVIDER_REJECTED");
});
test("network exception does not expose credentials or raw message",async()=>{
  await assert.rejects(()=>runIsolatedResearchSearch(fixture("tavily",{
    fetchImpl:async()=>{throw new Error("secret provider payload");},
  })),e=>e.message==="RESEARCH_NETWORK_UNAVAILABLE");
});
test("oversized/malformed response cannot be normalized",async()=>{
  for(const txt of ["oops","X".repeat(760000)]) {
    await assert.rejects(()=>runIsolatedResearchSearch(fixture("exa",{
      fetchImpl:async()=>({ok:true,text:async()=>txt}),
    })),e=>e.code==="INVALID_RESEARCH_RESPONSE");
  }
});
