"use client";

import React, { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface AdminForbiddenViewProps {
  currentUserEmail?: string | null;
  hasSecretKeyConfigured?: boolean;
}

export default function AdminForbiddenView({
  currentUserEmail,
  hasSecretKeyConfigured = false,
}: AdminForbiddenViewProps) {
  const [keyInput, setKeyInput] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleGoogleSignIn = async () => {
    try {
      setSigningIn(true);
      setErrorMsg("");
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setErrorMsg("Không thể kết nối dịch vụ xác thực Supabase.");
        setSigningIn(false);
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin`,
        },
      });
      if (error) {
        setErrorMsg(error.message || "Đăng nhập Google thất bại.");
        setSigningIn(false);
      }
    } catch {
      setErrorMsg("Có lỗi xảy ra trong quá trình mở cửa sổ đăng nhập.");
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  const handleSecretKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    document.cookie = `dealhoan_admin_key=${encodeURIComponent(trimmed)}; path=/; max-age=2592000; SameSite=Lax`;
    window.location.href = `/admin?key=${encodeURIComponent(trimmed)}`;
  };

  return (
    <div className="admin-forbidden-container">
      <div className="admin-forbidden-card">
        <div className="forbidden-icon">🛡️</div>
        <h2>Khu Vực Quản Trị Hệ Thống</h2>

        <p>
          {currentUserEmail ? (
            <>
              Bạn đang đăng nhập bằng tài khoản <b>{currentUserEmail}</b>. Đây là tài khoản người dùng và <b>không có quyền quản trị</b> hệ thống DealHoàn.
            </>
          ) : (
            <>
              Trang này được bảo mật nghiêm ngặt và <b>chỉ dành riêng cho Quản trị viên hệ thống</b> DealHoàn. Vui lòng đăng nhập bằng tài khoản Google có quyền Admin.
            </>
          )}
        </p>

        {errorMsg && (
          <div style={{ color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div className="forbidden-actions" style={{ flexDirection: "column", gap: "10px" }}>
          {!currentUserEmail ? (
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="admin-btn-primary"
              style={{ justifyContent: "center", width: "100%" }}
            >
              {signingIn ? "Đang chuyển đến Google..." : "🔑 Đăng nhập Google bằng tài khoản Admin"}
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              className="admin-btn-secondary"
              style={{ justifyContent: "center", width: "100%", border: "1px solid #e4e4e7" }}
            >
              🔄 Đăng xuất / Đổi tài khoản Quản trị
            </button>
          )}

          <Link
            href="/"
            className="admin-btn-secondary"
            style={{ justifyContent: "center", width: "100%", textDecoration: "none", border: "1px solid #e4e4e7" }}
          >
            ← Quay về trang chủ DealHoàn
          </Link>
        </div>

        {hasSecretKeyConfigured && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed #fed7aa" }}>
            {!showKeyInput ? (
              <button
                type="button"
                onClick={() => setShowKeyInput(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ea580c",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                🔐 Sử dụng Mã bảo mật Quản trị (Admin Secret Key)
              </button>
            ) : (
              <form onSubmit={handleSecretKeySubmit} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <input
                  type="password"
                  placeholder="Nhập ADMIN_SECRET_KEY..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #d4d4d8",
                    fontSize: "13px",
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  className="admin-btn-primary"
                  style={{ padding: "8px 14px", fontSize: "13px" }}
                >
                  Xác nhận
                </button>
              </form>
            )}
          </div>
        )}

        <div className="forbidden-note" style={{ marginTop: "20px" }}>
          <span>⚠️ Chỉ các email nằm trong danh sách cấp phép (whitelist) của hệ thống mới có thể truy cập khu vực này.</span>
        </div>
      </div>
    </div>
  );
}
