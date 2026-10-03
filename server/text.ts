// Characters that must never travel inside a message, a PayPal note or a result handed to the AI:
// the control characters (0-31, 127-159) and the two Unicode line separators (8232, 8233).
// Built from character codes so the file itself holds no invisible characters.
const code = (n: number) => String.fromCharCode(n);
const CONTROL = new RegExp(`[${code(0)}-${code(31)}${code(127)}-${code(159)}${code(8232)}${code(8233)}]`, 'g');

/**
 * Makes a piece of text from a receipt or a person safe to show or send on: no control characters or line breaks,
 * no runs of spaces, no angle brackets, and no longer than `max`. Used wherever text typed by someone (or read from a
 * photo) is put into a message, a PayPal note or a result handed to the AI.
 */
export function cleanText(value: unknown, max = 80): string {
  const text = typeof value === 'string' ? value : '';
  return text.replace(CONTROL, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
