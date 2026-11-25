import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCareerSearchResults } from "../lib/ai/pilot/research-normalizer.mjs";

const stamp = "2026-11-04T08:00:00.000Z";

test("rejects unknown providers, invalid payload and retrieval timestamp", () => {
  assert.throws(() => normalizeCareerSearchResults("other", {results:[]}, stamp), /UNAPPROVED_RESEARCH_PROVIDER/);
  assert.throws(() => normalizeCareerSearchResults("exa", {}, stamp), /INVALID_RESEARCH_PAYLOAD/);
  assert.throws(() => normalizeCareerSearchResults("exa", {results:[]}, "not-a-date"), /INVALID_RETRIEVAL_TIME/);
});

test("normalizes Exa publication evidence and never confirms job status", () => {
  const results = normalizeCareerSearchResults("exa", {results:[{
    title:"Employer careers", url:"https://example.org/jobs?utm_source=social",
    publishedDate:"2026-10-20T00:00:00Z", text:"Official careers listing"
  }]}, stamp);
  assert.equal(results.length, 1);
  assert.equal(results[0].url,"https://example.org/jobs");
  assert.equal(results[0].verifiedOpen,false);
  assert.equal(results[0].publishedAt,"2026-10-20T00:00:00.000Z");
  assert.equal(results[0].retrievedAt,stamp);
});

test("normalizes Tavily fields, limits sources and deduplicates tracking URLs", () => {
  const many = Array.from({length:9},(_,i)=>({
    title:"Result "+i,url:"https://example.com/jobs/"+i,content:"Source excerpt"
  }));
  const results = normalizeCareerSearchResults("tavily",{results:[
    {title:"Duplicate",url:"https://example.com/jobs/0?utm_campaign=alpha",content:"same"},
    ...many,
  ]},stamp);
  assert.equal(results.length,5);
  assert.equal(new Set(results.map(r=>r.url)).size,5);
  assert.ok(results.every(r=>r.verifiedOpen===false));
  assert.ok(results.every(r=>r.publishedAt===null));
});

test("filters unsafe protocols and internal/private links without fetching them", () => {
  const urls=[
    "http://example.com/a","ftp://example.com/a","https://localhost/a",
    "https://127.0.0.1/path","https://192.168.1.1/path",
    "https://10.1.0.1/path","https://169.254.169.254/latest",
    "https://some.internal/a","https://[::1]/a",
    "https://user:password@example.com/path",
  ];
  const results=normalizeCareerSearchResults("exa",{results:urls.map(url=>({title:"unsafe",url,text:"unsafe"}))},stamp);
  assert.equal(results.length,0);
});

test("does not accept future publication timestamps", () => {
  const results=normalizeCareerSearchResults("exa",{results:[{
    title:"test",url:"https://example.com/p",publishedDate:"2030-01-01",text:"summary"
  }]},stamp);
  assert.equal(results[0].publishedAt,null);
});

test("bounds returned title and excerpt sizes", () => {
  const results=normalizeCareerSearchResults("tavily",{results:[{
    title:"T".repeat(400),url:"https://example.com/p",content:"S".repeat(1200)
  }]},stamp);
  assert.equal(results[0].title.length,180);
  assert.equal(results[0].snippet.length,700);
});
