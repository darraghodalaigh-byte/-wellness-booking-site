const state = {
  config: null,
  selectedServiceId: '',
  selectedDate: '',
  selectedTime: '',
  selectedMonth: '',
  calendarSummary: null,
  slots: [],
  bookingSuccess: null
};

const CLIENT_PROFILE_STORAGE_KEY = 'soulToSoleClientProfile';

const refs = {
  serviceGrid: document.getElementById('serviceGrid'),
  testimonialGrid: document.getElementById('testimonialGrid'),
  faqList: document.getElementById('faqList'),
  policyCard: document.getElementById('policyCard'),
  serviceSelect: document.getElementById('serviceSelect'),
  monthLabel: document.getElementById('monthLabel'),
  calendar: document.getElementById('calendar'),
  timeSlots: document.getElementById('timeSlots'),
  slotTitle: document.getElementById('slotTitle'),
  slotHint: document.getElementById('slotHint'),
  prevMonth: document.getElementById('prevMonth'),
  nextMonth: document.getElementById('nextMonth'),
  bookingSummary: document.getElementById('bookingSummary'),
  bookingForm: document.getElementById('bookingForm'),
  momLoginForm: document.getElementById('momLoginForm'),
  clientLoginForm: document.getElementById('clientLoginForm'),
  momLoginStatus: document.getElementById('momLoginStatus'),
  clientLoginStatus: document.getElementById('clientLoginStatus'),
  formStatus: document.getElementById('formStatus'),
  submitBooking: document.getElementById('submitBooking'),
  heroMeta: document.getElementById('heroMeta'),
  heroIntro: document.getElementById('heroIntro'),
  aboutIntro: document.getElementById('aboutIntro'),
  footerTagline: document.getElementById('footerTagline'),
  contactInfo: document.getElementById('contactInfo'),
  businessHours: document.getElementById('businessHours'),
  plannerStatus: document.getElementById('plannerStatus')
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const euroFormatter = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2
});

function fmtMonthLabel(month) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function todayMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toPrettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatEuro(value) {
  return euroFormatter.format(Number(value || 0));
}

function setFormStatus(message, kind = '') {
  refs.formStatus.textContent = message;
  refs.formStatus.classList.remove('success', 'fail');
  if (kind) refs.formStatus.classList.add(kind);
}

function setPlannerStatus(message = '', kind = '') {
  if (!refs.plannerStatus) return;
  refs.plannerStatus.textContent = message;
  refs.plannerStatus.classList.remove('error', 'success');
  if (kind) refs.plannerStatus.classList.add(kind);
}

function setInlineStatus(element, message, kind = '') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('success', 'fail');
  if (kind) element.classList.add(kind);
}

function clearErrors() {
  document.querySelectorAll('[data-error-for]').forEach((el) => {
    el.textContent = '';
  });
}

