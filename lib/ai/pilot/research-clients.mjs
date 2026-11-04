/**
 * Development-only Exa/Tavily search benchmark transport.
 * Not callable from public Next.js routes or deployed Supabase functions.
 */
import { normalizeCareerSearchResults } from "./research-normalizer.mjs";
const URLS=Object.freeze({exa:"https://api.exa.ai/search",tavily:"https://api.tavily.com/search"});
export class ResearchPilotError extends Error {
  constructor(code) {super(code);this.code=code;this.name="ResearchPilotError";}
}
export async function runIsolatedResearchSearch(config) {
  if (process.env.NODE_ENV === "production") throw new ResearchPilotError("PRODUCTION_BLOCKED");
  if (config?.enabled !== true || config.environment !== "isolated-test" || config.synthetic !== true) {
    throw new ResearchPilotError("RESEARCH_PILOT_DISABLED");
  }
  if (!Object.prototype.hasOwnProperty.call(URLS,config.provider)) {
    throw new ResearchPilotError("UNAPPROVED_SEARCH_PROVIDER");
  }
  if (typeof config.apiKey !== "string" || config.apiKey.length < 6) {
    throw new ResearchPilotError("MISSING_RESEARCH_KEY");
  }
  if (typeof config.query !== "string" || !config.query.startsWith("[SYNTHETIC] ") ||
      config.query.length < 24 || config.query.length > 280) {
    throw new ResearchPilotError("INVALID_SYNTHETIC_QUERY");
  }
  const query=config.query.slice("[SYNTHETIC] ".length);
  const body=config.provider==="exa"
    ? {query,type:"auto",numResults:5,contents:{highlights:true}}
    : {query,search_depth:"basic",max_results:5,include_answer:false,include_raw_content:false,include_published_date:true};
  const headers=config.provider==="exa"
    ? {"x-api-key":config.apiKey,"Content-Type":"application/json"}
    : {"Authorization":"Bearer "+config.apiKey,"Content-Type":"application/json"};
  const transport=config.fetchImpl??fetch;
  const started=Date.now();
  let response;
  try {
    response=await transport(URLS[config.provider],{
      method:"POST",headers,body:JSON.stringify(body),
      signal:AbortSignal.timeout(12_000),redirect:"error",cache:"no-store",
    });
  } catch {
    throw new ResearchPilotError("RESEARCH_NETWORK_UNAVAILABLE");
  }
  if (!response.ok) throw new ResearchPilotError("RESEARCH_PROVIDER_REJECTED");
  let raw;
  try {
    const str=await response.text();
    if (str.length>750_000) throw new Error("response too large");
    raw=JSON.parse(str);
  } catch {
    throw new ResearchPilotError("INVALID_RESEARCH_RESPONSE");
  }
  const retrievedAt=config.fetchedAt??new Date().toISOString();
  const sources=normalizeCareerSearchResults(config.provider,raw,retrievedAt);
  return {
    provider:config.provider,retrievedAt,durationMs:Date.now()-started,
    sources,sourceCount:sources.length,verifiedOpen:false,
  };
}
