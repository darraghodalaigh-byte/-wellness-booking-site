import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PUBLIC_CONTENT, applyPublicContent } from '../lib/public-content.js';
import { BUSINESS_CONFIG } from '../config/business.config.js';
import publicConfigHandler from '../api/public-config.js';

const deposit = 'A 50% deposit is required to secure your appointment. Louise will email payment details after receiving your request. Your appointment is confirmed once the deposit is received and Louise confirms it by email. No payment is taken on this website.';
const cancellation = 'Please give at least 24 hours’ notice to cancel or reschedule. If you cancel less than 24 hours before your appointment, the 50% booking deposit is non-refundable.';

function staleDiary() {
  return {
    business: { name: 'Soul to Sole', ownerName: 'Louise O\'Dalaigh', ownerEmail: 'old@example.test', phone: '0123456789', about: 'Only two decades in healthcare.', timezone: 'Europe/Dublin' },
    services: [{ id: 'live-treatment', name: 'Live treatment', priceGBP: 83, durationMinutes: 90, active: true }],
    book: { enabled: false, title: 'Deeply OK', coverImage: '/assets/brand/deeply-ok-cover.jpeg', coverAlt: 'Cover of Deeply OK by Louise O\'Dalaigh', amazonUrl: 'https://retailer.example/book', waitlistUrl: 'https://signup.example/book', launchDate: '2026-11-01', launchDateLabel: 'A current launch date', waitlistLabel: 'Live waitlist label', amazonLabel: 'Live retailer label', description: ['Current book copy.'], isbn: { paperback: 'preserved-book-id' } },
    bookingRules: { workingDays: [2, 4], minNoticeHours: 36, maxAdvanceBookingDays: 45 },
    availability: { disabledDates: ['2027-01-02'] },
    policies: { depositPercent: 0, deposit: 'No deposit needed.', cancellation: 'A late cancellation fee may apply.', arrival: 'Arrive five minutes early.', privacy: 'Your details are used for appointments.' },
    faq: [
      { question: 'What should I wear?', answer: 'Whatever makes you comfortable.' },
      { question: 'Do you offer package options?', answer: 'Ask about the current live packages.' },
      { question: 'Is a deposit required?', answer: 'No.' },
      { question: 'When is my booking confirmed?', answer: 'Immediately after submission.' },
      { question: 'Can I reschedule my appointment?', answer: 'Call the old phone number.' },
      { question: 'What is your cancellation policy?', answer: 'There is no cancellation policy.' }
    ],
    testimonials: [{ quote: 'An existing client reflection.' }]
  };
}

test('stale upstream name, cover, biography, contact information and booking policies cannot overwrite approved content', () => {
  const source = staleDiary();
  const original = structuredClone(source);
  Object.freeze(source.business);
  Object.freeze(source.book);
  Object.freeze(source.policies);
  Object.freeze(source.faq);
  Object.freeze(source);
  const result = applyPublicContent(source);
  assert.equal(result.business.ownerName, 'Louise O’Dálaigh');
  assert.equal(result.book.coverImage, '/assets/brand/deeply-ok-cover-fada.jpeg');
  assert.equal(result.book.coverAlt, 'Deeply OK by Louise O’Dálaigh — A simple guide to feeling like yourself again');
  assert.match(result.business.about, /qualified as a nurse/);
  assert.match(result.business.about, /more than three decades in healthcare/);
  assert.match(result.business.about, /over 20 years as a healthcare leader/);
  assert.match(result.business.about.split('\n\n')[1], /nurse, ward sister, bed manager, general manager and services manager/);
  assert.equal(result.business.ownerEmail, 'soultosolebylouise@gmail.com');
  assert.equal(Object.hasOwn(result.business, 'phone'), false);
  assert.equal(result.policies.depositPercent, 50);
  assert.equal(result.policies.deposit, deposit);
  assert.equal(result.policies.cancellation, cancellation);
  assert.deepEqual(source, original, 'upstream data must not be mutated');
});

test('live services, prices, availability, book links and booking rules are retained exactly', () => {
  const source = staleDiary();
  const result = applyPublicContent(source);
  for (const key of ['services', 'bookingRules', 'availability', 'testimonials']) {
    assert.strictEqual(result[key], source[key], `${key} must remain authoritative from the diary`);
  }
  assert.notStrictEqual(result.book, source.book, 'book editorial changes require a copy');
  const { coverImage: oldCoverImage, coverAlt: oldCoverAlt, ...liveBook } = source.book;
  const { coverImage, coverAlt, ...preservedBook } = result.book;
  assert.deepEqual(preservedBook, liveBook, 'every non-editorial book field must remain authoritative from the diary');
  assert.strictEqual(result.book.isbn, source.book.isbn);
  assert.strictEqual(result.book.description, source.book.description);
  assert.equal(result.services[0].priceGBP, 83);
  assert.equal(result.services[0].durationMinutes, 90);
  assert.equal(result.business.timezone, 'Europe/Dublin');
  assert.equal(result.policies.arrival, source.policies.arrival);
  assert.equal(result.policies.privacy, source.policies.privacy);
});

