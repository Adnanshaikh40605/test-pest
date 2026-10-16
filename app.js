/* PestControl99 mobile booking.
   Prices come from GET /api/customer/catalog/ and the same matching rules
   as the website (catalogPricing.ts). Displayed total is GST-inclusive. */

const API_BASE = "https://api.vacationbna.site";
const PHONE_TEL = "+917710032627";
const WHATSAPP = "917710032627";

const PESTS = [
  { id: "cockroach-ants", label: "Cockroach & Ants", img: "assets/cockroach.jpg?v=4" },
  { id: "bedbugs", label: "Bed Bugs", img: "assets/bedbug.jpg?v=4" },
  { id: "termite", label: "Termite", img: "assets/termite.jpg?v=4" },
  { id: "rodent", label: "Rodent", img: "assets/rodent.jpg?v=4" },
  { id: "mosquito", label: "Mosquito", img: "assets/mosquito.jpg?v=4" },
  { id: "wood-borer", label: "Wood Borer", img: "assets/woodborer.jpg?v=4" },
];

const PEST_MATCH_KEYS = {
  "cockroach-ants": ["cockroach", "ant"],
  mosquito: ["mosquito"],
  termite: ["termite"],
  rodent: ["rodent", "rat"],
  bedbugs: ["bed bug", "bedbug", "bed bugs"],
  "wood-borer": ["wood borer", "woodborer", "borer"],
};

const PEST_PREFERRED_PACKAGES = {
  "cockroach-ants": {
    standard: ["Cockroach Standard", "Cockroach / Ants"],
    premium: ["Cockroach Premium", "Cockroach Standard", "Cockroach / Ants"],
  },
  rodent: {
    standard: ["Regular Rodent", "Rodent"],
    premium: ["Kill-Rodent System", "Regular Rodent", "Rodent"],
  },
  mosquito: {
    standard: ["Mosquito Cold Fogging", "Mosquito"],
    premium: ["Mosquito Thermal Fogging", "Mosquito Cold Fogging", "Mosquito"],
  },
  termite: {
    standard: ["Termite Spot Treatment", "Termite"],
    premium: ["Termite Spot Treatment", "Termite"],
  },
  bedbugs: { standard: ["Bed Bugs"], premium: ["Bed Bugs"] },
  "wood-borer": { standard: ["Wood Borer"], premium: ["Wood Borer"] },
};

const PEST_SERVICE_LABELS = {
  "cockroach-ants": "Cockroach Standard",
  mosquito: "Mosquito Control",
  termite: "Termite Control",
  rodent: "Rodent / Rat Control",
  bedbugs: "Bed Bug Control",
  "wood-borer": "Wood Borer",
};

const SIZE_LABEL = {
  "1rk": "1 RK",
  "1bhk": "1 BHK",
  "2bhk": "2 BHK",
  "3bhk": "3 BHK",
  "4bhk": "4 BHK",
};

