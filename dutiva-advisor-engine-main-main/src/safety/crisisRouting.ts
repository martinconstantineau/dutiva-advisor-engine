import { Locale } from '../workspace/workspaceTypes';

export interface CrisisResource {
  name: string;
  nameEn: string;
  nameFr: string;
  phone: string;
  url?: string;
}

export interface CrisisResponse {
  isCrisis: true;
  message: string;
  resources: CrisisResource[];
}

/**
 * Maintained list of Canadian crisis resources.
 * These are from public government sources and should be reviewed periodically.
 * Do NOT let the LLM generate phone numbers or URLs.
 */
const CANADA_CRISIS_RESOURCES: CrisisResource[] = [
  {
    name: 'Crisis Services Canada',
    nameEn: 'Crisis Services Canada',
    nameFr: 'Services de crise du Canada',
    phone: '1-833-456-4566',
    url: 'https://www.crisisservicescanada.ca',
  },
  {
    name: '988 Suicide Crisis Helpline',
    nameEn: '988 Suicide Crisis Helpline',
    nameFr: 'Ligne d\'aide en cas de crise suicidaire 988',
    phone: '9-8-8',
    url: 'https://988.ca',
  },
  {
    name: 'Emergency Services',
    nameEn: 'Emergency Services',
    nameFr: 'Services d\'urgence',
    phone: '9-1-1',
  },
];

const crisisMessages: Record<Locale, string> = {
  en: "It sounds like you may be going through a very difficult time. Your wellbeing matters most right now. Please reach out to a crisis support service — trained professionals are available 24/7.",
  fr: "Il semble que vous traversiez une période très difficile. Votre bien-être est ce qui compte le plus en ce moment. Veuillez contacter un service de soutien en cas de crise — des professionnels formés sont disponibles 24h/24.",
};

export function buildCrisisResponse(locale: Locale): CrisisResponse {
  return {
    isCrisis: true,
    message: crisisMessages[locale],
    resources: CANADA_CRISIS_RESOURCES,
  };
}

export function formatCrisisConversationalResponse(locale: Locale): string {
  const resources = CANADA_CRISIS_RESOURCES;
  const lines = resources.map((r) => {
    const name = locale === 'fr' ? r.nameFr : r.nameEn;
    const urlPart = r.url ? ` — ${r.url}` : '';
    return `${name}: ${r.phone}${urlPart}`;
  });

  return `${crisisMessages[locale]}\n\n${lines.join('\n')}`;
}
