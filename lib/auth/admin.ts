import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabasePublishableKey } from "../supabase/config";

export interface AdminUserItem {
  id: string;
  refCode: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: "admin" | "user";
  createdAt: string;
  lastSignInAt?: string;
  balance: number;
  pendingBalance: number;
  totalWithdrawn: number;
  totalEarned: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  isBankConfigured: boolean;
  withdrawalCount: number;
  latestWithdrawal?: {
    id: string;
    amount: number;
    status: "pending" | "completed" | "rejected";
    createdAt: string;
    note?: string | null;
  } | null;
}

export interface AdminKPIStats {
  totalUsers: number;
  totalBalance: number;
  totalPendingBalance: number;
  totalWithdrawn: number;
  bankLinkedUsers: number;
  bankLinkedRate: number;
}

// Danh sách email có quyền admin mặc định
const DEFAULT_ADMIN_EMAILS = [
  "quangvh.technical@gmail.com",
  "admin@dealhoan.vn",
  "contact@dealhoan.vn",
];

export function getAdminEmails(): string[] {
  const envEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase())
    : [];
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...envEmails]));
}

export function isAdminUser(user: {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): boolean {
  if (!user) return false;

  const email = (user.email || "").toLowerCase().trim();
  if (email && getAdminEmails().includes(email)) {
    return true;
  }

  if (
    user.app_metadata?.role === "admin" ||
    user.user_metadata?.role === "admin"
  ) {
    return true;
  }

  return false;
}

export function getSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) return null;

  // Sử dụng Service Role Key nếu có để bỏ qua RLS và gọi admin API
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  // Fallback sang publishable key
  if (supabasePublishableKey) {
    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  return null;
}