const BENEFITS = {
  standard: {
    title: "Standard Treatment",
    bullets: [
      "Strong chemical spray with standard gel treatment.",
      "Kitchen utensils and food items must be removed before treatment.",
      "Our technician can assist with utensil removal for an additional charge of ₹300.",
      "Keep children and pets away from the treated area.",
      "Do not use the treated area for at least 3 hours after treatment.",
    ],
  },
  premium: {
    title: "Premium Treatment — Recommended",
    bullets: [
      "Advanced premium gel treatment for complete-home cockroach control.",
      "Premium gel remains active and continuously targets hidden cockroaches.",
      "No need to remove kitchen utensils for gel-only treatment.",
      "Odourless spray is available with premium gel if spray treatment is required.",
      "Cockroach monitoring pads are provided wherever necessary.",
      "Ideal when you want less preparation and longer protection.",
    ],
    why: "Choose Premium for hassle-free service, no utensil removal, and long-lasting cockroach control.",
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NON_HOME = new Set(["addon", "society", "hotel", "hospital", "corporate", "commercial", "chain"]);

const state = {
  category: "residential",
  pest: "cockroach-ants",
  property: "flat",
  size: "1bhk",
  treatment: "standard",
  plan: "one-time",
  rates: [],
  catalogReady: false,
  quote: null,
  lat: null,
  lng: null,
  otpMobile: "",
  resendAt: 0,
  busy: false,
};

const $ = (sel) => document.querySelector(sel);
const statusLine = $("#statusLine");
const statusText = $("#statusText");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function packageTokenMatches(keys, servicePackage) {
  const pkg = servicePackage || "";
  return keys.some((key) => {
    const k = key.trim().toLowerCase();
    if (!k) return false;
    const escaped = escapeRegExp(k).replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(pkg);
  });
}

function isHomeExcludedRate(rate) {
  const cat = (rate.property_category || "").toLowerCase().trim();
  if (NON_HOME.has(cat)) return true;
  const pkg = (rate.service_package || "").toLowerCase();
  if (pkg.includes("integrated ipm")) return true;
  if (pkg.includes("fly catcher")) return true;
  if (pkg.includes("add-on") || pkg.includes("addon")) return true;
  if (/\bsociety\b/.test(pkg)) return true;
  if (pkg.includes("servicing") && pkg.includes("fly")) return true;
  return false;
}

function planMatches(rate, isAmc) {
  const amc = (rate.plan_type || "").toLowerCase().includes("amc");
  return isAmc ? amc : !amc;
}

function preferNamedPackages(pool, pestSlug, treatmentQuality) {
  const prefs = PEST_PREFERRED_PACKAGES[pestSlug];
  if (!prefs || pool.length === 0) return pool;
  const names = prefs[treatmentQuality === "premium" ? "premium" : "standard"] || prefs.standard;
  for (const name of names) {
    const hits = pool.filter((r) => (r.service_package || "").toLowerCase() === name.toLowerCase());
    if (hits.length) return hits;
  }
  return pool;
}

function matchRateForPest(rates, pestSlug, opts) {
  const keys = PEST_MATCH_KEYS[pestSlug];
  if (!keys || !rates.length) return null;
  const isHome = opts.premiseType !== "commercial";
  const area = (isHome ? SIZE_LABEL[opts.premiseSize] || "" : "Commercial").toLowerCase();
  let candidates = rates.filter((r) => packageTokenMatches(keys, r.service_package));
  if (!candidates.length) return null;
  if (isHome) {
    candidates = candidates.filter((r) => !isHomeExcludedRate(r));
    if (!candidates.length) return null;
  }
  const byPlan = candidates.filter((r) => planMatches(r, opts.isAmc));
  let pool = byPlan.length ? byPlan : candidates;
  if (opts.treatmentQuality) {
    const quality = opts.treatmentQuality.toLowerCase();
    const qualityHits = pool.filter((r) => (r.service_package || "").toLowerCase().includes(quality));
    if (qualityHits.length) pool = qualityHits;
    else if (quality === "standard") {
      const nonPremium = pool.filter((r) => !(r.service_package || "").toLowerCase().includes("premium"));
      if (nonPremium.length) pool = nonPremium;
    }
  }
  pool = preferNamedPackages(pool, pestSlug, opts.treatmentQuality);
  if (area) {
    const exact = pool.filter((r) => (r.area_key || "").toLowerCase() === area);
    if (exact.length) return exact[0];
    const soft = pool.filter((r) => {
      const key = (r.area_key || "").toLowerCase();
      return key.includes(area) || area.includes(key);
    });
    if (soft.length) return soft[0];
    if (isHome) return null;
  }
  return pool[0] || null;
}

function exclGstBaseAmount(rate) {
  if (!rate) return 0;
  const fromBase = Number.parseFloat(String(rate.base_amount ?? ""));
  if (Number.isFinite(fromBase) && fromBase > 0) return fromBase;
  const raw = Number.parseFloat(String(rate.amount ?? ""));
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (rate.price_includes_gst === true) {
    const pct = Number.parseFloat(String(rate.gst_percent ?? "18"));
    const divisor = 1 + (Number.isFinite(pct) && pct > 0 ? pct / 100 : 0.18);
    return Math.round((raw / divisor) * 100) / 100;
  }
  return raw;
}

function gstPercent(rate) {
  const pct = Number.parseFloat(String(rate?.gst_percent ?? "18"));
  return Number.isFinite(pct) && pct > 0 ? pct : 18;
}

function resolveTier(rate, treatmentQuality) {
  if (!rate) return { amount: 0, packageTier: treatmentQuality };
  const pkg = (rate.service_package || "").toLowerCase();
  const base = exclGstBaseAmount(rate);
  if (pkg.includes("premium") || pkg.includes("standard")) {
    return { amount: base, packageTier: "standard" };
  }
  if (treatmentQuality === "premium") {
    return { amount: Math.round(base * 1.15 * 100) / 100, packageTier: "premium" };
  }
  return { amount: base, packageTier: "standard" };
}

function inclusiveAmount(rate, treatmentQuality) {
  const resolved = resolveTier(rate, treatmentQuality);
  if (resolved.amount <= 0) return 0;
  const pkg = (rate.service_package || "").toLowerCase();
  if (pkg.includes("premium") || pkg.includes("standard")) {
    const total = Number.parseFloat(String(rate.total_with_gst ?? ""));
    if (Number.isFinite(total) && total > 0) return Math.round(total);
  }
  return Math.round(resolved.amount * (1 + gstPercent(rate) / 100));
}

function serviceTypeLabel(pest, rate, treatment) {
  const pkg = (rate?.service_package || "").trim();
  if (pkg) return pkg;
  if (pest === "cockroach-ants") return treatment === "premium" ? "Cockroach Premium" : "Cockroach Standard";
  return PEST_SERVICE_LABELS[pest] || pest;
}

function calculateQuote() {
  const isInspection = state.category === "commercial";
  const quality = state.treatment === "premium" ? "premium" : "standard";
  if (isInspection) {
    return {
      pending: true,
      inspection: true,
      offerExcl: 0,
      totalIncl: 0,
      gst: 18,
      rate: null,
      packageTier: quality,
      serviceLabel: serviceTypeLabel(state.pest, null, quality),
    };
  }
  const rate = matchRateForPest(state.rates, state.pest, {
    isAmc: state.plan === "amc",
    premiseType: "residential",
    premiseSize: state.size,
    treatmentQuality: quality,
  });
  const resolved = resolveTier(rate, quality);
  const pending = !rate || resolved.amount <= 0;
  return {
    pending,
    inspection: false,
    offerExcl: pending ? 0 : Math.round(resolved.amount),
    totalIncl: pending ? 0 : inclusiveAmount(rate, quality),
    gst: rate ? gstPercent(rate) : 18,
    rate: pending ? null : rate,
    packageTier: pending ? quality : resolved.packageTier,
    serviceLabel: serviceTypeLabel(state.pest, pending ? null : rate, quality),
  };
}

function inr(amount) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function setStatus(message, isError) {
  const show = Boolean(message) && message !== "Next: verify your number with WhatsApp OTP";
  statusLine.hidden = !show;
  statusText.textContent = show ? message : "";
  statusLine.classList.toggle("is-error", Boolean(isError) && show);
}

function renderPests() {
  const grid = $("#pestGrid");
  grid.innerHTML = PESTS.map((pest) => {
    const on = pest.id === state.pest;
    return `<button type="button" class="pest-card${on ? " is-on" : ""}" data-group="pest" data-value="${pest.id}" role="radio" aria-checked="${on}">
      <span class="pest-photo"><img src="${pest.img}" alt=""></span>
      <span class="pest-name">${pest.label}</span>
      ${on ? '<i class="tick" aria-hidden="true"></i>' : ""}
    </button>`;
  }).join("");
}

function amcAllowed() {
  return state.pest === "cockroach-ants";
}

function syncPlanCopy() {
  const bedbugs = state.pest === "bedbugs";
  $("#oneTimeTitle").textContent = bedbugs ? "2-Service" : "One-Time";
  $("#oneTimeSub").textContent = bedbugs ? "2 visits · 15 days" : "Single service";
  const amcBtn = $("#amcBtn");
  const allowed = amcAllowed();
  amcBtn.classList.toggle("is-disabled", !allowed);
  amcBtn.disabled = !allowed;
  amcBtn.setAttribute("aria-disabled", String(!allowed));
  $("#amcSub").textContent = allowed ? "Annual plan" : "Not for this pest";
  if (!allowed && state.plan === "amc") {
    state.plan = "one-time";
    document.querySelectorAll('[data-group="plan"]').forEach((el) => {
      const on = el.dataset.value === "one-time";
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-checked", String(on));
      const tick = el.querySelector(".tick");
      if (on && !tick) {
        const mark = document.createElement("i");
        mark.className = "tick";
        mark.setAttribute("aria-hidden", "true");
        el.appendChild(mark);
      }
      if (!on && tick) tick.remove();
    });
  }
}

function renderPrice() {
  const quote = calculateQuote();
  state.quote = quote;
  const value = $("#priceValue");
  const note = $("#priceNote");
  const caption = $("#priceCaption");
  if (!state.catalogReady) {
    caption.textContent = "Total incl. GST";
    value.innerHTML = "…";
    note.textContent = "Loading rate chart";
    return;
  }
  if (quote.inspection) {
    caption.textContent = "Inspection visit";
    value.textContent = "Free visit";
    note.textContent = "Price confirmed on site";
    return;
  }
  if (quote.pending || quote.totalIncl <= 0) {
    caption.textContent = "Total incl. GST";
    value.textContent = "On request";
    note.textContent = "We will confirm the rate";
    return;
  }
  caption.textContent = "Total incl. GST";
  value.innerHTML = `${inr(quote.totalIncl)}<span class="star">*</span>`;
  note.textContent = "Illustrative price";
}

function selectGroup(group, value, el) {
  if (group === "plan" && value === "amc" && !amcAllowed()) {
    setStatus("AMC is available for Cockroach & Ants.", true);
    return;
  }
  state[group === "pest" ? "pest" : group] = value;
  if (group === "pest") renderPests();
  else if (el) {
    document.querySelectorAll(`[data-group="${group}"]`).forEach((node) => {
      const on = node.dataset.value === value;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-checked", String(on));
      const tick = node.querySelector(".tick");
      if (group === "treatment") return;
      if (on && !tick && group !== "size") {
        /* ticks are in the markup for these groups */
      }
      if (group === "size") {
        const label = node.dataset.value.replace("bhk", "BHK").replace("rk", "RK");
        node.textContent = label;
        if (on) {
          const mark = document.createElement("i");
          mark.className = "tick";
          mark.setAttribute("aria-hidden", "true");
          node.appendChild(mark);
        }
      } else if (group !== "treatment") {
        const existing = node.querySelector(".tick");
        if (on && !existing) {
          const mark = document.createElement("i");
          mark.className = "tick";
          mark.setAttribute("aria-hidden", "true");
          node.appendChild(mark);
        }
        if (!on && existing) existing.remove();
      }
    });
  }
  if (group === "pest" || group === "plan") syncPlanCopy();
  clearFieldErrors();
  setStatus("Next: verify your number with WhatsApp OTP", false);
  renderPrice();
}

function clearFieldErrors() {
  document.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}

function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function defaultSchedule(now = new Date()) {
  const target = new Date(now.getTime() + 60 * 60 * 1000);
  const rounded = Math.ceil(target.getMinutes() / 5) * 5;
  target.setMinutes(rounded, 0, 0);
  const hour24 = target.getHours();
  const minute = target.getMinutes();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return {
    date: todayISO(target),
    time: `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`,
  };
}

function displayTime(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
  if (!match) return value;
  return `${Number(match[1])}:${match[2]} ${match[3].toUpperCase()}`;
}

function toBookingTime24(value) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value || "");
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3].toUpperCase();
  if (period === "AM") hour = hour === 12 ? 0 : hour;
  else if (hour !== 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function fillTimes(selected) {
  const select = $("#prefTime");
  const options = [];
  for (let mins = 8 * 60; mins <= 20 * 60; mins += 15) {
    const hour24 = Math.floor(mins / 60);
    const minute = mins % 60;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    const stored = `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
    options.push(stored);
  }
  if (selected && !options.includes(selected)) options.push(selected);
  options.sort((a, b) => toBookingTime24(a).localeCompare(toBookingTime24(b)));
  select.innerHTML = options
    .map((value) => `<option value="${value}">${displayTime(value)}</option>`)
    .join("");
  select.value = selected;
}

function nameError(name) {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required";
  if (/\d/.test(trimmed) || !/^[\p{L}\s]+$/u.test(trimmed)) return "Name can only contain letters and spaces";
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  return "";
}

function sanitizeName(raw) {
  return String(raw || "")
    .replace(/[0-9]/g, "")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s{2,}/g, " ");
}

function cityFromAddress(address) {
  const lower = address.toLowerCase();
  if (lower.includes("lonavala")) return "Lonavala";
  if (lower.includes("khandala")) return "Khandala";
  if (lower.includes("karjat")) return "Karjat";
  if (lower.includes("navi mumbai")) return "Navi Mumbai";
  if (lower.includes("mumbai") || lower.includes("bombay")) return "Mumbai";
  if (lower.includes("pune")) return "Pune";
  if (lower.includes("thane")) return "Thane";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "Mumbai";
}

function validateForm() {
  clearFieldErrors();
  const address = $("#address").value.trim();
  const date = $("#prefDate").value;
  const time = $("#prefTime").value;
  const name = $("#fullName").value.trim();
  const phone = $("#mobile").value.replace(/\D/g, "");
  if (address.length < 5) {
    $("#address").closest(".field").classList.add("is-invalid");
    return "Enter the area, building and full address.";
  }
  if (!date) return "Select a preferred date.";
  if (date < todayISO()) return "Preferred date cannot be in the past.";
  if (!toBookingTime24(time)) return "Select a preferred time.";
  const nameErr = nameError(name);
  if (nameErr) {
    $("#fullName").closest(".field").classList.add("is-invalid");
    return nameErr;
  }
  if (phone.length !== 10) {
    $("#mobile").closest(".field").classList.add("is-invalid");
    return "Mobile number must be exactly 10 digits.";
  }
  return "";
}

function sessionId() {
  const key = "pest99_booking_session_id";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const next = crypto.randomUUID();
    sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `sess-${Date.now()}`;
  }
}

function inquiryId() {
  const raw = sessionStorage.getItem("pest99_booking_inquiry_id");
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function setInquiryId(id) {
  if (id) sessionStorage.setItem("pest99_booking_inquiry_id", String(id));
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function errorText(result, fallback) {
  if (result.errors && typeof result.errors === "object") {
    const first = Object.values(result.errors)[0];
    if (Array.isArray(first) && first[0]) return String(first[0]);
    if (typeof first === "string") return first;
  }
  return result.message || result.detail || result.error || fallback;
}

async function loadCatalog() {
  try {
    const response = await fetch(`${API_BASE}/api/customer/catalog/?city=Mumbai`, {
      headers: { Accept: "application/json" },
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(errorText(data, "Could not load prices"));
    state.rates = Array.isArray(data.results) ? data.results : [];
    state.catalogReady = true;
  } catch (err) {
    state.catalogReady = true;
    state.rates = [];
    setStatus(err.message || "Live prices are unavailable. You can still send the booking.", true);
  }
  renderPrice();
}

function openSheet(id) {
  const sheet = document.getElementById(id);
  sheet.hidden = false;
}

function closeSheet(id) {
  document.getElementById(id).hidden = true;
}

function showBenefits(key) {
  const detail = BENEFITS[key];
  $("#benefitsTitle").textContent = detail.title;
  $("#benefitsList").innerHTML = detail.bullets.map((item) => `<li>${item}</li>`).join("");
  const why = $("#benefitsWhy");
  why.hidden = !detail.why;
  why.textContent = detail.why || "";
  openSheet("benefitsSheet");
}

function showGstInfo() {
  const quote = state.quote;
  let body;
  if (!quote || quote.inspection) {
    body = "Commercial bookings are scheduled as an inspection visit. The final price, including GST, is confirmed after the site is checked. There is no charge for the inspection visit itself.";
  } else if (quote.pending) {
    body = "This selection is not on the published rate chart, so the total is confirmed by the team before the visit. GST is added on the agreed service amount.";
  } else {
    const home = state.property === "villa" ? "Villa" : "Flat";
    body = `${serviceLabel()} for a ${home}, ${SIZE_LABEL[state.size]}, ${state.treatment} treatment, ${state.plan === "amc" ? "AMC" : "one-time"} plan. Catalog price excluding GST is ${inr(quote.offerExcl)}. GST at ${quote.gst}% brings the total to ${inr(quote.totalIncl)}. Villa and flat use the same home-size rate. The figure is illustrative until the booking is confirmed.`;
  }
  $("#gstBody").textContent = body;
  openSheet("gstSheet");
}

function pestLabel() {
  return PESTS.find((pest) => pest.id === state.pest)?.label || state.pest;
}

function serviceLabel() {
  return state.quote?.serviceLabel || pestLabel();
}

function planNotes() {
  if (state.plan === "amc") return "AMC · 3 visits";
  if (state.pest === "bedbugs") return "2-Service Package";
  return "One-Time";
}

async function sendOtp() {
  const name = sanitizeName($("#fullName").value).trim();
  const mobile = $("#mobile").value.replace(/\D/g, "");
  const response = await fetch(`${API_BASE}/api/customer/otp/send/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ mobile, purpose: "website_booking", full_name: name }),
  });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(errorText(data, "Failed to send OTP"));
    error.retryAfter = data.retry_after;
    throw error;
  }
  return data;
}

