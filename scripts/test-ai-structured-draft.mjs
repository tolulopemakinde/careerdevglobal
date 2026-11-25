import test from "node:test";
import assert from "node:assert/strict";
import {validateSyntheticCareerDraft,SyntheticDraftError} from "../lib/ai/pilot/structured-draft.mjs";
const source=[{url:"https://example.org/careers",retrievedAt:"2026-11-04T09:00:00Z",verifiedOpen:false}];
const fixture=()=>({summary:"Synthetic career pathway - needs review",
  recommendations:["Check employer sites before applying"],source_refs:[source[0].url],
  verification_gate:false,human_review_required:true});
test("synthetic draft allows only bounded reviewed fields and cited sources",()=>{
 const r=validateSyntheticCareerDraft(JSON.stringify(fixture()),source);
 assert.equal(r.synthetic,true);assert.equal(r.productionAuthorized,false);
 assert.equal(r.verification_gate,false);
 assert.equal(r.human_review_required,true);
 assert.deepEqual(r.source_refs,["https://example.org/careers"]);
});
test("model cannot claim independently verified career openings or coach approval",()=>{
 for(const change of [
 {verification_gate:true},{human_review_required:false},
 ])assert.throws(()=>validateSyntheticCareerDraft(JSON.stringify({...fixture(),...change}),source),
  e=>e instanceof SyntheticDraftError&&e.code==="FORGED_VERIFICATION_OR_REVIEW");
});
test("fabricated or duplicate citations fail closed",()=>{
 for(const fake of [
 ["https://fabricated.org/job"],
 [source[0].url,source[0].url],[],[null],
 ])assert.throws(()=>validateSyntheticCareerDraft(JSON.stringify({...fixture(),source_refs:fake}),source),
  e=>e.code==="UNSUPPORTED_SOURCE_REFERENCE");
});
test("unbounded or invalid summary and recommendations fail closed",()=>{
 for(const fields of [{summary:""},{summary:"x".repeat(1201)},{recommendations:[]},
 {recommendations:["x".repeat(501)]},{recommendations:[1]}]){
  assert.throws(()=>validateSyntheticCareerDraft(JSON.stringify({...fixture(),...fields}),source),
    e=>e.code==="MODEL_SCHEMA_MISMATCH");
 }
});
test("markdown, malformed JSON, extra fields and oversized response rejected",()=>{
 assert.throws(()=>validateSyntheticCareerDraft("not json",source),e=>e.code==="MODEL_JSON_PARSE_FAILED");
 assert.throws(()=>validateSyntheticCareerDraft("x".repeat(8001),source),e=>e.code==="INVALID_MODEL_RESPONSE_SIZE");
 assert.throws(()=>validateSyntheticCareerDraft(JSON.stringify({...fixture(),approved:true}),source),
  e=>e.code==="MODEL_SCHEMA_MISMATCH");
});
test("unreviewed, unsafe or unbounded research sources rejected",()=>{
 for(const sources of [[],[{}],[{url:"http://example.org",retrievedAt:"now",verifiedOpen:false}],
  [{url:source[0].url,retrievedAt:"now",verifiedOpen:true}],
  Array.from({length:6},()=>source[0])]){
  assert.throws(()=>validateSyntheticCareerDraft(JSON.stringify(fixture()),sources),
    e=>e.code==="UNREVIEWED_RESEARCH_SOURCES");
 }
});
