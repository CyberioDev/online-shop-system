const VOWELS = /[аэоөуүиеёыяю]$/i;
const BACK_VOWELS = /[аоуяёюы]/i;

/**
 * Genitive case of a personal name, using common spoken forms:
 * Болд → Болдын, Оюука → Оюукагийн, Хулан → Хуланы, Мишээл → Мишээлийн.
 */
export function genitive(name: string) {
  const back = BACK_VOWELS.test(name);
  if (VOWELS.test(name)) return `${name}гийн`;
  if (/й$/i.test(name)) return `${name}н`;
  if (/н$/i.test(name)) return `${name}${back ? 'ы' : 'ий'}`;
  return `${name}${back ? 'ын' : 'ийн'}`;
}

/**
 * Ablative case ("from"): Болд → Болдоос, Оюука → Оюукагаас, Мөнхөө → Мөнхөөгөөс,
 * Тэмүүлэн → Тэмүүлэнээс. Vowel harmony follows the name's vowels.
 */
export function ablative(name: string) {
  const suffix = /[ауяы]/i.test(name)
    ? 'аас'
    : /[оё]/i.test(name)
      ? 'оос'
      : /ө/i.test(name)
        ? 'өөс'
        : 'ээс';
  return VOWELS.test(name) ? `${name}г${suffix}` : `${name}${suffix}`;
}

/** "Болдынх", "Оюукагийнх" — "belonging to". */
export function possessive(name: string) {
  return `${genitive(name)}х`;
}
