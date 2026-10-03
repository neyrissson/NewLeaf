// Normalises text so keyword matching works the same in English and French.
//
//  - Accents are dropped ("génétique" → "genetique", "ingénieure" → "ingenieure"). JS's `\b`
//    only knows ASCII word characters, so a term ending in "é" never gets a boundary after it;
//    folding BOTH the text and the terms sidesteps that and makes "genetique" match "génétique".
//  - Curly apostrophes become straight ones ("l’IA" → "l'IA").
//  - Inclusive-writing markers are removed so multi-word terms still match titles like
//    "Chargé(e) de projet", "Infirmier(ère) autorisé(e)" or "Technicien·ne".
//
// The result is for matching only — never show it to the user.

const GENDER_MARKERS = /\((?:e|es|s|x|ne|nne|le|lle|se|ve|ive|ere|ee|euse|trice|rice|ienne)\)|[·•](?:e|es|s|x|ne|nne|le|lle|se|ve|ive|ere|ee|euse|trice|rice|ienne)(?![a-z])/gi;
const NEEDS_FOLDING = /[^\x00-\x7f]|[(`]/;   // plain ASCII text with neither is already in folded form

export const foldText = (s: string): string => {
  if (!s || !NEEDS_FOLDING.test(s)) return s;
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e, ç → c, ï → i
    .replace(/[œŒ]/g, 'oe').replace(/[æÆ]/g, 'ae')
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(GENDER_MARKERS, '');
};
