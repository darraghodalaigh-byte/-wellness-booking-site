const state = {
  dashboard: null,
  bookings: [],
  services: [],
  settings: null,
  selectedBookingId: '',
  calendarData: null
};

const refs = {
  kpiToday: document.getElementById('kpiToday'),
  kpiNext: document.getElementById('kpiNext'),
  kpiWeek: document.getElementById('kpiWeek'),
  kpiMonth: document.getElementById('kpiMonth'),
  kpiCancelled: document.getElementById('kpiCancelled'),
  kpiRevenue: document.getElementById('kpiRevenue'),
  refreshBookings: document.getElementById('refreshBookings'),
  filterSearch: document.getElementById('filterSearch'),
  filterDate: document.getElementById('filterDate'),
  filterService: document.getElementById('filterService'),
  filterStatus: document.getElementById('filterStatus'),
  filterSort: document.getElementById('filterSort'),
  bookingsTbody: document.getElementById('bookingsTbody'),
  bookingDetail: document.getElementById('bookingDetail'),
  bookingActions: document.getElementById('bookingActions'),
  deleteBookingBtn: document.getElementById('deleteBookingBtn'),
  manualBookingForm: document.getElementById('manualBookingForm'),
  manualService: document.getElementById('manualService'),
  manualStatus: document.getElementById('manualStatus'),
  blockDayForm: document.getElementById('blockDayForm'),
  blockRangeForm: document.getElementById('blockRangeForm'),
  blockList: document.getElementById('blockList'),
  blockStatus: document.getElementById('blockStatus'),
  settingsForm: document.getElementById('settingsForm'),
  workingDaysChecks: document.getElementById('workingDaysChecks'),
  servicesEditor: document.getElementById('servicesEditor'),
  settingsStatus: document.getElementById('settingsStatus'),
  calendarViewMode: document.getElementById('calendarViewMode'),
  calendarDate: document.getElementById('calendarDate'),
  loadCalendarBtn: document.getElementById('loadCalendarBtn'),
  calendarView: document.getElementById('calendarView'),
  logoutBtn: document.getElementById('logoutBtn')
};

const dayChoices = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
];

function todayDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prettyDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function setStatus(target, message, kind = '') {
  target.textContent = message;
  target.classList.remove('ok', 'error');
  if (kind) target.classList.add(kind);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (response.status === 401) {
    window.location.href = '/admin';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function renderDashboard() {
  const metrics = state.dashboard?.metrics;
  if (!metrics) return;

  refs.kpiToday.textContent = String(metrics.todayBookings.length);
  refs.kpiNext.textContent = metrics.upcomingBooking
    ? `${metrics.upcomingBooking.date} ${metrics.upcomingBooking.time}`
    : '-';
  refs.kpiWeek.textContent = String(metrics.totals.week);
  refs.kpiMonth.textContent = String(metrics.totals.month);
  refs.kpiCancelled.textContent = String(metrics.totals.cancelled);
  refs.kpiRevenue.textContent = `GBP ${metrics.totals.estimatedRevenueGBP}`;
}

function renderServiceOptions() {
  const activeServices = state.services.filter((service) => service.active !== false);
  refs.filterService.innerHTML = '<option value="">All services</option>';
  refs.manualService.innerHTML = '';

  state.services.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = service.name;
    refs.filterService.appendChild(option);
  });

  activeServices.forEach((service) => {
    const option = document.createElement('option');
    option.value = service.id;
    option.textContent = `${service.name} (${service.durationMinutes} mins)`;
    refs.manualService.appendChild(option);
  });
}

function getBookingById(id) {
  return state.bookings.find((booking) => booking.id === id) || null;
}

function renderBookingsTable() {
  if (state.bookings.length === 0) {
    refs.bookingsTbody.innerHTML = '<tr><td colspan="8" class="muted">No bookings found.</td></tr>';
    return;
  }

  refs.bookingsTbody.innerHTML = state.bookings
    .map(
      (booking) => `
      <tr data-id="${booking.id}" class="${state.selectedBookingId === booking.id ? 'active-row' : ''}">
        <td>${booking.bookingReference}</td>
        <td>${booking.fullName}</td>
        <td>${booking.serviceName}</td>
        <td>${booking.date}</td>
        <td>${booking.time}</td>
        <td><span class="badge badge-${booking.status}">${booking.status}</span></td>
        <td>${booking.phone}</td>
        <td>${booking.email}</td>
      </tr>
    `
    )
    .join('');

  refs.bookingsTbody.querySelectorAll('tr[data-id]').forEach((row) => {
    row.addEventListener('click', () => {
      state.selectedBookingId = row.dataset.id;
      renderBookingsTable();
      renderBookingDetail();
    });
  });
}

