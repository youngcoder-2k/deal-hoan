import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  hasSupabaseConfig,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";
import { claimReferralForUser, recordUserDeviceSignal } from "@/lib/referral/service";
import { extractClientIp } from "@/lib/referral/anti-fraud";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (!code || !hasSupabaseConfig || !supabaseUrl || !supabasePublishableKey) {
    return NextResponse.redirect(new URL("/?auth_error=google", requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    const signedInUser = data?.user;
    if (signedInUser) {
      const refCode = request.cookies.get("dh_ref")?.value?.trim() || "";
      const deviceId = request.cookies.get("dh_did")?.value?.trim() || "";
      const fingerprintHash = request.cookies.get("dh_fp")?.value?.trim() || "";
      const ip = extractClientIp(request.headers);
      const userAgent = request.headers.get("user-agent") || "";

      try {
        if (deviceId || fingerprintHash) {
          await recordUserDeviceSignal({
            userId: signedInUser.id,
            deviceId,
            fingerprintHash,
            ip,
            userAgent,
          });
        }
        if (refCode) {
          const claimRes = await claimReferralForUser({
            refereeId: signedInUser.id,
            refereeEmail: signedInUser.email,
            refCode,
            deviceId,
            fingerprintHash,
            ip,
            userAgent,
          });
          if (claimRes.success) {
            response.cookies.set("dh_ref", "", { path: "/", maxAge: 0 });
            const reward = Number(claimRes.referral?.referee_reward ?? 10000);
            const redirectUrl = new URL(next, requestUrl.origin);
            redirectUrl.searchParams.set("ref_claimed", "1");
            redirectUrl.searchParams.set("ref_reward", String(reward));
            response.headers.set("location", redirectUrl.toString());
          } else if (
            claimRes.code &&
            claimRes.code !== "rpc_failed" &&
            claimRes.code !== "db_unavailable" &&
            claimRes.code !== "missing_device_signal"
          ) {
            response.cookies.set("dh_ref", "", { path: "/", maxAge: 0 });
          }
        }
      } catch (refErr) {
        console.warn("[auth/callback] non-blocking referral hook error:", refErr);
      }
    }
    return response;
  }

  return NextResponse.redirect(new URL("/?auth_error=google", requestUrl.origin));
}