function readStoredClientProfile() {
  try {
    const raw = localStorage.getItem(CLIENT_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeClientProfile(profile) {
  localStorage.setItem(CLIENT_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function applyClientProfileToBookingForm(profile) {
  if (!refs.bookingForm || !profile) return;
  const fullNameInput = refs.bookingForm.querySelector('input[name="fullName"]');
  const emailInput = refs.bookingForm.querySelector('input[name="email"]');
  const phoneInput = refs.bookingForm.querySelector('input[name="phone"]');
  if (fullNameInput && profile.fullName) fullNameInput.value = profile.fullName;
  if (emailInput && profile.email) emailInput.value = profile.email;
  if (phoneInput && profile.phone) phoneInput.value = profile.phone;
}

function bindPortalLogins() {
  if (refs.clientLoginForm) {
    const stored = readStoredClientProfile();
    if (stored) {
      const fullNameInput = refs.clientLoginForm.querySelector('input[name="fullName"]');
      const emailInput = refs.clientLoginForm.querySelector('input[name="email"]');
      const phoneInput = refs.clientLoginForm.querySelector('input[name="phone"]');
      if (fullNameInput && stored.fullName) fullNameInput.value = stored.fullName;
      if (emailInput && stored.email) emailInput.value = stored.email;
      if (phoneInput && stored.phone) phoneInput.value = stored.phone;
      applyClientProfileToBookingForm(stored);
      setInlineStatus(refs.clientLoginStatus, 'Saved client details loaded.', 'success');
    }

    refs.clientLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(refs.clientLoginForm);
      const profile = {
        fullName: String(data.get('fullName') || '').trim(),
        email: String(data.get('email') || '').trim().toLowerCase(),
        phone: String(data.get('phone') || '').trim()
      };

      if (!profile.fullName || !profile.email || !profile.phone) {
        setInlineStatus(refs.clientLoginStatus, 'Please complete all fields.', 'fail');
        return;
      }

      storeClientProfile(profile);
      applyClientProfileToBookingForm(profile);
      setInlineStatus(refs.clientLoginStatus, 'Client login saved. Your booking form is now pre-filled.', 'success');
      scrollToSection('booking');
    });
  }

  if (refs.momLoginForm) {
    refs.momLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setInlineStatus(refs.momLoginStatus, 'Signing in...');
      const data = new FormData(refs.momLoginForm);
      const payload = {
        username: String(data.get('username') || '').trim(),
        password: String(data.get('password') || '').trim()
      };

      if (!payload.username || !payload.password) {
        setInlineStatus(refs.momLoginStatus, 'Please enter username and password.', 'fail');
        return;
      }

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
          setInlineStatus(refs.momLoginStatus, result.error || 'Login failed.', 'fail');
          return;
        }
        setInlineStatus(refs.momLoginStatus, 'Login successful. Opening admin dashboard...', 'success');
        window.location.href = '/admin';
      } catch {
        setInlineStatus(refs.momLoginStatus, 'Network error. Please retry.', 'fail');
      }
    });
  }
}

function showFieldErrors(errors = {}) {
  clearErrors();
  Object.entries(errors).forEach(([field, message]) => {
    const target = document.querySelector(`[data-error-for="${field}"]`);
    if (target) target.textContent = message;
  });
}

function scrollToSection(sectionId, options = {}) {
  const target = document.getElementById(sectionId);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (options.focusSelector) {
    window.setTimeout(() => {
      const focusTarget = document.querySelector(options.focusSelector);
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }, 380);
  }
}

function bindSmoothScroll() {
  document.querySelectorAll('[data-scroll-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = link.getAttribute('data-scroll-target');
      if (!target) return;
      event.preventDefault();
      scrollToSection(target);
    });
  });
}

function renderServiceSkeleton() {
  refs.serviceGrid.innerHTML = Array.from({ length: 3 })
    .map(
      () => `
      <article class="card">
        <div class="skeleton skeleton-block" style="height:28px;"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block" style="height:16px;width:80%;"></div>
      </article>
    `
    )
    .join('');
}

function renderTestimonialsSkeleton() {
  refs.testimonialGrid.innerHTML = Array.from({ length: 3 })
    .map(
      () => `
      <article class="card">
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block" style="width:70%;"></div>
      </article>
    `
    )
    .join('');
}

function renderFaqSkeleton() {
  refs.faqList.innerHTML = Array.from({ length: 3 })
    .map(
      () => `
      <article class="faq-item">
        <div class="skeleton skeleton-block" style="height:18px;"></div>
      </article>
    `
    )
    .join('');
}

function renderCalendarLoading() {
  const header = dayLabels.map((d) => `<div class="day-label">${d}</div>`).join('');
  const cells = Array.from({ length: 35 })
    .map(() => '<div class="skeleton" style="height:82px;border-radius:10px;"></div>')
    .join('');
  refs.calendar.innerHTML = `${header}${cells}`;
}

