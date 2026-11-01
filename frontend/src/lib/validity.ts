// The browser's own validation bubbles speak the browser's language. Replace their text with the app's language
// for every form at once, instead of per-form messages. Rules (required, pattern, min, max) are not changed.
const text = {
  th: {
    missing: 'กรุณากรอกช่องนี้', email: 'กรุณากรอกอีเมลให้ถูกต้อง เช่น name@example.com', url: 'กรุณากรอกลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://',
    pattern: 'กรุณากรอกให้ตรงรูปแบบ', range: (min: string, max: string) => `กรุณากรอกค่าระหว่าง ${min}–${max}`, bad: 'ค่านี้ไม่ถูกต้อง',
  },
  en: {
    missing: 'Please fill in this field.', email: 'Enter a valid email, e.g. name@example.com.', url: 'Enter a link that starts with http:// or https://.',
    pattern: 'Match the requested format.', range: (min: string, max: string) => `Enter a value between ${min} and ${max}.`, bad: 'This value is not valid.',
  },
};

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function messageFor(el: Field): string {
  const m = text[document.documentElement.lang.startsWith('th') ? 'th' : 'en'];
  const v = el.validity;
  if (v.valueMissing) return m.missing;
  if (v.typeMismatch) return (el as HTMLInputElement).type === 'url' ? m.url : m.email;
  if (v.patternMismatch || v.tooShort) return el.title || m.pattern;
  if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch) {
    const input = el as HTMLInputElement;
    return m.range(input.min || '–', input.max || '–');
  }
  return m.bad;
}

// ponytail: a custom message sticks if a value is changed in code without an input/change event; the next submit
// clears it (the invalid handler resets first) and re-checks, at the cost of one extra click. Per-form messages if it matters.
export function installValidationText(): void {
  document.addEventListener('invalid', event => {
    const el = event.target as Field;
    el.setCustomValidity('');
    if (!el.validity.valid) el.setCustomValidity(messageFor(el));
  }, true);
  const clear = (event: Event) => (event.target as Field).setCustomValidity?.('');
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
}
