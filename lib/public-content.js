// Approved editorial content belongs to this website. The legacy diary remains
// authoritative for services, prices, availability, booking rules and book links.
const contactEmail = 'soultosolebylouise@gmail.com';

export const PUBLIC_CONTENT = Object.freeze({
  business: Object.freeze({
    ownerName: 'Louise O’Dálaigh',
    ownerEmail: contactEmail,
    about: `I didn't plan any of this. I qualified as a nurse and built a career spanning more than three decades in healthcare — including over 20 years as a healthcare leader.

Along the way, I worked as a nurse, ward sister, bed manager, general manager and services manager.

But burnout has a way of asking questions you can't ignore. I found myself searching for something that would help me navigate life with a bit more ease. What I found changed everything.

I came across an understanding about how our minds actually work. It transformed my life in ways I'm still discovering.

Around the same time I started taking reflexology sessions myself — and found them enormously helpful for stress. So a few years later, I trained. Because if something genuinely helps, I want to be able to offer it to others.

None of this happened in a vacuum. I was doing all of it while raising four children, working full time in a very demanding role, and caring for elderly parents. Life was full — in every sense of the word. And this transformation changed how I showed up in all of it. As a parent. As a daughter. As a person.

That desire to help people never went away. It just found a new home.

I work especially with people in healthcare and caring professions. People who are brilliant at giving to others — and have quietly stopped giving to themselves. I know that place. I've been there.

People who work with me start to see life through a different lens. Things feel lighter. Clearer. And quite often — they start to laugh again. You'd be surprised how many people have forgotten how to do that. And how much difference it makes when they remember.`
  }),
  book: Object.freeze({
    coverImage: '/assets/brand/deeply-ok-cover-fada.jpeg',
    coverAlt: 'Deeply OK by Louise O’Dálaigh — A simple guide to feeling like yourself again'
  }),
  email: Object.freeze({ replyToEmail: contactEmail, ownerEmail: contactEmail }),
  policies: Object.freeze({
    depositPercent: 50,
    deposit: 'A 50% deposit is required to secure your appointment. Louise will email payment details after receiving your request. Your appointment is confirmed once the deposit is received and Louise confirms it by email. No payment is taken on this website.',
    cancellation: 'Please give at least 24 hours’ notice to cancel or reschedule. If you cancel less than 24 hours before your appointment, the 50% booking deposit is non-refundable.'
  }),
  faq: Object.freeze([
    Object.freeze({
      question: 'Is a deposit required?',
      answer: 'Yes. A 50% deposit is required to secure your appointment. Louise will email payment details after receiving your request. No payment is taken on this website.'
    }),
    Object.freeze({
      question: 'Is my appointment confirmed when I submit a request?',
      answer: 'Not yet. Submitting the form sends an appointment request. Louise will email payment details. Your appointment is confirmed once the 50% deposit is received and Louise confirms it by email.'
    }),
    Object.freeze({
      question: 'Can I reschedule my appointment?',
      answer: `Please email ${contactEmail} and give at least 24 hours’ notice to cancel or reschedule. If you cancel less than 24 hours before your appointment, the 50% booking deposit is non-refundable.`
    })
  ])
});

function isBookingPolicyQuestion(entry) {
  const question = String(entry?.question || '').toLowerCase();
  return /\bdeposit\b|\bcancel\w*\b|\breschedul\w*\b/.test(question)
    || (/\bconfirm\w*\b/.test(question) && /\bappointment\b|\bbooking\b|\brequest\b/.test(question));
}

export function applyPublicContent(config = {}) {
  const business = { ...(config.business || {}), ...PUBLIC_CONTENT.business };
  delete business.phone;
  const existingFaq = Array.isArray(config.faq) ? config.faq : [];
  const result = {
    ...config,
    business,
    book: { ...(config.book || {}), ...PUBLIC_CONTENT.book },
    policies: { ...(config.policies || {}), ...PUBLIC_CONTENT.policies },
    faq: [
      ...existingFaq.filter((entry) => !isBookingPolicyQuestion(entry)),
      ...PUBLIC_CONTENT.faq.map((entry) => ({ ...entry }))
    ]
  };
  // Internal configuration contains email transport settings; public diary
  // responses do not. Preserve that distinction and the configured sender.
  if (config.email) result.email = { ...config.email, ...PUBLIC_CONTENT.email };
  return result;
}
