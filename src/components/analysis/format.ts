/** One decimal, or a dash when missing. */
export const fixed1 = (value: number | null) => (value === null ? '—' : value.toFixed(1));

/** Signed with a real minus sign: "+2.3", "−1.0", "0.0". */
export function signed(value: number | null, digits = 1): string {
  if (value === null) return '—';
  const text = Math.abs(value).toFixed(digits);
  if (Number(text) === 0) return text;
  return value > 0 ? `+${text}` : `−${text}`;
}

/** Seconds with three decimals ("30.076"). */
export const seconds = (value: number | null) => (value === null ? '—' : value.toFixed(3));

/** "Kyle Larson" → "K. Larson" (for chips and tooltips). */
export function initialed(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const last = parts.slice(1).join(' ');
  return `${parts[0]![0]}. ${last}`;
}
