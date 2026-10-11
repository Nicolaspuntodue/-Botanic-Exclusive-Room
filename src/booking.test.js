// node src/booking.test.js
import assert from 'node:assert/strict';
import { quote } from './booking.js';

assert.deepEqual(quote('2026-11-12', '2026-11-14'), { nights: 2, perNight: [95, 95], total: 190 });
// crosses into high season: 31 May (low) + 1 Jun (high)
assert.equal(quote('2026-05-31', '2026-06-02').total, 95 + 120);
// DST change in late March must not change the night count
assert.equal(quote('2027-03-27', '2027-03-29').nights, 2);
assert.ok(quote('2026-11-14', '2026-11-14').error);
assert.ok(quote('2026-11-14', '2026-11-12').error);
assert.ok(quote('2026-11-12', '2026-11-14', 3).error);
assert.ok(quote('', '2026-11-14').error);
console.log('booking ok');
