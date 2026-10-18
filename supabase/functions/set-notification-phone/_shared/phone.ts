export function toE164Zambia(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('260')) return `+${digits}`;
  if (digits.startsWith('0')) return `+260${digits.slice(1)}`;
  return `+260${digits}`;
}