function renderSlotsLoading() {
  refs.timeSlots.innerHTML = Array.from({ length: 4 })
    .map(() => '<div class="skeleton" style="height:74px;border-radius:10px;"></div>')
    .join('');
}

function renderServices() {
  refs.serviceGrid.innerHTML = state.config.services
    .map((service) => {
      const benefits = service.benefits.map((benefit) => `<li>${benefit}</li>`).join('');
      return `
        <article class="card service-card reveal">
          <h3>${service.name}</h3>
          <p>${service.shortDescription}</p>
          <div class="service-meta">
            <span class="service-badge">${service.durationMinutes} mins</span>
            <span class="service-price">${formatEuro(service.priceGBP)}</span>
          </div>
          <ul class="service-benefits">${benefits}</ul>
          <button class="btn btn-sm service-select-btn" type="button" data-service-id="${service.id}">Book this session</button>
        </article>
      `;
    })
    .join('');

  refs.serviceGrid.querySelectorAll('.service-select-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const serviceId = button.dataset.serviceId;
      if (!serviceId || !refs.serviceSelect) return;
      refs.serviceSelect.value = serviceId;
      state.selectedServiceId = serviceId;
      state.selectedDate = '';
      state.selectedTime = '';
      state.slots = [];
      refs.slotTitle.textContent = 'Select a date to view times';
      refs.timeSlots.innerHTML = '';
      renderSummary();
      renderCalendarLoading();
      await loadCalendarSummary();
      renderCalendar();
      scrollToSection('availability', { focusSelector: '#serviceSelect' });
    });
  });
}

function renderTestimonials() {
  refs.testimonialGrid.innerHTML = state.config.testimonials
    .map(
      (entry) => `
      <article class="card testimonial reveal">
        <p>"${entry.quote}"</p>
        <strong>${entry.name}</strong>
        <div class="small">${entry.role}</div>
      </article>
    `
    )
    .join('');
}

function renderFaq() {
  refs.faqList.innerHTML = state.config.faq
    .map(
      (item) => `
      <details class="faq-item reveal">
        <summary>${item.question}</summary>
        <p>${item.answer}</p>
      </details>
    `
    )
    .join('');
}

function renderMeta() {
  const { business, bookingRules, policies } = state.config;
  refs.heroIntro.textContent = business.intro;
  refs.aboutIntro.textContent = `${business.ownerName} offers personal reflexology and clarity coaching designed to support your wellbeing with gentle, professional care.`;
  refs.footerTagline.textContent = business.tagline;
  const instagram = business.instagram || '@soultosolebylouise';
  refs.contactInfo.innerHTML = `${business.phone}<br/>${instagram}<br/>${business.ownerEmail}`;
  refs.businessHours.textContent = `${bookingRules.workingHours.start} to ${bookingRules.workingHours.end}, selected days`;
  refs.heroMeta.innerHTML = `
    <span>Phone: ${business.phone}</span>
    <span>Instagram: ${instagram}</span>
    <span>Min notice ${bookingRules.minNoticeHours}h</span>
  `;

  refs.policyCard.innerHTML = `
    <h3>Policies at a glance</h3>
    <p><strong>Cancellation:</strong> ${policies.cancellation}</p>
    <p><strong>Arrival:</strong> ${policies.arrival}</p>
    <p><strong>Privacy:</strong> ${policies.privacy}</p>
  `;
}

function renderServiceSelect() {
  refs.serviceSelect.innerHTML = state.config.services
    .map(
      (service) =>
        `<option value="${service.id}">${service.name} (${service.durationMinutes} mins, ${formatEuro(service.priceGBP)})</option>`
    )
    .join('');

  state.selectedServiceId = state.config.services[0].id;
  refs.serviceSelect.value = state.selectedServiceId;
}

