/**
 * Utility function to convert common Vietnamese bank names to VietQR official bank codes (Napas)
 */
export function getVietQrBankCode(bankName: string): string {
  const b = (bankName || "").toUpperCase();
  if (b.includes("MB")) return "MB";
  if (b.includes("VIETCOMBANK") || b.includes("VCB")) return "VCB";
  if (b.includes("TECHCOMBANK") || b.includes("TCB")) return "TCB";
  if (b.includes("VIETINBANK") || b.includes("CTG") || b.includes("ICB")) return "ICB";
  if (b.includes("BIDV")) return "BIDV";
  if (b.includes("ACB")) return "ACB";
  if (b.includes("VPBANK") || b.includes("VPB")) return "VPB";
  if (b.includes("TPBANK") || b.includes("TPB")) return "TPB";
  if (b.includes("AGRIBANK") || b.includes("VBA")) return "VBA";
  if (b.includes("SACOMBANK") || b.includes("STB")) return "STB";
  if (b.includes("VIB")) return "VIB";
  if (b.includes("HDBANK") || b.includes("HDB")) return "HDB";
  if (b.includes("SHB")) return "SHB";
  if (b.includes("MSB")) return "MSB";
  if (b.includes("OCB")) return "OCB";
  if (b.includes("SEABANK")) return "SEAB";
  if (b.includes("LPBANK")) return "LPB";
  return "MB";
}

/**
 * Builds standard VietQR image URL with optional transfer amount and addInfo note
 */
export function buildVietQrUrl(params: {
  bankName: string;
  accountNo: string;
  amount?: number;
  addInfo?: string;
  template?: "compact2" | "compact" | "qr_only" | "print";
}): string {
  const bankCode = getVietQrBankCode(params.bankName);
  const cleanAccount = (params.accountNo || "").replace(/\s+/g, "");
  const template = params.template || "compact2";
  const url = new URL(`https://img.vietqr.io/image/${bankCode}-${cleanAccount}-${template}.png`);
  if (params.amount && params.amount > 0) {
    url.searchParams.set("amount", String(Math.round(params.amount)));
  }
  if (params.addInfo) {
    url.searchParams.set("addInfo", params.addInfo);
  }
  return url.toString();
}
