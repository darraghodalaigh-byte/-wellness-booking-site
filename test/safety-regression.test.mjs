// Run: node --experimental-vm-modules --test test/safety-regression.test.mjs
// The PostgreSQL tests simulate transaction snapshots and advisory locks;
// they do not require, or modify, a live database.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const adminSource = await readFile(new URL('public/admin.js', root), 'utf8');
const repositorySource = await readFile(new URL('server/repositories/bookingRepository.js', root), 'utf8');
const timeSource = await readFile(new URL('server/db/time.js', root), 'utf8');
const attack = '\"><img src=x onerror="alert(1)"><script>alert(2)</script>&\'';

function createAdminHarness() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: '', value: '',
        classList: { add() {}, remove() {} },
        querySelectorAll: () => []
      });
    }
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element },
    window: { location: {} },
    // Prevent the page's automatic startup from loading operational data.
    fetch: async () => ({ status: 200, ok: true, json: async () => ({ authenticated: false }) })
  });
  vm.runInContext(adminSource, context);
  return {
    element,
    render(fixture, code) {
      context.fixture = fixture;
      vm.runInContext(`Object.assign(state, fixture); ${code}`, context);
    }
  };
}

function assertSafeHtml(html) {
  assert.doesNotMatch(html, /<(?:img|script|svg)\b/i, 'untrusted markup must never become an HTML element');
  assert.ok(html.includes('&lt;img'), 'the original content should remain visible as escaped text');
  assert.ok(html.includes('&quot;'), 'quotes must be escaped in attributes and text');
}

const unsafeBooking = {
  id: 'test-booking', bookingReference: 'TEST-123', fullName: attack,
  email: attack, phone: '0861568818', serviceName: attack,
  date: '2026-10-12', time: '10:00', durationMinutes: 60,
  status: 'pending', notes: attack, createdAt: '2026-09-16T12:00:00Z'
};

test('admin booking table and detail display malicious customer input as text', () => {
  const admin = createAdminHarness();
  admin.render({ bookings: [unsafeBooking], selectedBookingId: unsafeBooking.id },
    'renderBookingsTable(); renderBookingDetail();');
  assertSafeHtml(admin.element('bookingsTbody').innerHTML);
  assertSafeHtml(admin.element('bookingDetail').innerHTML);
  assert.match(admin.element('bookingsTbody').innerHTML, /TEST-123/);
  assert.match(admin.element('bookingDetail').innerHTML, /2026-10-12 10:00/);
});

for (const view of ['daily', 'weekly']) {
  test(`admin ${view} calendar escapes visitor names and service names`, () => {
    const admin = createAdminHarness();
    const day = { date: '2026-10-12', items: [unsafeBooking] };
    admin.render({ calendarData: { view, ...day, days: [day] } }, 'renderCalendarView();');
    assertSafeHtml(admin.element('calendarView').innerHTML);
    assert.match(admin.element('calendarView').innerHTML, /10:00/);
  });
}

