/**
 * Escape một ô dữ liệu cho CSV chuẩn RFC-4180 đồng thời chống lỗ hổng
 * CSV Formula Injection / DDE (Excel, LibreOffice Calc, Google Sheets).
 *
 * - Giá trị kiểu number hữu hạn (vd: -10000, 50000) giữ nguyên dạng số an toàn.
 * - Chuỗi bắt đầu bằng `=`, `+`, `-`, `@`, tab (`\t`) hoặc CR (`\r`)
 *   (kể cả sau khoảng trắng đầu dòng) được thêm tiền tố `'` để vô hiệu hóa công thức.
 */
const FORMULA_TRIGGER_RE = /^[\t\r]|^[\s\u0000-\u001f]*[=+\-@]/;

export function sanitizeCsvString(raw: string): string {
  if (!raw) return "";
  if (FORMULA_TRIGGER_RE.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `"${value}"` : '""';
  }
  if (typeof value === "boolean") {
    return value ? '"true"' : '"false"';
  }
  const safe = sanitizeCsvString(String(value));
  return `"${safe.replace(/"/g, '""')}"`;
}
