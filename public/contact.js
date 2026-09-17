const form = document.querySelector("#enquiryForm");
const fields = document.querySelector("#enquiryFields");
const button = document.querySelector("#enquirySubmit");
const status = document.querySelector("#enquiryStatus");
const topic = document.querySelector("#enquiryTopic");
const message = document.querySelector("#enquiryMessage");
const fieldIds = {
  fullName: "enquiryName",
  email: "enquiryEmail",
  topic: "enquiryTopic",
  message: "enquiryMessage",
  consentAccepted: "enquiryConsent",
};
let sending = false;
let uncertain = false;
let requestId;
let previousPayload;

function setStatus(text, kind = "", focus = false) {
  status.textContent = text;
  status.dataset.status = kind;
  if (focus) status.focus({ preventScroll: true });
}

function clearErrors() {
  Object.values(fieldIds).forEach((id) => {
    const field = document.getElementById(id);
    field.setCustomValidity("");
    field.removeAttribute("aria-invalid");
    document.getElementById(`${id}Error`).textContent = "";
  });
}

function showErrors(errors = {}) {
  let first;
  for (const [key, text] of Object.entries(errors)) {
    const id = fieldIds[key];
    if (!id) continue;
    const field = document.getElementById(id);
    field.setCustomValidity(text);
    field.setAttribute("aria-invalid", "true");
    document.getElementById(`${id}Error`).textContent = text;
    first ||= field;
  }
  first?.focus();
}

form.addEventListener("input", clearErrors);

const params = new URLSearchParams(location.search);
if ([...topic.options].some((option) => option.value === params.get("topic"))) {
  topic.value = params.get("topic");
}
const edition = params.get("edition");
if (topic.value === "book" && ["paperback", "hardback", "ebook"].includes(edition)) {
  message.value = `I’d like to ask about the ${edition} edition of Deeply OK. `;
}

async function prepareForm() {
  try {
    const response = await fetch("/api/contact", {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || data.ready !== true) throw new Error("Not ready");
    fields.disabled = false;
    setStatus("");
  } catch {
    setStatus("The form is temporarily unavailable. Please email Louise at soultosolebylouise@gmail.com.", "error");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "text-link enquiry-retry";
    retry.textContent = "Try loading the form again";
    retry.addEventListener("click", () => {
      setStatus("Getting the form ready…");
      prepareForm();
    });
    status.append(document.createElement("br"), retry);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending || uncertain) return;
  clearErrors();
  for (const name of ["fullName", "email", "message"]) {
    form.elements[name].value = form.elements[name].value.trim();
  }
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const payload = {
    fullName: data.get("fullName"),
    email: data.get("email"),
    topic: data.get("topic"),
    message: data.get("message"),
    consentAccepted: data.get("consentAccepted") === "on",
    website: data.get("website") || "",
  };
  const serialized = JSON.stringify(payload);
  if (previousPayload !== serialized) {
    requestId = crypto.randomUUID();
    previousPayload = serialized;
  }
  sending = true;
  fields.disabled = true;
  form.setAttribute("aria-busy", "true");
  button.textContent = "Sending your enquiry…";
  setStatus("Sending your enquiry…");
  let completed = false;
  try {
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...payload, requestId }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true || result.status !== "accepted") {
      uncertain = result.deliveryUnknown === true;
      fields.disabled = false;
      setStatus(
        uncertain
          ? "We couldn’t confirm whether your message was received. Your details are still here. Please email Louise before sending it again, so she doesn’t receive it twice."
          : result.error || "Your enquiry could not be sent. Your details are still here. Please try again or email Louise directly.",
        "error",
        true,
      );
      showErrors(result.fieldErrors);
      return;
    }
    completed = true;
    form.hidden = true;
    document.querySelector(".enquiry-required").hidden = true;
    status.replaceChildren();
    status.dataset.status = "success";
    const heading = document.createElement("h3");
    heading.textContent = "Thank you. Your enquiry has been sent.";
    const text = document.createElement("p");
    text.textContent = `Louise will reply to ${payload.email} by email when she’s available. There’s no need to send your message again.`;
    const home = document.createElement("a");
    home.href = "/";
    home.className = "text-link";
    home.textContent = "Back to Soul to Sole ↗";
    status.append(heading, text, home);
    status.focus({ preventScroll: true });
    status.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
  } catch {
    uncertain = true;
    setStatus("We couldn’t confirm whether your message was received. Your details are still here. Please email Louise before sending it again, so she doesn’t receive it twice.", "error", true);
  } finally {
    sending = false;
    form.removeAttribute("aria-busy");
    fields.disabled = completed;
    button.disabled = uncertain || completed;
    button.textContent = uncertain ? "Please email Louise to check" : "Send enquiry ↗";
  }
});

prepareForm();