test('booking-policy FAQs are replaced while unrelated existing FAQs retain their content', () => {
  const source = staleDiary();
  const result = applyPublicContent(source);
  assert.deepEqual(result.faq.slice(0, 2), source.faq.slice(0, 2));
  assert.equal(result.faq.length, 5);
  assert.deepEqual(result.faq.slice(2), PUBLIC_CONTENT.faq);
  assert.equal(result.faq.filter((item) => /deposit/.test(item.question)).length, 1);
  const reschedule = result.faq.find((item) => item.question === 'Can I reschedule my appointment?');
  assert.match(reschedule.answer, /email soultosolebylouise@gmail\.com/);
  assert.match(reschedule.answer, /at least 24 hours’ notice to cancel or reschedule/);
  assert.match(reschedule.answer, /If you cancel less than 24 hours before your appointment, the 50% booking deposit is non-refundable\./);
  assert.doesNotMatch(reschedule.answer, /If you cancel or reschedule less/);
  assert.deepEqual(applyPublicContent(result), result, 'applying the editorial layer twice must not duplicate FAQs');
});

test('public responses do not gain internal email settings, while internal sender configuration is preserved', () => {
  const source = staleDiary();
  assert.equal(Object.hasOwn(applyPublicContent(source), 'email'), false);
  source.email = { senderName: 'Configured sender', fromEmail: 'sender@example.test', replyToEmail: 'old@example.test', ownerEmail: 'old@example.test' };
  const result = applyPublicContent(source);
  assert.equal(result.email.senderName, 'Configured sender');
  assert.equal(result.email.fromEmail, 'sender@example.test');
  assert.equal(result.email.replyToEmail, 'soultosolebylouise@gmail.com');
  assert.equal(result.email.ownerEmail, 'soultosolebylouise@gmail.com');
  assert.equal(source.email.ownerEmail, 'old@example.test');
});

test('local business configuration and saved settings use the same approved editorial content', async () => {
  const settings = JSON.parse(await readFile(new URL('../data/settings.json', import.meta.url), 'utf8'));
  for (const config of [BUSINESS_CONFIG, settings]) {
    assert.equal(config.business.ownerName, 'Louise O’Dálaigh');
    assert.equal(config.book.coverImage, PUBLIC_CONTENT.book.coverImage);
    assert.equal(config.book.coverAlt, PUBLIC_CONTENT.book.coverAlt);
    assert.equal(config.business.about, PUBLIC_CONTENT.business.about);
    assert.equal(config.business.ownerEmail, PUBLIC_CONTENT.business.ownerEmail);
    assert.equal(Object.hasOwn(config.business, 'phone'), false);
    assert.equal(config.policies.depositPercent, 50);
    assert.equal(config.policies.deposit, deposit);
    assert.equal(config.policies.cancellation, cancellation);
    assert.deepEqual(config.faq.slice(-3), PUBLIC_CONTENT.faq);
    assert.equal(config.email.replyToEmail, PUBLIC_CONTENT.email.replyToEmail);
    assert.equal(config.email.ownerEmail, PUBLIC_CONTENT.email.ownerEmail);
  }
});

test('public-config API overlays stale editorial data without replacing current diary values', async (context) => {
  const upstream = staleDiary();
  let endpoint;
  context.mock.method(globalThis, 'fetch', async (url) => {
    endpoint = url;
    return { ok: true, json: async () => upstream };
  });
  const captured = { headers: {} };
  const response = {
    setHeader(key, value) { captured.headers[key] = value; },
    status(status) { captured.status = status; return this; },
    json(body) { captured.body = body; },
    end() { captured.ended = true; }
  };
  await publicConfigHandler({ method: 'GET' }, response);
  assert.equal(endpoint, 'https://wellness-booking-site.onrender.com/api/public-config');
  assert.equal(captured.status, 200);
  assert.equal(captured.headers['Cache-Control'], 'no-store');
  assert.equal(captured.body.business.ownerName, 'Louise O’Dálaigh');
  assert.equal(captured.body.business.about, PUBLIC_CONTENT.business.about);
  assert.equal(captured.body.policies.depositPercent, 50);
  assert.equal(captured.body.policies.cancellation, cancellation);
  assert.deepEqual(captured.body.faq.slice(-3), PUBLIC_CONTENT.faq);
  assert.strictEqual(captured.body.services, upstream.services);
  assert.strictEqual(captured.body.bookingRules, upstream.bookingRules);
  assert.deepEqual(captured.body.book, { ...upstream.book, ...PUBLIC_CONTENT.book });
  assert.notEqual(captured.body.book.coverImage, upstream.book.coverImage);
  assert.notEqual(captured.body.book.coverAlt, upstream.book.coverAlt);
  assert.equal(Object.hasOwn(captured.body.business, 'phone'), false);
});
