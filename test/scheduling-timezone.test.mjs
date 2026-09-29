import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  buildSlotsForDate,
  checkBookingConflict,
  generateCalendarSummary,
  validateBookingWindow
} from '../server/scheduling.js';

function configuration(booking = {}) {
  return {
    business: { timezone: 'Europe/Dublin' },
    services: [{ id: 'reflexology', name: 'Reflexology', durationMinutes: 15, active: true }],
    booking: {
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      workingHours: { start: '09:00', end: '12:00' },
      slotIntervalMinutes: 15,
      bufferBetweenAppointmentsMinutes: 0,
      minNoticeHours: 2,
      maxAdvanceBookingDays: 90,
      disabledDates: [],
      blockedTimeRangesByDate: {},
      ...booking
    }
  };
}

function slots(date, instant, config = configuration(), extra = {}) {
  return buildSlotsForDate({ serviceId: 'reflexology', date, bookings: [], config, now: new Date(instant), ...extra });
}

const at = (result, time) => result.slots.find((slot) => slot.time === time);

test('summer notice uses Irish summer time and allows the exact cutoff', () => {
  // 08:00 UTC is 09:00 in Ireland; two hours' notice begins at 11:00 local.
  const result = slots('2026-07-15', '2026-07-15T08:00:00Z');
  assert.equal(at(result, '10:45').available, false);
  assert.equal(at(result, '10:45').reason, 'Requires 2h notice');
  assert.equal(at(result, '11:00').available, true);
  assert.equal(at(slots('2026-07-15', '2026-07-15T08:00:00.001Z'), '11:00').available, false);
});

test('winter notice uses Irish standard time with the same local boundary', () => {
  const result = slots('2026-01-15', '2026-01-15T09:00:00Z');
  assert.equal(at(result, '10:45').available, false);
  assert.equal(at(result, '11:00').available, true);
});

test('booking windows follow Dublin midnight across month boundaries, not UTC midnight', () => {
  const config = configuration({ maxAdvanceBookingDays: 1 });
  const summerNow = new Date('2026-09-29T23:30:00Z'); // 30 September locally.
  assert.deepEqual(validateBookingWindow('2026-09-29', config, summerNow), { valid: false, reason: 'Please choose a future date.' });
  assert.equal(validateBookingWindow('2026-09-30', config, summerNow).valid, true);
  assert.equal(validateBookingWindow('2026-10-01', config, summerNow).valid, true);
  assert.equal(validateBookingWindow('2026-10-02', config, summerNow).valid, false);
  const winterNow = new Date('2026-11-29T23:30:00Z'); // Still 29 November locally.
  assert.equal(validateBookingWindow('2026-11-29', config, winterNow).valid, true);
  assert.equal(validateBookingWindow('2026-11-30', config, winterNow).valid, true);
  assert.equal(validateBookingWindow('2026-12-01', config, winterNow).valid, false);
});

test('minimum notice across either DST change measures elapsed hours', () => {
  const config = configuration({ minNoticeHours: 12 });
  const spring = slots('2026-03-29', '2026-03-28T22:00:00Z', config);
  assert.equal(at(spring, '10:45').available, false);
  assert.equal(at(spring, '11:00').available, true); // 10:00 UTC: exactly 12 hours.
  const autumn = slots('2026-10-25', '2026-10-24T22:00:00Z', config);
  assert.equal(at(autumn, '09:45').available, false);
  assert.equal(at(autumn, '10:00').available, true); // 10:00 UTC: exactly 12 hours.
});

test('nonexistent spring times are closed and repeated autumn times do not reopen', () => {
  const config = configuration({ workingHours: { start: '00:00', end: '03:00' }, minNoticeHours: 0 });
  const spring = slots('2026-03-29', '2026-03-28T20:00:00Z', config);
  assert.equal(at(spring, '00:45').available, true);
  assert.equal(at(spring, '01:00').available, false);
  assert.equal(at(spring, '01:30').reason, 'Unavailable during the clock change');
  assert.equal(at(spring, '02:00').available, true);
  const firstOccurrence = slots('2026-10-25', '2026-10-25T00:15:00Z', config);
  assert.equal(at(firstOccurrence, '01:30').available, true);
  const secondOccurrence = slots('2026-10-25', '2026-10-25T01:15:00Z', config);
  assert.equal(at(secondOccurrence, '01:30').available, false);
  assert.equal(at(secondOccurrence, '02:00').available, true);
});

test('calendar summaries and submit-time conflict checks share the same injected clock', () => {
  const config = configuration();
  const now = new Date('2026-07-15T08:00:00Z');
  const common = { serviceId: 'reflexology', bookings: [], config, now };
  const summary = generateCalendarSummary({ ...common, month: '2026-07' });
  assert.equal(summary.days.find((day) => day.date === '2026-07-15').availableCount, 4);
  assert.equal(summary.days.find((day) => day.date === '2026-07-14').isUnavailable, true);
  assert.deepEqual(checkBookingConflict({ ...common, date: '2026-07-15', time: '10:45' }), { conflict: true, reason: 'Requires 2h notice' });
  assert.deepEqual(checkBookingConflict({ ...common, date: '2026-07-15', time: '11:00' }), { conflict: false });
});

test('working days, closures, blocks and appointment buffers keep their existing behavior', () => {
  const date = '2026-07-15';
  const instant = '2026-07-14T10:00:00Z';
  const config = configuration({ workingHours: { start: '09:00', end: '13:00' }, minNoticeHours: 0, bufferBetweenAppointmentsMinutes: 15, blockedTimeRangesByDate: { [date]: ['12:00-12:30'] } });
  config.services[0].durationMinutes = 30;
  const result = slots(date, instant, config, { bookings: [{ id: 'existing', date, time: '10:00', durationMinutes: 60, status: 'confirmed' }], blockedTimes: [{ date, start_time: '09:00', end_time: '09:15' }] });
  assert.equal(at(result, '09:00').reason, 'Blocked period');
  assert.equal(at(result, '09:15').available, true);
  assert.equal(at(result, '09:30').reason, 'Already booked');
  assert.equal(at(result, '11:00').reason, 'Already booked');
  assert.equal(at(result, '11:15').available, true);
  assert.equal(at(result, '12:00').reason, 'Blocked period');
  assert.equal(at(result, '12:30').available, true);
  assert.equal(slots(date, instant, configuration({ disabledDates: [date] })).unavailableReason, 'This date is unavailable.');
  assert.equal(slots(date, instant, configuration({ workingDays: [1] })).unavailableReason, 'Appointments are not offered on this day.');
});

test('slot results are identical when the server runs in different timezones', () => {
  const moduleUrl = new URL('../server/scheduling.js', import.meta.url).href;
  const source = `import { buildSlotsForDate } from ${JSON.stringify(moduleUrl)};\nconsole.log(JSON.stringify(buildSlotsForDate({serviceId:'reflexology',date:'2026-07-15',bookings:[],config:${JSON.stringify(configuration())},now:new Date('2026-07-15T08:00:00Z')})));`;
  const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((TZ) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ }, encoding: 'utf8' })));
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
  assert.equal(at(results[0], '10:45').available, false);
  assert.equal(at(results[0], '11:00').available, true);
});
