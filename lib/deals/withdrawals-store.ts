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

// In-memory shared store for withdrawal requests (persists in process memory for dev/demo)
let globalWithdrawals: WithdrawalRecord[] = [
  {
    id: "w-hqv-10k",
    user_id: "usr_dh_001",
    amount: 10000,
    bank_name: "MB Bank (MBB)",
    bank_account_no: "0988889999",
    bank_account_name: "HUY QUANG VU",
    status: "pending",
    note: "Đang chờ đối soát & chuyển khoản qua Napas247",
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
  {
    id: "w-hqv-50k",
    user_id: "usr_dh_001",
    amount: 50000,
    bank_name: "MB Bank (MBB)",
    bank_account_no: "0988889999",
    bank_account_name: "HUY QUANG VU",
    status: "pending",
    note: "Đang chờ đối soát & chuyển khoản qua Napas247",
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "w-demo-1",
    user_id: "usr_dh_001",
    amount: 60000,
    bank_name: "MB Bank (MBB)",
    bank_account_no: "0988889999",
    bank_account_name: "HUY QUANG VU",
    status: "completed",
    note: "Đã chuyển khoản thành công qua Napas247",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "w-demo-2",
    user_id: "usr_dh_002",
    amount: 300000,
    bank_name: "Techcombank (TCB)",
    bank_account_no: "1903456789102",
    bank_account_name: "TRAN VAN MINH",
    status: "pending",
    note: "Đang chờ admin đối soát đơn hoàn tiền",
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "w-demo-3",
    user_id: "usr_dh_003",
    amount: 500000,
    bank_name: "Vietcombank (VCB)",
    bank_account_no: "0011004382910",
    bank_account_name: "NGUYEN LAN HUONG",
    status: "completed",
    note: "Đã chi trả Napas247",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "w-demo-4",
    user_id: "usr_dh_005",
    amount: 100000,
    bank_name: "VPBank",
    bank_account_no: "128938472910",
    bank_account_name: "PHAM THUY DUONG",
    status: "rejected",
    note: "Số tài khoản nhận tiền bị sai tên chủ tài khoản",
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "w-demo-5",
    user_id: "usr_dh_006",
    amount: 150000,
    bank_name: "ACB",
    bank_account_no: "248910283",
    bank_account_name: "NGUYEN DUC VIET",
    status: "completed",
    note: "Hoàn tất chuyển khoản",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "w-demo-6",
    user_id: "usr_dh_007",
    amount: 250000,
    bank_name: "TPBank",
    bank_account_no: "03928172601",
    bank_account_name: "LE MAI ANH",
    status: "pending",
    note: "Chờ duyệt Napas247",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

export function getWithdrawals(userId?: string): WithdrawalRecord[] {
  if (!userId) return [...globalWithdrawals];
  const isHqv =
    userId === "usr_dh_001" ||
    userId === "demo-user" ||
    userId === "demo-user-123" ||
    userId.includes("dh_001") ||
    userId.includes("quangvh") ||
    userId.includes("demo");
  return globalWithdrawals.filter((w) => {
    if (w.user_id === userId) return true;
    if (isHqv && (w.user_id === "usr_dh_001" || w.user_id === "demo-user" || w.user_id === "demo-user-123")) return true;
    return false;
  });
}

export function addWithdrawal(
  record: Omit<WithdrawalRecord, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  }
): WithdrawalRecord {
  const normalizedUserId =
    record.user_id === "demo-user" || record.user_id === "demo-user-123"
      ? "usr_dh_001"
      : record.user_id;
  const newRec: WithdrawalRecord = {
    id: record.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: normalizedUserId,
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
