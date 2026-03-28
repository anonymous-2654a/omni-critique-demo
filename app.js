const caseList = document.getElementById("caseList");
const caseTemplate = document.getElementById("caseTemplate");
const tabBar = document.getElementById("tabBar");
const subFilters = document.getElementById("subFilters");
const warningBanner = document.getElementById("warningBanner");
const warningClose = document.getElementById("warningClose");

let allCases = [];
let activeTab = "text";
let labelFilter = "all";

if (warningClose && warningBanner) {
  warningClose.addEventListener("click", () => {
    warningBanner.classList.add("hidden");
  });
}

if (tabBar) {
  tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    tabBar.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
}

if (subFilters) {
  subFilters.addEventListener("click", (e) => {
    const pill = e.target.closest(".filter-pill");
    if (!pill) return;
    const value = pill.dataset.value;
    if (pill.classList.contains("active")) {
      pill.classList.remove("active");
      labelFilter = "all";
    } else {
      subFilters.querySelectorAll(".filter-pill")
        .forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      labelFilter = value;
    }
    render();
  });
}

/* ---- Parse input into conversation parts ---- */
function parseInput(raw) {
  if (!raw) return { userMsg: "", agentMsg: "", systemNote: "" };

  const userMatch = raw.match(/\nUser:\s*([\s\S]*?)(?:\nAgent:|$)/i);
  const agentMatch = raw.match(/\nAgent:\s*([\s\S]*?)$/i);

  if (userMatch) {
    const userMsg = userMatch[1].trim();
    let agentMsg = agentMatch ? agentMatch[1].trim() : "";
    if (agentMsg === "None" || agentMsg === "none") agentMsg = "";
    return { userMsg, agentMsg, systemNote: "" };
  }

  const mediaRef = raw.match(/(Image|Video|Audio):\s*(.+)/i);
  if (mediaRef) {
    return { userMsg: "", agentMsg: "", systemNote: `[${mediaRef[1]}: ${mediaRef[2].trim()}]` };
  }

  return { userMsg: raw, agentMsg: "", systemNote: "" };
}

/* ---- Extract only the assessment text from critique ---- */
function parseAssessmentText(raw) {
  if (!raw) return "";
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*-?\s*Assessment:/i.test(lines[i]) && !/Safety\s+Assessment:/i.test(lines[i])) {
      const firstLine = lines[i].replace(/^\s*-?\s*Assessment:\s*/i, "");
      return [firstLine, ...lines.slice(i + 1)].join("\n").trim();
    }
  }
  return raw;
}

/* LlavaGuard-style "O1: …" codes — strip for display; split on ; only so "Hate, Humiliation, Harassment" stays one tag */
function splitCategoryDisplay(raw) {
  const s = String(raw || "")
    .replace(/\bO\s*\d+\s*:\s*/gi, "")
    .trim();
  if (!s) return [];
  const bySemi = s.split(";").map((x) => x.trim()).filter(Boolean);
  if (bySemi.length > 1) return bySemi.filter((x) => x.length < 200);
  const only = bySemi[0];
  if (/^[\w_]+(,[\w_]+)+$/i.test(only.replace(/\s/g, ""))) {
    return only.split(",").map((x) => x.trim()).filter((x) => x && x.length < 120);
  }
  return [only].filter((x) => x.length < 200);
}

function createMediaElement(item) {
  if (!item.mediaRelPath) return null;
  if (item.modality === "image") {
    const img = document.createElement("img");
    img.src = item.mediaRelPath;
    img.alt = "case image";
    img.loading = "lazy";
    return img;
  }
  if (item.modality === "video") {
    const video = document.createElement("video");
    video.src = item.mediaRelPath;
    video.controls = true;
    video.preload = "metadata";
    return video;
  }
  if (item.modality === "audio") {
    const audio = document.createElement("audio");
    audio.src = item.mediaRelPath;
    audio.controls = true;
    return audio;
  }
  return null;
}

const userSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const agentSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/></svg>';

function buildConversation(item) {
  const wrap = document.createElement("div");
  const { userMsg, agentMsg, systemNote } = parseInput(item.input);

  if (systemNote && !userMsg) {
    const note = document.createElement("div");
    note.className = "conv-note";
    note.textContent = systemNote;
    wrap.appendChild(note);
    return wrap;
  }

  if (item.input && !userMsg && !systemNote) {
    const bubble = document.createElement("div");
    bubble.className = "conv-row conv-user";
    bubble.innerHTML = `<span class="conv-avatar conv-avatar-user">${userSvg}</span>`;
    const body = document.createElement("div");
    body.className = "conv-body";
    const label = document.createElement("span");
    label.className = "conv-role";
    label.textContent = "User Prompt";
    body.appendChild(label);
    const text = document.createElement("div");
    text.className = "conv-text";
    text.textContent = item.input;
    body.appendChild(text);
    bubble.appendChild(body);
    wrap.appendChild(bubble);
    return wrap;
  }

  if (userMsg) {
    const row = document.createElement("div");
    row.className = "conv-row conv-user";
    row.innerHTML = `<span class="conv-avatar conv-avatar-user">${userSvg}</span>`;
    const body = document.createElement("div");
    body.className = "conv-body";
    const label = document.createElement("span");
    label.className = "conv-role";
    label.textContent = "User";
    body.appendChild(label);
    const text = document.createElement("div");
    text.className = "conv-text";
    text.textContent = userMsg;
    body.appendChild(text);
    wrap.appendChild(row);
    row.appendChild(body);
  }

  if (agentMsg) {
    const row = document.createElement("div");
    row.className = "conv-row conv-agent";
    row.innerHTML = `<span class="conv-avatar conv-avatar-agent">${agentSvg}</span>`;
    const body = document.createElement("div");
    body.className = "conv-body";
    const label = document.createElement("span");
    label.className = "conv-role";
    label.textContent = "Agent Response";
    body.appendChild(label);
    const text = document.createElement("div");
    text.className = "conv-text";
    text.textContent = agentMsg;
    body.appendChild(text);
    row.appendChild(body);
    wrap.appendChild(row);
  }

  return wrap;
}

