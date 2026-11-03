export interface WithdrawalRecord {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  created_at: string;
}

// In-memory store (chỉ dùng lưu tạm nếu CSDL không khả dụng, KHÔNG chứa mock/fake data)
let globalWithdrawals: WithdrawalRecord[] = [];

export function getWithdrawals(userId?: string): WithdrawalRecord[] {
  if (!userId) return [...globalWithdrawals];
  return globalWithdrawals.filter((w) => w.user_id === userId);
}

export function addWithdrawal(
  record: Omit<WithdrawalRecord, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  }
): WithdrawalRecord {
  const newRec: WithdrawalRecord = {
    id: record.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: record.user_id,
    amount: record.amount,
    bank_name: record.bank_name,
    bank_account_no: record.bank_account_no,
    bank_account_name: record.bank_account_name,
    status: record.status || "pending",
    note: record.note || "Đang chờ đối soát & chuyển khoản qua Napas247",
    created_at: record.created_at || new Date().toISOString(),
  };
  globalWithdrawals = [newRec, ...globalWithdrawals];
  return newRec;
}

export function updateWithdrawalStatus(
  id: string,
  status: "pending" | "completed" | "rejected",
  note?: string | null
): WithdrawalRecord | null {
  const target = globalWithdrawals.find((w) => w.id === id);
  if (!target) return null;
  target.status = status;
  if (typeof note === "string") target.note = note;
  return target;
}

export function clearWithdrawals(): void {
  globalWithdrawals = [];
}