function renderBookingDetail() {
  const booking = getBookingById(state.selectedBookingId);
  if (!booking) {
    refs.bookingDetail.innerHTML = 'Select a booking row to view details.';
    refs.bookingActions.classList.add('hidden');
    return;
  }

  refs.bookingDetail.innerHTML = `
    <div class="stack compact">
      <div><strong>Reference:</strong> ${booking.bookingReference}</div>
      <div><strong>Client:</strong> ${booking.fullName}</div>
      <div><strong>Email:</strong> ${booking.email}</div>
      <div><strong>Phone:</strong> ${booking.phone}</div>
      <div><strong>Service:</strong> ${booking.serviceName}</div>
      <div><strong>Date & Time:</strong> ${booking.date} ${booking.time}</div>
      <div><strong>Duration:</strong> ${booking.durationMinutes} minutes</div>
      <div><strong>Status:</strong> ${booking.status}</div>
      <div><strong>Notes:</strong> ${booking.notes || 'No notes'}</div>
      <div><strong>Created:</strong> ${booking.createdAt}</div>
    </div>
  `;

  refs.bookingActions.classList.remove('hidden');
}

function renderBlocks() {
  const bookingRules = state.settings?.booking;
  if (!bookingRules) return;

  const items = [];
  bookingRules.disabledDates.forEach((date) => {
    items.push({ label: `${date} (full day)`, type: 'day', date });
  });

  Object.entries(bookingRules.blockedTimeRangesByDate).forEach(([date, ranges]) => {
    ranges.forEach((range) => {
      const [start, end] = range.split('-');
      items.push({ label: `${date} ${start}-${end}`, type: 'range', date, start, end });
    });
  });

  if (items.length === 0) {
    refs.blockList.innerHTML = '<li class="muted">No blocked dates or ranges.</li>';
    return;
  }

  refs.blockList.innerHTML = items
    .map((item) => {
      const attrs = [`data-type="${item.type}"`, `data-date="${item.date}"`];
      if (item.start) attrs.push(`data-start="${item.start}"`);
      if (item.end) attrs.push(`data-end="${item.end}"`);

      return `<li>${item.label} <button class="btn btn-ghost btn-xs" ${attrs.join(' ')}>Unblock</button></li>`;
    })
    .join('');

  refs.blockList.querySelectorAll('button[data-type]').forEach((button) => {
    button.addEventListener('click', async () => {
      const params = new URLSearchParams({
        type: button.dataset.type,
        date: button.dataset.date
      });

      if (button.dataset.start) params.set('start', button.dataset.start);
      if (button.dataset.end) params.set('end', button.dataset.end);

      try {
        setStatus(refs.blockStatus, 'Removing block...');
        await api(`/api/admin/blocks?${params.toString()}`, { method: 'DELETE' });
        setStatus(refs.blockStatus, 'Block removed.', 'ok');
        await loadSettings();
      } catch (error) {
        setStatus(refs.blockStatus, error.message, 'error');
      }
    });
  });
}