/* ---- Render a single card ---- */
function renderCard(item) {
  const frag = caseTemplate.content.cloneNode(true);

  frag.querySelector(".js-modality").textContent = item.modality;

  const predEl = frag.querySelector(".js-pred");
  predEl.textContent = `Pred: ${item.labelPred || "\u2014"}`;
  predEl.classList.add(item.labelPred === "safe" ? "pill-safe" : "pill-unsafe");

  const gtEl = frag.querySelector(".js-gt");
  gtEl.textContent = `GT: ${item.labelGt || "\u2014"}`;
  gtEl.classList.add(item.labelGt === "safe" ? "pill-safe" : "pill-unsafe");

  const failureEl = frag.querySelector(".js-failure");
  if (item.isFailure) {
    failureEl.textContent = `Failure: ${item.failureType || "yes"}`;
  } else {
    failureEl.style.display = "none";
  }

  const rawSource = (item.source || item.dataset || "");
  const shortSource = rawSource
    .replace(/_benign$/i, "")
    .replace(/[_-]?(text|image|video|audio|harmful)$/gi, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  const sourceEl = frag.querySelector(".js-source");
  if (shortSource) {
    sourceEl.textContent = shortSource;
  } else {
    sourceEl.style.display = "none";
  }

  const convWrap = frag.querySelector(".js-conversation");
  convWrap.appendChild(buildConversation(item));

  const mediaWrap = frag.querySelector(".js-media");
  const media = createMediaElement(item);
  if (media) {
    mediaWrap.appendChild(media);
  } else {
    mediaWrap.style.display = "none";
  }

  const verdictEl = frag.querySelector(".js-verdict-pill");
  if (item.labelPred) {
    const pill = document.createElement("span");
    pill.className = `pill ${item.labelPred === "safe" ? "pill-safe" : "pill-unsafe"}`;
    pill.textContent = item.labelPred === "safe" ? "Safe" : "Unsafe";
    verdictEl.appendChild(pill);
  }

  const cats = splitCategoryDisplay(item.categories || "");
  const catsRow = frag.querySelector(".js-og-cats");
  const catsWrap = frag.querySelector(".js-omniguard-cats");
  if (cats.length > 0) {
    cats.forEach((cat) => {
      const tag = document.createElement("span");
      tag.className = "cat-tag";
      tag.textContent = cat;
      catsWrap.appendChild(tag);
    });
  } else {
    catsRow.style.display = "none";
  }

  const reasoning = frag.querySelector(".js-omniguard-reasoning");
  reasoning.textContent = parseAssessmentText(item.critique) || "\u2014";

  return frag;
}

function matchesFilters(item) {
  if (activeTab === "failure") {
    if (!item.isFailure) return false;
  } else {
    if (item.isFailure) return false;
    if (item.modality !== activeTab) return false;
  }
  if (labelFilter !== "all" && item.labelPred !== labelFilter) return false;
  return true;
}

function render() {
  caseList.innerHTML = "";
  const filtered = allCases.filter(matchesFilters);
  if (filtered.length === 0) {
    caseList.innerHTML = '<p class="empty-msg">No cases match the current filter.</p>';
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.forEach((item) => fragment.appendChild(renderCard(item)));
  caseList.appendChild(fragment);
}

function updateBadges() {
  const counts = { text: 0, image: 0, video: 0, audio: 0, failure: 0 };
  allCases.forEach((c) => {
    if (c.isFailure) {
      counts.failure++;
      return;
    }
    if (counts[c.modality] !== undefined) counts[c.modality]++;
  });
  document.getElementById("badgeText").textContent = counts.text;
  document.getElementById("badgeImage").textContent = counts.image;
  document.getElementById("badgeVideo").textContent = counts.video;
  document.getElementById("badgeAudio").textContent = counts.audio;
  document.getElementById("badgeFailure").textContent = counts.failure;
}

function init() {
  if (Array.isArray(window.__CASES__) && window.__CASES__.length > 0) {
    allCases = window.__CASES__;
  } else {
    caseList.innerHTML = '<p class="empty-msg">No data. Run prepare_cases.py to generate data.js</p>';
    return;
  }
  updateBadges();
  render();
}

init();