async function verifyOtp(mobile, otp) {
  const response = await fetch(`${API_BASE}/api/customer/otp/verify/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ mobile, otp, purpose: "website_booking" }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.otp_verification_token) {
    throw new Error(errorText(data, "Invalid OTP"));
  }
  return data;
}

function bookingPayload(token) {
  const quote = calculateQuote();
  const address = $("#address").value.trim();
  const preferredTime = $("#prefTime").value;
  const qualityLabel = state.treatment === "premium" ? "Premium" : "Standard";
  const propertyType = state.category === "commercial"
    ? "Commercial Space"
    : state.property === "villa"
      ? "Villa"
      : "Home / Flat";
  const bhk = state.category === "commercial" ? "Commercial" : SIZE_LABEL[state.size];
  const priceNote = quote.inspection || quote.pending
    ? "Inspection / on-request pricing"
    : `CRM ₹${quote.offerExcl} excl. GST · ₹${quote.totalIncl} incl. GST`;
  return {
    full_name: sanitizeName($("#fullName").value).trim(),
    mobile: $("#mobile").value.replace(/\D/g, ""),
    service_type: quote.serviceLabel,
    package_tier: quote.packageTier,
    property_type: propertyType,
    bhk_size: bhk,
    address,
    full_address: address,
    city: cityFromAddress(address),
    booking_type: state.plan === "amc" ? "amc" : "one_time",
    pricing_rate_id: quote.pending ? null : quote.rate.id,
    price_confirmation_pending: quote.pending,
    booking_date: $("#prefDate").value,
    booking_time: toBookingTime24(preferredTime),
    timezone: "Asia/Kolkata",
    time_slot: preferredTime,
    latitude: state.lat,
    longitude: state.lng,
    notes: `Website booking · ${state.category === "commercial" ? "Commercial" : "Home (Residential)"} · ${propertyType} · ${bhk} · ${qualityLabel} · ${planNotes()} · ${preferredTime} · ${priceNote}`,
    otp_verification_token: token,
    booking_session_id: sessionId(),
    inquiry_id: inquiryId(),
  };
}

async function createBooking(token) {
  const response = await fetch(`${API_BASE}/api/customer/website-bookings/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(bookingPayload(token)),
  });
  const data = await readJson(response);
  if (!response.ok) throw new Error(errorText(data, "Failed to create booking"));
  return data;
}

