import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth, fetchRealAdminUsers } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import {
  evaluateReferralUnlocks,
  expireOverdueReferrals,
  getUserQualifyingCashback,
} from "@/lib/referral/service";
import { getReferralSettings } from "@/lib/referral/config";
import type { UserReferralRecord } from "@/lib/referral/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập dữ liệu giới thiệu." }, { status: 403 });
    }

    const db = getSupabaseAdminClient();
    const settings = await getReferralSettings();
    if (!db) {
      return NextResponse.json({
        success: true,
        referrals: [],
        settings,
        stats: {
          total: 0,
          locked: 0,
          reviewPending: 0,
          unlocked: 0,
          expired: 0,
          revoked: 0,
          totalLockedAmount: 0,
          totalUnlockedAmount: 0,
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = (searchParams.get("status") || "all").trim();
    const fraudFilter = (searchParams.get("fraud") || "all").trim();
    const q = (searchParams.get("q") || "").trim().toLowerCase();

    const { data: rawRows, error } = await db
      .from("user_referrals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({
        success: true,
        referrals: [],
        settings,
        migrationNeeded: true,
        warning: `Bảng user_referrals chưa được khởi tạo (${error.message}). Chạy supabase/schema-referral-ledger.sql trong Supabase SQL Editor.`,
        stats: {
          total: 0,
          locked: 0,
          reviewPending: 0,
          unlocked: 0,
          expired: 0,
          revoked: 0,
          totalLockedAmount: 0,
          totalUnlockedAmount: 0,
        },
      });
    }

    const rows = (Array.isArray(rawRows) ? rawRows : []) as UserReferralRecord[];
    const { users } = await fetchRealAdminUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const involvedUserIds = Array.from(
      new Set(rows.flatMap((r) => [r.referrer_id, r.referee_id]).filter(Boolean))
    );
    const qualifyingMap = new Map<string, number>();
    const QUAL_BATCH_SIZE = 15;
    for (let i = 0; i < involvedUserIds.length; i += QUAL_BATCH_SIZE) {
      const batch = involvedUserIds.slice(i, i + QUAL_BATCH_SIZE);
      await Promise.all(
        batch.map(async (uid) => {
          qualifyingMap.set(uid, await getUserQualifyingCashback(uid));
        })
      );
    }

    const enriched = rows.map((row) => {
      const a = userMap.get(row.referrer_id);
      const b = userMap.get(row.referee_id);
      return {
        ...row,
        referrerEmail: a?.email || "",
        referrerName: a?.fullName || a?.email?.split("@")[0] || row.referrer_id.slice(0, 8),
        referrerRefCode: a?.refCode || `u_${row.referrer_id.slice(0, 8)}`,
        referrerBankAccountNo: a?.bankAccountNo || "",
        referrerQualifying: qualifyingMap.get(row.referrer_id) || 0,
        refereeEmail: b?.email || "",
        refereeName: b?.fullName || b?.email?.split("@")[0] || row.referee_id.slice(0, 8),
        refereeRefCode: b?.refCode || `u_${row.referee_id.slice(0, 8)}`,
        refereeBankAccountNo: b?.bankAccountNo || "",
        refereeQualifying: qualifyingMap.get(row.referee_id) || 0,
      };
    });

    const stats = {
      total: enriched.length,
      locked: enriched.filter((r) => r.status === "locked").length,
      reviewPending: enriched.filter((r) => r.status === "review_pending").length,
      unlocked: enriched.filter((r) => r.status === "unlocked").length,
      expired: enriched.filter((r) => r.status === "expired").length,
      revoked: enriched.filter((r) => r.status === "revoked").length,
      totalLockedAmount: enriched
        .filter((r) => r.status === "locked" || r.status === "review_pending")
        .reduce((s, r) => s + Number(r.referrer_reward || 0) + Number(r.referee_reward || 0), 0),
      totalUnlockedAmount: enriched
        .filter((r) => r.status === "unlocked")
        .reduce((s, r) => s + Number(r.referrer_reward || 0) + Number(r.referee_reward || 0), 0),
    };

    const filtered = enriched.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (fraudFilter !== "all" && item.fraud_status !== fraudFilter) return false;
      if (q) {
        const hay = [
          item.referrerEmail,
          item.referrerName,
          item.referrerRefCode,
          item.refereeEmail,
          item.refereeName,
          item.refereeRefCode,
          item.ref_code,
          item.id,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Đưa các mục chờ Admin duyệt (review_pending) lên đầu
    filtered.sort((x, y) => {
      if (x.status === "review_pending" && y.status !== "review_pending") return -1;
      if (x.status !== "review_pending" && y.status === "review_pending") return 1;
      return new Date(y.created_at).getTime() - new Date(x.created_at).getTime();
    });

    return NextResponse.json({
      success: true,
      referrals: filtered,
      stats,
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền duyệt thưởng giới thiệu." }, { status: 403 });
    }

    const db = getSupabaseAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Chưa kết nối CSDL Supabase." }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const referralId = String(body.referralId || "").trim();
    const action = String(body.action || "").trim();
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!referralId || !["approve", "revoke"].includes(action)) {
      return NextResponse.json(
        { error: "Thiếu referralId hoặc action không hợp lệ ('approve' hoặc 'revoke')." },
        { status: 400 }
      );
    }

    const adminEmail = auth.user?.email || "admin";
    const { data, error } = await db.rpc("admin_decide_referral", {
      p_referral_id: referralId,
      p_action: action,
      p_admin_email: adminEmail,
      p_note: note || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Không thể xử lý quyết định." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message:
        action === "approve"
          ? "✅ Đã duyệt mở khóa thưởng giới thiệu sang số dư khả dụng và ghi Sổ cái!"
          : "❌ Đã thu hồi thưởng giới thiệu và ghi Sổ cái!",
      referral: data?.referral,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện." }, { status: 403 });
    }

    const db = getSupabaseAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Chưa kết nối CSDL Supabase." }, { status: 500 });
    }

    const expiredCount = await expireOverdueReferrals();

    const { data: activeRows } = await db
      .from("user_referrals")
      .select("referee_id")
      .eq("status", "locked")
      .limit(200);

    let unlockedCount = 0;
    let reviewCount = 0;
    for (const row of activeRows || []) {
      const res = await evaluateReferralUnlocks(String(row.referee_id));
      unlockedCount += res.unlocked;
      reviewCount += res.review_pending;
    }

    return NextResponse.json({
      success: true,
      expiredCount,
      unlockedCount,
      reviewCount,
      message: `Đã rà soát: mở khóa ${unlockedCount}, chuyển duyệt tay ${reviewCount}, hết hạn ${expiredCount}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