async function loadCalendarSummary() {
  setPlannerStatus('Loading availability...');

  const params = new URLSearchParams({
    serviceId: state.selectedServiceId,
    month: state.selectedMonth
  });

  const response = await fetch(`/api/availability/summary?${params.toString()}`);
  if (!response.ok) {
    setPlannerStatus('Availability is taking longer than usual. Please retry in a moment.', 'error');
    throw new Error('Could not load calendar summary.');
  }

  state.calendarSummary = await response.json();
  setPlannerStatus('Live availability updated.', 'success');
}

function renderCalendar() {
  refs.monthLabel.textContent = fmtMonthLabel(state.selectedMonth);

  if (!state.calendarSummary || !Array.isArray(state.calendarSummary.days)) {
    refs.calendar.innerHTML = '<p class="small">Calendar unavailable right now. Please refresh the page.</p>';
    return;
  }

  const [year, month] = state.selectedMonth.split('-').map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const offset = firstOfMonth.getDay();

  const dayHeader = dayLabels.map((d) => `<div class="day-label">${d}</div>`).join('');
  const cells = [];

  for (let i = 0; i < offset; i += 1) {
    cells.push('<div></div>');
  }

  state.calendarSummary.days.forEach((day) => {
    const date = Number(day.date.slice(-2));
    const unavailable = day.isUnavailable || day.availableCount === 0;
    const selected = state.selectedDate === day.date;

    cells.push(`
      <button
        type="button"
        class="day ${unavailable ? 'unavailable' : ''} ${selected ? 'selected' : ''}"
        data-date="${day.date}"
        ${unavailable ? 'disabled' : ''}
        title="${unavailable ? day.unavailableReason || 'No times available' : `${day.availableCount} slots available`}" >
        <div>${date}</div>
        <div class="count">${day.availableCount > 0 ? `${day.availableCount} slots` : 'Unavailable'}</div>
      </button>
    `);
  });

  refs.calendar.innerHTML = `${dayHeader}${cells.join('')}`;

  refs.calendar.querySelectorAll('button[data-date]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.selectedDate = button.dataset.date;
      state.selectedTime = '';
      state.bookingSuccess = null;
      renderSummary();
      await loadSlots();
      renderCalendar();
      if (window.innerWidth < 980) {
        scrollToSection('availability', { focusSelector: '#slotTitle' });
      }
    });
  });
}

async function loadSlots() {
  if (!state.selectedDate) return;

  refs.slotTitle.textContent = `Times for ${toPrettyDate(state.selectedDate)}`;
  refs.slotHint.textContent = 'Checking today\'s available times...';
  renderSlotsLoading();

  const params = new URLSearchParams({
    serviceId: state.selectedServiceId,
    date: state.selectedDate
  });

  const response = await fetch(`/api/availability/slots?${params.toString()}`);
  if (!response.ok) {
    refs.slotHint.textContent = 'We could not load times right now.';
    refs.timeSlots.innerHTML = '<p class="small">Please retry, or choose another date if your schedule is flexible.</p>';
    return;
  }

  const payload = await response.json();
  state.slots = payload.slots || [];
  renderSlots(payload.unavailableReason || '');
}

function renderSlots(unavailableReason) {
  if (unavailableReason) {
    refs.slotHint.textContent = unavailableReason;
    refs.timeSlots.innerHTML =
      '<p class="small">No availability on this date yet. Please choose another day in the planner.</p>';
    return;
  }

  if (state.slots.length === 0) {
    refs.slotHint.textContent = 'No slots currently available for this date.';
    refs.timeSlots.innerHTML =
      '<p class="small">Try another day or check back shortly as new times are often released.</p>';
    return;
  }

  refs.slotHint.textContent = 'Select a time below to update your booking summary.';

  refs.timeSlots.innerHTML = state.slots
    .map(
      (slot) => `
      <button
        type="button"
        class="slot-btn ${slot.available ? '' : 'unavailable'} ${state.selectedTime === slot.time ? 'selected' : ''}"
        data-time="${slot.time}"
        ${slot.available ? '' : 'disabled'}
      >
        <strong>${slot.label}</strong>
        <div class="small">${slot.available ? 'Available' : slot.reason || 'Unavailable'}</div>
      </button>
    `
    )
    .join('');

  refs.timeSlots.querySelectorAll('button[data-time]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTime = button.dataset.time;
      state.bookingSuccess = null;
      renderSlots();
      renderSummary();
      if (window.innerWidth < 980) {
        scrollToSection('booking');
      }
    });
  });
}