async function upsertInquiry() {
  const phone = $("#mobile").value.replace(/\D/g, "");
  const name = sanitizeName($("#fullName").value).trim();
  if (phone.length !== 10 || nameError(name)) return;
  const quote = state.quote;
  try {
    const response = await fetch(`${API_BASE}/api/inquiries/upsert/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name,
        mobile: phone,
        city: cityFromAddress($("#address").value.trim() || "Mumbai"),
        service_interest: serviceLabel(),
        message: `Website booking lead · ${pestLabel()} · ${state.category} · ${state.property} · ${SIZE_LABEL[state.size]}`,
        premise_type: state.category,
        premise_size: SIZE_LABEL[state.size],
        pest_problems: pestLabel(),
        estimated_price: quote && !quote.pending ? quote.offerExcl : undefined,
        is_inspection_required: Boolean(quote?.inspection || quote?.pending),
        service_frequency: state.plan === "amc" ? "amc" : "one_time",
        booking_session_id: sessionId(),
        page_url: location.href,
      }),
    });
    const data = await readJson(response);
    if (response.ok && data.id) setInquiryId(data.id);
  } catch {
    /* Booking must still proceed if the lead upsert fails. */
  }
}

let resendTimer = 0;
function startResendCountdown(seconds) {
  state.resendAt = Date.now() + seconds * 1000;
  const btn = $("#resendBtn");
  clearInterval(resendTimer);
  const tick = () => {
    const left = Math.ceil((state.resendAt - Date.now()) / 1000);
    if (left > 0) {
      btn.disabled = true;
      btn.textContent = `Resend OTP in ${left}s`;
    } else {
      btn.disabled = false;
      btn.textContent = "Resend OTP";
      clearInterval(resendTimer);
    }
  };
  tick();
  resendTimer = setInterval(tick, 400);
}

async function onConfirm() {
  const error = validateForm();
  if (error) {
    setStatus(error, true);
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const button = $("#confirmBtn");
  button.disabled = true;
  button.textContent = "Sending OTP…";
  try {
    await upsertInquiry();
    const sent = await sendOtp();
    state.otpMobile = sent.mobile || $("#mobile").value.replace(/\D/g, "");
    $("#otpLead").textContent = `OTP sent to +91 ${state.otpMobile} to confirm your booking.`;
    const dev = $("#devOtp");
    if (sent.dev_otp) {
      dev.hidden = false;
      dev.textContent = `Local DEBUG OTP: ${sent.dev_otp}`;
    } else {
      dev.hidden = true;
    }
    $("#otpInput").value = "";
    $("#otpError").hidden = true;
    openSheet("otpSheet");
    startResendCountdown(sent.resend_after > 0 ? sent.resend_after : 2);
    setTimeout(() => $("#otpInput").focus(), 60);
    setStatus("Next: verify your number with WhatsApp OTP", false);
  } catch (err) {
    setStatus(err.message || "Could not send the WhatsApp OTP.", true);
    if (err.retryAfter) startResendCountdown(err.retryAfter);
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = "Confirm Booking →";
  }
}

async function onVerify() {
  const otp = $("#otpInput").value.replace(/\D/g, "");
  const errorEl = $("#otpError");
  if (otp.length !== 4) {
    errorEl.hidden = false;
    errorEl.textContent = "Enter the 4-digit OTP.";
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const button = $("#verifyBtn");
  button.disabled = true;
  button.textContent = "Confirming booking…";
  errorEl.hidden = true;
  try {
    const verified = await verifyOtp(state.otpMobile, otp);
    const created = await createBooking(verified.otp_verification_token);
    const booking = created.booking || {};
    closeSheet("otpSheet");
    const code = booking.code ? ` Reference ${booking.code}.` : "";
    const priceBit = booking.total_amount
      ? ` Total ${inr(Number(booking.total_amount))}.`
      : state.quote && !state.quote.pending
        ? ` Illustrative total ${inr(state.quote.totalIncl)} incl. GST.`
        : "";
    $("#doneBody").textContent = `${created.message || "Booking confirmed."}${code}${priceBit} Our team will reach you on WhatsApp.`;
    const text = encodeURIComponent(`Hello Pest Control 99, I just booked ${serviceLabel()} for ${$("#prefDate").value}.`);
    $("#doneWhatsApp").href = `https://wa.me/${WHATSAPP}?text=${text}`;
    openSheet("doneSheet");
    setStatus("Booking confirmed. Check WhatsApp for updates.", false);
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err.message || "Could not verify the OTP.";
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = "Verify & Confirm Booking";
  }
}

async function useLocation() {
  if (!navigator.geolocation) {
    setStatus("Location is not available in this browser.", true);
    return;
  }
  setStatus("Finding your address…", false);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    state.lat = pos.coords.latitude;
    state.lng = pos.coords.longitude;
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${state.lat}&longitude=${state.lng}&localityLanguage=en`,
      );
      const data = await readJson(response);
      const parts = [data.locality, data.city, data.principalSubdivision, data.postcode].filter(Boolean);
      if (parts.length) {
        $("#address").value = parts.join(", ");
        setStatus("Address filled from your location. Add the building if needed.", false);
      } else {
        setStatus("Location found. Please type the full address.", true);
      }
    } catch {
      setStatus("Location found. Please type the full address.", true);
    }
  }, () => setStatus("Allow location access, or type the address.", true), { enableHighAccuracy: false, timeout: 8000 });
}

function openInquiry() {
  $("#inqName").value = sanitizeName($("#fullName").value).trim();
  $("#inqPhone").value = $("#mobile").value.replace(/\D/g, "");
  const address = $("#address").value.trim();
  $("#inqMessage").value = `I need a quote for ${pestLabel()} (${state.category}, ${state.property}, ${SIZE_LABEL[state.size]}).${address ? ` Address: ${address}.` : ""}`;
  $("#inqError").hidden = true;
  openSheet("inquirySheet");
}

async function submitInquiry(event) {
  event.preventDefault();
  const name = sanitizeName($("#inqName").value).trim();
  const phone = $("#inqPhone").value.replace(/\D/g, "");
  const message = $("#inqMessage").value.trim();
  const errorEl = $("#inqError");
  const nameErr = nameError(name);
  if (nameErr || phone.length !== 10 || message.length < 10) {
    errorEl.hidden = false;
    errorEl.textContent = nameErr || (phone.length !== 10 ? "Mobile number must be exactly 10 digits." : "Message must be at least 10 characters.");
    return;
  }
  const button = $("#inqSubmit");
  button.disabled = true;
  button.textContent = "Sending…";
  try {
    const response = await fetch(`${API_BASE}/api/inquiries/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name,
        mobile: phone,
        city: cityFromAddress($("#address").value.trim() || "Mumbai"),
        service_interest: serviceLabel(),
        message,
        premise_type: state.category,
        premise_size: SIZE_LABEL[state.size],
        pest_problems: pestLabel(),
        booking_session_id: sessionId(),
        page_url: location.href,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) throw new Error(errorText(data, "Could not send the inquiry"));
    closeSheet("inquirySheet");
    setStatus("Inquiry sent. We will contact you shortly.", false);
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = err.message || "Could not send the inquiry.";
  } finally {
    button.disabled = false;
    button.textContent = "Send Inquiry";
  }
}