test('service editor escapes quotes so names cannot create attributes or elements', () => {
  const admin = createAdminHarness();
  for (const key of ['ownerEmail', 'workStart', 'workEnd', 'buffer', 'minNotice', 'maxAdvance']) {
    admin.element('settingsForm')[key] = { value: '' };
  }
  admin.render({ settings: {
    business: { ownerEmail: 'owner@example.test' },
    booking: {
      workingHours: { start: '09:00', end: '18:00' }, workingDays: [1],
      bufferBetweenAppointmentsMinutes: 15, minNoticeHours: 12,
      maxAdvanceBookingDays: 90, disabledDates: [], blockedTimeRangesByDate: {}
    },
    services: [{ id: 'reflexology', name: attack, durationMinutes: 60, priceGBP: 45, active: true }]
  } }, 'renderSettingsForm();');
  assertSafeHtml(admin.element('servicesEditor').innerHTML);
  assert.match(admin.element('servicesEditor').innerHTML, /value="&quot;&gt;&lt;img/);
});

// A small transaction simulator models separate READ COMMITTED snapshots and
// shared locks across repository instances. Without the date lock, two overlap
// reads see the empty date before either transaction commits its insert.
class SimulatedPostgres {
  dialect = 'postgres';
  rows = [];
  locks = new Map();

  async acquire(key) {
    const previous = this.locks.get(key) || Promise.resolve();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    this.locks.set(key, held);
    await previous;
    return () => {
      release();
      if (this.locks.get(key) === held) this.locks.delete(key);
    };
  }

  async transaction(work) {
    const inserted = [];
    const releases = [];
    const tx = {
      dialect: 'postgres',
      get: async (sql, [date, start, end, buffer]) => {
        assert.match(sql, /SELECT id\s+FROM bookings/);
        const snapshot = this.rows.find((row) => row.date === date
          && ['pending', 'confirmed'].includes(row.status)
          && start < row.end + buffer && row.start < end + buffer);
        await setImmediate();
        return snapshot || null;
      },
      run: async (sql, params) => {
        if (sql.includes('pg_advisory_xact_lock')) {
          releases.push(await this.acquire(params[0]));
          return;
        }
        assert.match(sql, /INSERT INTO bookings/);
        if (params[1] === 'FAIL-INSERT') throw new Error('Simulated insert failure');
        inserted.push({ id: params[0], date: params[6], start: params[9], end: params[10], status: params[12] });
      }
    };
    try {
      const result = await work(tx);
      this.rows.push(...inserted);
      return result;
    } finally {
      releases.forEach((release) => release());
    }
  }
}

async function loadRepository(db) {
  const context = vm.createContext({});
  const module = new vm.SourceTextModule(repositorySource, { context });
  const dependency = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
  await module.link((specifier) => {
    if (specifier === 'node:crypto') return dependency({ default: crypto });
    if (specifier === '../db/client.js') return dependency({ createDbClient: async () => db });
    if (specifier === '../db/schema.js') return dependency({ initializeSchema: async () => {} });
    if (specifier === '../db/time.js') return new vm.SourceTextModule(timeSource, { context });
    throw new Error(`Unexpected dependency: ${specifier}`);
  });
  await module.evaluate();
  return module.namespace.createBookingRepository({ businessConfig: {
    services: [{ id: 'reflexology', name: 'Reflexology' }, { id: 'massage', name: 'Massage' }]
  } });
}

function booking(overrides = {}) {
  return {
    reference: crypto.randomUUID(), name: 'Test Client', email: 'test@example.test',
    phone: '0861568818', service: 'reflexology', date: '2026-10-12',
    startTime: '10:00', duration: 60, status: 'pending', ...overrides
  };
}

test('simultaneous bookings across services and repository instances cannot take the same time', async () => {
  const db = new SimulatedPostgres();
  const first = await loadRepository(db);
  const second = await loadRepository(db);
  const results = await Promise.allSettled([
    first.createBooking(booking(), { bufferMinutes: 15 }),
    second.createBooking(booking({ service: 'massage' }), { bufferMinutes: 15 })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'DOUBLE_BOOKING');
  assert.equal(db.rows.length, 1);
  assert.equal(db.locks.size, 0);
});

test('concurrent bookings respect the buffer while allowing its exact boundary', async () => {
  const db = new SimulatedPostgres();
  const repository = await loadRepository(db);
  const results = await Promise.allSettled([
    repository.createBooking(booking(), { bufferMinutes: 15 }),
    repository.createBooking(booking({ startTime: '11:00' }), { bufferMinutes: 15 })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'DOUBLE_BOOKING');
  const adjacent = await repository.createBooking(booking({ startTime: '11:15' }), { bufferMinutes: 15 });
  assert.equal(adjacent.time, '11:15');
  assert.equal(db.rows.length, 2);
});

test('insert failure rolls back and releases the date for the waiting booking', async () => {
  const db = new SimulatedPostgres();
  const repository = await loadRepository(db);
  const results = await Promise.allSettled([
    repository.createBooking(booking({ reference: 'FAIL-INSERT' })),
    repository.createBooking(booking())
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.match(results[0].reason.message, /Simulated insert failure/);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(db.rows.length, 1);
  assert.equal(db.locks.size, 0);
});

test('the same time on different dates remains bookable', async () => {
  const db = new SimulatedPostgres();
  const repository = await loadRepository(db);
  await Promise.all([
    repository.createBooking(booking()),
    repository.createBooking(booking({ date: '2026-10-13' }))
  ]);
  assert.equal(db.rows.length, 2);
  assert.equal(db.locks.size, 0);
});