function renderSummary() {
  const service = state.config.services.find((item) => item.id === state.selectedServiceId);

  if (!service || !state.selectedDate || !state.selectedTime) {
    refs.bookingSummary.innerHTML = 'Choose a service, date, and time to continue.';
    return;
  }

  const successBlock = state.bookingSuccess
    ? `<div class="summary-ok"><strong>Request received.</strong><br/>Ref ${state.bookingSuccess.bookingReference}. We'll confirm by ${state.bookingSuccess.contactMethod} shortly.</div>`
    : '';

  refs.bookingSummary.innerHTML = `
    <div class="summary-item"><strong>Service:</strong> ${service.name}</div>
    <div class="summary-item"><strong>Date:</strong> ${toPrettyDate(state.selectedDate)}</div>
    <div class="summary-item"><strong>Time:</strong> ${state.selectedTime}</div>
    <div class="summary-item"><strong>Duration:</strong> ${service.durationMinutes} minutes</div>
    <div class="summary-item"><strong>Price:</strong> ${formatEuro(service.priceGBP)}</div>
    <div class="divider"></div>
    <p class="small">Submitting this form sends a booking request directly to the owner by email.</p>
    ${successBlock}
  `;
}

function getFormPayload() {
  const data = new FormData(refs.bookingForm);
  return {
    fullName: data.get('fullName')?.toString().trim(),
    email: data.get('email')?.toString().trim(),
    phone: data.get('phone')?.toString().trim(),
    preferredContactMethod: data.get('preferredContactMethod')?.toString().trim(),
    notes: data.get('notes')?.toString().trim(),
    website: data.get('website')?.toString().trim(),
    consentAccepted: data.get('consentAccepted') === 'on',
    serviceId: state.selectedServiceId,
    date: state.selectedDate,
    time: state.selectedTime
  };
}

function clientValidate(payload) {
  const errors = {};
  if (!state.selectedServiceId || !state.selectedDate || !state.selectedTime) {
    errors.time = 'Please choose service, date and time from the planner.';
  }
  if (!payload.fullName) errors.fullName = 'Required';
  if (!payload.email) errors.email = 'Required';
  if (!payload.phone) errors.phone = 'Required';
  if (!payload.consentAccepted) errors.consentAccepted = 'Required';
  return errors;
}

async function submitBooking(event) {
  event.preventDefault();
  setFormStatus('');
  clearErrors();

  const payload = getFormPayload();
  const validationErrors = clientValidate(payload);

  if (Object.keys(validationErrors).length > 0) {
    showFieldErrors(validationErrors);
    setFormStatus('Please fix the highlighted fields before submitting.', 'fail');
    return;
  }

  refs.submitBooking.disabled = true;
  refs.submitBooking.textContent = 'Submitting...';

  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.fieldErrors) {
        showFieldErrors(result.fieldErrors);
      }

      setFormStatus(result.error || 'Could not submit your booking request.', 'fail');

      if (response.status === 409) {
        setPlannerStatus('That time was just taken. Please choose another slot.', 'error');
        await loadCalendarSummary();
        renderCalendar();
        await loadSlots();
      }
      return;
    }

    refs.bookingForm.reset();
    storeClientProfile({
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone
    });
    applyClientProfileToBookingForm(readStoredClientProfile());
    const info = result.booking;
    state.bookingSuccess = {
      bookingReference: info.bookingReference,
      contactMethod: payload.preferredContactMethod || 'your preferred contact method'
    };
    renderSummary();
    await loadCalendarSummary();
    renderCalendar();
    await loadSlots();

    setFormStatus(
      `Booking request confirmed. Ref ${info.bookingReference} for ${toPrettyDate(info.date)} at ${info.time}. We'll contact you shortly with final confirmation.`,
      'success'
    );

    scrollToSection('booking');
  } catch (error) {
    setFormStatus('A network error occurred. Please try again in a moment.', 'fail');
  } finally {
    refs.submitBooking.disabled = false;
    refs.submitBooking.textContent = 'Submit Booking Request';
  }
}

