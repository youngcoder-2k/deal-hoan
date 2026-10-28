export interface WalletState {
  balance: number;
  pendingBalance: number;
  totalWithdrawn: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

// Initial demo wallet data synchronized with user's modal:
// Chờ nền tảng duyệt: 0đ, Có thể rút: 40.000đ, Đã nhận: 60.000đ
let globalWallet: WalletState = {
  balance: 40000,
  pendingBalance: 0,
  totalWithdrawn: 60000,
  bankName: "MB Bank (MBB)",
  bankAccountNo: "0988889999",
  bankAccountName: "HUY QUANG VU",
};

export function getSharedWallet(): WalletState {
  return { ...globalWallet };
}

export function updateSharedWallet(updates: Partial<WalletState>): WalletState {
  globalWallet = {
    ...globalWallet,
    ...updates,
  };
  return { ...globalWallet };
}

export function deductSharedWithdrawal(amount: number): WalletState {
  globalWallet.balance = Math.max(0, globalWallet.balance - amount);
  globalWallet.totalWithdrawn += amount;
  return { ...globalWallet };
}
