/* [for overdue lockout and return checklist helpers]

No buttons or screens in here. Pages call these functions and show the result. */
import { transactions } from "./sample-data.js";
import { loanStatus } from "./app.js";

// Overdue lockout - Set to false if the lab has no overdue rule (the lockout is then switched off).
export const LOCKOUT_ENABLED = true;

export function overdueLoans(studentId) {
  return transactions.filter((t) => t.studentId === studentId && !t.returnedAt && loanStatus(t) === "overdue");
}

export function isLockedOut(studentId) {
  return LOCKOUT_ENABLED && overdueLoans(studentId).length > 0;
}

// Returns and missing parts: If an earlier return was incomplete, only the missing parts still need checking.
export const missingParts = (tx) => (tx.missing && tx.missing.length ? tx.missing : []);
export const partsToCheck = (tx) => (missingParts(tx).length ? missingParts(tx) : tx.checklistOut);