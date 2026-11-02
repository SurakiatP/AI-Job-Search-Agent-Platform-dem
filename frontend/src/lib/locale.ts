import type { Locale } from '../app/providers';

// One date style per language across the app: Thai calendar for Thai, day-month-year for English.
export const dateLocale = (locale: Locale | string): 'th-TH' | 'en-GB' => (locale.startsWith('th') ? 'th-TH' : 'en-GB');
