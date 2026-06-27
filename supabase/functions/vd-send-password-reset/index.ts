// supabase/functions/vd-send-password-reset/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendApiKey = Deno.env.get("VD_RESEND_API_KEY") ?? Deno.env.get("RESEND_API_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables on server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let email: string | undefined;
    let redirectTo: string | undefined;

    try {
      const body = await req.json();
      email = body?.email;
      redirectTo = body?.redirectTo;
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email) {
      return new Response(
        JSON.stringify({ error: "email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create a service role client to generate the password reset link
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 2. Generate the recovery link securely
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: redirectTo || `${req.headers.get("origin") || ""}/reset-password`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.error("[generateLink Error]", linkError);
      return new Response(
        JSON.stringify({ error: linkError?.message || "Failed to generate password reset link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const actionLink = linkData.properties.action_link;

    // 3. Fallback for testing when Resend API Key is not set up yet
    if (!resendApiKey) {
      console.warn("VD_RESEND_API_KEY is not set. Action link logged to console:");
      console.log(`[TESTING] Password reset link for ${email}: ${actionLink}`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Password reset link generated but VD_RESEND_API_KEY is not configured. Link logged to Deno console logs for testing." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Send email using Resend API via fetch
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "VeriDraw <noreply@veridraw.app>",
        to: [email],
        subject: "Reset your VeriDraw Password",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 40px auto; padding: 32px; border: 1px solid #e5e7eb; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="margin-bottom: 24px; text-align: center;">
              <span style="font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">VeriDraw</span>
            </div>
            <h2 style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 12px; text-align: center;">Reset your password</h2>
            <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin-bottom: 24px; text-align: center;">
              We received a request to reset the password for your VeriDraw account. Click the button below to choose a new password. This link will expire in 1 hour.
            </p>
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${actionLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.25);">
                Reset Password
              </a>
            </div>
            <div style="border-t: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px; text-align: center;">
              <p style="font-size: 11px; color: #9ca3af; margin: 0;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.json();
      console.error("[Resend Error]", resendError);
      return new Response(
        JSON.stringify({ error: resendError.message || "Failed to deliver email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent successfully." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[vd-send-password-reset Error]`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