function renderSettingsForm() {
  if (!state.settings) return;

  const booking = state.settings.booking;
  const business = state.settings.business;

  refs.settingsForm.ownerEmail.value = business.ownerEmail || '';
  refs.settingsForm.workStart.value = booking.workingHours.start;
  refs.settingsForm.workEnd.value = booking.workingHours.end;
  refs.settingsForm.buffer.value = booking.bufferBetweenAppointmentsMinutes;
  refs.settingsForm.minNotice.value = booking.minNoticeHours;
  refs.settingsForm.maxAdvance.value = booking.maxAdvanceBookingDays;

  refs.workingDaysChecks.innerHTML = dayChoices
    .map(
      (day) => `
      <label class="check-item">
        <input type="checkbox" value="${day.value}" ${booking.workingDays.includes(day.value) ? 'checked' : ''} />
        ${day.label}
      </label>
    `
    )
    .join('');

  refs.servicesEditor.innerHTML = state.settings.services
    .map(
      (service, index) => `
      <div class="service-row" data-index="${index}">
        <div class="grid-2">
          <label>Name <input type="text" name="serviceName" value="${service.name}" required /></label>
          <label>ID <input type="text" name="serviceId" value="${service.id}" readonly /></label>
        </div>
        <div class="grid-3">
          <label>Duration (mins) <input type="number" name="serviceDuration" min="5" value="${service.durationMinutes}" required /></label>
          <label>Price (GBP) <input type="number" name="servicePrice" min="0" value="${service.priceGBP}" required /></label>
          <label class="check-item inline-toggle"><input type="checkbox" name="serviceActive" ${service.active !== false ? 'checked' : ''}/> Active</label>
        </div>
      </div>
    `
    )
    .join('');

  renderBlocks();
}

function renderCalendarView() {
  if (!state.calendarData) {
    refs.calendarView.innerHTML = '<p class="muted">No calendar data loaded yet.</p>';
    return;
  }

  if (state.calendarData.view === 'weekly') {
    refs.calendarView.innerHTML = state.calendarData.days
      .map((day) => {
        const rows = day.items.length
          ? day.items
              .map((booking) => `<li>${booking.time} - ${booking.fullName} (${booking.serviceName}) [${booking.status}]</li>`)
              .join('')
          : '<li class="muted">No bookings</li>';

        return `<article class="calendar-day"><h3>${prettyDate(day.date)}</h3><ul>${rows}</ul></article>`;
      })
      .join('');
    return;
  }

  const rows = state.calendarData.items.length
    ? state.calendarData.items
        .map((booking) => `<li>${booking.time} - ${booking.fullName} (${booking.serviceName}) [${booking.status}]</li>`)
        .join('')
    : '<li class="muted">No bookings</li>';

  refs.calendarView.innerHTML = `<article class="calendar-day"><h3>${prettyDate(state.calendarData.date)}</h3><ul>${rows}</ul></article>`;
}

async function loadDashboard() {
  state.dashboard = await api('/api/admin/dashboard');
  state.services = state.dashboard.services || [];
  renderServiceOptions();
  renderDashboard();
}

async function loadBookings() {
  const params = new URLSearchParams({
    search: refs.filterSearch.value.trim(),
    date: refs.filterDate.value,
    serviceId: refs.filterService.value,
    status: refs.filterStatus.value,
    sort: refs.filterSort.value
  });

  const payload = await api(`/api/admin/bookings?${params.toString()}`);
  state.bookings = payload.items || [];

  if (state.selectedBookingId && !getBookingById(state.selectedBookingId)) {
    state.selectedBookingId = '';
  }

  renderBookingsTable();
  renderBookingDetail();
}

async function loadSettings() {
  const payload = await api('/api/admin/settings');
  state.settings = payload.settings;
  renderSettingsForm();
}

async function loadCalendar() {
  const mode = refs.calendarViewMode.value;
  const date = refs.calendarDate.value || todayDate();
  const payload = await api(`/api/admin/calendar?view=${mode}&date=${date}`);
  state.calendarData = payload;
  renderCalendarView();
}

