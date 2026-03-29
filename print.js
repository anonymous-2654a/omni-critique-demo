const root = document.getElementById("figureRoot");

const userSvg =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const agentSvg =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/></svg>';

function parseInput(raw) {
  if (!raw) return { userMsg: "", agentMsg: "", systemNote: "" };
  const userMatch = raw.match(/\nUser:\s*([\s\S]*?)(?:\nAgent:|$)/i);
  const agentMatch = raw.match(/\nAgent:\s*([\s\S]*?)$/i);
  if (userMatch) {
    let agentMsg = agentMatch ? agentMatch[1].trim() : "";
    if (agentMsg === "None" || agentMsg === "none") agentMsg = "";
    return { userMsg: userMatch[1].trim(), agentMsg, systemNote: "" };
  }
  const mediaRef = raw.match(/(Image|Video|Audio):\s*(.+)/i);
  if (mediaRef) {
    return { userMsg: "", agentMsg: "", systemNote: `[${mediaRef[1]}: ${mediaRef[2].trim()}]` };
  }
  return { userMsg: raw, agentMsg: "", systemNote: "" };
}

/** Text after the final "- Assessment:" line (excludes Safety Assessment / Categories headers). */
function parseAssessmentText(raw) {
  if (!raw) return "";
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*-?\s*Assessment:/i.test(lines[i]) && !/Safety\s+Assessment:/i.test(lines[i])) {
      const firstLine = lines[i].replace(/^\s*-?\s*Assessment:\s*/i, "");
      return [firstLine, ...lines.slice(i + 1)].join("\n").trim();
    }
  }
  return raw.trim();
}

/** Long benchmark instruction block — omit from PDF (caption + media suffice). */
function isStandardSafetyInstructionPrompt(text) {
  if (!text) return false;
  return /Based on our safety classification policy/i.test(text);
}

function appendTaskPromptIfSubstantive(body, modality, input) {
  if (!input || !input.trim()) return;
  if (modality === "text") return;
  if (isStandardSafetyInstructionPrompt(input)) return;
  const snip = document.createElement("div");
  snip.className = "task-prompt";
  snip.textContent = input.trim();
  body.appendChild(snip);
}

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

