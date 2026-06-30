import { Locale } from '../workspace/workspaceTypes';

type LocalizedStrings = Record<string, Record<Locale, string>>;

const strings: LocalizedStrings = {
  disclaimer: {
    en: 'This information is for general guidance only and does not constitute legal advice. Consult a qualified employment lawyer for your specific situation.',
    fr: 'Ces informations sont fournies à titre indicatif uniquement et ne constituent pas un avis juridique. Consultez un avocat spécialisé en droit du travail pour votre situation spécifique.',
  },
  crisisMessage: {
    en: 'If you or someone you know is in immediate danger, please call 911 or your local emergency services.',
    fr: 'Si vous ou quelqu\'un que vous connaissez est en danger immédiat, veuillez appeler le 911 ou les services d\'urgence locaux.',
  },
  outOfScope: {
    en: 'This question falls outside the scope of HR and employment law guidance. Please consult the appropriate professional.',
    fr: 'Cette question dépasse le cadre des conseils en droit du travail et des ressources humaines. Veuillez consulter le professionnel approprié.',
  },
  escalationPrompt: {
    en: 'Given the severity of this situation, we strongly recommend consulting an employment lawyer immediately.',
    fr: 'Compte tenu de la gravité de cette situation, nous vous recommandons vivement de consulter immédiatement un avocat en droit du travail.',
  },
};

export function t(key: string, locale: Locale): string {
  return strings[key]?.[locale] ?? strings[key]?.['en'] ?? key;
}

export function isValidLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr';
}