async function updateBookingStatus(status) {
  if (!state.selectedBookingId) return;
  await api(`/api/admin/bookings/${state.selectedBookingId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  await Promise.all([loadDashboard(), loadBookings(), loadCalendar()]);
}

function wireEvents() {
  refs.refreshBookings.addEventListener('click', () => loadBookings().catch(console.error));

  [refs.filterSearch, refs.filterDate, refs.filterService, refs.filterStatus, refs.filterSort].forEach((node) => {
    node.addEventListener('change', () => loadBookings().catch(console.error));
    if (node === refs.filterSearch) {
      node.addEventListener('input', () => loadBookings().catch(console.error));
    }
  });

  refs.bookingActions.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      updateBookingStatus(button.dataset.action).catch((error) => alert(error.message));
    });
  });

  refs.deleteBookingBtn.addEventListener('click', async () => {
    if (!state.selectedBookingId) return;

    const ok = window.confirm('Delete this booking permanently? This cannot be undone.');
    if (!ok) return;

    try {
      await api(`/api/admin/bookings/${state.selectedBookingId}`, { method: 'DELETE' });
      state.selectedBookingId = '';
      await Promise.all([loadDashboard(), loadBookings(), loadCalendar()]);
    } catch (error) {
      alert(error.message);
    }
  });

  refs.manualBookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(refs.manualStatus, 'Creating booking...');

    const data = new FormData(refs.manualBookingForm);
    const payload = {
      fullName: String(data.get('fullName') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      serviceId: String(data.get('serviceId') || '').trim(),
      date: String(data.get('date') || '').trim(),
      time: String(data.get('time') || '').trim(),
      notes: String(data.get('notes') || '').trim(),
      preferredContactMethod: String(data.get('preferredContactMethod') || 'email').trim()
    };

    try {
      await api('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      refs.manualBookingForm.reset();
      setStatus(refs.manualStatus, 'Manual booking created successfully.', 'ok');
      await Promise.all([loadDashboard(), loadBookings(), loadCalendar()]);
    } catch (error) {
      setStatus(refs.manualStatus, error.message, 'error');
    }
  });

  refs.blockDayForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(refs.blockDayForm);
    const payload = { type: 'day', date: String(data.get('date') || '').trim() };

    try {
      setStatus(refs.blockStatus, 'Blocking full day...');
      await api('/api/admin/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setStatus(refs.blockStatus, 'Full day blocked.', 'ok');
      refs.blockDayForm.reset();
      await Promise.all([loadSettings(), loadCalendar()]);
    } catch (error) {
      setStatus(refs.blockStatus, error.message, 'error');
    }
  });

  refs.blockRangeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(refs.blockRangeForm);
    const payload = {
      type: 'range',
      date: String(data.get('date') || '').trim(),
      start: String(data.get('start') || '').trim(),
      end: String(data.get('end') || '').trim()
    };

    try {
      setStatus(refs.blockStatus, 'Blocking time range...');
      await api('/api/admin/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setStatus(refs.blockStatus, 'Time range blocked.', 'ok');
      refs.blockRangeForm.reset();
      await Promise.all([loadSettings(), loadCalendar()]);
    } catch (error) {
      setStatus(refs.blockStatus, error.message, 'error');
    }
  });

  refs.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(refs.settingsStatus, 'Saving settings...');

    const services = Array.from(refs.servicesEditor.querySelectorAll('.service-row')).map((row) => ({
      id: row.querySelector('input[name="serviceId"]').value.trim(),
      name: row.querySelector('input[name="serviceName"]').value.trim(),
      durationMinutes: Number(row.querySelector('input[name="serviceDuration"]').value),
      priceGBP: Number(row.querySelector('input[name="servicePrice"]').value),
      active: row.querySelector('input[name="serviceActive"]').checked
    }));

    const workingDays = Array.from(refs.workingDaysChecks.querySelectorAll('input[type="checkbox"]:checked')).map((input) => Number(input.value));

    const payload = {
      business: {
        ownerEmail: refs.settingsForm.ownerEmail.value.trim()
      },
      booking: {
        workingHours: {
          start: refs.settingsForm.workStart.value,
          end: refs.settingsForm.workEnd.value
        },
        workingDays,
        bufferBetweenAppointmentsMinutes: Number(refs.settingsForm.buffer.value),
        minNoticeHours: Number(refs.settingsForm.minNotice.value),
        maxAdvanceBookingDays: Number(refs.settingsForm.maxAdvance.value)
      },
      services
    };

    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setStatus(refs.settingsStatus, 'Settings saved.', 'ok');
      await Promise.all([loadDashboard(), loadSettings(), loadBookings(), loadCalendar()]);
    } catch (error) {
      setStatus(refs.settingsStatus, error.message, 'error');
    }
  });

  refs.loadCalendarBtn.addEventListener('click', () => loadCalendar().catch(console.error));

  refs.logoutBtn.addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin';
  });
}

async function init() {
  const session = await api('/api/admin/session');
  if (!session.authenticated) {
    window.location.href = '/admin';
    return;
  }

  refs.calendarDate.value = todayDate();

  wireEvents();
  await Promise.all([loadDashboard(), loadSettings(), loadBookings(), loadCalendar()]);
}

init().catch((error) => {
  refs.calendarView.innerHTML = `<p class="status error">${error.message}</p>`;
});