function buildConversation(item) {
  const wrap = document.createElement("div");
  wrap.className = "conversation";
  const { userMsg, agentMsg, systemNote } = parseInput(item.input);

  if (systemNote && !userMsg) {
    const note = document.createElement("div");
    note.className = "task-prompt";
    note.textContent = systemNote;
    wrap.appendChild(note);
    return wrap;
  }

  if (item.input && !userMsg && !systemNote) {
    const row = document.createElement("div");
    row.className = "conv-row conv-user";
    row.innerHTML = `<span class="conv-avatar conv-avatar-user">${userSvg}</span>`;
    const body = document.createElement("div");
    body.className = "conv-body";
    const label = document.createElement("span");
    label.className = "conv-role";
    label.textContent = "User prompt";
    body.appendChild(label);
    const text = document.createElement("div");
    text.className = "conv-text";
    text.textContent = item.input;
    body.appendChild(text);
    row.appendChild(body);
    wrap.appendChild(row);
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
    row.appendChild(body);
    wrap.appendChild(row);
  }

  if (agentMsg) {
    const row = document.createElement("div");
    row.className = "conv-row conv-agent";
    row.innerHTML = `<span class="conv-avatar conv-avatar-agent">${agentSvg}</span>`;
    const body = document.createElement("div");
    body.className = "conv-body";
    const label = document.createElement("span");
    label.className = "conv-role";
    label.textContent = "Agent";
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

const shieldSvg =
  '<svg class="omniguard-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

function makeGtPill(item) {
  const gtPill = document.createElement("span");
  const gtSafe = item.labelGt === "safe";
  gtPill.className = `pdf-gt pill ${gtSafe ? "pill-safe" : "pill-unsafe"}`;
  gtPill.textContent = gtSafe ? "Ground truth: safe" : "Ground truth: unsafe";
  return gtPill;
}

function renderOmniGuard(item) {
  const block = document.createElement("div");
  block.className = "omniguard-block pdf-og-block";

  const titleRow = document.createElement("div");
  titleRow.className = "omniguard-title";
  titleRow.innerHTML = `${shieldSvg}<span class="omniguard-title-text">OmniGuard Assessment</span>`;
  block.appendChild(titleRow);

  const table = document.createElement("div");
  table.className = "og-kv-table";

  const rowLabel = document.createElement("div");
  rowLabel.className = "og-kv-row";
  rowLabel.innerHTML = "<span class=\"og-kv-key\">Safety Label</span>";
  const valPred = document.createElement("span");
  valPred.className = "og-kv-val";
  const predPill = document.createElement("span");
  const predSafe = item.labelPred === "safe";
  predPill.className = `pill ${predSafe ? "pill-safe" : "pill-unsafe"}`;
  predPill.textContent = predSafe ? "Safe" : "Unsafe";
  valPred.appendChild(predPill);
  rowLabel.appendChild(valPred);
  table.appendChild(rowLabel);

  const cats = splitCategoryDisplay(item.categories || "");
  if (cats.length) {
    const rowC = document.createElement("div");
    rowC.className = "og-kv-row";
    rowC.innerHTML = "<span class=\"og-kv-key\">Categories</span>";
    const catsVal = document.createElement("div");
    catsVal.className = "og-kv-val og-cats-list";
    cats.forEach((cat) => {
      const tag = document.createElement("span");
      tag.className = "cat-tag";
      tag.textContent = cat;
      catsVal.appendChild(tag);
    });
    rowC.appendChild(catsVal);
    table.appendChild(rowC);
  }

  block.appendChild(table);

  const assessmentBody = parseAssessmentText(item.critique || "");
  if (assessmentBody) {
    const reasonSec = document.createElement("div");
    reasonSec.className = "og-reasoning-section";
    const lab = document.createElement("span");
    lab.className = "og-reasoning-label";
    lab.textContent = "Reasoning";
    reasonSec.appendChild(lab);
    const reason = document.createElement("div");
    reason.className = "og-reasoning-text";
    reason.textContent = assessmentBody;
    reasonSec.appendChild(reason);
    block.appendChild(reasonSec);
  }

  return block;
}

function renderFigure(item, index) {
  const fig = document.createElement("figure");
  fig.className = "pdf-figure";

  const card = document.createElement("div");
  card.className = "pdf-figure-card";

  const head = document.createElement("div");
  head.className = "figure-head";

  const headLeft = document.createElement("div");
  headLeft.className = "figure-head-left";
  headLeft.appendChild(makeGtPill(item));
  head.appendChild(headLeft);

  const badges = document.createElement("div");
  badges.className = "figure-badges";
  const m = document.createElement("span");
  m.className = "pill pill-modality";
  m.textContent = item.modality;
  badges.appendChild(m);
  if (item.isFailure) {
    const f = document.createElement("span");
    f.className = "pill pill-failure";
    f.textContent = "Error case";
    badges.appendChild(f);
  }
  head.appendChild(badges);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "figure-body";

  const modality = item.modality;
  if (modality === "text") {
    body.appendChild(buildConversation(item));
  } else if (modality === "image" && item.mediaRelPath) {
    const slot = document.createElement("div");
    slot.className = "media-slot";
    const img = document.createElement("img");
    img.src = item.mediaRelPath;
    img.alt = "";
    slot.appendChild(img);
    body.appendChild(slot);
    appendTaskPromptIfSubstantive(body, modality, item.input);
  } else if (modality === "video") {
    const slot = document.createElement("div");
    slot.className = "media-slot video-strip";
    if (item.stripRelPath) {
      const img = document.createElement("img");
      img.src = item.stripRelPath;
      img.alt = "Video key frames";
      slot.appendChild(img);
    } else {
      slot.textContent = "[Video strip not generated — run python3 scripts/build_pdf.py]";
    }
    body.appendChild(slot);
    appendTaskPromptIfSubstantive(body, modality, item.input);
  } else if (modality === "audio") {
    const slot = document.createElement("div");
    slot.className = "media-slot";
    if (item.waveRelPath) {
      const img = document.createElement("img");
      img.src = item.waveRelPath;
      img.alt = "Audio waveform";
      slot.appendChild(img);
    } else {
      slot.textContent = "[Waveform not generated — run python3 scripts/build_pdf.py]";
    }
    body.appendChild(slot);
    if (item.transcription) {
      const tr = document.createElement("div");
      tr.className = "transcription";
      tr.textContent = `Transcript: ${item.transcription}`;
      body.appendChild(tr);
    }
    appendTaskPromptIfSubstantive(body, modality, item.input);
  }

  body.appendChild(renderOmniGuard(item));
  card.appendChild(body);
  fig.appendChild(card);

  const cap = document.createElement("figcaption");
  cap.className = "pdf-fig-caption";
  const prefix = document.createElement("span");
  prefix.className = "fig-prefix";
  prefix.textContent = `Figure ${index + 1}: `;
  cap.appendChild(prefix);
  cap.appendChild(document.createTextNode(item.caption || ""));
  fig.appendChild(cap);

  return fig;
}

function init() {
  const bundle = window.__PDF_BUNDLE__;
  if (!bundle || !Array.isArray(bundle.figures)) {
    root.innerHTML = "<p class=\"empty-msg\">No PDF data. Run: python3 scripts/build_pdf.py</p>";
    return;
  }

  document.getElementById("docTitle").textContent = bundle.title || "examples of the reasoning critiques";

  const frag = document.createDocumentFragment();
  bundle.figures.forEach((item, i) => {
    frag.appendChild(renderFigure(item, i));
  });
  root.appendChild(frag);
}

init();
