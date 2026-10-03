export type Theme = 'black' | 'blue';

export const THEME_KEY = 'newleaf_theme';

export const loadTheme = (): Theme => {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'black' || raw === 'blue') return raw;
  } catch {}
  return 'black';
};

export const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};
