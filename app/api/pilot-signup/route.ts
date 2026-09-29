import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../lib/supabase-server";

type Role = "client" | "coach";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const URL_RE = /^https?:\/\/[^\s]+$/i;

function clean(value: unknown, max = 2000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body?.website) {
      return NextResponse.json({ ok: true });
    }

    const role: Role | null =
      body?.role === "coach" ? "coach" : body?.role === "client" ? "client" : null;
    if (!role) return jsonError("Please choose a valid pilot.");

    const firstName = clean(body?.firstName, 80);
    const lastName = clean(body?.lastName, 80);
    const email = clean(body?.email, 320).toLowerCase();
    const whatsapp = clean(body?.whatsapp, 30);
    const linkedinUrl = clean(body?.linkedinUrl, 500);
    const careerStage = clean(body?.careerStage, 160);
    const careerGoal = clean(body?.careerGoal, 2000);
    const coachingSpecialty = clean(body?.coachingSpecialty, 300);
    const certification = clean(body?.certification, 500);
    const yearsCoaching =
      Number.isInteger(body?.yearsCoaching) && body.yearsCoaching >= 0 && body.yearsCoaching <= 80
        ? body.yearsCoaching
        : null;
    const whatsappOptIn = body?.whatsappOptIn === true;
    const pilotConsent = body?.pilotConsent === true;

    if (!firstName || !lastName || !EMAIL_RE.test(email)) {
      return jsonError("Please provide your first name, last name and a valid email address.");
    }

    if (!pilotConsent) {
      return jsonError("Pilot consent is required.");
    }

    if (linkedinUrl && !URL_RE.test(linkedinUrl)) {
      return jsonError("Please enter a valid LinkedIn URL.");
    }

    if (role === "client" && (!careerStage || careerGoal.length < 10)) {
      return jsonError("Please provide your career stage and a little more detail about your goal or challenge.");
    }

    if (role === "coach" && (!coachingSpecialty || yearsCoaching === null)) {
      return jsonError("Please provide your coaching specialty and years of experience.");
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ufmhrmzumqkjvaezrmxf.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      : await createSupabaseServerClient();

    const signup = {
      role,
      first_name: firstName,
      last_name: lastName,
      email,
      whatsapp: whatsapp || null,
      linkedin_url: linkedinUrl || null,
      career_stage: role === "client" ? careerStage : null,
      career_goal: role === "client" ? careerGoal : null,
      coaching_specialty: role === "coach" ? coachingSpecialty : null,
      years_coaching: role === "coach" ? yearsCoaching : null,
      certification: role === "coach" ? certification || null : null,
      whatsapp_opt_in: whatsappOptIn,
      pilot_consent: pilotConsent,
    };

    const insertQuery = supabase.from("pilot_signups").insert(signup);
    const insertResult = serviceRoleKey
      ? await insertQuery.select("id").single()
      : await insertQuery;

    const inserted = serviceRoleKey ? insertResult.data : null;
    const insertError = insertResult.error;

    if (insertError) {
      if (insertError.code === "23505") {
        return jsonError("This email is already registered for this pilot.", 409);
      }
      console.error("Pilot signup database error:", insertError);
      return jsonError("We could not save your signup. Please try again.", 500);
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    let brevoSynced = false;
    let welcomeEmailSent = false;
    let brevoContactId: number | null = null;
    let integrationWarning = "";

    if (brevoApiKey) {
      const listId = role === "client" ? 4 : 5;
      const templateId = role === "client" ? 7 : 8;
      const attributes: Record<string, string | boolean> = {
        FIRSTNAME: firstName,
        LASTNAME: lastName,
        OPT_IN: whatsappOptIn,
        JOB_TITLE: role === "client" ? "CareerDev Global Client Pilot Tester" : "CareerDev Global Coach Pilot Tester",
      };

      if (linkedinUrl) attributes.LINKEDIN = linkedinUrl;
      if (whatsappOptIn && whatsapp) attributes.WHATSAPP = whatsapp;

      const contactResponse = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          attributes,
          listIds: [listId],
          updateEnabled: true,
          getId: true,
        }),
        cache: "no-store",
      });

      const contactPayload = await contactResponse.json().catch(() => ({}));

      if (!contactResponse.ok) {
        integrationWarning = "Your signup was saved, but Brevo could not be updated yet.";
        console.error("Brevo contact error:", contactPayload);
      } else {
        brevoSynced = true;
        brevoContactId = Number(contactPayload?.id) || null;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "api-key": brevoApiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            to: [{ email, name: firstName + " " + lastName }],
            templateId,
            params: { FIRSTNAME: firstName, LASTNAME: lastName },
            tags: ["careerdev-global-pilot", role + "-pilot"],
          }),
          cache: "no-store",
        });

        if (emailResponse.ok) {
          welcomeEmailSent = true;
        } else {
          const emailPayload = await emailResponse.json().catch(() => ({}));
          integrationWarning =
            "Your signup was saved and added to the pilot list, but the welcome email could not be sent yet.";
          console.error("Brevo welcome email error:", emailPayload);
        }
      }
    } else {
      integrationWarning =
        "Signup saved. Brevo is ready to connect when the BREVO_API_KEY is added to Vercel.";
    }

    if (serviceRoleKey && inserted?.id) {
      const { error: updateError } = await supabase
        .from("pilot_signups")
        .update({
          brevo_synced: brevoSynced,
          brevo_contact_id: brevoContactId,
          welcome_email_sent: welcomeEmailSent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);

      if (updateError) {
        console.error("Pilot signup sync-status update error:", updateError);
      }
    }

    return NextResponse.json({
      ok: true,
      role,
      brevoSynced,
      welcomeEmailSent,
      message: integrationWarning || "Pilot signup completed.",
    });
  } catch (error) {
    console.error("Pilot signup request error:", error);
    return jsonError("We could not complete your signup. Please try again.", 500);
  }
}
