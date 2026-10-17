// Fixed UTC+7, independent of the server/browser timezone. Vietnam has no DST.
export const XTRA_HOURS_VN = [0, 9, 12, 15, 18, 21];
export function nextXtraSlot(now = Date.now()) {
  const offset = 7 * 3600000;
  const day = Math.floor((now + offset) / 86400000) * 86400000 - offset;
  return XTRA_HOURS_VN.map(hour => day + hour * 3600000).find(time => time > now) ?? day + 86400000;
}
// Retain the previous successful batch during a 15-minute import grace period.
// Never renew checkedAt when an import fails.
export function xtraExpiresAt(checkedAt) { return nextXtraSlot(checkedAt) + 15 * 60000; }
