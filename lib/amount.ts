/**
 * Amounts are integer-only (the FCFA has no minor unit) and grouped with spaces
 * so large values stay readable while typing: `"150000"` -> `"150 000"`.
 */

/** Keep only the digits of an amount string. */
export function amountDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Format a raw amount string for an input field: `"150000"` -> `"150 000"`. */
export function formatAmountInput(value: string) {
  const digits = amountDigits(value);
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Read a (possibly formatted) amount string back as a number; null when empty. */
export function parseAmountInput(value: string): number | null {
  const digits = amountDigits(value);
  if (!digits) return null;
  return Number(digits);
}

/**
 * Caret offset sitting just after the `digitCount`-th digit of a formatted
 * amount, so re-formatting while typing does not send the caret to the end.
 */
export function caretForDigitIndex(formatted: string, digitCount: number) {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    const char = formatted.charAt(index);
    if (char >= "0" && char <= "9") {
      seen += 1;
      if (seen === digitCount) return index + 1;
    }
  }
  return formatted.length;
}
