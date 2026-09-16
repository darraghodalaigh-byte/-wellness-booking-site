import { initBooking } from './booking.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function setupMenu() {
  const button = $('.menu-toggle');
  const nav = $('#primaryNav');
  const toggle = (open) => {
    button.setAttribute('aria-expanded', String(open));
    $('span', button).textContent = open ? 'Close' : 'Menu';
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
  };
  button.addEventListener('click', () => toggle(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) toggle(false); });
  document.addEventListener('keydown', event => {
    if (button.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') { toggle(false); button.focus(); }
    if (event.key === 'Tab') {
      const focusable = [button, ...$$('a[href]', nav)];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.matchMedia('(min-width:861px)').addEventListener('change', event => { if (event.matches) toggle(false); });
}
function setupMotion() {
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
  }, { threshold: 0.09, rootMargin: '0px 0px 25px 0px' });
  $$('.reveal').forEach(el => observer.observe(el));
  // Back/forward cache restores must not leave offscreen content permanently hidden.
  window.addEventListener('pageshow', event => { if (event.persisted) $$('.reveal').forEach(el => el.classList.add('is-visible')); });
  if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  $$('[data-tilt]').forEach(el => {
    let frame;
    el.addEventListener('pointermove', event => {
      if (reducedMotion.matches) return;
      cancelAnimationFrame(frame);
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      frame = requestAnimationFrame(() => { el.style.transform = `rotate(-3deg) rotateY(${x * 13 - 8}deg) rotateX(${-y * 8}deg) translateY(-5px)`; });
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); el.style.transform = ''; });
  });
}
const descriptions = {
  'reflexology': 'A foot reflexology session, with time to settle and attention to your comfort.',
  'reflexology-chelation': 'A combined session. Speak with Louise about what this treatment involves before booking.',
  'fertility-reflexology': 'Reflexology offered with sensitivity to your fertility journey and space to discuss your needs.',
  'pregnancy-reflexology': 'A personal conversation with Louise helps establish whether this session is suitable for you.',
  'facial-reflexology': 'A longer session bringing facial techniques and foot reflexology together.',
  'facial-hand-reflexology': 'A gentle session focused on the face and hands.',
  'indian-head-massage': 'A treatment focused on the scalp, neck and shoulders, with attention to your comfort.',
  'reflexology-programme': 'Six reflexology appointments for those who would like to make regular time for themselves. The planner reserves your first session; arrange the remaining visits with Louise.'
};
function renderTreatments(config) {
  const list = $('#treatmentList');
  if (!list) return;
  list.replaceChildren();
  config.services.forEach((service, index) => {
    const detail = node('details', undefined, 'treatment-item');
    detail.name = 'treatments';
    const summary = node('summary');
    summary.append(node('span', String(index + 1).padStart(2, '0'), 'treatment-number'), node('span', service.name, 'treatment-name'));
    const meta = node('span', undefined, 'treatment-meta');
    meta.append(node('span', money.format(service.priceGBP), 'treatment-price'), node('span', `${service.durationMinutes} minutes${service.id === 'reflexology-programme' ? ' each' : ''}`, 'treatment-duration'));
    const expand = node('span', '+', 'expand-symbol'); expand.setAttribute('aria-hidden', 'true');
    summary.append(meta, expand);
    const body = node('div', undefined, 'treatment-detail');
    const a = node('a', service.id === 'reflexology-programme' ? 'Book the first session ↗' : 'Choose this treatment ↗', 'button button-primary');
    a.href = `/booking.html?service=${encodeURIComponent(service.id)}`;
    body.append(node('p', descriptions[service.id] || service.shortDescription), a);
    detail.append(summary, body); list.append(detail);
  });
}
function renderFaq(config) {
  const list = $('#faqList'); if (!list) return;
  list.replaceChildren();
  config.faq.forEach(faq => { const el = node('details', undefined, 'faq-item'); el.name = 'questions'; el.append(node('summary', faq.question), node('p', faq.answer)); list.append(el); });
}
function renderShared(config) {
  const b = config.business;
  $$('[data-phone]').forEach(el => { el.textContent = b.phone; el.href = `tel:${b.phone.replace(/[^\d+]/g,'').replace(/^0/,'+353')}`; });
  $$('[data-email]').forEach(el => { el.href = `mailto:${b.ownerEmail}`; if (el.textContent.includes('@')) el.textContent = b.ownerEmail; });
  $$('[data-instagram]').forEach(el => { const url = safeUrl(b.instagramUrl); if (url) el.href = url; });
  $$('[data-facebook]').forEach(el => { const url = safeUrl(b.facebookUrl); if (url) el.href = url; });
  $$('[data-cancellation]').forEach(el => el.textContent = config.policies.cancellation);
  const story = $('#fullStory');
  if (story) story.replaceChildren(...b.about.split(/\n\s*\n/).map(p => node('p', p.trim())).filter(p => p.textContent));
  $$('[data-release]').forEach(el => {
    const value = config.book?.launchDate;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(`${value}T12:00:00Z`);
      const formatted = new Intl.DateTimeFormat('en-GB', { day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Dublin' }).format(date);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Dublin', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
      el.textContent = value > today ? `Coming ${formatted}` : `Publication date · ${formatted}`;
    }
  });
}
function setupBook(config) {
  const action = $('#bookAction'); if (!action) return;
  const book = config.book || {};
  const update = () => {
    const format = $('input[name="bookFormat"]:checked').value;
    const label = {paperback:'Paperback',hardback:'Hardback',ebook:'Ebook'}[format];
    $('#formatDetail').textContent = `${label} edition · Price to be announced`;
    const retailer = safeUrl(book.amazonUrl);
    const waitlist = safeUrl(book.waitlistUrl);
    action.removeAttribute('target'); action.removeAttribute('rel');
    if (retailer) {
      action.href = retailer; action.textContent = 'View editions & pricing on Amazon ↗';
      action.target = '_blank'; action.rel = 'noopener noreferrer';
      $('#formatDetail').textContent = `${label} selected · Confirm format, availability and price with the retailer`;
      $('#bookAvailability').textContent = 'Your purchase is completed with the retailer. Check your preferred edition, delivery and returns there.';
    } else if (waitlist) {
      action.href = waitlist; action.textContent = `${book.waitlistLabel || 'Join the waitlist'} ↗`;
      action.target = '_blank'; action.rel = 'noopener noreferrer';
      $('#bookAvailability').textContent = 'Open the signup page for launch updates. Book pricing will be announced when sales open.';
    } else {
      action.href = `mailto:${config.business.ownerEmail}?subject=${encodeURIComponent(`Deeply OK — ${label.toLowerCase()} enquiry`)}&body=${encodeURIComponent(`Hello Louise,\n\nI would love to know more about the ${label.toLowerCase()} edition of Deeply OK and when it will be available.\n\nThank you!`)}`;
      action.textContent = 'Ask Louise about the book ↗';
      $('#bookAvailability').textContent = 'Sales will open when the retailer details are ready. This opens your email app to enquire with Louise.';
    }
  };
  $$('input[name="bookFormat"]').forEach(input => input.addEventListener('change', update)); update();
}
const ideas = [
  {theme:'carer',name:'Space for the carer',label:'A space for people who give so much',heading:'You look after everyone. Who makes space for you?',copy:'For people in healthcare and caring roles who have become used to putting themselves last. A thoughtful conversation, with someone who understands a full, demanding life.',focus:'The people you already understand',detail:'Build around your healthcare experience and family caring responsibilities. Keep the language practical, warm and reassuring.',mood:'Deep green · warm paper · personal and grounded'},
  {theme:'clarity',name:'Everyday clarity',label:'A fresh perspective on ordinary life',heading:'A little less caught up. A little more here.',copy:'Sometimes the same thoughts take up all the room. Make space to explore how we experience everyday life, notice familiar patterns, and become curious about another way of seeing.',focus:'An open invitation',detail:'A broad, welcoming starting point for anyone curious about your understanding of the mind. More everyday conversation, less formal programme.',mood:'Soft lilac · expressive type · open and light'},
  {theme:'chapter',name:'A new chapter',label:'Room for what comes next',heading:'You don’t need to have it all figured out.',copy:'When life starts asking new questions, it can help to have room to listen. Explore change, identity and the parts of yourself that get quieter while you’re being everything to everyone.',focus:'Life’s moments of change',detail:'A possible focus on transitions and rediscovering yourself. This would be a direction to develop, rather than an existing specialist programme.',mood:'Warm sand · gentle contrast · reflective and personal'},
  {theme:'book',name:'Deeply OK conversations',label:'The conversation beyond the page',heading:'What if you were never broken?',copy:'Inspired by Deeply OK, a space to explore the reflections that stay with you: ordinary family life, the stories we tell ourselves, and something familiar beneath the noise.',focus:'A bridge between author and coach',detail:'Let the book lead into conversation. You could explore individual sessions, a reading circle, or another format that feels right to you.',mood:'Sky blue · navy · literary and quietly hopeful'}
];
function setupIdeas() {
  const panel = $('#ideaPanel'); if (!panel) return;
  const tabs = $$('[data-idea]');
  const choices = $('#ideaChoices');
  const storageKey = 'soul-to-sole-coaching-ideas-v1';
  let current = 0;
  ideas.forEach((idea, index) => {
    const label = node('label'); const input = node('input'); input.type = 'checkbox'; input.value = String(index); input.name = 'ideaChoice';
    label.append(input, document.createTextNode(idea.name)); choices.append(label);
  });
  const render = index => {
    current = index;
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `ideaTab${index}`);
    const idea = ideas[index]; panel.dataset.theme = idea.theme;
    const main = node('div'); main.append(node('p', idea.label, 'idea-label'),node('h2', idea.heading),node('p', idea.copy, 'idea-description'));
    const aside = node('aside'); aside.append(node('h3', idea.focus),node('p',idea.detail),node('p',idea.mood));
    panel.replaceChildren(main,aside);
  };
  tabs.forEach((tab,index) => {
    tab.addEventListener('click', () => render(index));
    tab.addEventListener('keydown', event => {
      let next = current;
      if (event.key === 'ArrowRight') next = (current+1)%4;
      else if (event.key === 'ArrowLeft') next = (current+3)%4;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = 3;
      else return;
      event.preventDefault(); render(next); tabs[next].focus();
    });
  });
  const getChoices = () => $$('input[name="ideaChoice"]:checked').map(input => Number(input.value));
  const status = $('#ideasStatus');
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored && Array.isArray(stored.choices)) {
      $$('input[name="ideaChoice"]').forEach(input => input.checked = stored.choices.includes(Number(input.value)));
      $('#ideaNotes').value = String(stored.notes || '');
      status.textContent = 'Your saved choices have been restored from this device.';
    }
  } catch { /* Storage is optional; the review still works without it. */ }
  $('#saveIdeas').addEventListener('click', () => {
    try { localStorage.setItem(storageKey, JSON.stringify({choices:getChoices(),notes:$('#ideaNotes').value})); status.textContent = 'Saved on this device. Nothing has been sent.'; }
    catch { status.textContent = 'This browser cannot save locally. Download your notes instead.'; }
  });
  $('#downloadIdeas').addEventListener('click', () => {
    const selected = getChoices().map(i=>ideas[i].name);
    const text = `Coaching ideas for Louise\n\nFavourite directions\n${selected.length?selected.map(name=>`- ${name}`).join('\n'):'No favourites selected yet.'}\n\nMy thoughts\n${$('#ideaNotes').value || 'No notes yet.'}\n\nThese are ideas for discussion, not agreed programmes.\n`;
    const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
    const a = node('a'); a.href=url; a.download='Louise-coaching-ideas.txt'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),3000);
    status.textContent = 'Your notes have been prepared for download. You can share the file whenever you’re ready.';
  });
  $('#clearIdeas').addEventListener('click', () => {
    try { localStorage.removeItem(storageKey); } catch { /* Keep the current page usable. */ }
    $$('input[name="ideaChoice"]').forEach(input => input.checked=false); $('#ideaNotes').value=''; status.textContent='Choices cleared on this device.';
  });
  render(0);
}
function applyContent(config, booking = false) {
  if (!config.business || !Array.isArray(config.services)) throw new Error('Invalid configuration');
  renderShared(config); renderTreatments(config); renderFaq(config); setupBook(config);
  if (booking) {
    const bookingConfig = {...config, services:config.services.map(service=>({...service,shortDescription:descriptions[service.id] || service.shortDescription}))};
    return initBooking(bookingConfig);
  }
}
async function loadContent() {
  const page = document.body.dataset.page;
  let published = false;
  // Published content remains fast even while the existing appointment service wakes up.
  if (page !== 'booking') {
    try {
      const response = await fetch('/content.json');
      if (response.ok) { applyContent(await response.json()); published = true; }
    } catch { /* The live source below can still supply the content. */ }
  }
  try {
    const response = await fetch('/api/public-config', {signal:AbortSignal.timeout(page === 'booking' ? 60000 : 15000)});
    if (!response.ok) throw new Error('Configuration unavailable');
    await applyContent(await response.json(), page === 'booking');
  } catch {
    if (page === 'booking') {
      const root = $('#bookingApp'); root.replaceChildren(node('p','The appointment planner is unavailable at the moment. Please try again or call Louise to arrange your visit.','status-message'));
      const button = node('button','Try again','button button-primary'); button.type='button'; button.addEventListener('click',()=>{button.disabled=true;button.textContent='Loading…';loadContent();});
      const call=node('a','Call 086 156 8818','button button-outline');call.href='tel:+353861568818';root.append(button,document.createTextNode(' '),call);
    }
    if (!published) {
      const list=$('#treatmentList'); if(list) list.replaceChildren(node('p','Treatment details are temporarily unavailable. Please call Louise on 086 156 8818 for prices and availability.'));
      const faq=$('#faqList'); if(faq) faq.replaceChildren(node('p','For any questions about your first visit, please call Louise on 086 156 8818.'));
    }
  }
}

setupMenu();setupMotion();setupIdeas();$$('[data-year]').forEach(el=>el.textContent=String(new Date().getFullYear()));
loadContent();
// Preserve useful links from the previous one-page website.
if (document.body.dataset.page==='home') {
  const legacy = {'#availability':'/booking.html','#booking':'/booking.html','#services':'/reflexology.html#treatments','#deeply-ok':'/book.html','#about':'/about.html'};
  if (legacy[location.hash]) location.replace(legacy[location.hash]);
}
