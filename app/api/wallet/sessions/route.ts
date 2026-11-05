import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    const { data, error } = await supabase
      .from("shopping_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    return NextResponse.json({ success: true, sessions: data || [] });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể tải phiên hoàn tiền.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      // Khi ở chế độ demo/local chưa kết nối CSDL, trả về session tạm
      return NextResponse.json({
        success: true,
        session: {
          id: `sess_${Date.now()}`,
          order_id: "ĐANG-CHỜ-SÀN",
          platform: body.platform || "Shopee",
          product_name: body.productName || "Sản phẩm mua qua DealHoàn",
          product_image: body.productImage || null,
          order_value: Number(body.orderValue) || 0,
          cashback_amount: Number(body.cashbackAmount) || 0,
          status: "tracking",
          note: body.note || "Đang chờ sàn đối soát và gửi đơn (15–45 phút).",
          created_at: new Date().toISOString(),
          is_tracking_session: true,
        },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để lưu phiên hoàn tiền." },
        { status: 401 }
      );
    }

    const platform = String(body.platform || "Shopee");
    const productName = String(body.productName || "Sản phẩm mua qua DealHoàn").slice(0, 500);
    const productImage = body.productImage ? String(body.productImage).slice(0, 1000) : null;
    const orderValue = Math.max(0, Math.round(Number(body.orderValue) || 0));
    const cashbackAmount = Math.max(0, Math.round(Number(body.cashbackAmount) || 0));
    const subId = body.subId ? String(body.subId).slice(0, 128) : null;
    const note = String(
      body.note || ""
    ).slice(0, 500);

    // Lưu phiên tracking trực tiếp vào Database Supabase theo user_id
    const { data, error } = await supabase
      .from("shopping_sessions")
      .insert({
        user_id: user.id,
        order_id: "ĐANG-CHỜ-SÀN",
        platform,
        product_name: productName,
        product_image: productImage,
        order_value: orderValue,
        cashback_amount: cashbackAmount,
        sub_id: subId,
        status: "tracking",
        note,
      })
      .select("*")
      .single();

    if (error) {
      console.warn("Lỗi lưu shopping_sessions vào CSDL:", error.message);
      // Trả về session phản hồi ngay để UI không bị gián đoạn
      return NextResponse.json({
        success: true,
        session: {
          id: `sess_${Date.now()}`,
          order_id: "ĐANG-CHỜ-SÀN",
          platform,
          product_name: productName,
          product_image: productImage,
          order_value: orderValue,
          cashback_amount: cashbackAmount,
          status: "tracking",
          note,
          created_at: new Date().toISOString(),
          is_tracking_session: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      session: {
        ...data,
        is_tracking_session: true,
      },
    });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể lưu phiên hoàn tiền.");
  }
}
