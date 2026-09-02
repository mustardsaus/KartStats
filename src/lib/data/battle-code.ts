// Short, phone-screen-friendly codes for Battle Mode. Excludes visually
// ambiguous characters (0/O, 1/I/L) since these get typed on a cramped
// mobile keyboard, often while glancing between two screens.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

export function generateBattleCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Trims and uppercases user-entered codes before lookup/comparison. */
export function normalizeBattleCode(input: string): string {
  return input.trim().toUpperCase();
}
