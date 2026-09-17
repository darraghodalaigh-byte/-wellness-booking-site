const euro = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const dayFormatter = new Intl.DateTimeFormat("en-IE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthFormatter = new Intl.DateTimeFormat("en-IE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
let disposePrevious = null;

function dateObject(value) {
  const [year, month, day = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function nextMonth(month, direction) {
  const date = dateObject(month);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return dateKey(date).slice(0, 7);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function servicePrice(service) {
  const amount = Number(service?.priceEUR ?? service?.priceGBP);
  return Number.isFinite(amount)
    ? euro.format(amount)
    : "Ask Louise for pricing";
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Mount the public appointment-request flow after the site's public config has loaded. */
export async function initBooking(config) {
  const root = document.getElementById("bookingApp");
  if (!root) return;
  disposePrevious?.();

  const services = (
    Array.isArray(config?.services) ? config.services : []
  ).filter((service) => service.active !== false);
  if (!services.length) {
    root.replaceChildren(
      element(
        "p",
        "empty-state",
        "Online appointments are not available just now. Please contact Louise to arrange a session.",
      ),
    );
    return;
  }

  const rules = config.bookingRules || {};
  const now = new Date();
  const today = dateKey(now);
  const maxDays = Math.max(
    0,
    Number.isFinite(Number(rules.maxAdvanceBookingDays))
      ? Number(rules.maxAdvanceBookingDays)
      : 90,
  );
  const lastDayObject = dateObject(today);
  lastDayObject.setUTCDate(lastDayObject.getUTCDate() + maxDays);
  const lastDay = dateKey(lastDayObject);
  const firstMonth = today.slice(0, 7);
  const lastMonth = lastDay.slice(0, 7);
  const requestedService = new URLSearchParams(window.location.search).get(
    "service",
  );
  const initialService =
    services.find((service) => service.id === requestedService) || services[0];
  const state = {
    serviceId: initialService.id,
    month: firstMonth,
    date: "",
    time: "",
    days: [],
    slots: [],
    calendarLoading: false,
    slotsLoading: false,
    submitting: false,
    completed: false,
    disposed: false,
    calendarSequence: 0,
    slotsSequence: 0,
  };
  let calendarController;
  let slotsController;
  const eventController = new AbortController();
  const listen = (target, event, handler) =>
    target.addEventListener(event, handler, { signal: eventController.signal });
  const dispose = () => {
    state.disposed = true;
    calendarController?.abort();
    slotsController?.abort();
    eventController.abort();
  };
  disposePrevious = dispose;

  root.innerHTML = `
    <div class="booking-layout">
      <section class="planner-panel" aria-labelledby="bookingPlannerHeading">
        <p class="eyebrow">01 / Your time to pause</p>
        <h2 id="bookingPlannerHeading">Choose a treatment &amp; date</h2>
        <div class="field">
          <label for="bookingService">Your treatment</label>
          <select id="bookingService" name="serviceId" aria-describedby="bookingServiceDescription"></select>
          <p id="bookingServiceDescription"></p>
        </div>
        <div class="booking-month-controls">
          <button type="button" class="button button-outline" id="bookingPrevious" aria-label="Previous month">←</button>
          <h3 id="bookingMonth"></h3>
          <button type="button" class="button button-outline" id="bookingNext" aria-label="Next month">→</button>
        </div>
        <p id="bookingCalendarStatus" class="status-message" role="status" aria-live="polite" aria-atomic="true"></p>
        <div id="bookingCalendar" class="calendar-grid" role="group" aria-labelledby="bookingMonth"></div>
        <p id="bookingDateHint" class="booking-date-hint"></p>
      </section>
      <section class="slots-panel" aria-labelledby="bookingSlotsHeading">
        <p class="eyebrow">02 / Make a little room</p>
        <h2 id="bookingSlotsHeading">Choose a time</h2>
        <p id="bookingSelectedDate">Select an available date to see appointment times.</p>
        <p id="bookingTimezone"></p>
        <p id="bookingSlotsStatus" class="status-message" role="status" aria-live="polite" aria-atomic="true"></p>
        <div id="bookingSlots" class="slot-grid" role="group" aria-label="Appointment times"></div>
      </section>
      <section class="booking-details" aria-labelledby="bookingDetailsHeading">
        <p class="eyebrow">03 / A few details</p>
        <h2 id="bookingDetailsHeading">Request your appointment</h2>
        <div id="bookingSummary" class="booking-summary" aria-live="polite" aria-atomic="true"></div>
        <form id="appointmentForm">
          <fieldset id="bookingFormFields">
            <legend class="sr-only">Your contact details</legend>
            <div class="field-grid">
              <div class="field">
                <label for="bookingName">Full name <span aria-hidden="true">*</span></label>
                <input id="bookingName" name="fullName" type="text" autocomplete="name" required minlength="2" maxlength="120" aria-describedby="bookingNameError">
                <span class="field-error" id="bookingNameError"></span>
              </div>
              <div class="field">
                <label for="bookingEmail">Email address <span aria-hidden="true">*</span></label>
                <input id="bookingEmail" name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" aria-describedby="bookingEmailError">
                <span class="field-error" id="bookingEmailError"></span>
              </div>
              <div class="field">
                <label for="bookingPhone">Phone number <span aria-hidden="true">*</span></label>
                <input id="bookingPhone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required minlength="7" maxlength="20" aria-describedby="bookingPhoneError">
                <span class="field-error" id="bookingPhoneError"></span>
              </div>
              <div class="field">
                <p class="booking-email-note">Louise will reply to your email address to confirm the arrangements.</p>
                <input name="preferredContactMethod" type="hidden" value="email">
              </div>
            </div>
            <div class="field">
              <label for="bookingNotes">Anything else? <span>(optional)</span></label>
              <textarea id="bookingNotes" name="notes" rows="4" maxlength="3000" placeholder="A question, a preference, or anything Louise should know before getting in touch."></textarea>
            </div>
            <div hidden aria-hidden="true">
              <label for="bookingWebsite">Leave this field empty</label>
              <input id="bookingWebsite" name="website" type="text" tabindex="-1" autocomplete="off">
            </div>
            <label class="form-consent" for="bookingConsent">
              <input id="bookingConsent" name="consentAccepted" type="checkbox" required aria-describedby="bookingConsentError">
              <span>I agree to my details being used to arrange this appointment and for Louise to contact me about it. <span aria-hidden="true">*</span></span>
            </label>
            <span class="field-error" id="bookingConsentError"></span>
            <p id="bookingPolicy"></p>
            <button type="submit" id="bookingSubmit" class="button button-primary">Request appointment <span aria-hidden="true">↗</span></button>
          </fieldset>
        </form>
        <div id="bookingFormStatus" class="status-message" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></div>
      </section>
    </div>`;

  const get = (id) => root.querySelector(`#${id}`);
  const refs = {
    service: get("bookingService"),
    serviceDescription: get("bookingServiceDescription"),
    previous: get("bookingPrevious"),
    next: get("bookingNext"),
    month: get("bookingMonth"),
    calendar: get("bookingCalendar"),
    calendarStatus: get("bookingCalendarStatus"),
    dateHint: get("bookingDateHint"),
    selectedDate: get("bookingSelectedDate"),
    timezone: get("bookingTimezone"),
    slots: get("bookingSlots"),
    slotsStatus: get("bookingSlotsStatus"),
    summary: get("bookingSummary"),
    form: get("appointmentForm"),
    fields: get("bookingFormFields"),
    submit: get("bookingSubmit"),
    formStatus: get("bookingFormStatus"),
    policy: get("bookingPolicy"),
  };
  const fields = {
    fullName: [get("bookingName"), get("bookingNameError")],
    email: [get("bookingEmail"), get("bookingEmailError")],
    phone: [get("bookingPhone"), get("bookingPhoneError")],
    consentAccepted: [get("bookingConsent"), get("bookingConsentError")],
  };

  // Native fieldsets have browser-specific borders; the site controls the visual grouping.
  refs.fields.style.cssText = "border:0;padding:0;margin:0;min-width:0";
  const hiddenLegend = refs.fields.querySelector("legend");
  hiddenLegend.style.cssText =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  refs.previous.style.minWidth = "44px";
  refs.next.style.minWidth = "44px";
  refs.calendar.style.cssText =
    "display:grid;grid-template-columns:repeat(7,minmax(0,1fr))";
  refs.timezone.textContent =
    config.business?.timezone === "Europe/Dublin" || !config.business?.timezone
      ? "All appointment times are shown in Ireland time."
      : `Appointment time zone: ${config.business.timezone}.`;
  refs.dateHint.textContent = `Appointments can be requested up to ${maxDays} days ahead${Number(rules.minNoticeHours) > 0 ? `, with at least ${Number(rules.minNoticeHours)} hours’ notice` : ""}. Unavailable dates are greyed out.`;
  refs.policy.textContent =
    config.policies?.cancellation ||
    "This is an appointment request. Louise will contact you to confirm your session.";

  for (const service of services) {
    const option = element(
      "option",
      "",
      `${service.name} · ${service.durationMinutes} min · ${servicePrice(service)}`,
    );
    option.value = service.id;
    refs.service.append(option);
  }
  refs.service.value = initialService.id;

  function selectedService() {
    return services.find((service) => service.id === state.serviceId);
  }

  function updateDescription() {
    const service = selectedService();
    refs.serviceDescription.textContent = service?.shortDescription || "";
  }

  function setStatus(target, message, kind = "") {
    target.replaceChildren(element("span", "", message));
    if (kind) target.dataset.status = kind;
    else delete target.dataset.status;
  }

  function retryStatus(target, message, callback) {
    setStatus(target, message, "error");
    const retry = element("button", "button button-outline", "Try again");
    retry.type = "button";
    listen(retry, "click", callback);
    target.append(document.createTextNode(" "), retry);
  }

  function updateControls() {
    const locked = state.submitting || state.completed;
    refs.service.disabled = locked;
    refs.previous.disabled = locked || state.month <= firstMonth;
    refs.next.disabled = locked || state.month >= lastMonth;
    refs.fields.disabled = locked;
    refs.submit.disabled = locked;
    refs.submit.textContent = state.submitting
      ? "Sending your request…"
      : "Request appointment ↗";
    for (const button of refs.calendar.querySelectorAll("button")) {
      button.disabled =
        locked || state.calendarLoading || button.dataset.available !== "true";
    }
    for (const button of refs.slots.querySelectorAll("button")) {
      button.disabled =
        locked || state.slotsLoading || button.dataset.available !== "true";
    }
  }

  function updateSummary() {
    const service = selectedService();
    const fragment = document.createDocumentFragment();
    fragment.append(element("h3", "", "Your appointment"));
    const list = element("dl", "booking-summary-list");
    const rows = [
      ["Treatment", service?.name || "Choose a treatment"],
      ["Duration", `${service?.durationMinutes || "—"} minutes`],
      ["Price", servicePrice(service)],
      [
        "Date",
        state.date
          ? dayFormatter.format(dateObject(state.date))
          : "Choose an available date",
      ],
      ["Time", state.time || "Choose a time"],
    ];
    for (const [label, value] of rows) {
      const row = element("div", "booking-summary-row");
      row.append(element("dt", "", label), element("dd", "", value));
      list.append(row);
    }
    fragment.append(list);
    if (!state.completed)
      fragment.append(
        element(
          "p",
          "",
          "Your appointment is confirmed when you hear from Louise. No payment is taken here.",
        ),
      );
    refs.summary.replaceChildren(fragment);
  }

  function resetSlots() {
    slotsController?.abort();
    state.slotsSequence += 1;
    state.slotsLoading = false;
    state.slots = [];
    state.date = "";
    state.time = "";
    refs.slots.removeAttribute("aria-busy");
    refs.slots.replaceChildren();
    refs.selectedDate.textContent =
      "Select an available date to see appointment times.";
    setStatus(refs.slotsStatus, "");
    updateSummary();
  }

  function renderCalendar() {
    refs.month.textContent = monthFormatter.format(dateObject(state.month));
    const fragment = document.createDocumentFragment();
    for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const label = element("span", "day-label", name);
      label.setAttribute("aria-hidden", "true");
      fragment.append(label);
    }
    const leadingDays = (dateObject(state.month).getUTCDay() + 6) % 7;
    for (let i = 0; i < leadingDays; i += 1) {
      const space = element("span");
      space.setAttribute("aria-hidden", "true");
      fragment.append(space);
    }
    const [year, month] = state.month.split("-").map(Number);
    const numberOfDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = new Map(state.days.map((day) => [day.date, day]));
    for (let n = 1; n <= numberOfDays; n += 1) {
      const date = `${state.month}-${String(n).padStart(2, "0")}`;
      const day = days.get(date);
      const inWindow = date >= today && date <= lastDay;
      const available =
        inWindow &&
        Boolean(day && !day.isUnavailable && Number(day.availableCount) > 0);
      const button = element(
        "button",
        `calendar-day${date === state.date ? " is-selected" : ""}`,
        String(n),
      );
      button.type = "button";
      button.dataset.date = date;
      button.dataset.available = String(available);
      button.setAttribute("aria-pressed", String(date === state.date));
      if (date === today) button.setAttribute("aria-current", "date");
      const reason = state.calendarLoading
        ? "Loading availability"
        : !inWindow
          ? "Outside the booking window"
          : day?.unavailableReason ||
            (available
              ? `${day.availableCount} available times`
              : "No available times");
      button.setAttribute(
        "aria-label",
        `${dayFormatter.format(dateObject(date))}. ${reason}`,
      );
      button.title = reason;
      button.style.minHeight = "44px";
      listen(button, "click", () => chooseDate(date));
      fragment.append(button);
    }
    refs.calendar.replaceChildren(fragment);
    updateControls();
  }

  async function loadCalendar() {
    calendarController?.abort();
    const controller = new AbortController();
    calendarController = controller;
    const sequence = ++state.calendarSequence;
    const serviceId = state.serviceId;
    const month = state.month;
    state.calendarLoading = true;
    state.days = [];
    refs.calendar.setAttribute("aria-busy", "true");
    setStatus(refs.calendarStatus, "Checking available dates…");
    renderCalendar();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const query = new URLSearchParams({ serviceId, month });
      const response = await fetch(`/api/availability/summary?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const result = await readResponse(response);
      if (
        state.disposed ||
        sequence !== state.calendarSequence ||
        serviceId !== state.serviceId ||
        month !== state.month
      )
        return;
      if (!response.ok || !Array.isArray(result?.days))
        throw new Error("Calendar could not be loaded.");
      state.days = result.days;
      state.calendarLoading = false;
      renderCalendar();
      const availableDays = state.days.filter(
        (day) =>
          day.date >= today &&
          day.date <= lastDay &&
          !day.isUnavailable &&
          Number(day.availableCount) > 0,
      ).length;
      setStatus(
        refs.calendarStatus,
        availableDays
          ? `${availableDays} ${availableDays === 1 ? "date has" : "dates have"} availability in ${monthFormatter.format(dateObject(month))}.`
          : `No appointments are available in ${monthFormatter.format(dateObject(month))}.${month < lastMonth ? " Try the next month or another treatment." : " Try another treatment or contact Louise."}`,
      );
    } catch {
      if (
        state.disposed ||
        sequence !== state.calendarSequence ||
        serviceId !== state.serviceId ||
        month !== state.month
      )
        return;
      state.calendarLoading = false;
      renderCalendar();
      retryStatus(
        refs.calendarStatus,
        "We couldn’t load available dates. Please try again.",
        loadCalendar,
      );
    } finally {
      window.clearTimeout(timeout);
      if (sequence === state.calendarSequence && !state.disposed) {
        refs.calendar.removeAttribute("aria-busy");
        updateControls();
      }
    }
  }

  function renderSlots() {
    const fragment = document.createDocumentFragment();
    for (const slot of state.slots) {
      const button = element(
        "button",
        `slot-button${slot.time === state.time ? " is-selected" : ""}`,
        slot.label || slot.time,
      );
      button.type = "button";
      button.dataset.time = slot.time;
      button.dataset.available = String(Boolean(slot.available));
      button.setAttribute("aria-pressed", String(slot.time === state.time));
      button.setAttribute(
        "aria-label",
        `${slot.label || slot.time}${slot.available ? ", available" : `, unavailable${slot.reason ? `: ${slot.reason}` : ""}`}`,
      );
      if (slot.reason) button.title = slot.reason;
      button.style.minHeight = "44px";
      listen(button, "click", () => {
        if (state.submitting || state.completed || !slot.available) return;
        state.time = slot.time;
        for (const timeButton of refs.slots.querySelectorAll("button")) {
          const selected = timeButton.dataset.time === state.time;
          timeButton.classList.toggle("is-selected", selected);
          timeButton.setAttribute("aria-pressed", String(selected));
        }
        setStatus(refs.formStatus, "");
        updateSummary();
      });
      fragment.append(button);
    }
    refs.slots.replaceChildren(fragment);
    updateControls();
  }

  async function loadSlots() {
    if (!state.date) return;
    slotsController?.abort();
    const controller = new AbortController();
    slotsController = controller;
    const sequence = ++state.slotsSequence;
    const serviceId = state.serviceId;
    const date = state.date;
    state.slotsLoading = true;
    refs.slots.setAttribute("aria-busy", "true");
    setStatus(refs.slotsStatus, "Checking appointment times…");
    updateControls();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const query = new URLSearchParams({ serviceId, date });
      const response = await fetch(`/api/availability/slots?${query}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const result = await readResponse(response);
      if (
        state.disposed ||
        sequence !== state.slotsSequence ||
        serviceId !== state.serviceId ||
        date !== state.date
      )
        return;
      if (!response.ok || !Array.isArray(result?.slots))
        throw new Error("Times could not be loaded.");
      state.slots = result.slots;
      state.slotsLoading = false;
      if (
        !state.slots.some((slot) => slot.time === state.time && slot.available)
      )
        state.time = "";
      renderSlots();
      updateSummary();
      const count = state.slots.filter((slot) => slot.available).length;
      setStatus(
        refs.slotsStatus,
        count
          ? `${count} ${count === 1 ? "time is" : "times are"} available. Choose the one that suits you.`
          : result.unavailableReason ||
              "No times are available on this date. Please choose another date.",
      );
    } catch {
      if (
        state.disposed ||
        sequence !== state.slotsSequence ||
        serviceId !== state.serviceId ||
        date !== state.date
      )
        return;
      state.slotsLoading = false;
      retryStatus(
        refs.slotsStatus,
        "We couldn’t load appointment times. Your details have been kept. Please try again.",
        loadSlots,
      );
    } finally {
      window.clearTimeout(timeout);
      if (sequence === state.slotsSequence && !state.disposed) {
        refs.slots.removeAttribute("aria-busy");
        updateControls();
      }
    }
  }

  function chooseDate(date) {
    if (state.submitting || state.completed || state.calendarLoading) return;
    if (
      !state.days.some(
        (day) =>
          day.date === date &&
          !day.isUnavailable &&
          Number(day.availableCount) > 0,
      )
    )
      return;
    state.date = date;
    state.time = "";
    state.slots = [];
    refs.slots.replaceChildren();
    refs.selectedDate.textContent = dayFormatter.format(dateObject(date));
    setStatus(refs.formStatus, "");
    for (const button of refs.calendar.querySelectorAll("button")) {
      const selected = button.dataset.date === date;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    updateSummary();
    void loadSlots();
  }

  function clearFieldErrors() {
    for (const [input, error] of Object.values(fields)) {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      error.textContent = "";
    }
  }

  function showFieldError(name, message) {
    if (!fields[name]) return;
    const [input, error] = fields[name];
    input.setCustomValidity(message);
    input.setAttribute("aria-invalid", "true");
    error.textContent = message;
  }

  function showSuccess(booking) {
    state.completed = true;
    updateControls();
    updateSummary();
    refs.form.hidden = true;
    refs.form.reset();
    refs.formStatus.dataset.status = "success";
    const heading = element("h3", "", "Your request has been received.");
    const message = element(
      "p",
      "",
      "Your appointment is awaiting confirmation. Louise will email you to confirm the details.",
    );
    const reference = element("p");
    reference.append(
      element("strong", "", `Your reference: ${booking.bookingReference}`),
    );
    const appointment = element(
      "p",
      "",
      `${booking.serviceName || selectedService()?.name} · ${dayFormatter.format(dateObject(state.date))} · ${state.time}`,
    );
    const reminder = element(
      "p",
      "",
      "Please keep your reference. You do not need to submit another request for this appointment.",
    );
    refs.formStatus.replaceChildren(
      heading,
      message,
      reference,
      appointment,
      reminder,
    );
    refs.formStatus.focus({ preventScroll: true });
    refs.formStatus.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (state.submitting || state.completed || state.disposed) return;
    clearFieldErrors();
    fields.fullName[0].value = fields.fullName[0].value.trim();
    fields.email[0].value = fields.email[0].value.trim();
    fields.phone[0].value = fields.phone[0].value.trim();
    if (fields.fullName[0].value.length < 2)
      showFieldError("fullName", "Please enter your full name.");
    if (!/^[+\d()\-\s]{7,20}$/.test(fields.phone[0].value))
      showFieldError(
        "phone",
        "Please enter a valid contact number, including a country code if needed.",
      );
    if (!refs.form.reportValidity()) return;
    if (
      !state.date ||
      !state.time ||
      state.slotsLoading ||
      !state.slots.some((slot) => slot.time === state.time && slot.available)
    ) {
      setStatus(
        refs.formStatus,
        "Please choose an available date and time before requesting your appointment.",
        "error",
      );
      const firstChoice = (
        !state.date ? refs.calendar : refs.slots
      ).querySelector("button:not(:disabled)");
      (firstChoice || refs.service).focus();
      return;
    }
    const data = new FormData(refs.form);
    const payload = {
      fullName: String(data.get("fullName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      serviceId: state.serviceId,
      date: state.date,
      time: state.time,
      notes: String(data.get("notes") || "").trim(),
      preferredContactMethod: "email",
      consentAccepted: data.get("consentAccepted") === "on",
      website: String(data.get("website") || ""),
    };
    state.submitting = true;
    updateControls();
    setStatus(refs.formStatus, "Sending your appointment request…");
    refs.form.setAttribute("aria-busy", "true");
    // Do not automatically retry a POST: a lost response may still mean the request was saved.
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await readResponse(response);
      if (state.disposed) return;
      if (response.status === 201 && result?.booking?.bookingReference) {
        showSuccess(result.booking);
        return;
      }
      if (response.status === 422 && result?.fieldErrors) {
        for (const [name, message] of Object.entries(result.fieldErrors))
          showFieldError(name, String(message));
        setStatus(
          refs.formStatus,
          "Please check the highlighted details and try again. Your other details have been kept.",
          "error",
        );
      } else if (response.status === 409) {
        state.time = "";
        state.slots = [];
        refs.slots.replaceChildren();
        updateSummary();
        setStatus(
          refs.formStatus,
          "That time has just become unavailable. Please choose another time. Your contact details have been kept.",
          "error",
        );
        void loadSlots();
        void loadCalendar();
      } else if (response.status >= 400 && response.status < 500) {
        setStatus(
          refs.formStatus,
          result?.error ||
            "Please check your appointment details and try again. Your details have been kept.",
          "error",
        );
      } else {
        throw new Error("Booking response was not confirmed.");
      }
    } catch {
      if (state.disposed) return;
      setStatus(
        refs.formStatus,
        "We couldn’t confirm whether your request was received. Your details are still here. Please contact Louise before submitting again so that the same appointment is not requested twice.",
        "error",
      );
    } finally {
      window.clearTimeout(timeout);
      state.submitting = false;
      if (!state.disposed) {
        refs.form.removeAttribute("aria-busy");
        updateControls();
        const invalid = refs.form.querySelector('[aria-invalid="true"]');
        if (invalid && !state.completed) invalid.focus();
      }
    }
  }

  listen(refs.service, "change", () => {
    state.serviceId = refs.service.value;
    resetSlots();
    updateDescription();
    setStatus(refs.formStatus, "");
    void loadCalendar();
  });
  listen(refs.previous, "click", () => {
    if (state.month <= firstMonth || state.submitting || state.completed)
      return;
    state.month = nextMonth(state.month, -1);
    resetSlots();
    setStatus(refs.formStatus, "");
    void loadCalendar();
  });
  listen(refs.next, "click", () => {
    if (state.month >= lastMonth || state.submitting || state.completed) return;
    state.month = nextMonth(state.month, 1);
    resetSlots();
    setStatus(refs.formStatus, "");
    void loadCalendar();
  });
  for (const [name, [input, error]] of Object.entries(fields)) {
    listen(input, name === "consentAccepted" ? "change" : "input", () => {
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      error.textContent = "";
    });
  }
  listen(refs.form, "submit", submitBooking);
  updateDescription();
  updateSummary();
  await loadCalendar();
  return dispose;
}