function setupRevealAnimations() {
  const revealElements = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || revealElements.length === 0) {
    revealElements.forEach((element) => element.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealElements.forEach((element) => observer.observe(element));
}

function setupStickyCtaVisibility() {
  const mobileCta = document.querySelector('.mobile-book-cta');
  const bookingSection = document.getElementById('booking');
  if (!mobileCta || !bookingSection) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          mobileCta.style.opacity = '0';
          mobileCta.style.pointerEvents = 'none';
        } else {
          mobileCta.style.opacity = '1';
          mobileCta.style.pointerEvents = 'auto';
        }
      });
    },
    { threshold: 0.15 }
  );

  observer.observe(bookingSection);
}

async function init() {
  renderServiceSkeleton();
  renderTestimonialsSkeleton();
  renderFaqSkeleton();
  renderCalendarLoading();
  renderSlotsLoading();
  bindSmoothScroll();
  bindPortalLogins();

  const response = await fetch('/api/public-config');
  if (!response.ok) {
    refs.formStatus.textContent = 'Failed to load booking system configuration.';
    refs.formStatus.classList.add('fail');
    setPlannerStatus('Booking data could not be loaded. Please refresh.', 'error');
    return;
  }

  state.config = await response.json();
  state.selectedMonth = todayMonth();

  renderServices();
  renderTestimonials();
  renderFaq();
  renderMeta();
  renderServiceSelect();
  renderSummary();

  await loadCalendarSummary();
  renderCalendar();
  refs.timeSlots.innerHTML = '<p class="small">Select a date to reveal available times.</p>';

  refs.serviceSelect.addEventListener('change', async (event) => {
    state.selectedServiceId = event.target.value;
    state.selectedDate = '';
    state.selectedTime = '';
    state.bookingSuccess = null;
    state.slots = [];
    refs.slotTitle.textContent = 'Select a date to view times';
    refs.timeSlots.innerHTML = '<p class="small">Select a date to reveal available times.</p>';
    renderSummary();
    renderCalendarLoading();
    await loadCalendarSummary();
    renderCalendar();
  });

  refs.prevMonth.addEventListener('click', async () => {
    state.selectedMonth = shiftMonth(state.selectedMonth, -1);
    state.selectedDate = '';
    state.selectedTime = '';
    state.bookingSuccess = null;
    refs.timeSlots.innerHTML = '<p class="small">Select a date to reveal available times.</p>';
    refs.slotTitle.textContent = 'Select a date to view times';
    renderSummary();
    renderCalendarLoading();
    await loadCalendarSummary();
    renderCalendar();
  });

  refs.nextMonth.addEventListener('click', async () => {
    state.selectedMonth = shiftMonth(state.selectedMonth, 1);
    state.selectedDate = '';
    state.selectedTime = '';
    state.bookingSuccess = null;
    refs.timeSlots.innerHTML = '<p class="small">Select a date to reveal available times.</p>';
    refs.slotTitle.textContent = 'Select a date to view times';
    renderSummary();
    renderCalendarLoading();
    await loadCalendarSummary();
    renderCalendar();
  });

  refs.bookingForm.addEventListener('submit', submitBooking);
  setupRevealAnimations();
  setupStickyCtaVisibility();
}

init().catch((error) => {
  console.error(error);
  setFormStatus('Failed to initialize booking application.', 'fail');
  setPlannerStatus('Planner failed to initialize. Please refresh the page.', 'error');
});