function bindChoices() {
  document.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-group]");
    if (!choice || choice.disabled) return;
    if (choice.dataset.group === "treatment") {
      selectGroup("treatment", choice.dataset.value, choice);
      document.querySelectorAll('[data-group="treatment"]').forEach((node) => {
        const on = node.dataset.value === state.treatment;
        node.classList.toggle("is-on", on);
        node.setAttribute("aria-checked", String(on));
        let tick = node.querySelector(".treat-head .tick");
        if (on && !tick) {
          tick = document.createElement("i");
          tick.className = "tick";
          tick.setAttribute("aria-hidden", "true");
          node.querySelector(".treat-head").appendChild(tick);
        }
        if (!on && tick) tick.remove();
      });
      return;
    }
    selectGroup(choice.dataset.group, choice.dataset.value, choice);
  });
  document.addEventListener("keydown", (event) => {
    const choice = event.target.closest('[data-group="treatment"]');
    if (!choice) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choice.click();
    }
  });
}

function initSchedule() {
  const schedule = defaultSchedule();
  const date = $("#prefDate");
  date.min = todayISO();
  date.value = schedule.date;
  $("#dateFace").textContent = formatDateLabel(schedule.date);
  date.addEventListener("change", () => {
    $("#dateFace").textContent = formatDateLabel(date.value);
  });
  fillTimes(schedule.time);
}

