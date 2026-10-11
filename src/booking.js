// Direct-booking rates (EUR per night). Single place to edit prices.
// ponytail: flat seasonal table, swap for a channel manager / booking engine API when it goes live.
export const RATES = {
  low: 95,           // October–May (Google Hotels showed 94–112 € for Oct 2026)
  high: 120,         // June–September
  highMonths: [5, 6, 7, 8], // 0-based: Jun, Jul, Aug, Sep
  maxGuests: 2,
  minNights: 1,
};

const DAY = 86400000;
const toUTC = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export const rateFor = (utc) => (RATES.highMonths.includes(new Date(utc).getUTCMonth()) ? RATES.high : RATES.low);

// quote('2026-11-12', '2026-11-14') -> { nights: 2, total: 190, perNight: [95, 95] } or { error }
export function quote(checkin, checkout, guests = 2) {
  if (!checkin || !checkout) return { error: 'Scegli le date' };
  const a = toUTC(checkin), b = toUTC(checkout);
  const nights = Math.round((b - a) / DAY);
  if (!(nights >= RATES.minNights)) return { error: 'Il check-out deve essere dopo il check-in' };
  if (guests < 1 || guests > RATES.maxGuests) return { error: `Massimo ${RATES.maxGuests} ospiti` };
  const perNight = Array.from({ length: nights }, (_, i) => rateFor(a + i * DAY));
  return { nights, perNight, total: perNight.reduce((s, r) => s + r, 0) };
}
