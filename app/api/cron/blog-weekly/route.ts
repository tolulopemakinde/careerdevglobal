import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime="nodejs";
export async function GET(req:Request){
 const auth=req.headers.get("authorization");
 if(process.env.CRON_SECRET && auth!=="Bearer "+process.env.CRON_SECRET)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return NextResponse.json({error:"SUPABASE_SERVICE_ROLE_KEY is not configured"},{status:503});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({ok:false,error:"OPENAI_API_KEY is not configured. Weekly workflow is installed; configure an AI provider key before automatic generation."},{status:503});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
 const {data:recent}=await db.from("blog_posts").select("title").order("created_at",{ascending:false}).limit(8);
 const prompt="Create one practical CareerDev Global blog article for this week. Avoid duplicating these recent topics: "+(recent||[]).map((x:any)=>x.title).join("; ")+". Choose a useful topic across career development, career intelligence, leadership, talent mobility, employability, education-to-work transitions, or AI and the future of work. Return JSON with title, slug, excerpt, content_html, category, tags, seo_title and seo_description. Do not invent statistics. Use 3-5 H2 sections.";
 const res=await fetch(process.env.OPENAI_API_URL||"https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5.6-luna",temperature:.6,response_format:{type:"json_object"},messages:[{role:"system",content:"You are CareerDev Global Blog Content AI. Produce accurate, practical, original career education. AI drafts must be reviewed by an administrator before publication."},{role:"user",content:prompt}]})});
 if(!res.ok)return NextResponse.json({ok:false,error:"AI provider request failed: "+res.status},{status:502});
 const body=await res.json();let article:any;try{article=JSON.parse(body.choices?.[0]?.message?.content||"{}")}catch{return NextResponse.json({ok:false,error:"AI response was not valid JSON"},{status:502})}
 if(!article.title||!article.slug||!article.content_html)return NextResponse.json({ok:false,error:"AI response missing required fields"},{status:502});
 const {data,error}=await db.from("blog_posts").insert({title:article.title,slug:article.slug,excerpt:article.excerpt||"",content:article.content_html,category:article.category||"Career Development",tags:Array.isArray(article.tags)?article.tags:[],featured_image_url:"https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1800&q=85",seo_title:article.seo_title||article.title,seo_description:article.seo_description||article.excerpt||"",status:"draft",ai_generated:true,ai_generation_notes:"Weekly Blog Content AI draft. Admin review and publishing required."});
 if(error)return NextResponse.json({ok:false,error:error.message},{status:500});
 return NextResponse.json({ok:true,post_id:data.id,status:"draft"});
}