function initMenu() {
  const drawer = $("#menuDrawer");
  const open = (show) => {
    drawer.hidden = !show;
    $("#menuBtn").setAttribute("aria-expanded", String(show));
  };
  $("#menuBtn").addEventListener("click", () => open(true));
  $("#menuClose").addEventListener("click", () => open(false));
  $("#menuBackdrop").addEventListener("click", () => open(false));
  $("#menuInquiry").addEventListener("click", () => {
    open(false);
    openInquiry();
  });
}

function init() {
  renderPests();
  syncPlanCopy();
  initSchedule();
  renderPrice();
  bindChoices();
  initMenu();
  $("#confirmBtn").addEventListener("click", onConfirm);
  $("#verifyBtn").addEventListener("click", onVerify);
  $("#resendBtn").addEventListener("click", onConfirm);
  $("#otpClose").addEventListener("click", () => closeSheet("otpSheet"));
  $("#otpBackdrop").addEventListener("click", () => {
    if (!state.busy) closeSheet("otpSheet");
  });
  $("#otpInput").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
  });
  $("#mobile").addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 10);
  });
  $("#fullName").addEventListener("input", (event) => {
    const next = sanitizeName(event.target.value);
    if (next !== event.target.value) event.target.value = next;
  });
  $("#mobile").addEventListener("blur", () => {
    if ($("#mobile").value.replace(/\D/g, "").length === 10) upsertInquiry();
  });
  $("#locateBtn").addEventListener("click", useLocation);
  $("#gstInfoBtn").addEventListener("click", showGstInfo);
  $("#inquiryBtn").addEventListener("click", openInquiry);
  $("#inquiryForm").addEventListener("submit", submitInquiry);
  document.querySelectorAll("[data-benefits]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showBenefits(button.dataset.benefits);
    });
  });
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => closeSheet(button.dataset.close));
  });
  loadCatalog();
}

init();