// Dữ liệu mẫu phong phú mô phỏng hệ thống thực tế khi chưa kết nối Supabase Service Role
export const DEMO_ADMIN_USERS: AdminUserItem[] = [
  {
    id: "usr_dh_001",
    refCode: "u_dh001",
    email: "quangvh.technical@gmail.com",
    fullName: "Huy Quang Vũ",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face",
    role: "admin",
    createdAt: "2025-01-10T08:30:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    balance: 154000,
    pendingBalance: 77000,
    totalWithdrawn: 200000,
    totalEarned: 354000,
    bankName: "MB Bank (MBB)",
    bankAccountNo: "0988889999",
    bankAccountName: "NGUYEN VAN DEMO",
    isBankConfigured: true,
    withdrawalCount: 2,
    latestWithdrawal: {
      id: "w-demo-1",
      amount: 200000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      note: "Đã chuyển khoản thành công qua Napas247",
    },
  },
  {
    id: "usr_dh_002",
    refCode: "u_dh002",
    email: "tranminh.shopee@gmail.com",
    fullName: "Trần Văn Minh",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-01-14T14:20:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    balance: 420000,
    pendingBalance: 185000,
    totalWithdrawn: 1250000,
    totalEarned: 1670000,
    bankName: "Techcombank (TCB)",
    bankAccountNo: "1903456789102",
    bankAccountName: "TRAN VAN MINH",
    isBankConfigured: true,
    withdrawalCount: 4,
    latestWithdrawal: {
      id: "w-demo-2",
      amount: 300000,
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      note: "Đang chờ admin đối soát đơn hoàn tiền",
    },
  },
  {
    id: "usr_dh_003",
    refCode: "u_dh003",
    email: "nguyen.lanhuong89@gmail.com",
    fullName: "Nguyễn Lan Hương",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-02-01T09:15:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    balance: 89000,
    pendingBalance: 120000,
    totalWithdrawn: 500000,
    totalEarned: 589000,
    bankName: "Vietcombank (VCB)",
    bankAccountNo: "0011004382910",
    bankAccountName: "NGUYEN LAN HUONG",
    isBankConfigured: true,
    withdrawalCount: 1,
    latestWithdrawal: {
      id: "w-demo-3",
      amount: 500000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      note: "Đã chi trả Napas247",
    },
  },
  {
    id: "usr_dh_004",
    refCode: "u_dh004",
    email: "hoangnam.dev@outlook.com",
    fullName: "Hoàng Nam",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-02-12T11:45:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    balance: 0,
    pendingBalance: 45000,
    totalWithdrawn: 0,
    totalEarned: 0,
    bankName: "",
    bankAccountNo: "",
    bankAccountName: "",
    isBankConfigured: false,
    withdrawalCount: 0,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_005",
    refCode: "u_dh005",
    email: "thuyduong.pham@gmail.com",
    fullName: "Phạm Thùy Dương",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-02-18T16:10:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    balance: 240000,
    pendingBalance: 95000,
    totalWithdrawn: 800000,
    totalEarned: 1040000,
    bankName: "VPBank",
    bankAccountNo: "128938472910",
    bankAccountName: "PHAM THUY DUONG",
    isBankConfigured: true,
    withdrawalCount: 3,
    latestWithdrawal: {
      id: "w-demo-4",
      amount: 100000,
      status: "rejected",
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      note: "Số tài khoản nhận tiền bị sai tên chủ tài khoản",
    },
  },
  {
    id: "usr_dh_006",
    refCode: "u_dh006",
    email: "ducviet.ng@gmail.com",
    fullName: "Nguyễn Đức Việt",
    avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-02-25T10:00:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    balance: 65000,
    pendingBalance: 32000,
    totalWithdrawn: 150000,
    totalEarned: 215000,
    bankName: "ACB",
    bankAccountNo: "248910283",
    bankAccountName: "NGUYEN DUC VIET",
    isBankConfigured: true,
    withdrawalCount: 1,
    latestWithdrawal: {
      id: "w-demo-5",
      amount: 150000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      note: "Hoàn tất chuyển khoản",
    },
  },
  {
    id: "usr_dh_007",
    refCode: "u_dh007",
    email: "mai.anh.order@yahoo.com",
    fullName: "Lê Mai Anh",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-01T15:25:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    balance: 310000,
    pendingBalance: 210000,
    totalWithdrawn: 450000,
    totalEarned: 760000,
    bankName: "TPBank",
    bankAccountNo: "03928172601",
    bankAccountName: "LE MAI ANH",
    isBankConfigured: true,
    withdrawalCount: 2,
    latestWithdrawal: {
      id: "w-demo-6",
      amount: 250000,
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      note: "Chờ duyệt Napas247",
    },
  },
  {
    id: "usr_dh_008",
    refCode: "u_dh008",
    email: "tuananh.k14@gmail.com",
    fullName: "Vũ Tuấn Anh",
    avatarUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-05T09:00:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    balance: 15000,
    pendingBalance: 88000,
    totalWithdrawn: 0,
    totalEarned: 15000,
    bankName: "BIDV",
    bankAccountNo: "1231000492817",
    bankAccountName: "VU TUAN ANH",
    isBankConfigured: true,
    withdrawalCount: 0,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_009",
    refCode: "u_dh009",
    email: "baongoc.fashion@gmail.com",
    fullName: "Hoàng Bảo Ngọc",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-08T14:10:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    balance: 560000,
    pendingBalance: 320000,
    totalWithdrawn: 1800000,
    totalEarned: 2360000,
    bankName: "MB Bank (MBB)",
    bankAccountNo: "0388991122",
    bankAccountName: "HOANG BAO NGOC",
    isBankConfigured: true,
    withdrawalCount: 5,
    latestWithdrawal: {
      id: "w-demo-7",
      amount: 500000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
      note: "Đã chuyển khoản Napas247",
    },
  },
  {
    id: "usr_dh_010",
    refCode: "u_dh010",
    email: "tri.dominhtri@gmail.com",
    fullName: "Đỗ Minh Trí",
    avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-10T11:20:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    balance: 175000,
    pendingBalance: 90000,
    totalWithdrawn: 300000,
    totalEarned: 475000,
    bankName: "VietinBank",
    bankAccountNo: "102839201928",
    bankAccountName: "DO MINH TRI",
    isBankConfigured: true,
    withdrawalCount: 1,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_011",
    refCode: "u_dh011",
    email: "honghanh.media@gmail.com",
    fullName: "Nguyễn Thị Hồng Hạnh",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-12T08:45:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    balance: 890000,
    pendingBalance: 410000,
    totalWithdrawn: 2100000,
    totalEarned: 2990000,
    bankName: "Techcombank (TCB)",
    bankAccountNo: "1903829102938",
    bankAccountName: "NGUYEN THI HONG HANH",
    isBankConfigured: true,
    withdrawalCount: 6,
    latestWithdrawal: {
      id: "w-demo-8",
      amount: 400000,
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      note: "Yêu cầu rút tiền qua TCB",
    },
  },
  {
    id: "usr_dh_012",
    refCode: "u_dh012",
    email: "thanhson.bui@yahoo.com",
    fullName: "Bùi Thanh Sơn",
    avatarUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-15T16:00:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    balance: 0,
    pendingBalance: 65000,
    totalWithdrawn: 0,
    totalEarned: 0,
    bankName: "Sacombank",
    bankAccountNo: "060293848192",
    bankAccountName: "BUI THANH SON",
    isBankConfigured: true,
    withdrawalCount: 0,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_013",
    refCode: "u_dh013",
    email: "khanhlinh.design@gmail.com",
    fullName: "Trần Khánh Linh",
    avatarUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-18T10:15:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    balance: 330000,
    pendingBalance: 155000,
    totalWithdrawn: 600000,
    totalEarned: 930000,
    bankName: "VIB",
    bankAccountNo: "6018392019",
    bankAccountName: "TRAN KHANH LINH",
    isBankConfigured: true,
    withdrawalCount: 2,
    latestWithdrawal: {
      id: "w-demo-9",
      amount: 300000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      note: "Đã chi trả Napas247",
    },
  },
  {
    id: "usr_dh_014",
    refCode: "u_dh014",
    email: "quanghuy.dinh@outlook.com",
    fullName: "Đinh Quang Huy",
    avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-20T13:30:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    balance: 45000,
    pendingBalance: 25000,
    totalWithdrawn: 100000,
    totalEarned: 145000,
    bankName: "SHB",
    bankAccountNo: "1002938491",
    bankAccountName: "DINH QUANG HUY",
    isBankConfigured: true,
    withdrawalCount: 1,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_015",
    refCode: "u_dh015",
    email: "thutrang.agri@gmail.com",
    fullName: "Phạm Thu Trang",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-22T09:00:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 15).toISOString(),
    balance: 720000,
    pendingBalance: 280000,
    totalWithdrawn: 950000,
    totalEarned: 1670000,
    bankName: "Agribank",
    bankAccountNo: "1500205839201",
    bankAccountName: "PHAM THU TRANG",
    isBankConfigured: true,
    withdrawalCount: 3,
    latestWithdrawal: {
      id: "w-demo-10",
      amount: 350000,
      status: "completed",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      note: "Đã giải ngân qua Agribank",
    },
  },
  {
    id: "usr_dh_016",
    refCode: "u_dh016",
    email: "haidang.ng@gmail.com",
    fullName: "Nguyễn Hải Đăng",
    avatarUrl: "https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-25T15:40:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    balance: 120000,
    pendingBalance: 80000,
    totalWithdrawn: 200000,
    totalEarned: 320000,
    bankName: "MSB",
    bankAccountNo: "03001019283910",
    bankAccountName: "NGUYEN HAI DANG",
    isBankConfigured: true,
    withdrawalCount: 1,
    latestWithdrawal: null,
  },
  {
    id: "usr_dh_017",
    refCode: "u_dh017",
    email: "dieuthuy.vu@gmail.com",
    fullName: "Vũ Diệu Thúy",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-28T11:10:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
    balance: 490000,
    pendingBalance: 215000,
    totalWithdrawn: 1400000,
    totalEarned: 1890000,
    bankName: "ACB",
    bankAccountNo: "738291028",
    bankAccountName: "VU DIEU THUY",
    isBankConfigured: true,
    withdrawalCount: 4,
    latestWithdrawal: {
      id: "w-demo-11",
      amount: 490000,
      status: "pending",
      createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      note: "Yêu cầu rút toàn bộ số dư khả dụng",
    },
  },
  {
    id: "usr_dh_018",
    refCode: "u_dh018",
    email: "quocbao.le@gmail.com",
    fullName: "Lê Quốc Bảo",
    avatarUrl: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop&crop=face",
    role: "user",
    createdAt: "2025-03-30T09:20:00Z",
    lastSignInAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    balance: 0,
    pendingBalance: 50000,
    totalWithdrawn: 0,
    totalEarned: 0,
    bankName: "",
    bankAccountNo: "",
    bankAccountName: "",
    isBankConfigured: false,
    withdrawalCount: 0,
    latestWithdrawal: null,
  },
];
