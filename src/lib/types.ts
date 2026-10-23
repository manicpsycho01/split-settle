import type { Paise, SplitKind } from "./money";

export type Member = { id: string; name: string; upi: string | null; isAdmin: boolean; isMe: boolean; joined: boolean };
export type ExpenseRow = {
  id: string;
  description: string;
  amount: Paise;
  paidBy: string;
  splitKind: SplitKind;
  splitInput: Record<string, number> | string[];
  shares: Record<string, Paise>;
  date: string;
  category: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
  source: "app" | "splitwise";
};
export type PaymentRow = { id: string; from: string; to: string; amount: Paise; method: "upi" | "cash" | "other"; recordedBy: string; date: string; createdAt: string; deletedAt: string | null };
export type ActivityRow = { id: number; actor: string | null; kind: string; subject: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; at: string };
export type GroupData = {
  id: string;
  name: string;
  emoji: string;
  demo: boolean;
  me: string;
  isAdmin: boolean;
  members: Member[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
  activity: ActivityRow[];
};
export type GroupSummary = { id: string; name: string; emoji: string; myBalance: Paise; people: number; demo: boolean };
export type ExpenseDraft = { description: string; amount: Paise; paidBy: string; splitKind: SplitKind; splitInput: Record<string, number> | string[]; shares: Record<string, Paise>; date: string; category: string };
export type InvitePreview = { groupId: string; name: string; emoji: string; forMember: { id: string; name: string } | null; people: string[]; alreadyMember: boolean };
export type InviteLinks = { group: string; people: { memberId: string; name: string; token: string }[] };

export interface Store {
  listGroups(): Promise<GroupSummary[]>;
  loadGroup(id: string): Promise<GroupData>;
  createGroup(name: string, emoji: string, myName: string, others: string[]): Promise<string>;
  addMember(groupId: string, name: string): Promise<void>;
  saveExpense(groupId: string, draft: ExpenseDraft, id?: string): Promise<void>;
  setExpenseDeleted(groupId: string, id: string, deleted: boolean): Promise<void>;
  recordPayment(groupId: string, p: { from: string; to: string; amount: Paise; method: PaymentRow["method"] }): Promise<void>;
  setPaymentDeleted(groupId: string, id: string, deleted: boolean): Promise<void>;
  updateMember(groupId: string, memberId: string, patch: { name?: string; upi?: string | null }): Promise<void>;
  renameGroup(groupId: string, name: string, emoji: string): Promise<void>;
  inviteLinks(groupId: string): Promise<InviteLinks>;
  rotateInvite(groupId: string): Promise<void>;
  unlinkMember(groupId: string, memberId: string): Promise<void>;
  subscribe(groupId: string, onChange: () => void): () => void;
}
