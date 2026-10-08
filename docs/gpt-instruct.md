# gpt-instruct trong DealHoàn

Đã cài bộ chỉ dẫn Codex ở phạm vi dự án, không phải dependency của website.

- Nguồn: https://github.com/MDX-Tom/gpt-instruct
- Commit upstream: 3ab84df64468bb74cc9eb4e5423660083953c44f
- Bản: gpt-5.6-sol-v45 (stable theo upstream tại thời điểm cài).
- Bản nguyên gốc và giấy phép MIT: `.codex/vendor/gpt-instruct/`.
- Bản được nạp: `.codex/deal-hoan-instructions.md`, gồm prompt upstream và các yêu cầu riêng của DealHoàn.
- Cấu hình: `.codex/config.toml` → `model_instructions_file`.

## Sử dụng

Mở phiên Codex mới trong repository được đánh dấu trusted để cấu hình dự án được nạp. Phiên đang chạy không chứng minh được việc nạp cấu hình mới. Không đổi model tự động; upstream thiết kế bản này cho gpt-5.6-sol, nên hiệu quả trên model khác cần đánh giá riêng.

Đây là bộ prompt bên thứ ba có nội dung jailbreak, không đảm bảo tăng chất lượng code. Cấu hình thay chỉ dẫn mặc định của Codex; các ràng buộc hệ thống vẫn áp dụng. Không chạy installer upstream vì installer mặc định sửa cấu hình Codex toàn máy.

## Kiểm tra và tắt

Kiểm tra file đích tồn tại và bản vendor trùng nội dung archive upstream. Không cần build Next.js vì cài đặt này không sửa runtime website.

Để tắt, xóa hoặc comment dòng `model_instructions_file` trong `.codex/config.toml`, rồi mở phiên Codex mới. Các file vendor có thể giữ để tham khảo.

Tài liệu cấu hình: https://learn.chatgpt.com/docs/config-file/config-reference
