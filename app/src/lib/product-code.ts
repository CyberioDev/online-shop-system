/**
 * Product codes are 3 Latin letters, stored uppercase ("TOS"). Sellers and buyers often
 * type on a Mongolian Cyrillic keyboard, so Cyrillic letters that look like Latin ones
 * are read as those letters. The backend's chat parser should apply the same mapping.
 */
const LOOKALIKES: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Ү: 'Y', Х: 'X',
};

export const PRODUCT_CODE_PATTERN = /^[A-Z]{3}$/;

/** Uppercases, maps Cyrillic look-alikes, drops everything else, and keeps 3 letters. */
export function normalizeProductCode(text: string) {
  return [...text.toUpperCase()]
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .filter((ch) => ch >= 'A' && ch <= 'Z')
    .join('')
    .slice(0, 3);
}
