/**
 * Read-only AI catalogue reachability check for isolated testing.
 *
 * No provider inference, no AI credits, and no public API route.
 * Must receive dedicated PILOT keys; production keys are intentionally not read.
 */
const CATALOGUE_ENDPOINTS=Object.freeze({
  openai:"https://api.openai.com/v1/models",
  groq:"https://api.groq.com/openai/v1/models",
});
const REFERENCE_TEST_PROJECT="yyevuwvtrktrzwuzeddo";

export class ModelConnectivityError extends Error {
  constructor(code){ super(code); this.name="ModelConnectivityError"; this.code=code; }
}

/**
 * Checks whether the user-approved model appears in a read-only model catalogue.
 * This does not verify chat completion, quota, billing, web search, JSON schema or response quality.
 *
 * @param {{
 *   provider:'openai'|'groq', pilotKey:string, approvedModel:string,
 *   isolatedProjectRef:string, enabled:boolean, synthetic:boolean,
 *   fetchImpl?:(url:string, init:RequestInit)=>Promise<Response>
 * }} cfg
 */
export async function checkPilotModelCatalogue(cfg) {
  if(process.env.NODE_ENV==="production") throw new ModelConnectivityError("PRODUCTION_RUNTIME_BLOCKED");
  if(cfg?.enabled!==true || cfg.synthetic!==true || cfg.isolatedProjectRef!==REFERENCE_TEST_PROJECT) {
    throw new ModelConnectivityError("ISOLATED_PREFLIGHT_DISABLED");
  }
  if(!Object.prototype.hasOwnProperty.call(CATALOGUE_ENDPOINTS,cfg.provider)) {
    throw new ModelConnectivityError("UNAPPROVED_PROVIDER");
  }
  if(typeof cfg.pilotKey!=="string" || cfg.pilotKey.length<8) {
    throw new ModelConnectivityError("DEDICATED_PILOT_KEY_MISSING");
  }
  if(typeof cfg.approvedModel!=="string" ||
     !/^[A-Za-z0-9][A-Za-z0-9/_:.-]{2,119}$/.test(cfg.approvedModel)) {
    throw new ModelConnectivityError("MODEL_NOT_ALLOWLISTED");
  }
  const transport=cfg.fetchImpl??fetch;
  let response;
  try{
    response=await transport(CATALOGUE_ENDPOINTS[cfg.provider],{
      method:"GET",
      headers:{Authorization:"Bearer "+cfg.pilotKey,Accept:"application/json"},
      redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000),
    });
  }catch{
    throw new ModelConnectivityError("PROVIDER_NETWORK_UNAVAILABLE");
  }
  if(!response?.ok) {
    // Never log provider error bodies or authorization headers.
    return {provider:cfg.provider,connected:false,approvedModelFound:false,
      httpStatus:Number(response?.status)||0};
  }
  let catalogue;
  try{
    const body=await response.text();
    if(body.length>500_000)throw new Error("catalogue too large");
    catalogue=JSON.parse(body);
    if(!Array.isArray(catalogue.data))throw new Error("missing model data");
  }catch{
    throw new ModelConnectivityError("INVALID_MODEL_CATALOGUE");
  }
  return {provider:cfg.provider,connected:true,
    approvedModelFound:catalogue.data.some(m=>m && m.id===cfg.approvedModel && m.active!==false),
    httpStatus:200};
}
