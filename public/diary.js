const $ = (id) => document.getElementById(id);
const state = {
  authenticated: false,
  generation: 0,
  settings: null,
  hoursBaseline: null,
  servicesBaseline: [],
  hoursDirty: false,
  servicesDirty: false,
  offDirty: false,
  busy: false,
  needsReload: false,
  settingsRequest: 0,
  bookingsRequest: 0,
  bookingsLoading: false,
  bookings: null,
  tab: "hours",
};
const days = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [0, "Sunday"]];
const statuses = { pending: "Awaiting confirmation", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", "no-show": "Did not attend" };
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasDraft = () => state.hoursDirty || state.servicesDirty || state.offDirty;

class DiaryError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function setStatus(id, message = "", kind = "") {
  $(id).textContent = message;
  $(id).dataset.kind = kind;
}
function irelandToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value || "Date not available");
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IE", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
function readableError(error) {
  if (error.status === 401) return "Please sign in again. Your unfinished entries are still here.";
  if (error.status === 503 || !error.status) return "The diary could not be reached. Please try again when the connection is available.";
  return error.message || "Something went wrong. Please try again.";
}
async function api(route, { method = "GET", body, query = {} } = {}) {
  const generation = state.generation;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 60000);
  let response;
  let data;
  try {
    const params = new URLSearchParams({ route, ...query });
    response = await fetch(`/api/diary?${params}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    data = await response.json().catch(() => null);
  } catch {
    throw new DiaryError("The diary could not be reached. Please try again.");
  } finally {
    window.clearTimeout(timer);
  }
  if (generation !== state.generation) throw new DiaryError("This request is no longer current.", 401);
  if (response.status === 401 && route !== "login" && route !== "session") {
    showLogin("Your sign-in has expired. Sign in again to continue. Your unfinished entries are still here.");
    throw new DiaryError("Please sign in again.", 401);
  }
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error.length < 500 ? data.error : "The diary could not complete that request.";
    throw new DiaryError(message, response.status);
  }
  if (!data || typeof data !== "object") throw new DiaryError("The diary returned an unexpected response. Please reload.", 502);
  return data;
}
function showLogin(message = "") {
  state.authenticated = false;
  state.generation += 1;
  state.bookings = null;
  state.bookingsLoading = false;
  $("bookingsList").replaceChildren();
  $("bookingSearch").value = "";
  $("diaryApp").hidden = true;
  $("sessionCheck").hidden = true;
  $("logout").hidden = true;
  $("loginPanel").hidden = false;
  setStatus("loginStatus", message, message ? "error" : "");
  syncControls();
}
function showDiary() {
  state.authenticated = true;
  $("loginPanel").hidden = true;
  $("sessionCheck").hidden = true;
  $("diaryApp").hidden = false;
  $("logout").hidden = false;
  $("password").value = "";
  $("password").type = "password";
  $("showPassword").textContent = "Show";
  $("showPassword").setAttribute("aria-pressed", "false");
  syncControls();
}
function syncControls() {
  const unavailable = !state.authenticated || !state.settings || state.busy || state.needsReload;
  for (const id of ["hoursFields", "servicesFields", "timeoffFields"]) $(id).disabled = unavailable;
  document.querySelectorAll("[data-write]").forEach((button) => { button.disabled = unavailable; });
  $("addService").disabled = unavailable || $("servicesList").querySelectorAll(".service-editor").length >= 30;
  document.querySelectorAll("[data-booking-write]").forEach((control) => { control.disabled = !state.authenticated || state.busy || state.needsReload || state.bookingsLoading; });
  $("refreshBookings").disabled = state.busy || state.bookingsLoading;
  $("retryConnection").disabled = state.busy;
  $("logout").disabled = state.busy;
  $("hoursDirty").hidden = !state.hoursDirty;
  $("servicesDirty").hidden = !state.servicesDirty;
  $("discardHours").hidden = !state.hoursDirty;
  $("discardServices").hidden = !state.servicesDirty;
  $("diaryApp").setAttribute("aria-busy", String(state.busy));
}
function notice(message) {
  $("connectionMessage").textContent = message;
  $("connectionNotice").hidden = !message;
}
function validSettings(settings) {
  const booking = settings?.booking;
  return booking && Array.isArray(booking.workingDays) && booking.workingDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && /^\d{2}:\d{2}$/.test(booking.workingHours?.start) && /^\d{2}:\d{2}$/.test(booking.workingHours?.end)
    && [booking.bufferBetweenAppointmentsMinutes, booking.minNoticeHours, booking.maxAdvanceBookingDays].every(Number.isFinite)
    && Array.isArray(booking.disabledDates) && booking.blockedTimeRangesByDate && typeof booking.blockedTimeRangesByDate === "object"
    && Array.isArray(settings.services);
}
function hoursFromSettings(booking) {
  return {
    workingDays: [...booking.workingDays].sort((a, b) => a - b),
    workingHours: { start: booking.workingHours.start, end: booking.workingHours.end },
    bufferBetweenAppointmentsMinutes: booking.bufferBetweenAppointmentsMinutes,
    minNoticeHours: booking.minNoticeHours,
    maxAdvanceBookingDays: booking.maxAdvanceBookingDays,
  };
}
function hoursFromForm() {
  return {
    workingDays: [...$("workingDays").querySelectorAll("input:checked")].map((input) => Number(input.value)).sort((a, b) => a - b),
    workingHours: { start: $("workStart").value, end: $("workEnd").value },
    bufferBetweenAppointmentsMinutes: Number($("bufferMinutes").value),
    minNoticeHours: Number($("noticeHours").value),
    maxAdvanceBookingDays: Number($("advanceDays").value),
  };
}
function renderHours() {
  state.hoursBaseline = hoursFromSettings(state.settings.booking);
  const booking = state.hoursBaseline;
  const choices = days.map(([value, name]) => {
    const label = element("label", "day-choice");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "workingDay";
    input.value = String(value);
    input.checked = booking.workingDays.includes(value);
    label.append(input, element("span", "", name.slice(0, 3)));
    input.setAttribute("aria-label", name);
    return label;
  });
  $("workingDays").replaceChildren(...choices);
  $("workStart").value = booking.workingHours.start;
  $("workEnd").value = booking.workingHours.end;
  $("bufferMinutes").value = booking.bufferBetweenAppointmentsMinutes;
  $("noticeHours").value = booking.minNoticeHours;
  $("advanceDays").value = booking.maxAdvanceBookingDays;
  state.hoursDirty = false;
}
function serviceField(labelText, name, value, type = "text", options = {}) {
  const label = element("label", "field", labelText);
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  if (type !== "textarea") input.type = type;
  input.name = name;
  input.value = value ?? "";
  Object.assign(input, options);
  label.append(input);
  return label;
}
function serviceValues(service) {
  return { name: String(service.name || ""), durationMinutes: Number(service.durationMinutes), priceGBP: Number(service.priceGBP), shortDescription: String(service.shortDescription || ""), active: service.active !== false };
}
function createServiceEditor(service, { isNew = false } = {}) {
  const row = element("section", "service-editor");
  row.dataset.serviceId = String(service.id || "");
  if (isNew) {
    row.dataset.newService = "true";
    row.dataset.serviceSuffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  }
  const heading = element("h3", "", service.name || "New treatment or session");
  heading.id = `service-heading-${row.dataset.serviceId || row.dataset.serviceSuffix}`;
  row.setAttribute("aria-labelledby", heading.id);
  const toggle = element("label", "service-toggle");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.name = "active";
  checkbox.checked = service.active !== false;
  toggle.append(checkbox, element("span", "", "Available for new bookings"));
  const pair = element("div", "field-grid");
  pair.append(serviceField("Length, in minutes", "durationMinutes", service.durationMinutes, "number", { min: "5", max: "480", step: "1", required: true }), serviceField("Price in euros (€)", "priceGBP", service.priceGBP, "number", { min: "0", max: "10000", step: "1", required: true }));
  row.append(heading);
  if (isNew) row.append(element("p", "small-copy service-draft-note", "New entry · not saved yet"));
  row.append(toggle, serviceField("Name", "name", service.name, "text", { required: true, maxLength: 120 }), pair, serviceField("Short description", "shortDescription", service.shortDescription, "textarea", { maxLength: 2000 }));
  if (isNew) {
    const remove = element("button", "button button-quiet", "Remove this draft");
    remove.type = "button";
    remove.dataset.write = "";
    remove.addEventListener("click", () => {
      row.remove();
      state.servicesDirty = serviceChanges().length > 0;
      setStatus("servicesStatus", "The new draft was removed. Your other changes have been kept.");
      syncControls();
      $("addService").focus();
    });
    const actions = element("div", "form-actions service-draft-actions");
    actions.append(remove);
    row.append(actions);
  }
  return row;
}
function renderServices() {
  state.servicesBaseline = clone(state.settings.services);
  const rows = state.settings.services.map((service) => createServiceEditor(service));
  $("servicesList").replaceChildren(...(rows.length ? rows : [element("p", "empty-state", "No treatments or sessions are configured. Add your first one below.")]));
  state.servicesDirty = false;
}
function newServiceId(name, suffix) {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "session";
  return `${slug}-${suffix}`;
}
function serviceChanges({ assignIds = false } = {}) {
  return [...$("servicesList").querySelectorAll(".service-editor")].map((row) => {
    const isNew = row.dataset.newService === "true";
    const baseline = state.servicesBaseline.find((service) => String(service.id) === row.dataset.serviceId);
    const before = serviceValues(baseline || {});
    const after = {
      name: row.querySelector('[name="name"]').value.trim(),
      durationMinutes: Number(row.querySelector('[name="durationMinutes"]').value),
      priceGBP: Number(row.querySelector('[name="priceGBP"]').value),
      shortDescription: row.querySelector('[name="shortDescription"]').value.trim(),
      active: row.querySelector('[name="active"]').checked,
    };
    if (isNew && assignIds && !row.dataset.serviceId) row.dataset.serviceId = newServiceId(after.name, row.dataset.serviceSuffix);
    const changes = isNew ? after : Object.fromEntries(Object.entries(after).filter(([key, value]) => !same(value, before[key])));
    return { id: row.dataset.serviceId, isNew, changes };
  }).filter((item) => Object.keys(item.changes).length);
}
function mergeServiceChanges(services, changes) {
  if (changes.some((change) => !change.isNew && !services.some((service) => String(service.id) === change.id))) throw new DiaryError("A treatment or session has changed elsewhere. Reload the diary and review your entries before saving.", 409);
  const merged = services.map((service) => ({ ...service, active: service.active !== false, ...(changes.find((change) => change.id === String(service.id))?.changes || {}) }));
  for (const change of changes) {
    if (change.isNew && !merged.some((service) => String(service.id) === change.id)) merged.push({ id: change.id, ...change.changes, benefits: [] });
  }
  if (merged.length > 30) throw new DiaryError("You can keep up to 30 treatments and sessions. Remove a new draft before saving.", 400);
  return merged;
}
function reconcileSavedServiceDrafts() {
  for (const row of $("servicesList").querySelectorAll('[data-new-service="true"]')) {
    const saved = state.settings.services.find((service) => String(service.id) === row.dataset.serviceId);
    if (!saved) continue;
    delete row.dataset.newService;
    row.querySelector(".service-draft-note")?.remove();
    row.querySelector(".service-draft-actions")?.remove();
    state.servicesBaseline.push(clone(saved));
  }
  state.servicesDirty = serviceChanges().length > 0;
}
function blocksFromSettings() {
  if (!state.settings) return [];
  const result = state.settings.booking.disabledDates.map((date) => ({ type: "day", date }));
  for (const [date, ranges] of Object.entries(state.settings.booking.blockedTimeRangesByDate)) {
    for (const range of Array.isArray(ranges) ? ranges : []) {
      const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(String(range));
      if (match) result.push({ type: "range", date, start: match[1], end: match[2] });
    }
  }
  return result.sort((a, b) => `${a.date}${a.start || ""}`.localeCompare(`${b.date}${b.start || ""}`));
}
function renderBlocks() {
  const blocks = blocksFromSettings();
  const rows = blocks.map((block) => {
    const row = element("div", "block-row");
    const copy = element("div");
    copy.append(element("strong", "", displayDate(block.date)), element("p", "", block.type === "day" ? "Whole day" : `${block.start}–${block.end}`));
    const remove = element("button", "button button-outline", "Remove");
    remove.type = "button";
    remove.dataset.write = "";
    remove.setAttribute("aria-label", `Remove time off on ${displayDate(block.date)}, ${block.type === "day" ? "whole day" : `${block.start} to ${block.end}`}`);
    remove.addEventListener("click", () => runMutation("timeoffStatus", () => api("blocks", { method: "DELETE", query: block }), () => loadSettings(), "Time off removed. The diary now reflects your usual hours for that time."));
    row.append(copy, remove);
    return row;
  });
  $("blocksList").replaceChildren(...(rows.length ? rows : [element("p", "empty-state", "No time off has been added.")]));
}
async function loadSettings({ resetHours = false, resetServices = false } = {}) {
  const request = ++state.settingsRequest;
  const data = await api("settings");
  if (request !== state.settingsRequest || !state.authenticated) return false;
  if (!validSettings(data.settings)) throw new DiaryError("The working-hours information is incomplete. Please reload before making changes.", 502);
  state.settings = clone(data.settings);
  if (state.servicesDirty && !resetServices) reconcileSavedServiceDrafts();
  if (!state.hoursDirty || resetHours) renderHours();
  if (!state.servicesDirty || resetServices) renderServices();
  renderBlocks();
  syncControls();
  return true;
}
async function runMutation(statusId, action, reload, successMessage, afterReload) {
  if (state.busy || state.needsReload || !state.authenticated) return;
  state.busy = true;
  syncControls();
  setStatus(statusId, "Saving…");
  let updateReceived = false;
  try {
    await action();
    updateReceived = true;
    const refreshed = await reload();
    if (!refreshed) throw new DiaryError("The diary could not confirm the latest information.", 502);
    afterReload?.();
    setStatus(statusId, successMessage, "success");
  } catch (error) {
    if (error.status === 401) {
      setStatus(statusId, readableError(error), "error");
    } else if (updateReceived || !error.status || error.status >= 500) {
      state.needsReload = true;
      const message = updateReceived
        ? "The update was received, but the latest diary could not be loaded. Reload the diary to check it before making another change."
        : "We couldn’t confirm whether the change was saved. Your entries are still here. Reload the diary to check before trying again.";
      setStatus(statusId, message, "error");
      notice(message);
    } else {
      setStatus(statusId, readableError(error), "error");
    }
  } finally {
    state.busy = false;
    syncControls();
  }
}
async function refreshAll() {
  if (state.busy || !state.authenticated) return;
  state.busy = true;
  syncControls();
  notice("Loading the latest diary. Unsaved form entries will be kept.");
  try {
    await loadSettings();
    if (state.tab === "bookings" || state.bookings !== null) await loadBookings();
    state.needsReload = false;
    notice("");
    if (state.hoursDirty || state.servicesDirty) {
      const message = "The latest diary is loaded. Your unsaved entries are still here; review them, then save or discard them.";
      notice(message);
    }
  } catch (error) {
    if (error.status !== 401) notice(`${readableError(error)} Your unfinished entries have been kept.`);
  } finally {
    state.busy = false;
    syncControls();
  }
}
function renderBookings() {
  if (state.bookings === null) return;
  const search = $("bookingSearch").value.trim().toLocaleLowerCase();
  const period = $("bookingDates").value;
  const status = $("bookingStatusFilter").value;
  const today = irelandToday();
  const items = state.bookings.filter((booking) => {
    if (period === "upcoming" && booking.date < today) return false;
    if (period === "past" && booking.date >= today) return false;
    if (status !== "all" && booking.status !== status) return false;
    return !search || [booking.fullName, booking.email, booking.bookingReference, booking.serviceName].some((value) => String(value || "").toLocaleLowerCase().includes(search));
  }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) * (period === "upcoming" ? 1 : -1));
  const cards = items.map((booking) => {
    const card = element("article", "booking-card");
    const head = element("div", "booking-card-head");
    const name = element("div");
    name.append(element("p", "booking-date", `${displayDate(booking.date)} · ${booking.time || "Time not available"}`), element("h3", "", booking.fullName || "Name not available"), element("p", "booking-reference", `Reference ${booking.bookingReference || "not available"}`));
    const badge = element("span", "status-badge", statuses[booking.status] || booking.status || "Status not available");
    badge.dataset.state = String(booking.status || "");
    head.append(name, badge);
    const meta = element("div", "booking-meta");
    for (const [label, value] of [["Appointment", booking.serviceName], ["Length", booking.durationMinutes ? `${booking.durationMinutes} minutes` : "Not available"], ["Email", booking.email]]) {
      const part = element("p");
      part.append(element("span", "", label), document.createTextNode(String(value || "Not available")));
      meta.append(part);
    }
    card.append(head, meta);
    if (["unconfirmed", "sending", "pending"].includes(booking.notificationStatus)) {
      card.append(element("p", "notice quiet-notice", "Booking notification delivery has not been confirmed. The booking is saved in your diary. Check your email before contacting the person separately."));
    }
    if (booking.notes) card.append(element("p", "booking-notes", booking.notes));
    if (typeof booking.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
      const reply = element("a", "text-link booking-email", "Reply by email ↗");
      reply.href = `mailto:${encodeURIComponent(booking.email)}?subject=${encodeURIComponent(`Your Soul to Sole appointment — ${booking.bookingReference || ""}`)}`;
      card.append(reply);
    }
    if (booking.status === "cancelled") {
      card.append(element("p", "small-copy", "This appointment is cancelled. Any new appointment needs a fresh booking."));
      return card;
    }
    const actions = element("form", "booking-actions");
    const label = element("label", "field", "Booking status");
    const select = document.createElement("select");
    select.dataset.bookingWrite = "";
    select.setAttribute("aria-label", `Booking status for ${booking.fullName || booking.bookingReference}`);
    for (const [value, text] of Object.entries(statuses)) {
      const option = element("option", "", text);
      option.value = value;
      select.append(option);
    }
    select.value = Object.hasOwn(statuses, booking.status) ? booking.status : "pending";
    label.append(select);
    const save = element("button", "button button-outline", "Update status");
    save.type = "submit";
    save.dataset.bookingWrite = "";
    actions.append(label, save);
    actions.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextStatus = select.value;
      if (nextStatus === booking.status) { setStatus("bookingsStatus", "This booking already has that status."); return; }
      if (nextStatus === "cancelled" && !window.confirm(`Cancel ${booking.fullName || "this person"}’s appointment on ${displayDate(booking.date)} at ${booking.time}? This updates the diary only. Please email the person separately.`)) { select.value = booking.status; return; }
      await runMutation("bookingsStatus", () => api("status", { method: "PATCH", query: { id: String(booking.id) }, body: { status: nextStatus } }), () => loadBookings(), "Booking status updated. No email was sent; please reply separately if needed.");
    });
    card.append(actions);
    return card;
  });
  $("bookingsList").replaceChildren(...(cards.length ? cards : [element("p", "panel empty-state", state.bookings.length ? "No bookings match this view. Try All dates or clear your filters." : "No bookings have been received yet.")]));
  syncControls();
}
async function loadBookings() {
  const request = ++state.bookingsRequest;
  state.bookingsLoading = true;
  syncControls();
  $("bookingsList").setAttribute("aria-busy", "true");
  try {
    const data = await api("bookings");
    if (request !== state.bookingsRequest || !state.authenticated) return false;
    if (!Array.isArray(data.items)) throw new DiaryError("The booking list could not be read. Please refresh it.", 502);
    state.bookings = data.items;
    renderBookings();
    return true;
  } finally {
    if (request === state.bookingsRequest) {
      state.bookingsLoading = false;
      $("bookingsList").setAttribute("aria-busy", "false");
      syncControls();
    }
  }
}
async function refreshBookings() {
  if (state.busy || state.bookingsLoading || !state.authenticated) return;
  setStatus("bookingsStatus", "Loading your bookings…");
  try { await loadBookings(); setStatus("bookingsStatus", "Bookings are up to date."); }
  catch (error) { setStatus("bookingsStatus", `${readableError(error)} Use Refresh bookings to try again.`, "error"); }
}
function activateTab(tab, focus = false) {
  if (!["hours", "timeoff", "bookings"].includes(tab)) return;
  state.tab = tab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(`panel-${button.dataset.tab}`).hidden = !selected;
    if (selected && focus) button.focus();
  });
  if (tab === "bookings" && state.authenticated && state.bookings === null && !state.bookingsLoading) void refreshBookings();
}
function updateOffFields() {
  const range = $("offType").value === "range";
  $("offTimeFields").hidden = !range;
  $("offStart").required = range;
  $("offEnd").required = range;
  $("offEnd").setCustomValidity("");
}

$("todayLabel").textContent = new Intl.DateTimeFormat("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Dublin" }).format(new Date());
$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("loginFields").disabled) return;
  $("loginFields").disabled = true;
  setStatus("loginStatus", "Signing in…");
  try {
    await api("login", { method: "POST", body: { username: $("username").value.trim(), password: $("password").value } });
    const session = await api("session");
    if (!session.authenticated) throw new DiaryError("Sign-in was not confirmed. Please try again.", 401);
    showDiary();
    await refreshAll();
  } catch (error) {
    setStatus("loginStatus", error.status === 401 ? "That username and password were not recognised. Please try again." : readableError(error), "error");
  } finally {
    $("password").value = "";
    $("loginFields").disabled = false;
  }
});
$("showPassword").addEventListener("click", () => {
  const visible = $("password").type === "password";
  $("password").type = visible ? "text" : "password";
  $("showPassword").textContent = visible ? "Hide" : "Show";
  $("showPassword").setAttribute("aria-pressed", String(visible));
});
$("logout").addEventListener("click", async () => {
  if (state.busy) return;
  if (hasDraft() && !window.confirm("You have unfinished changes. Sign out and discard them?")) return;
  state.busy = true;
  syncControls();
  try {
    await api("logout", { method: "POST" });
    state.hoursDirty = false;
    state.servicesDirty = false;
    state.offDirty = false;
    state.settings = null;
    state.hoursBaseline = null;
    state.servicesBaseline = [];
    state.needsReload = false;
    $("hoursForm").reset();
    $("timeoffForm").reset();
    $("workingDays").replaceChildren();
    $("servicesList").replaceChildren();
    $("blocksList").replaceChildren();
    updateOffFields();
    notice("");
    showLogin();
    $("username").focus();
  } catch (error) { if (error.status !== 401) notice("We couldn’t confirm that you signed out. Please try Sign out again."); }
  finally { state.busy = false; syncControls(); }
});
$("hoursForm").addEventListener("input", () => {
  $("workEnd").setCustomValidity("");
  state.hoursDirty = state.hoursBaseline ? !same(hoursFromForm(), state.hoursBaseline) : false;
  setStatus("hoursStatus");
  syncControls();
});
$("hoursForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.hoursBaseline) return;
  const values = hoursFromForm();
  if (values.workingHours.start >= values.workingHours.end) { $("workEnd").setCustomValidity("Choose a finish time after the start time."); $("workEnd").reportValidity(); return; }
  const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => !same(value, state.hoursBaseline[key])));
  if (!Object.keys(changes).length) { setStatus("hoursStatus", "Your working hours are already up to date."); return; }
  await runMutation("hoursStatus", () => api("settings", { method: "PUT", body: { booking: changes } }), () => loadSettings({ resetHours: true }), "Working hours saved and checked against the diary.");
});
$("discardHours").addEventListener("click", () => { renderHours(); setStatus("hoursStatus", "Your unsaved changes were discarded."); syncControls(); });
$("addService").addEventListener("click", () => {
  if (!state.authenticated || !state.settings || state.busy || state.needsReload || $("servicesList").querySelectorAll(".service-editor").length >= 30) return;
  const row = createServiceEditor({ name: "", durationMinutes: "", priceGBP: "", shortDescription: "", active: false }, { isNew: true });
  $("servicesList").querySelector(".empty-state")?.remove();
  $("servicesList").append(row);
  state.servicesDirty = true;
  $("servicesDetails").open = true;
  setStatus("servicesStatus", "Enter the new session details and choose whether it is available for bookings, then save when you are ready.");
  syncControls();
  row.querySelector('[name="name"]').focus();
});
$("servicesForm").addEventListener("input", (event) => {
  if (event.target.name === "name") event.target.setCustomValidity("");
  state.servicesDirty = serviceChanges().length > 0;
  setStatus("servicesStatus");
  syncControls();
});
$("servicesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  for (const input of $("servicesList").querySelectorAll('[name="name"]')) input.setCustomValidity(input.value.trim() ? "" : "Enter a name for this treatment or session.");
  if (!$("servicesForm").reportValidity()) return;
  const changes = serviceChanges({ assignIds: true });
  if (!changes.length) { setStatus("servicesStatus", "Your treatments and sessions are already up to date."); return; }
  await runMutation("servicesStatus", async () => {
    const fresh = await api("settings");
    if (!validSettings(fresh.settings)) throw new DiaryError("Your treatments and sessions could not be checked. Please reload before saving.", 502);
    const services = mergeServiceChanges(fresh.settings.services, changes);
    await api("settings", { method: "PUT", body: { services } });
  }, () => loadSettings({ resetServices: true }), "Treatments and sessions saved and checked against the diary.");
});
$("discardServices").addEventListener("click", () => { renderServices(); setStatus("servicesStatus", "Your unsaved changes were discarded."); syncControls(); });
$("offType").addEventListener("change", updateOffFields);
$("timeoffForm").addEventListener("input", () => { state.offDirty = true; $("offEnd").setCustomValidity(""); setStatus("timeoffStatus"); });
$("timeoffForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = $("offType").value;
  const block = { type, date: $("offDate").value };
  if (type === "range") {
    block.start = $("offStart").value;
    block.end = $("offEnd").value;
    if (block.start >= block.end) { $("offEnd").setCustomValidity("Choose an end time after the start time."); $("offEnd").reportValidity(); return; }
  }
  if (blocksFromSettings().some((item) => same(item, block))) { setStatus("timeoffStatus", "That time off is already in your diary."); return; }
  await runMutation("timeoffStatus", () => api("blocks", { method: "POST", body: block }), () => loadSettings(), "Time off added and checked against the diary. Existing appointments are unchanged.", () => { $("timeoffForm").reset(); updateOffFields(); state.offDirty = false; });
});
document.querySelectorAll("[data-tab]").forEach((button, index, buttons) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
  button.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); activateTab(buttons[next].dataset.tab, true); }
  });
});
$("retryConnection").addEventListener("click", refreshAll);
$("refreshBookings").addEventListener("click", refreshBookings);
$("bookingSearch").addEventListener("input", renderBookings);
$("bookingDates").addEventListener("change", renderBookings);
$("bookingStatusFilter").addEventListener("change", renderBookings);
window.addEventListener("beforeunload", (event) => { if (hasDraft() || state.busy) { event.preventDefault(); event.returnValue = ""; } });
activateTab(location.hash.replace("#", "") || "hours");
updateOffFields();
async function start() {
  try {
    const session = await api("session");
    if (!session.authenticated) { showLogin(); return; }
    showDiary();
    await refreshAll();
  } catch (error) { showLogin(readableError(error)); }
}
void start();
