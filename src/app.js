/* ============================================================
   State
   ============================================================ */
const STORAGE_KEY = 'capygo_player_state_v1';

function defaultState() {
  return {
    collectibleOwned: {},   // itemName -> bool
    collectibleStars: {},   // itemName -> number of stars, 0-10
    relicOwned: {},         // relicName -> bool (keyed by name, not id — ids can be blank/duplicate in source data)
    relicStars: {},         // relicName -> 0-10
    mountState: {},         // idx -> { owned, stars(0-5), awaken(0-10) }
    artifactState: {},      // idx -> { owned, stars(0-5), awaken(0-10) }
    fashionLevel: 0,
    capymon: {},             // cardName -> { owned, stars(0-5), deployed }
    homestead: {},           // buildingId -> level (0 = not owned)
    equipment: {},           // slotId -> { itemName, quality, surpass, arcana, psionics[4], gems[5] }
    arcana: {},              // itemName -> arcana level (0-10) — the Collection-tracked record, matched
                             // by name against whatever's currently equipped/petted; independent of
                             // any specific equipment slot or pet slot.
    petSlots: [
      { itemName: '', arcana: -1, level: 0, armament: '', armamentLevel: 1, skills: [{ stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }] },
      { itemName: '', arcana: -1, level: 0, armament: '', armamentLevel: 1, skills: [{ stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }] },
      { itemName: '', arcana: -1, level: 0, armament: '', armamentLevel: 1, skills: [{ stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }] },
    ],
    mountSlots: [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }], // 3 deployed — awaken skill each
    mountMainSlot: { itemIdx: null }, // 1 main — star skill
    artifactSlots: [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }],
    artifactMainSlot: { itemIdx: null },
    relicSlots: { totem1: null, totem2: null, core: null, guardian: null }, // relic name per slot
    adventurerSlot: { name: '', stars: 0 },
    heroSlots: [{ name: '', quality: '', polarization: 0 }, { name: '', quality: '', polarization: 0 }],
    brandSlots: [{ name: '', quality: '', polarization: 0 }, { name: '', quality: '', polarization: 0 }, { name: '', quality: '', polarization: 0 }, { name: '', quality: '', polarization: 0 }],
    inheritance: {
      activeTree: 'sk',       // which tree is deployed in battle — sk/kn/rn/gh only, Dragon isn't selectable as active
      viewingTree: 'sk',      // which tree's tab is currently open for viewing/editing (independent of activeTree)
      progress: { sk: {}, kn: {}, rn: {}, gh: {}, dr: {} }, // treeKey -> nodeId -> invested points
    },
    specialization: {
      viewingTab: 'general', // 'general' or 'adventure'
      progress: { General: {}, Adventure: {} }, // tab -> "group||track" -> invested level
    },
  };
}

let state = loadState();

// One-time migration: copy any arcana level already set on an equipment
// or pet slot into the new, name-keyed state.arcana record, so existing
// players don't lose progress when this feature ships. Runs exactly
// once (guarded by state._arcanaMigrated) and never overwrites an
// existing state.arcana entry — once the Collection tab is someone's
// source of truth, a stale per-slot value should never silently stomp
// a deliberate edit made there.
function migrateArcanaToCollection() {
  if (state._arcanaMigrated) return;
  Object.values(state.equipment || {}).forEach(s => {
    if (s && s.itemName && s.arcana != null && s.arcana >= 0 && state.arcana[s.itemName] == null) {
      state.arcana[s.itemName] = s.arcana;
    }
  });
  (state.petSlots || []).forEach(p => {
    if (p && p.itemName && p.arcana != null && p.arcana >= 0 && state.arcana[p.itemName] == null) {
      state.arcana[p.itemName] = p.arcana;
    }
  });
  state._arcanaMigrated = true;
  saveState();
}
migrateArcanaToCollection();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {
    console.warn('Could not load saved state, starting fresh.', e);
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state.', e);
  }
}

function exportSaveData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `capydex-export-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Wipes everything and replaces it cleanly with the imported file — merged
// against defaultState() so an export from an older app version (missing
// a field added since) still fills in sensible defaults instead of
// crashing on a missing key.
function importSaveData(jsonText, onError) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    if (onError) onError('That file isn\u2019t valid JSON.');
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    if (onError) onError('That doesn\u2019t look like a CapyDex export file.');
    return;
  }
  state = Object.assign(defaultState(), parsed);
  saveState();
  render();
}

function openImportModal() {
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'import-file-input' });
  const errorMsg = el('div', { class: 'import-error hidden' });
  function closeModal() { overlay.remove(); }

  const box = el('div', { class: 'modal-box' }, [
    el('div', { class: 'modal-title' }, 'Import data'),
    el('p', { class: 'section-desc', style: 'margin-bottom:14px;' },
      'This replaces everything currently saved — Collection, Equipment, Inheritance, Specialization, all of it — with what\u2019s in the file. There\u2019s no undo, so make sure this is the file you want.'),
    fileInput,
    errorMsg,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'bulk-action-btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'bulk-action-btn primary',
        onclick: () => {
          const file = fileInput.files[0];
          if (!file) { errorMsg.textContent = 'Choose a file first.'; errorMsg.classList.remove('hidden'); return; }
          const reader = new FileReader();
          reader.onload = () => {
            let hadError = false;
            importSaveData(reader.result, (msg) => {
              hadError = true;
              errorMsg.textContent = msg;
              errorMsg.classList.remove('hidden');
            });
            if (!hadError) closeModal();
          };
          reader.readAsText(file);
        },
      }, 'Import'),
    ]),
  ]);

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function isMobileViewport() {
  if (typeof window.matchMedia === 'function') return window.matchMedia('(max-width: 843px)').matches;
  return window.innerWidth <= 843;
}

function renderCalcDataControls() {
  const isMobile = isMobileViewport();

  // Shared hidden input used by the mobile direct-trigger path — desktop
  // uses its own input inside the modal instead.
  const mobileFileInput = el('input', {
    type: 'file', accept: 'application/json,.json', style: 'display:none;',
    onchange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importSaveData(reader.result, (msg) => alert(msg));
      reader.readAsText(file);
    },
  });

  const handleImportClick = () => {
    if (isMobileViewport()) {
      mobileFileInput.click();
    } else {
      openImportModal();
    }
  };

  if (!isMobile) {
    return el('div', { class: 'calc-data-controls' }, [
      mobileFileInput,
      el('button', { class: 'bulk-action-btn secondary', onclick: handleImportClick }, 'Import Data'),
      el('button', { class: 'bulk-action-btn secondary', onclick: exportSaveData }, 'Export Data'),
    ]);
  }

  // Mobile: single icon button revealing both options in a small dropdown.
  const menu = el('div', { class: 'calc-data-menu hidden' }, [
    el('button', { class: 'calc-data-menu-item', onclick: () => { menu.classList.add('hidden'); handleImportClick(); } }, 'Import Data'),
    el('button', { class: 'calc-data-menu-item', onclick: () => { menu.classList.add('hidden'); exportSaveData(); } }, 'Export Data'),
  ]);
  const wrap = el('div', { class: 'calc-data-controls-mobile' }, [
    mobileFileInput,
    el('button', {
      class: 'calc-data-icon-btn', 'aria-label': 'Import or export data',
      onclick: (e) => { e.stopPropagation(); menu.classList.toggle('hidden'); },
    }, '\u22ee'),
    menu,
  ]);
  document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });
  return wrap;
}

function getMountOrArtifactState(bucket, idx) {
  if (!state[bucket][idx]) {
    state[bucket][idx] = { owned: false, stars: 0, awaken: 0 };
  }
  return state[bucket][idx];
}


/* ============================================================
   Small DOM helpers
   ============================================================ */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

const STAT_LABELS = {
  hp_pct: 'HP%', hp: 'HP', atk_pct: 'ATK%', atk: 'ATK', def_pct: 'DEF%', def: 'DEF',
  tenacity: 'Tenacity', armor_break: 'Armor Break', penetration: 'Penetration',
  block: 'Block', suppression: 'Suppression', ignore_suppression: 'Ignore Suppression',
  crit_rate: 'Crit Rate%', crit_dmg: 'Crit DMG%',
};
function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function itemImagePath(kind, item) {
  // item.img is an optional override for when the display name and the
  // actual image filename have diverged — e.g. a relic's name got
  // corrected to match its real in-game name after its image was already
  // converted and saved under the old one. Falls back to slugifying the
  // display name for every item that doesn't need this (the vast
  // majority), so nothing else is affected.
  const slug = item.img || slugify(item.n);
  return `assets/images/${kind}/${slug}.webp`;
}

// Shared header for every Equipment-style deploy/slot card (regular
// equipment slots, Adventurer, Hero/Brand, Relic deploy, Pet, Mount/
// Artifact deploy) — a thumb + title row. Unlike renderCardTitleRow's
// Collection cards, there's no dashed-placeholder box shown when nothing
// is selected — an empty slot simply shows no image at all, just the
// title, since a slot with nothing chosen yet has no image to represent.
function renderEquipHeader(imgKind, item, title) {
  const headerImg = item
    ? el('img', { src: itemImagePath(imgKind, item), alt: item.n, class: 'equip-card-thumb', onerror: (e) => { e.target.style.visibility = 'hidden'; } })
    : null;
  return el('div', { class: 'equip-card-header' }, [headerImg, el('div', { class: 'equip-card-title' }, title)]);
}

/* Small inline thumbnail (icon-sized, sits left of the item name) with
   graceful fallback: shows a dimmed placeholder mark until (or unless) the
   real image file exists at assets/images/<kind>/<slug>.webp. Nothing breaks
   for items without art yet — just add the file later. */
function renderThumb(kind, item) {
  const thumb = el('div', { class: 'item-thumb-inline' });
  const placeholder = el('span', { class: 'thumb-placeholder-inline' }, '◈');
  thumb.appendChild(placeholder);
  thumb.appendChild(el('img', {
    src: itemImagePath(kind, item),
    alt: item.n,
    loading: 'lazy',
    onerror: (e) => { e.target.style.display = 'none'; },
    // Explicitly hides the placeholder once the real image is confirmed
    // loaded, rather than just relying on the image visually covering it.
    // That assumption only holds for a fully opaque, exactly-square
    // source image — anything padded to fit the square frame (which is
    // most of them, via convert_all.py's contain-not-cover resizing)
    // leaves transparent margins the placeholder was still showing
    // through, even though the "real" image had already loaded fine.
    onload: () => { placeholder.style.display = 'none'; },
  }));
  return thumb;
}

function renderOwnedBadge(isOwned, onToggle) {
  return el('button', {
    type: 'button',
    class: 'owned-badge' + (isOwned ? ' owned' : ''),
    onclick: () => onToggle(!isOwned),
  }, el('span', { class: 'owned-label' }, isOwned ? 'Owned' : 'Not Owned'));
}

// Rarity/tier badge — from Figma's Tag component. Covers both the
// Rare/Epic/Legendary/Mythic rarity tiers and the Uncommon/Immortal/
// Transcendent mount/artifact tiers with the same class, since both sets
// already share one --rarity-*/--tier-* CSS token naming scheme.
// Dropdown-style filter control — label above a native <select>,
// replacing the old inline chip-row filter per the new Figma Filter/Form
// structure. Fires onChange with the selected value; caller owns state.
function renderFilterDropdown(label, options, currentValue, onChange) {
  const group = el('div', { class: 'filter-dropdown-group' });
  group.appendChild(el('label', { class: 'filter-dropdown-label' }, label));
  const select = el('select', {
    class: 'filter-dropdown p-default',
    onchange: (e) => onChange(e.target.value),
  });
  options.forEach(opt => {
    const optionEl = el('option', { value: opt }, opt);
    if (opt === currentValue) optionEl.selected = true;
    select.appendChild(optionEl);
  });
  group.appendChild(select);
  return group;
}

// Per-section open/closed state for the mobile filter toggle — persists
// across render() calls (which rebuild the whole DOM) since it lives at
// module scope, not on any DOM node. Defaults closed: she was explicit
// that the filter must never be exposed immediately, only by the user's
// own tap.
const filterToggleOpen = { collectibles: false, relics: false, mounts: false, artifacts: false };

// Wraps a section's Tier/Owned dropdown row behind a "Filters" toggle
// for mobile — desktop shows the dropdowns directly via CSS (this
// wrapper is visually inert above 844px), only the mobile media query
// actually hides/reveals anything.
function renderFilterToggleSection(key, dropdownsRow) {
  const wrap = el('div', {});
  const toggleRow = el('div', { class: 'filter-toggle-row' + (filterToggleOpen[key] ? ' open' : '') });
  const chevron = el('span', { class: 'filter-toggle-chevron' }, '▾');
  toggleRow.appendChild(chevron);
  toggleRow.appendChild(el('span', {}, 'Filters'));

  const collapse = el('div', { class: 'filter-collapse' + (filterToggleOpen[key] ? ' open' : '') });
  const inner = el('div', { class: 'filter-collapse-inner' }, [dropdownsRow]);
  collapse.appendChild(inner);

  toggleRow.onclick = () => {
    filterToggleOpen[key] = !filterToggleOpen[key];
    toggleRow.classList.toggle('open', filterToggleOpen[key]);
    collapse.classList.toggle('open', filterToggleOpen[key]);
  };

  wrap.appendChild(toggleRow);
  wrap.appendChild(collapse);
  return wrap;
}

function renderRarityTag(tier) {
  return el('span', { class: `rarity-tag tag-${tier}` }, tier);
}

// Shared title row for every item-card variant (Collectibles, Relics,
// Mounts/Artifacts, Homestead) — thumb + name on the left, rarity Tag
// pinned top-right. `rarity` is optional and falsy-safe: pass a real
// rarity/tier to show the Tag, or omit it (Homestead has no rarity at
// all, Mounts/Artifacts' tier can be missing on some items) to skip the
// Tag cleanly rather than render one with an undefined label.
function renderCardTitleRow(kind, item, rarity) {
  return el('div', { class: 'card-title-row' }, [
    el('div', { class: 'card-title-image-group' }, [
      renderThumb(kind, item),
      el('div', { class: 'item-name', title: item.n }, item.n),
    ]),
    rarity ? renderRarityTag(rarity) : null,
  ]);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

let editingStepperKey = null;

// A number input's blur handler needs to trigger a full render() so
// whatever else on the page depends on its value (a derived stat display,
// a battle-skill tier, etc.) actually updates — but render() rebuilds the
// entire DOM, and blur fires *before* the click finishes landing on
// wherever the user was actually heading next. Left alone, that means the
// element they clicked toward gets torn down and rebuilt mid-click, so
// their click lands on a node about to disappear and focus goes nowhere,
// forcing a second click just to focus what should have been one motion.
// Capturing mousedown here — which fires even earlier, before blur — lets
// this remember what the user was actually reaching for and refocus its
// equivalent in the freshly-rendered DOM once render() finishes, so
// moving from one number field straight into typing the next one works
// in a single click the way it visually should.
let pendingFocusId = null;
document.addEventListener('mousedown', (e) => {
  const target = e.target.closest('[data-focus-id]');
  pendingFocusId = target ? target.dataset.focusId : null;
}, true);

function restorePendingFocus() {
  if (!pendingFocusId) return;
  const el2 = document.querySelector(`[data-focus-id="${CSS.escape(pendingFocusId)}"]`);
  if (el2) { el2.focus(); if (el2.select) el2.select(); }
  pendingFocusId = null;
}

/* Shared stepper: −/+ buttons for incremental adjustment, plus click-to-edit
   on the number itself for typing an exact value directly. format() controls
   how the value displays (e.g. "3★", "A5") when not being edited.

   value === null is the "not owned yet" state — displays as an em dash,
   and the − button is disabled (nothing to revert to). The first + click
   from there sets it to min (typically 0) and the caller's onChange is
   expected to also flip ownership on. From then on − never goes below
   min and never reverts back to the em dash — per her explicit call:
   clicking + is a low-stakes, obviously-intentional action, but clicking
   − back to "unowned" would be an easy way to lose data through a click
   that didn't feel deliberate. Un-owning stays a separate, deliberate
   action (the Owned badge itself), not something the stepper does. */
// Whether a collectible's stat is a percentage — inferred directly from
// its own stat_label ending in "%", rather than a separate is_percent/
// is_percent2 field. That field used to exist but was never actually
// populated for any of the 58 existing collectibles, so the "%" suffix
// this drives had silently never shown up in the UI at all; the label
// text itself already carried this information reliably (57 of 58
// labels already ended in "%" correctly), so there was nothing this
// separate field did that the label couldn't already tell us.
function isPercentLabel(label) {
  return !!label && label.trim().endsWith('%');
}

function renderStepper(key, value, min, max, onChange, format) {
  format = format || (v => String(v));
  const isUnset = value === null;
  const minusDisabled = isUnset || value <= min;

  const handlePlus = () => onChange(isUnset ? min : clamp(value + 1, min, max));
  const handleMinus = () => { if (!minusDisabled) onChange(clamp(value - 1, min, max)); };

  if (editingStepperKey === key) {
    let cancelled = false;
    const input = el('input', {
      type: 'number', class: 'stepper-input',
      value: isUnset ? '' : String(value), min: String(min), max: String(max),
      'data-stepper-key': key,
      onblur: (e) => {
        if (cancelled) return;
        const num = parseInt(e.target.value, 10);
        editingStepperKey = null;
        if (!isNaN(num)) onChange(clamp(num, min, max));
        else render();
      },
      onkeydown: (e) => {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { cancelled = true; editingStepperKey = null; render(); }
      },
    });
    return el('div', { class: 'stepper' }, [
      el('button', minusDisabled ? { onclick: handleMinus, disabled: true, class: 'stepper-btn-disabled' } : { onclick: handleMinus }, '−'),
      input,
      el('button', { onclick: handlePlus }, '+'),
    ]);
  }

  return el('div', { class: 'stepper' }, [
    el('button', minusDisabled ? { onclick: handleMinus, disabled: true, class: 'stepper-btn-disabled' } : { onclick: handleMinus }, '−'),
    el('span', {
      class: 'val val-editable',
      onclick: () => { editingStepperKey = key; render(); },
    }, isUnset ? '—' : format(value)),
    el('button', { onclick: handlePlus }, '+'),
  ]);
}

function focusActiveStepperInput() {
  if (!editingStepperKey) return;
  const input = document.querySelector(`[data-stepper-key="${CSS.escape(editingStepperKey)}"]`);
  if (input) { input.focus(); input.select(); }
}

function statLabel(key) {
  const base = key.replace(/_pct$/, '');
  return STAT_LABELS[base] || base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* Wrap [ Skill Name ] tags so they never break mid-bracket — if they don't
   fit on the current line, the whole tag moves down as one unit instead. */
// Wraps every number-like substring that's actually a stat value (23.35%,
// +15, -10%, but NOT plain turn counts like "3" in "every 3 turns" or
// ordinals like "3rd") in its own span so it can be color-highlighted —
// applied only to the plain prose portions of effect text, not the
// [ Skill Name ] tags themselves, which get their own distinct highlight
// treatment instead. A number only gets highlighted if it carries a %
// sign (an actual stat magnitude, e.g. "300%") or a +/- sign (a flat
// buff/debuff, e.g. "+10 Speed") — a bare, unsigned, non-percent number
// is reliably just narrative context (turn timing, item name references
// like "No.1", cooldowns) rather than a value the reader should treat as
// a stat.
function appendHighlightedNumbers(frag, text) {
  const numberRegex = /[+-]\d+(?:\.\d+)?%?|\d+(?:\.\d+)?%/g;
  let lastIndex = 0;
  let match;
  while ((match = numberRegex.exec(text)) !== null) {
    if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    // Reuses .stat-value-live rather than a new class — this is the same
    // "accent-colored, bold number" treatment already used elsewhere in
    // the app (stepper values, Calculator totals), so a highlighted
    // number in effect text reads consistently with the rest of the UI.
    frag.appendChild(el('span', { class: 'stat-value-live' }, match[0]));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function renderTextWithSkillTags(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  const regex = /\[\s*[^[\]]+?\s*\]/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) appendHighlightedNumbers(frag, text.slice(lastIndex, match.index));
    // Each [ Skill Name ] reference gets its own line rather than flowing
    // inline with the surrounding prose — easier to spot at a glance, and
    // the nowrap on .skill-tag means the bracket text itself never splits
    // across two lines once it's isolated like this.
    frag.appendChild(el('span', { class: 'skill-tag' }, match[0]));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) appendHighlightedNumbers(frag, text.slice(lastIndex));
  return frag;
}

// Stats that are absolute/flat numbers, never percentages, regardless of
// which raw key names they show up under (ATK/HP don't follow the
// "_pct" suffix convention the way global buffs and proc rates do) —
// defaulting new/unrecognized keys to "%" is the safer assumption, since
// most stats that appear in a star_up/awaken block genuinely are
// percentage-based bonuses.
const STAT_BLOCK_FLAT_KEYS = new Set([
  'atk', 'hp', 'def', 'armor_break', 'armor_break_res',
  'tenacity', 'tenacity_res', 'speed', 'suppression', 'block',
]);

/* Stat entries as DOM nodes with the value (the part that changes as you
   move the star/awaken steppers) highlighted in the accent color.
   showSign: prefix positive deltas with '+' (for artifact deltas, not for
   relic absolute stat previews). */
function formatStatBlockNodes(stats, showSign) {
  const entries = Object.entries(stats).filter(([k]) => k !== '_unparsed');
  const frag = document.createDocumentFragment();
  if (!entries.length) { frag.appendChild(document.createTextNode('—')); return frag; }
  entries.forEach(([k, v], i) => {
    if (i > 0) frag.appendChild(document.createTextNode(' · '));
    frag.appendChild(document.createTextNode(statLabel(k) + ' '));
    const sign = showSign && v > 0 ? '+' : '';
    // An explicit "_pct" suffix always wins outright — checked BEFORE the
    // denylist, not after stripping it. Stripping first and then checking
    // the denylist was the bug: atk_pct and atk both reduce to the same
    // base name "atk", so a flat atk entry and a genuinely percentage-
    // based atk_pct entry on the same item were getting treated
    // identically, incorrectly hiding the % on atk_pct.
    const isFlat = !k.endsWith('_pct') && STAT_BLOCK_FLAT_KEYS.has(k);
    const valText = `${sign}${v}${isFlat ? '' : '%'}`;
    frag.appendChild(el('span', { class: 'stat-value-live' }, valText));
  });
  return frag;
}

/* ============================================================
   App shell: top-level tabs. Collection tab uses an internal
   sidenav + anchor scroll for Relics/Collectibles/Mounts/Artifacts.
   Equipment/Inheritance/Calculator are their own separate tabs.
   ============================================================ */
const root = document.getElementById('app-root');
let activeMainTab = 'collection';

const mainTabsNav = document.getElementById('main-tabs');
const hamburgerBtn = document.getElementById('hamburger-toggle');
hamburgerBtn.addEventListener('click', () => {
  mainTabsNav.classList.toggle('open');
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMainTab = btn.dataset.tab;
    if (activeMainTab === 'specialization') state.specialization.viewingTab = 'adventure';
    mainTabsNav.classList.remove('open');
    render();
    // Explicit 'instant' needed to override the global scroll-behavior:
    // smooth — a tab switch should feel immediate, not like the page is
    // scrolling itself back up while the content underneath also changes.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
});

document.addEventListener('click', (e) => {
  if (mainTabsNav.classList.contains('open') && !mainTabsNav.contains(e.target) && e.target !== hamburgerBtn) {
    mainTabsNav.classList.remove('open');
  }
});

function tierSlug(tier) {
  return (tier || 'untiered').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildTierGroups(items, field = 'tier') {
  const grouped = {};
  items.forEach(item => {
    const tier = item[field] || '(Untiered)';
    (grouped[tier] = grouped[tier] || []).push(item);
  });
  const ordered = [...TIER_ORDER.filter(t => grouped[t]), ...Object.keys(grouped).filter(t => !TIER_ORDER.includes(t))];
  return ordered.map(tier => ({ tier, slug: tierSlug(tier), items: grouped[tier] }));
}

// Every Arcana entry, resolved against its linked item for display (name,
// image, tier) — reads exclusively from DB.arcanas now, the standalone
// source of truth, rather than embedded arcana_descs/awaken_effects
// fields on the equipment/pet items themselves (those were migrated out
// once arcanas.json existed). Each entry's own maxLevel comes from
// whichever data shape that entry actually uses: arcana_descs.length for
// equipment (a plain list), or the highest "AN" key actually present in
// arcana_effects for pets (an object) — never a single global max, since
// that both undersells items with fewer tiers and overstates ones with
// more.
function getAllArcanaItems() {
  const out = [];
  (DB.arcanas || []).forEach(entry => {
    const linkedList = DB[entry.linked_kind] || [];
    const linkedItem = linkedList.find(it => it.n === entry.linked_item);
    if (!linkedItem) return; // linked item no longer exists in its DB — skip rather than show a broken card
    let maxLevel;
    if (entry.arcana_descs) {
      maxLevel = entry.arcana_descs.length - 1;
    } else if (entry.arcana_effects) {
      const levels = [];
      for (let i = 0; i <= 10; i++) if (entry.arcana_effects[`A${i}`]) levels.push(i);
      maxLevel = levels.length ? Math.max(...levels) : 0;
    } else {
      maxLevel = 0;
    }
    const imgKind = entry.linked_kind === 'pets' ? 'pets' : (EQUIPMENT_SLOTS.find(s => s.dataKey === entry.linked_kind) || {}).imgKind || entry.linked_kind;
    out.push({ name: entry.linked_item, kind: entry.linked_kind === 'pets' ? 'pet' : 'equipment', imgKind, tier: linkedItem.tier || '(Untiered)', maxLevel, item: linkedItem, arcanaEntry: entry });
  });
  return out;
}

// Looks up the Arcana record for a given item name, matched via
// linked_item — the one place this lookup happens, so every reader
// (equipment card, pet card, Calculator) stays in sync automatically if
// the matching logic here ever needs to change.
function getArcanaEntry(itemName) {
  return (DB.arcanas || []).find(e => e.linked_item === itemName) || null;
}

// Resolves the arcana effect TEXT for a given entry + level, handling
// both storage shapes: equipment's arcana_descs (a flat, cumulative list
// — level N shows itself only, since callers that want the full
// cumulative text use collateArcanaEffects separately) and pets'
// arcana_effects (an "AN" keyed object, same shape as mount/artifact
// awaken text).
function getArcanaEffectText(entry, level) {
  if (!entry) return null;
  if (entry.arcana_descs) return entry.arcana_descs[level] || null;
  if (entry.arcana_effects) return entry.arcana_effects[`A${level}`] || null;
  return null;
}

function renderArcanaCard(entry) {
  const currentLevel = state.arcana[entry.name];
  const card = el('div', { class: 'item-card' });
  card.appendChild(renderCardTitleRow(entry.kind === 'pet' ? 'pets' : entry.imgKind, entry.item, entry.tier));

  const select = el('select', { class: 'equip-select' }, [
    el('option', { value: '-1', selected: currentLevel == null ? 'true' : null }, 'No Arcana'),
    ...Array.from({ length: entry.maxLevel + 1 }, (_, i) => i).map(lvl =>
      el('option', { value: String(lvl), selected: currentLevel === lvl ? 'true' : null }, `A${lvl}`)),
  ]);
  select.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (val < 0) delete state.arcana[entry.name];
    else state.arcana[entry.name] = val;
    saveState();
    render();
  });
  card.appendChild(select);

  if (currentLevel != null) {
    card.appendChild(el('div', { class: 'section-desc', style: 'margin-top:8px;font-style:italic;' },
      'Applies automatically whenever this is equipped — the Equipment/Pet page no longer needs its own Arcana picker for this item.'));
  }
  return card;
}

function renderArcanaSection() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Set an item\u2019s Arcana level here once, independent of whether it\u2019s currently equipped — it\u2019s matched by name to whatever\u2019s equipped or petted, the same way Mounts/Artifacts track stars separately from being deployed.'));

  const search = el('input', { class: 'search-input', type: 'text', placeholder: 'Search arcana items…' });
  wrap.appendChild(el('div', { class: 'toolbar toolbar-stacked' }, [el('div', { class: 'toolbar-row' }, [search])]));

  const groupsWrap = el('div', {});
  wrap.appendChild(groupsWrap);

  // Two fixed top-level sections (Equipment, Pets) rather than tier-only
  // groups, matching the sidebar's own sub-nav slugs (arcana-equipment /
  // arcana-pets) — tier grouping still happens WITHIN each section, same
  // as the rest of the app's collection pages, just nested one level in.
  const renderGroups = () => {
    groupsWrap.innerHTML = '';
    const q = search.value.trim().toLowerCase();
    const allItems = getAllArcanaItems().filter(e => !q || e.name.toLowerCase().includes(q));

    [
      { kind: 'equipment', label: 'Equipment', slug: 'arcana-equipment' },
      { kind: 'pet', label: 'Pets', slug: 'arcana-pets' },
    ].forEach(section => {
      const items = allItems.filter(e => e.kind === section.kind);
      groupsWrap.appendChild(el('div', { class: 'tier-group-title', id: section.slug }, section.label));
      if (!items.length) {
        groupsWrap.appendChild(el('p', { class: 'section-desc' }, 'No matching items.'));
        return;
      }
      const tierGroups = buildTierGroups(items);
      tierGroups.forEach(g => {
        groupsWrap.appendChild(el('div', { class: 'tier-group-title', style: 'font-size:14px;opacity:0.8;' }, g.tier));
        const grid = el('div', { class: 'card-grid cols-2' });
        g.items.forEach(entry => grid.appendChild(renderArcanaCard(entry)));
        groupsWrap.appendChild(grid);
      });
    });
  };
  search.addEventListener('input', renderGroups);
  renderGroups();

  return wrap;
}

const COLLECTION_SECTIONS = [
  { id: 'collectibles', label: 'Collectibles', build: renderCollectibles, sub: () => [...buildTierGroups(DB.collectibles, 'rarity'), { tier: 'Sets', slug: 'sets' }], clearAll: () => clearAllCollectibles() },
  { id: 'relics', label: 'Relics', build: renderRelics, sub: () => [...buildTierGroups(DB.relics, 'rarity'), { tier: 'Sets', slug: 'sets' }], clearAll: () => clearAllRelics() },
  { id: 'arcana', label: 'Arcana', build: renderArcanaSection, sub: () => [{ tier: 'Equipment', slug: 'arcana-equipment' }, { tier: 'Pets', slug: 'arcana-pets' }], clearAll: () => { state.arcana = {}; saveState(); render(); } },
  { id: 'mounts', label: 'Mounts', build: () => renderMountsOrArtifacts('mounts'), sub: () => buildTierGroups(DB.mounts.filter(x => x.n !== 'None')), clearAll: () => clearAllMountsOrArtifacts('mounts') },
  { id: 'artifacts', label: 'Artifacts', build: () => renderMountsOrArtifacts('artifacts'), sub: () => buildTierGroups(DB.artifacts.filter(x => x.n !== 'None')), clearAll: () => clearAllMountsOrArtifacts('artifacts') },
  { id: 'fashion', label: 'Fashion Level', build: buildFashionSectionContent, clearAll: () => { state.fashionLevel = 0; saveState(); render(); } },
  { id: 'capymon', label: 'Capymon Cards', build: buildCapymonSectionContent, clearAll: () => { state.capymon = {}; saveState(); render(); } },
  { id: 'homestead', label: 'Homestead', build: buildHomesteadSectionContent, clearAll: () => { state.homestead = {}; saveState(); render(); } },
];

function parseFashionNoteStats(note) {
  const result = {};
  if (!note) return result;
  note.split(',').forEach(part => {
    const m = part.trim().match(/^\+(\d+(?:\.\d+)?)%\s+(HP|ATK|DEF)$/);
    if (m) result[m[2]] = parseFloat(m[1]);
  });
  return result;
}

function buildFashionSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Cumulative bonuses from Fashion Level 1 up to your selected level — every stat stacks from every level along the way, not just the one you land on.'));

  const levels = DB.fashion_levels || [];
  const levelInput = el('input', {
    type: 'number', class: 'equip-select', style: 'max-width:220px;', min: '0', max: '50', placeholder: '0',
    value: state.fashionLevel ? String(state.fashionLevel) : '',
    'data-focus-id': 'fashion-level',
  });
  levelInput.addEventListener('input', (e) => {
    const n = parseInt(e.target.value, 10);
    state.fashionLevel = Number.isNaN(n) ? 0 : Math.max(0, Math.min(50, n));
    saveState();
  });
  levelInput.addEventListener('blur', () => render());
  wrap.appendChild(equipFieldLabel('Fashion Level'));
  wrap.appendChild(levelInput);

  if (state.fashionLevel > 0) {
    let totalFd = 0, totalFdr = 0;
    const statTotals = {};
    for (let i = 1; i <= state.fashionLevel; i++) {
      const lv = levels[i];
      if (!lv) continue;
      totalFd += lv.fd || 0;
      totalFdr += lv.fdr || 0;
      Object.entries(parseFashionNoteStats(lv.note)).forEach(([stat, val]) => {
        statTotals[stat] = (statTotals[stat] || 0) + val;
      });
    }
    const parts = [
      `Final DMG +${Math.round(totalFd * 10000) / 100}%`,
      `Final DMG Reduction +${Math.round(totalFdr * 10000) / 100}%`,
      ...Object.entries(statTotals).map(([stat, val]) => `${stat} +${Math.round(val * 100) / 100}%`),
    ];
    wrap.appendChild(equipFieldLabel('Totals at this level'));
    wrap.appendChild(el('div', { class: 'equip-writeup' }, parts.join(' · ')));
  }

  return wrap;
}

/* ============================================================
   Capymon Cards
   ============================================================
   Mythic collectibles that grant a passive Final DMG or Final DMG
   Reduction bonus just for being owned, scaling 0-5★ (fd_by_star /
   fdr_by_star — only one of the two is ever nonzero for a given card,
   per its game design, but both arrays are always present so the code
   doesn't need a card.calc branch). A few also grant a second, separate
   stacking buff while deployed (deploy_fd_by_star / deploy_fdr_by_star,
   capped differently at 2★ vs 4★ — tracked here at full stacks). Data:
   DB.capymon, from data/capymon.json. Art: assets/images/capymon/<slug>.webp
   via the same itemImagePath()/renderThumb() convention as every other
   item kind (weapons, arcana, etc).
   ============================================================ */

function capymonState(name) {
  if (!state.capymon || typeof state.capymon !== 'object') state.capymon = {};
  if (!state.capymon[name]) state.capymon[name] = { owned: false, stars: 0, deployed: false };
  return state.capymon[name];
}

// Sums every owned/deployed card's Final DMG and Final DMG Reduction
// contribution. Returns { fd, fdr, breakdown } — fd/fdr are fractions
// (0.05 = 5%); breakdown is per-card for source tracking.
function computeCapymonStats() {
  const cards = DB.capymon || [];
  let fd = 0, fdr = 0;
  const breakdown = [];

  cards.forEach(card => {
    const st = capymonState(card.n);
    if (!st.owned) return;
    const stars = Math.min(Math.max(st.stars || 0, 0), 5);
    let cardFd = (card.fd_by_star || [])[stars] || 0;
    let cardFdr = (card.fdr_by_star || [])[stars] || 0;

    if (st.deployed && stars >= 2) {
      cardFd += (card.deploy_fd_by_star || [])[stars] || 0;
      cardFdr += (card.deploy_fdr_by_star || [])[stars] || 0;
    }

    fd += cardFd;
    fdr += cardFdr;
    if (cardFd || cardFdr) breakdown.push({ name: card.n, fd: cardFd, fdr: cardFdr });
  });

  return { fd, fdr, breakdown };
}

function buildCapymonSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Mythic cards grant passive Final DMG / Final DMG Reduction just for being owned, scaling with star level. A few also buff you while deployed, at a separate stacking rate — tracked here at full stacks.'));

  const grid = el('div', { class: 'cpm-grid' });
  (DB.capymon || []).forEach(card => {
    const st = capymonState(card.n);
    const stars = Math.min(Math.max(st.stars || 0, 0), 5);
    const hasDeploy = (card.deploy_fd_by_star && card.deploy_fd_by_star.some(v => v)) ||
                       (card.deploy_fdr_by_star && card.deploy_fdr_by_star.some(v => v));
    const passiveFd = (card.fd_by_star || [])[stars] || 0;
    const passiveFdr = (card.fdr_by_star || [])[stars] || 0;

    const cardEl = el('div', { class: 'cpm-card' + (st.owned ? ' owned' : '') });

    if (st.owned) {
      const removeBtn = el('button', { class: 'cpm-remove', title: `Remove ${card.n}` }, '✕');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        st.owned = false;
        st.deployed = false;
        saveState();
        render();
      });
      cardEl.appendChild(removeBtn);
    } else {
      cardEl.title = `Click to add ${card.n}`;
      cardEl.addEventListener('click', () => {
        st.owned = true;
        saveState();
        render();
      });
    }

    cardEl.appendChild(el('div', { class: 'cpm-head' }, [renderThumb('capymon', card), el('div', { class: 'cpm-name' }, card.n)]));

    const tagParts = [];
    if (passiveFd) tagParts.push(el('span', { class: 'cpm-tag' }, `Final DMG +${(passiveFd * 100).toFixed(0)}%`));
    if (passiveFdr) tagParts.push(el('span', { class: 'cpm-tag' }, `Final DMG Red. +${(passiveFdr * 100).toFixed(0)}%`));
    cardEl.appendChild(el('div', { class: 'cpm-row' }, tagParts));

    const starRow = el('div', { class: 'cpm-row' }, 'Stars ');
    const starSelect = el('select', { disabled: st.owned ? null : 'disabled' });
    for (let s = 0; s <= 5; s++) {
      const sFd = (card.fd_by_star || [])[s] || 0;
      const sFdr = (card.fdr_by_star || [])[s] || 0;
      const pct = sFd || sFdr;
      const opt = el('option', { value: String(s) }, `${s}★ (+${(pct * 100).toFixed(0)}%)`);
      if (s === stars) opt.selected = true;
      starSelect.appendChild(opt);
    }
    starSelect.addEventListener('click', (e) => e.stopPropagation());
    starSelect.addEventListener('change', (e) => {
      st.stars = parseInt(e.target.value, 10) || 0;
      if (st.stars < 2) st.deployed = false;
      saveState();
      render();
    });
    starRow.appendChild(starSelect);
    cardEl.appendChild(starRow);

    if (hasDeploy) {
      const dFd = (card.deploy_fd_by_star || [])[stars] || 0;
      const dFdr = (card.deploy_fdr_by_star || [])[stars] || 0;
      const dLabel = dFd ? `+${(dFd * 100).toFixed(0)}% Final DMG` : dFdr ? `+${(dFdr * 100).toFixed(0)}% Final DMG Red.` : '';
      const canDeploy = st.owned && stars >= 2;
      const deployRow = el('div', { class: 'cpm-row cpm-deploy', title: card.deploy_desc || '' });
      const deploySelect = el('select', { disabled: canDeploy ? null : 'disabled' });
      deploySelect.appendChild(el('option', { value: '0', selected: (!st.deployed || !canDeploy) ? 'selected' : null }, 'Not deployed'));
      deploySelect.appendChild(el('option', { value: '1', selected: (st.deployed && canDeploy) ? 'selected' : null },
        `Deployed${dLabel ? ` (${dLabel})` : ''}`));
      deploySelect.addEventListener('click', (e) => e.stopPropagation());
      deploySelect.addEventListener('change', (e) => {
        st.deployed = e.target.value === '1';
        saveState();
        render();
      });
      deployRow.appendChild(deploySelect);
      if (!canDeploy) deployRow.appendChild(el('span', { class: 'cpm-dep-val' }, '2★+'));
      cardEl.appendChild(deployRow);
    }

    grid.appendChild(cardEl);
  });
  wrap.appendChild(grid);

  return wrap;
}

let homesteadSearch = '';
let homesteadOwnedFilter = 'All';

function renderHomesteadCard(b) {
  const currentLevel = state.homestead[b.id] || 0;
  const owned = currentLevel > 0;
  const maxLevel = b.values.length;
  const card = el('div', { class: 'item-card' });

  card.appendChild(renderCardTitleRow('homestead', { n: b.name }));
  if (b.event) card.appendChild(el('div', { class: 'item-rarity' }, `Set: ${b.event}`));

  card.appendChild(el('div', { class: 'card-badge-row' }, [
    renderOwnedBadge(owned, (checked) => {
      if (!checked) delete state.homestead[b.id];
      else state.homestead[b.id] = 1;
      saveState();
      render();
    }),
  ]));

  card.appendChild(el('div', { class: 'card-stepper-row' }, [
    el('div', { class: 'card-stepper-label' }, 'Level'),
    // min is 1, not 0 — unlike Relic/Collectible, Homestead has no
    // meaningful "owned at 0" state (owned is derived from level > 0
    // above), so the em dash's first + click should land on Lv1
    // directly, not an "owned Lv0" that doesn't really exist.
    renderStepper(`homestead-${b.id}`, owned ? currentLevel : null, 1, maxLevel,
      (next) => {
        state.homestead[b.id] = next;
        saveState();
        render();
      },
      (v) => `Lv${v}`),
  ]));

  if (owned) {
    const val = b.values[currentLevel - 1];
    const pct = Math.round(val * 10000) / 100;
    card.appendChild(el('div', { class: 'card-info' }, [
      el('div', { class: 'item-effect' }, [
        b.label + ': ',
        el('span', { class: 'stat-value-live' }, `+${pct}%`),
      ]),
    ]));
  }
  return card;
}

function renderHomesteadGroups(container) {
  container.innerHTML = '';
  const buildings = (DB.homestead_buildings || []).filter(b => {
    if (homesteadSearch && !b.name.toLowerCase().includes(homesteadSearch.toLowerCase())) return false;
    const owned = (state.homestead[b.id] || 0) > 0;
    if (homesteadOwnedFilter === 'Owned' && !owned) return false;
    if (homesteadOwnedFilter === 'Not Owned' && owned) return false;
    return true;
  });
  const grid = el('div', { class: 'card-grid cols-4' });
  buildings.forEach(b => grid.appendChild(renderHomesteadCard(b)));
  container.appendChild(grid);
}

function buildHomesteadSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Buildings you own grant passive stats at whichever level you\u2019ve upgraded them to.'));

  const toolbar = el('div', { class: 'toolbar toolbar-stacked' });
  const search = el('input', {
    class: 'search-input', type: 'text', placeholder: 'Search homestead…', value: homesteadSearch,
    oninput: (e) => { homesteadSearch = e.target.value; renderHomesteadGroups(groupsWrap); },
  });
  toolbar.appendChild(search);

  const ownedRow = el('div', { class: 'toolbar-row' });
  ownedRow.appendChild(el('span', { class: 'toolbar-row-label' }, 'Owned'));
  ['All', 'Owned', 'Not Owned'].forEach(o => {
    const chip = el('button', {
      class: 'filter-chip' + (homesteadOwnedFilter === o ? ' active' : ''),
      onclick: () => {
        homesteadOwnedFilter = o;
        ownedRow.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderHomesteadGroups(groupsWrap);
      },
    }, o);
    ownedRow.appendChild(chip);
  });
  toolbar.appendChild(ownedRow);
  wrap.appendChild(toolbar);

  const groupsWrap = el('div', {});
  wrap.appendChild(groupsWrap);
  renderHomesteadGroups(groupsWrap);

  return wrap;
}


function renderPlaceholder(label, desc) {
  return el('div', { class: 'placeholder-page' }, [
    el('div', { class: 'section-title' }, label),
    el('p', { class: 'section-desc placeholder-coming-soon' }, '✨ Coming soon'),
    el('p', { class: 'section-desc' }, desc || `${label} is being built next.`),
  ]);
}

/* ============================================================
   Inheritance Tree
   ============================================================ */
const INHERIT_TREE_NAMES = { sk: 'Skeleton', kn: 'Knight', rn: 'Ranger', gh: 'Ghost', dr: 'Dragon' };
// Active-tree dropdown deliberately excludes Dragon — matches what was
// asked for explicitly. Dragon is still fully viewable/editable via its
// own tab, just not selectable as the "deployed" tree.
const INHERIT_ACTIVE_TREE_OPTIONS = ['sk', 'kn', 'rn', 'gh'];

function getInheritNodeValue(treeKey, nodeId) {
  return state.inheritance.progress[treeKey][nodeId] || 0;
}

function setInheritNodeValue(treeKey, nodeId, val) {
  state.inheritance.progress[treeKey][nodeId] = val;
}

function renderInheritNodeStatSummary(treeKey, nodeId, points) {
  const entries = DB.inherit_node_calc[`${treeKey}_${nodeId}`];
  let text = '';
  if (points && entries) {
    const parts = [];
    entries.forEach(entry => {
      const val = entry.vals[Math.min(points, entry.vals.length) - 1];
      const label = INHERIT_CALC_TO_LABEL[`${entry.calc}:${entry.ty}`];
      if (label && val != null) parts.push(`${label} +${Math.round(val * 10000) / 100}%`);
    });
    text = parts.join(', ');
  }
  // Always render this line, even empty — reserves the same vertical
  // space whether or not a node has stat text, so boxes with and without
  // a summary line still line up to the same height across the row.
  return el('div', { class: 'inherit-node-stats' }, text || '\u00A0');
}

function renderInheritNodeInput(treeKey, nodeId, max) {
  if (max === 0) return el('span', { class: 'inherit-node-na' }, '\u2014');
  const val = getInheritNodeValue(treeKey, nodeId);
  const input = el('input', {
    type: 'number', class: 'inherit-node-input', min: '0', max: String(max), value: String(val),
    'data-focus-id': `inherit-${treeKey}-${nodeId}`,
    oninput: (e) => {
      const n = parseInt(e.target.value, 10);
      const clamped = Number.isNaN(n) ? 0 : Math.max(0, Math.min(max, n));
      setInheritNodeValue(treeKey, nodeId, clamped);
      saveState();
    },
    onblur: () => render(),
  });
  return el('div', {}, [
    el('div', { class: 'inherit-node-input-wrap' }, [input, el('span', { class: 'inherit-node-max' }, `/${max}`)]),
    renderInheritNodeStatSummary(treeKey, nodeId, val),
  ]);
}

function renderInheritNodeRow(treeKey, nodeId, name, max) {
  return el('div', { class: 'inherit-node-row' }, [
    el('span', { class: 'inherit-node-name' }, name || '(unnamed)'),
    renderInheritNodeInput(treeKey, nodeId, max),
  ]);
}

function renderInheritTriplet(treeKey, seg, td, tm) {
  const idx = seg - 1;
  const row = el('div', { class: 'inherit-triplet-row' });

  const leftCol = el('div', { class: 'inherit-col' });
  ['a', 'b', 'c'].forEach((sub, i) => {
    const key = `l${seg}${sub}`;
    if (tm[key] !== undefined) leftCol.appendChild(renderInheritNodeBox(treeKey, key, td.left[idx][i], tm[key]));
  });

  const midCol = el('div', { class: 'inherit-col inherit-col-mid' });
  const midKey = `m${seg}`;
  if (tm[midKey] !== undefined) midCol.appendChild(renderInheritNodeBox(treeKey, midKey, td.mid[idx], tm[midKey]));

  const rightCol = el('div', { class: 'inherit-col' });
  ['a', 'b', 'c'].forEach((sub, i) => {
    const key = `r${seg}${sub}`;
    if (tm[key] !== undefined) rightCol.appendChild(renderInheritNodeBox(treeKey, key, td.right[idx][i], tm[key]));
  });

  row.appendChild(leftCol);
  row.appendChild(midCol);
  row.appendChild(rightCol);
  return row;
}

function renderInheritNodeBox(treeKey, nodeId, name, max) {
  return el('div', { class: 'inherit-node-box' }, [
    el('span', { class: 'inherit-node-name' }, name || '(unnamed)'),
    renderInheritNodeInput(treeKey, nodeId, max),
  ]);
}

function renderInheritanceShell() {
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'section-title-row' }, [
    el('div', { class: 'section-title' }, 'Inheritance Tree'),
    renderClearAllButton('Inheritance', () => {
      state.inheritance.progress = { sk: {}, kn: {}, rn: {}, gh: {}, dr: {} };
      saveState();
      render();
    }, true),
  ]));
  wrap.appendChild(el('p', { class: 'section-desc' },
    'The Active Tree is the deployed tree in battle, not the current skill level for the tree.'));

  // Active tree dropdown — sits above the tabs, deliberately a separate
  // concept from "which tab am I viewing right now."
  const activeRow = el('div', { class: 'inherit-active-row' });
  activeRow.appendChild(el('span', { class: 'equip-field-label' }, 'Active Tree'));
  const activeSelect = el('select', { class: 'equip-select', style: 'max-width:220px;' },
    INHERIT_ACTIVE_TREE_OPTIONS.map(k => el('option', { value: k, selected: k === state.inheritance.activeTree ? 'true' : null }, INHERIT_TREE_NAMES[k])));
  activeSelect.addEventListener('change', (e) => {
    state.inheritance.activeTree = e.target.value;
    saveState();
    render();
  });
  activeRow.appendChild(activeSelect);
  wrap.appendChild(activeRow);

  // Tree tabs
  const tabRow = el('div', { class: 'inherit-tab-row' });
  Object.keys(INHERIT_TREE_NAMES).forEach(k => {
    const isActive = k === state.inheritance.viewingTree;
    const isDeployed = k === state.inheritance.activeTree;
    tabRow.appendChild(el('button', {
      class: 'inherit-tab-btn' + (isActive ? ' active' : ''),
      onclick: () => { state.inheritance.viewingTree = k; render(); },
    }, [INHERIT_TREE_NAMES[k], isDeployed ? el('span', { class: 'inherit-deployed-dot' }) : null]));
  });
  wrap.appendChild(tabRow);

  const treeKey = state.inheritance.viewingTree;
  const td = DB.inherit_def[treeKey];
  const tm = DB.inherit_max[treeKey];

  const toolRow = el('div', { class: 'inherit-tool-row' });
  toolRow.appendChild(el('button', {
    class: 'bulk-action-btn primary',
    onclick: () => {
      Object.entries(tm).forEach(([nodeId, max]) => setInheritNodeValue(treeKey, nodeId, max));
      saveState();
      render();
    },
  }, 'Fill to Max'));
  toolRow.appendChild(renderClearAllButton(`${INHERIT_TREE_NAMES[treeKey]} tree`, () => {
    state.inheritance.progress[treeKey] = {};
    saveState();
    render();
  }));
  wrap.appendChild(toolRow);

  const grid = el('div', { class: 'inherit-chain' });

  // Hero node — only meaningfully investable at segment 1 (h2-h6 are empty
  // visual placeholders in the source data, no cost/function), sits at the
  // very top of the chain like the reference layout shows.
  const heroName = td.hero[0] || '';
  grid.appendChild(el('div', { class: 'inherit-chain-node inherit-chain-hero' }, [
    el('span', { class: 'inherit-node-name' }, heroName || 'Hero'),
    renderInheritNodeInput(treeKey, 'h1', tm.h1),
  ]));

  // The tree is really one continuous chain, not 6 independent groups:
  // each Left/Mid/Right triplet is followed by a standalone named
  // skill-rank node (Skeleton Recruit → ... → Bone King) before the next
  // triplet begins — confirmed against the reference layout and the
  // source data (skill[i-1] pairs with node s{i}, for i=1..5; s6 has no
  // name and max 0, so the chain just ends after the 6th triplet).
  for (let seg = 1; seg <= td.segments; seg++) {
    grid.appendChild(renderInheritTriplet(treeKey, seg, td, tm));

    const skillKey = `s${seg}`;
    const skillName = td.skill[seg - 1];
    if (tm[skillKey] !== undefined && tm[skillKey] > 0 && skillName) {
      grid.appendChild(el('div', { class: 'inherit-chain-node inherit-chain-skillname' }, [
        el('span', { class: 'inherit-node-name' }, skillName),
        renderInheritNodeInput(treeKey, skillKey, tm[skillKey]),
      ]));
    }
  }
  wrap.appendChild(grid);

  return wrap;
}

/* ============================================================
   Specialization Tree
   ============================================================ */
// General tree's 4 directions, renamed by theme per the dominant pattern
// observed in each direction's actual nodes (confirmed against the real
// extracted data — North is mostly PVP DMG Reduction tracks, etc.).
const SPEC_DIRECTION_LABELS = {
  N: 'PVP DMG Reduction', E: 'Mounted DMG Reduction', S: 'Pet Damage Boost', W: 'Artifact DMG Boost',
};

function specTrackKey(group, trackName) {
  return `${group}||${trackName}`;
}

// Parses "N Tier 3" -> { dir: 'N', tierNum: 3 }. Group names are otherwise
// free text, so this is deliberately strict — a non-match returns null
// rather than guessing, since silently misparsing a direction/tier would
// corrupt the whole cascade below it.
function parseSpecGroupName(groupName) {
  const m = (groupName || '').trim().match(/^([NESW])\s+Tier\s+(\d+)$/i);
  if (!m) return null;
  return { dir: m[1].toUpperCase(), tierNum: parseInt(m[2], 10) };
}

// Direction -> tier groups, sorted ascending by tier number, each tagged
// with its parsed tier number for quick lookup by the cascade below.
function buildSpecDirectionIndex() {
  const byDir = { N: [], E: [], S: [], W: [] };
  (DB.General || []).forEach(g => {
    const parsed = parseSpecGroupName(g.group);
    if (parsed && byDir[parsed.dir]) byDir[parsed.dir].push({ tierNum: parsed.tierNum, group: g });
  });
  Object.keys(byDir).forEach(dir => byDir[dir].sort((a, b) => a.tierNum - b.tierNum));
  return byDir;
}

// Walks backward from one tier through every earlier tier in the same
// direction, raising whatever prerequisite tracks the game's own
// progression rules actually require — never lowering anything already
// higher than the minimum, so a deliberate extra investment isn't
// clobbered back down.
//
//   N direction: the entire previous tier must be fully maxed before the
//   next tier can hold any investment at all — every earlier tier gets
//   every one of its tracks maxed, all the way back to Tier 1.
//
//   E/S/W directions: the tree's own layout converges and diverges — a
//   tier with 3 tracks can feed into a single-track tier ahead of it, or
//   a single track can fan back out into 3. Matching is by POSITION
//   within each tier's track list, not by name: Tier 12's 1st track can
//   pair with Tier 11's 1st track even when the two share no words at
//   all ("Dragon Armor Beast's Blessing" ↔ "Blessing of Capytti Veyron").
//   That pairing only holds when both tiers have the same track count —
//   whenever the count changes between adjacent tiers (a converge or
//   diverge point), there's no clean 1-to-1 mapping, so every track in
//   the earlier tier becomes required instead of just one.
function autoFillSpecPrerequisites(tab, group, trackName) {
  const parsed = parseSpecGroupName(group.group);
  if (!parsed) return;
  const { dir, tierNum } = parsed;
  const dirIndex = buildSpecDirectionIndex()[dir];
  if (!dirIndex) return;

  const raiseTo = (groupName, name, level) => {
    if (getSpecTrackLevel(tab, groupName, name) < level) {
      setSpecTrackLevel(tab, groupName, name, level);
    }
  };

  if (dir === 'N') {
    dirIndex.forEach(entry => {
      if (entry.tierNum >= tierNum) return;
      entry.group.tracks.forEach(t => raiseTo(entry.group.group, t.name, t.levels.length));
    });
    return;
  }

  // Starts from just the one track's position that triggered this, not
  // every track in the tier — a different, uninvested track sitting in
  // the same tier shouldn't get pulled into a cascade nobody asked for.
  const startIdx = group.tracks.findIndex(t => t.name === trackName);
  if (startIdx === -1) return;

  let neededIndices = [startIdx];
  let producingTierCount = group.tracks.length;

  for (let n = tierNum - 1; n >= 1; n--) {
    const entry = dirIndex.find(e => e.tierNum === n);
    if (!entry) continue;
    const thisTierCount = entry.group.tracks.length;

    const indicesToSatisfy = thisTierCount === producingTierCount
      ? neededIndices
      : entry.group.tracks.map((_, i) => i);

    indicesToSatisfy.forEach(i => {
      const t = entry.group.tracks[i];
      if (t) raiseTo(entry.group.group, t.name, 1);
    });

    neededIndices = indicesToSatisfy;
    producingTierCount = thisTierCount;
  }
}

function getSpecTrackLevel(tab, group, trackName) {
  return state.specialization.progress[tab][specTrackKey(group, trackName)] || 0;
}

function setSpecTrackLevel(tab, group, trackName, level) {
  state.specialization.progress[tab][specTrackKey(group, trackName)] = level;
}

function specGroupInvested(tab, group) {
  return group.tracks.reduce((sum, t) => sum + getSpecTrackLevel(tab, group.group, t.name), 0);
}

// Display-only — strips the "N "/"E "/"S "/"W " prefix from General tab
// group names ("N Tier 1" → "Tier 1"), since the direction is already
// shown by which accordion the row sits in. The underlying group.group
// value (used as the state key) is untouched.
function specDisplayGroupName(group) {
  return group.group.replace(/^[NESW]\s+/, '');
}

// For the drawer title specifically — includes the direction's full name
// ("PVP DMG Reduction — Tier 4") since multiple directions can each have
// their own identically-numbered tier, and the simplified list label
// alone isn't enough to tell them apart once the drawer is open full-screen.
function specDrawerTitle(tab, group) {
  const base = specDisplayGroupName(group);
  if (tab !== 'General') return base;
  const dir = group.group.trim()[0];
  return SPEC_DIRECTION_LABELS[dir] ? `${SPEC_DIRECTION_LABELS[dir]} \u2014 ${base}` : base;
}

function renderSpecTierRow(tab, group) {
  const invested = specGroupInvested(tab, group);
  const hasInvestment = invested > 0;
  const names = group.tracks.map(t => t.name).join(', ');

  const row = el('div', {
    class: 'spec-tier-row' + (hasInvestment ? '' : ' empty'),
    onclick: () => openSpecDrawer(tab, group),
  }, [
    el('div', {}, [
      el('div', { class: 'spec-tier-group-label' }, specDisplayGroupName(group)),
      el('div', { class: 'spec-tier-track-names' }, names),
    ]),
    el('span', { class: 'spec-tier-points' }, `${invested} pts`),
  ]);
  return row;
}

// Tracks the currently-open Specialization drawer (if any) so a new
// openSpecDrawer call can force-remove it synchronously rather than
// relying on the 250ms close animation's delayed removal — without this,
// tapping a tier row again quickly (e.g. close then immediately reopen)
// could leave a stale drawer instance alive in the DOM alongside the new
// one, sharing the same backdrop/overlay space.
let currentSpecDrawer = null;

function openSpecDrawer(tab, group) {
  if (currentSpecDrawer) {
    currentSpecDrawer.backdrop.remove();
    currentSpecDrawer.drawer.remove();
    currentSpecDrawer = null;
  }

  const backdrop = el('div', { class: 'spec-drawer-backdrop' });
  const drawer = el('div', { class: 'spec-drawer' });

  const close = () => {
    drawer.classList.remove('open');
    backdrop.remove();
    setTimeout(() => drawer.remove(), 250);
    if (currentSpecDrawer && currentSpecDrawer.drawer === drawer) currentSpecDrawer = null;
    // The tier row's own points and the accordion header's running total
    // both live in #root, outside the drawer — they never picked up
    // changes made while the drawer was open until this re-render.
    render();
  };
  backdrop.addEventListener('click', close);

  drawer.appendChild(el('div', { class: 'spec-drawer-handle' }));
  drawer.appendChild(el('div', { class: 'spec-drawer-header' }, [
    el('span', { class: 'spec-drawer-title' }, specDrawerTitle(tab, group)),
    el('button', { class: 'spec-drawer-close', onclick: close }, '\u2715'),
  ]));

  const applyLevelFns = [];
  const fillToMaxBtn = el('button', { class: 'bulk-action-btn primary' }, 'Fill to Max');
  fillToMaxBtn.addEventListener('click', () => applyLevelFns.forEach(fn => fn.max()));
  drawer.appendChild(el('div', { class: 'spec-drawer-tool-row' }, [fillToMaxBtn]));

  group.tracks.forEach(track => {
    const max = track.levels.length;
    const currentLevel = getSpecTrackLevel(tab, group.group, track.name);
    // Tracks like "General Enhancement" or "Mount Enhancement" don't grant
    // numeric stats — each level just names a different unlock ("Upgrade
    // Spell Master", "Upgrade Alchemist"...). For those, show every
    // level's name up front as a reference, since there's no single
    // number a stepper conveys on its own the way "+5% ATK" does.
    const isNamedUpgrade = track.levels.some(l => l && l.startsWith('Upgrade '));
    const stripLevelText = (text) => text && text.startsWith('Upgrade ') ? text.slice('Upgrade '.length) : text;

    const imgSlot = el('div', { class: 'spec-track-img' });
    if (track.image) imgSlot.appendChild(el('img', { src: track.image, alt: track.name }));

    const applyLevel = (n) => {
      const clamped = Math.max(0, Math.min(max, n));
      setSpecTrackLevel(tab, group.group, track.name, clamped);
      // Investing in a track should automatically satisfy whatever
      // earlier-tier prerequisites the game's own rules require for it —
      // nobody should have to remember to go fill in earlier tiers by
      // hand, or find and press a separate button, every time they raise
      // something further along. Only fires while actually raising a
      // track above 0; autoFillSpecPrerequisites only ever raises levels
      // too, so calling it repeatedly (or after a decrease that's still
      // above 0) is always safe — it just confirms what's already there.
      if (clamped > 0) autoFillSpecPrerequisites(tab, group, track.name);
      saveState();
      input.value = clamped === 0 && document.activeElement === input ? '' : String(clamped);
      if (effectDiv) effectDiv.textContent = clamped > 0 ? stripLevelText(track.levels[clamped - 1]) : 'Not yet invested';
      if (summaryDiv) {
        const activeSummary = track.levels.slice(0, clamped).map((l, i) => `Level ${i + 1}: ${stripLevelText(l)}`).join(', ');
        summaryDiv.textContent = activeSummary;
        summaryDiv.style.display = clamped > 0 ? '' : 'none';
      }
      return clamped;
    };
    applyLevelFns.push({ max: () => applyLevel(max) });

    const input = el('input', {
      type: 'number', class: 'spec-track-input', min: '0', max: String(max), value: String(currentLevel),
      placeholder: '0',
      oninput: (e) => {
        const n = parseInt(e.target.value, 10);
        applyLevel(Number.isNaN(n) ? 0 : n);
      },
      // 0 stays a real value once you click away — the placeholder-on-focus
      // behavior is purely a typing convenience, not a way to hide 0 itself.
      onfocus: (e) => { if (e.target.value === '0') e.target.value = ''; },
      onblur: (e) => { if (e.target.value === '') e.target.value = '0'; },
    });
    const minusBtn = el('button', { class: 'spec-stepper-btn', onclick: () => applyLevel(getSpecTrackLevel(tab, group.group, track.name) - 1) }, '\u2212');
    const plusBtn = el('button', { class: 'spec-stepper-btn', onclick: () => applyLevel(getSpecTrackLevel(tab, group.group, track.name) + 1) }, '+');

    drawer.appendChild(el('div', { class: 'spec-track-row' }, [
      el('div', { class: 'spec-track-left' }, [imgSlot, el('span', { class: 'spec-track-name' }, track.name)]),
      el('div', { class: 'spec-track-input-wrap' }, [minusBtn, input, plusBtn, el('span', { class: 'spec-track-max' }, `/${max}`)]),
    ]));

    // Only levels actually reached so far are shown — an un-invested track
    // shows nothing here at all, and investing partway shows just "Level
    // 1: X, Level 2: Y" up through the current level, not the full list
    // including levels not yet unlocked.
    let summaryDiv = null;
    if (isNamedUpgrade) {
      const activeSummary = track.levels.slice(0, currentLevel).map((l, i) => `Level ${i + 1}: ${stripLevelText(l)}`).join(', ');
      summaryDiv = el('div', { class: 'spec-track-effect', style: `color:var(--text-tertiary);${currentLevel > 0 ? '' : 'display:none;'}` }, activeSummary);
      drawer.appendChild(summaryDiv);
    }

    // Named-upgrade tracks skip this second line entirely — the summary
    // above already ends with the current level's name as its last entry,
    // so repeating it here would show right underneath, reading like the
    // name appeared twice.
    let effectDiv = null;
    if (!isNamedUpgrade) {
      effectDiv = el('div', { class: 'spec-track-effect' },
        currentLevel > 0 ? stripLevelText(track.levels[currentLevel - 1]) : 'Not yet invested');
      drawer.appendChild(effectDiv);
    }
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  currentSpecDrawer = { backdrop, drawer };
  requestAnimationFrame(() => drawer.classList.add('open'));
}

function renderSpecGeneralTab() {
  const wrap = el('div', {});
  const groups = DB.General || [];
  const byDirection = { N: [], E: [], S: [], W: [] };
  groups.forEach(g => {
    const dir = g.group.trim()[0];
    if (byDirection[dir]) byDirection[dir].push(g);
  });

  ['N', 'E', 'S', 'W'].forEach(dir => {
    const dirGroups = byDirection[dir];
    if (!dirGroups.length) return;
    const totalInvested = dirGroups.reduce((sum, g) => sum + specGroupInvested('General', g), 0);
    const content = el('div', {}, dirGroups.map(g => renderSpecTierRow('General', g)));
    wrap.appendChild(renderAccordion(`${SPEC_DIRECTION_LABELS[dir]} (${dirGroups.length} tiers, ${totalInvested} pts)`, content, true, true));
  });

  return wrap;
}

function renderSpecAdventureTab() {
  const wrap = el('div', {});
  const groups = DB.Adventure || [];
  groups.forEach(g => wrap.appendChild(renderSpecTierRow('Adventure', g)));
  return wrap;
}

function renderSpecializationShell() {
  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'section-title-row' }, [
    el('div', { class: 'section-title' }, 'Specialization'),
    renderClearAllButton('Specialization', () => {
      state.specialization.progress = { General: {}, Adventure: {} };
      saveState();
      render();
    }, true),
  ]));

  const tabRow = el('div', { class: 'spec-tab-row' });
  const tabBtnGroup = el('div', { class: 'spec-tab-btn-group' });
  [['adventure', 'Adventurer'], ['general', 'General']].forEach(([key, label]) => {
    tabBtnGroup.appendChild(el('button', {
      class: 'spec-tab-btn' + (state.specialization.viewingTab === key ? ' active' : ''),
      onclick: () => { state.specialization.viewingTab = key; render(); },
    }, label));
  });
  tabRow.appendChild(tabBtnGroup);

  const isGeneral = state.specialization.viewingTab === 'general';
  const dbTab = isGeneral ? 'General' : 'Adventure';
  const rightGroup = el('div', { class: 'spec-tab-right-group' });
  rightGroup.appendChild(el('button', {
    class: 'bulk-action-btn primary',
    onclick: () => {
      (DB[dbTab] || []).forEach(group => {
        group.tracks.forEach(track => setSpecTrackLevel(dbTab, group.group, track.name, track.levels.length));
      });
      saveState();
      render();
    },
  }, 'Fill All to Max'));
  rightGroup.appendChild(renderClearAllButton(`${isGeneral ? 'General' : 'Adventurer'} tree`, () => {
    state.specialization.progress[dbTab] = {};
    saveState();
    render();
  }));
  tabRow.appendChild(rightGroup);
  wrap.appendChild(tabRow);

  wrap.appendChild(isGeneral ? renderSpecGeneralTab() : renderSpecAdventureTab());

  return wrap;
}

/* ============================================================
   Equipment
   ============================================================ */
const EQUIPMENT_SLOTS = [
  { id: 'weapon', label: 'Weapon', dataKey: 'weapons', psiKey: 'weapon', gemKey: 'weapon', imgKind: 'weapons' },
  { id: 'armor', label: 'Armor', dataKey: 'armors', psiKey: 'armor', gemKey: 'armor', imgKind: 'armors' },
  { id: 'ring1', label: 'Ring 1', dataKey: 'rings', psiKey: 'ring', gemKey: 'ring', imgKind: 'rings' },
  { id: 'ring2', label: 'Ring 2', dataKey: 'rings', psiKey: 'ring', gemKey: 'ring', imgKind: 'rings' },
  { id: 'accessory1', label: 'Accessory 1', dataKey: 'accessories', psiKey: 'accessory', gemKey: 'accessory', imgKind: 'accessories' },
  { id: 'accessory2', label: 'Accessory 2', dataKey: 'accessories', psiKey: 'accessory', gemKey: 'accessory', imgKind: 'accessories' },
];

const GEM_TIER_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Immortal', 'Transcendent', 'Peerless'];

function getEquipState(slotId) {
  if (!state.equipment[slotId]) {
    state.equipment[slotId] = {
      itemName: '', quality: '', surpass: 0, arcana: -1, // -1 = "No Arcana"
      psionics: [0, 1, 2, 3].map(() => ({ stat: '', val: 0 })),
      gems: [0, 1, 2, 3, 4].map(() => ({ gemId: '', tier: 9 })), // tier 9 = Peerless
    };
  }
  return state.equipment[slotId];
}

function buildEquipmentSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Quality defaults to Mythic and gems default to peerless'));
  const grid = el('div', { class: 'equip-grid' });
  EQUIPMENT_SLOTS.forEach(slotDef => grid.appendChild(renderEquipCard(slotDef)));
  wrap.appendChild(grid);
  return wrap;
}

function buildPetSectionContent() {
  const wrap = el('div', {});
  const petGrid = el('div', { class: 'equip-grid' });
  [0, 1, 2].forEach(i => petGrid.appendChild(renderEquipPetCard(i)));
  wrap.appendChild(petGrid);
  return wrap;
}

function buildMountsSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Mounts that are marked as owned in collections are allowed to be equipped here.'));
  const mainGrid = el('div', { class: 'equip-grid equip-grid-single' });
  mainGrid.appendChild(renderDeployCard('mount', 'star', null));
  wrap.appendChild(mainGrid);
  const grid = el('div', { class: 'equip-grid' });
  [0, 1, 2].forEach(i => grid.appendChild(renderDeployCard('mount', 'awaken', i)));
  wrap.appendChild(grid);
  return wrap;
}

function buildArtifactsSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Artifacts that are marked as owned in collections are allowed to be equipped here.'));
  const mainGrid = el('div', { class: 'equip-grid equip-grid-single' });
  mainGrid.appendChild(renderDeployCard('artifact', 'star', null));
  wrap.appendChild(mainGrid);
  const grid = el('div', { class: 'equip-grid' });
  [0, 1, 2].forEach(i => grid.appendChild(renderDeployCard('artifact', 'awaken', i)));
  wrap.appendChild(grid);
  return wrap;
}

/* ---------- Adventurer, Heroes & Brands ---------- */

// Adventurer tier_effects mix skill descriptions with plain stat-buff lines
// ("Adventurer's ATK +25%"). The "main skill" shown at any star level is the
// latest non-buff entry at or below that level; buffs are summed separately
// across every buff entry up to that level (confirmed additive, same as
// every other tiered-bonus system in this app).
function parseAdventurerStatBuff(text) {
  const m = text && text.match(/^Adventurer'?s (\w+) \+(\d+(?:\.\d+)?)%$/);
  return m ? { stat: m[1], val: parseFloat(m[2]) } : null;
}
function computeAdventurerDisplay(tierEffects, stars) {
  let mainSkillIdx = -1, mainSkillText = null;
  const statTotals = {};
  for (let i = 0; i <= stars && i < (tierEffects || []).length; i++) {
    const text = tierEffects[i];
    if (!text) continue;
    const buff = parseAdventurerStatBuff(text);
    if (buff) statTotals[buff.stat] = (statTotals[buff.stat] || 0) + buff.val;
    else { mainSkillIdx = i; mainSkillText = text; }
  }
  return { mainSkillIdx, mainSkillText, statTotals };
}

function renderAdventurerCard() {
  const s = state.adventurerSlot;
  const advs = (DB.adventurers || []).filter(a => a.n !== 'None');
  const adv = advs.find(a => a.n === s.name);

  const card = el('div', { class: 'item-card equip-card--adventurer' });
  card.appendChild(renderEquipHeader('adventurers', adv, 'Adventurer'));

  card.appendChild(equipFieldLabel('Adventurer'));
  card.appendChild(renderSearchCombo({
    value: s.name,
    options: advs.map(a => a.n),
    placeholder: 'Search adventurers…',
    getImage: (name) => {
      const a = advs.find(x => x.n === name);
      return a ? itemImagePath('adventurers', a) : null;
    },
    onSelect: (name) => { s.name = name; s.stars = 0; saveState(); render(); },
    onClear: () => { s.name = ''; s.stars = 0; saveState(); render(); },
  }));

  if (!adv) return card;

  card.appendChild(equipFieldLabel('Stars'));
  card.appendChild(el('input', {
    type: 'number', class: 'equip-select', min: '0', value: String(s.stars || 0),
    oninput: (e) => {
      const n = parseInt(e.target.value, 10);
      s.stars = Number.isNaN(n) ? 0 : Math.max(0, n);
      saveState();
      render();
    },
  }));

  const { mainSkillIdx, mainSkillText, statTotals } = computeAdventurerDisplay(adv.tier_effects, s.stars);
  if (mainSkillText) {
    card.appendChild(equipFieldLabel(`Main Skill (level ${mainSkillIdx} skill)`));
    card.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(mainSkillText)));
  }
  const buffParts = Object.entries(statTotals).map(([k, v]) => `${k} +${Math.round(v * 100) / 100}%`);
  if (buffParts.length) {
    card.appendChild(equipFieldLabel('Adventurer Stat Buffs'));
    card.appendChild(el('div', { class: 'equip-writeup' }, buffParts.join(', ')));
  }

  return card;
}

// NOTE ON CATEGORIZATION: the source data has no S/Basic split for heroes,
// or SS/S/Basic split for brands — only the 4 named Inheritance Heroes are
// confirmed. Everything else defaults into one placeholder bucket below
// until that classification is provided; flagged clearly so it's not
// mistaken for confirmed data.
const INHERITANCE_HERO_NAMES = new Set(['Legendary Ranger', 'Legendary Knight', 'Ghost Princess', 'Bone King']);
function classifyHero(name) {
  return INHERITANCE_HERO_NAMES.has(name) ? 'Inheritance Heroes' : 'Basic Heroes';
}
function classifyBrand(name) {
  return 'Basic Brands';
}

function hasRealPolarization(entity) {
  return Object.values(entity.polarization_effects || {}).some(v => v != null);
}

function renderHeroOrBrandCard(kind, slotIndex) {
  const isHero = kind === 'hero';
  const s = isHero ? state.heroSlots[slotIndex] : state.brandSlots[slotIndex];
  const all = isHero ? (DB.heroes || []).filter(h => h.n !== 'None') : (DB.brands || []);
  const classify = isHero ? classifyHero : classifyBrand;
  const groupOrder = isHero ? ['S Heroes', 'Basic Heroes', 'Inheritance Heroes'] : ['SS Brands', 'S Brands', 'Basic Brands'];

  // Hide non-allowed Inheritance Heroes entirely — future-proofed even
  // though every Inheritance-classified hero we have today is allowed.
  let options = isHero
    ? all.filter(h => classify(h.n) !== 'Inheritance Heroes' || INHERITANCE_HERO_NAMES.has(h.n))
    : all;

  // Brands can't be equipped twice across the 4 slots — once one's
  // chosen somewhere, it drops out of every other slot's dropdown. Not
  // applied to Heroes here since she asked specifically about Brands;
  // the current slot's own selection stays visible/re-selectable, since
  // this only excludes a name claimed by a DIFFERENT slot index.
  if (!isHero) {
    const takenElsewhere = new Set(
      state.brandSlots
        .filter((slot, i) => i !== slotIndex && slot.name)
        .map(slot => slot.name)
    );
    options = options.filter(o => !takenElsewhere.has(o.n));
  }

  const entity = options.find(x => x.n === s.name);
  const label = isHero ? `Hero ${slotIndex + 1}` : `Brand ${slotIndex + 1}`;
  const imgKind = isHero ? 'heroes' : 'brands';

  const card = el('div', { class: 'item-card equip-card--hero-brand' });
  card.appendChild(renderEquipHeader(imgKind, entity, label));

  card.appendChild(equipFieldLabel(label));
  const byGroup = {};
  options.forEach(o => { (byGroup[classify(o.n)] = byGroup[classify(o.n)] || []).push(o); });
  const sortedOptions = groupOrder.filter(g => byGroup[g]).flatMap(g => byGroup[g]);
  const optionLabel = (o) => o.n;

  card.appendChild(renderSearchCombo({
    value: entity ? optionLabel(entity) : '',
    options: sortedOptions.map(optionLabel),
    placeholder: `Search ${isHero ? 'heroes' : 'brands'}…`,
    getImage: (name) => {
      const o = sortedOptions.find(x => optionLabel(x) === name);
      return o ? itemImagePath(imgKind, o) : null;
    },
    onSelect: (chosenLabel) => {
      const newEntity = sortedOptions.find(o => optionLabel(o) === chosenLabel);
      if (!newEntity) return;
      s.name = newEntity.n;
      // Inheritance Heroes default to Rare, not the usual highest-available —
      // they're the low-investment tier tied to the inheritance tree, so
      // assuming Mythic like everything else doesn't fit.
      if (classify(newEntity.n) === 'Inheritance Heroes' && (newEntity.q || []).includes('Rare')) {
        s.quality = 'Rare';
      } else {
        s.quality = newEntity.q && newEntity.q.length ? newEntity.q[newEntity.q.length - 1] : '';
      }
      s.polarization = 0;
      saveState();
      render();
    },
    onClear: () => {
      s.name = '';
      s.quality = '';
      s.polarization = 0;
      saveState();
      render();
    },
  }));

  if (!entity) return card;

  card.appendChild(equipFieldLabel('Quality'));
  const qualOpts = entity.q || [];
  const qualitySelect = el('select', { class: 'equip-select', disabled: qualOpts.length ? null : 'true' },
    qualOpts.length
      ? qualOpts.map(q => el('option', { value: q, selected: q === s.quality ? 'true' : null }, q))
      : [el('option', { value: '' }, '—')]);
  qualitySelect.addEventListener('change', (e) => { s.quality = e.target.value; saveState(); render(); });
  card.appendChild(qualitySelect);

  const showPolarization = hasRealPolarization(entity);
  if (showPolarization) {
    const isMythic = s.quality === 'Mythic';
    card.appendChild(equipFieldLabel('Polarization'));
    const polOpts = Array.from({ length: 10 }, (_, i) => i + 1);
    const polSelect = el('select', { class: 'equip-select', disabled: isMythic ? null : 'true' }, [
      el('option', { value: '0', selected: !isMythic || s.polarization === 0 ? 'true' : null }, 'Not Polarised'),
      ...polOpts.map(p => el('option', { value: String(p), selected: p === s.polarization ? 'true' : null }, `P${p}`)),
    ]);
    polSelect.addEventListener('change', (e) => { s.polarization = parseInt(e.target.value, 10); saveState(); render(); });
    card.appendChild(polSelect);
  }

  if (entity.quality_effects && s.quality) {
    const text = entity.quality_effects[s.quality];
    if (text) {
      card.appendChild(equipFieldLabel(`${s.quality} Skill`));
      card.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(text)));
    }
  }
  if (showPolarization && s.quality === 'Mythic' && s.polarization > 0) {
    const text = entity.polarization_effects[`P${s.polarization}`];
    if (text) {
      card.appendChild(equipFieldLabel(`P${s.polarization} Bonus`));
      card.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(text)));
    }
  }

  return card;
}

function buildAdventurerHeroBrandSectionContent() {
  const wrap = el('div', {});

  wrap.appendChild(el('div', { class: 'equip-section-title' }, 'Adventurer'));
  const advGrid = el('div', { class: 'equip-grid equip-grid-single' });
  advGrid.appendChild(renderAdventurerCard());
  wrap.appendChild(advGrid);

  wrap.appendChild(el('div', { class: 'equip-section-title' }, 'Heroes'));
  const heroGrid = el('div', { class: 'equip-grid' });
  [0, 1].forEach(i => heroGrid.appendChild(renderHeroOrBrandCard('hero', i)));
  wrap.appendChild(heroGrid);

  wrap.appendChild(el('div', { class: 'equip-section-title' }, 'Brands'));
  const brandGrid = el('div', { class: 'equip-grid' });
  [0, 1, 2, 3].forEach(i => brandGrid.appendChild(renderHeroOrBrandCard('brand', i)));
  wrap.appendChild(brandGrid);

  return wrap;
}


const EQUIPMENT_SECTIONS = [
  { id: 'equip-equipment', label: 'Equipment', build: buildEquipmentSectionContent, clearAll: () => { state.equipment = {}; saveState(); render(); } },
  { id: 'equip-pet', label: 'Pet', build: buildPetSectionContent, clearAll: () => {
    state.petSlots = state.petSlots.map(() => ({
      itemName: '', arcana: -1, level: 0, armament: '', armamentLevel: 1,
      skills: [{ stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }],
    }));
    saveState(); render();
  } },
  { id: 'equip-relics', label: 'Relics', build: buildRelicsSectionContent, clearAll: () => { state.relicSlots = { totem1: null, totem2: null, core: null, guardian: null }; saveState(); render(); } },
  { id: 'equip-mounts', label: 'Mounts', build: buildMountsSectionContent, clearAll: () => {
    state.mountSlots = [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }];
    state.mountMainSlot = { itemIdx: null };
    saveState(); render();
  } },
  { id: 'equip-artifacts', label: 'Artifacts', build: buildArtifactsSectionContent, clearAll: () => {
    state.artifactSlots = [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }];
    state.artifactMainSlot = { itemIdx: null };
    saveState(); render();
  } },
  { id: 'equip-adv-hero-brand', label: 'Adventurer, Heroes & Brands', build: buildAdventurerHeroBrandSectionContent, clearAll: () => {
    state.adventurerSlot = { name: '', stars: 0 };
    state.heroSlots = state.heroSlots.map(() => ({ name: '', quality: '', polarization: 0 }));
    state.brandSlots = state.brandSlots.map(() => ({ name: '', quality: '', polarization: 0 }));
    saveState(); render();
  } },
];

const RELIC_DEPLOY_SLOTS = [
  { key: 'totem1', label: 'Totem 1', type: 'totem' },
  { key: 'totem2', label: 'Totem 2', type: 'totem' },
  { key: 'core', label: 'Core', type: 'core' },
  { key: 'guardian', label: 'Guardian', type: 'guardian' },
];

function buildRelicsSectionContent() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'Relics that are marked as owned in collections are allowed to be equipped here'));
  const grid = el('div', { class: 'equip-grid' });
  RELIC_DEPLOY_SLOTS.forEach(slot => grid.appendChild(renderRelicDeployCard(slot)));
  wrap.appendChild(grid);
  return wrap;
}

function renderRelicDeployCard(slotDef) {
  const relics = (DB.relics || []).filter(r => r.deploy_type === slotDef.type);
  let ownedOptions = sortByTierDesc(relics.filter(r => state.relicOwned[r.n]), 'rarity');
  const currentName = state.relicSlots[slotDef.key];

  // Same duplicate-exclusion as Brands — a relic already equipped in a
  // different slot drops out of every other slot's dropdown. Most
  // relevant for Totem 1/2 specifically, since they're the only two
  // slots that share a deploy_type pool (Core and Guardian each have
  // their own distinct type, so this could never come up there in the
  // first place). The current slot's own selection stays visible/
  // re-selectable, since this only excludes a name claimed by a
  // DIFFERENT slot key.
  const takenElsewhere = new Set(
    Object.entries(state.relicSlots)
      .filter(([key, name]) => key !== slotDef.key && name)
      .map(([, name]) => name)
  );
  ownedOptions = ownedOptions.filter(r => !takenElsewhere.has(r.n));

  const relic = ownedOptions.find(r => r.n === currentName) || null;

  const card = el('div', { class: 'item-card equip-card--pulled' });
  card.appendChild(renderEquipHeader('relics', relic, slotDef.label));

  const linkText = 'Information prefilled from your Collections. To update it, please change it ';
  const link = el('a', {
    href: '#', class: 'equip-collection-link',
    onclick: (e) => { e.preventDefault(); goToCollectionSection('relics'); },
  }, 'here');
  card.appendChild(el('p', { class: 'equip-prefill-note' }, [linkText, link, '.']));

  card.appendChild(equipFieldLabel(slotDef.label));
  if (!ownedOptions.length) {
    card.appendChild(el('div', { class: 'equip-writeup' },
      `You haven't marked any owned ${slotDef.type}-type relics in Collection yet.`));
    return card;
  }

  const combo = renderSearchCombo({
    value: currentName || '',
    options: ownedOptions.map(r => r.n),
    placeholder: `Search ${slotDef.label.toLowerCase()}…`,
    getImage: (name) => {
      const r = ownedOptions.find(x => x.n === name);
      return r ? itemImagePath('relics', r) : null;
    },
    onSelect: (name) => { state.relicSlots[slotDef.key] = name; saveState(); render(); },
    onClear: () => { state.relicSlots[slotDef.key] = null; saveState(); render(); },
  });
  card.appendChild(combo);

  if (!relic) return card;

  const star = state.relicStars[relic.n] || 0;
  card.appendChild(equipFieldLabel('Stars'));
  card.appendChild(el('div', { class: 'equip-writeup' }, `${star}★`));

  // Same tiered-effect logic as the Collection relic card — the same
  // 0★/5★/10★ breakpoints, since deployed relics don't get finer granularity.
  let effectText = relic.effect;
  let effectLabel = '10★';
  if (relic.effect_base) {
    if (star < 5) { effectText = relic.effect_base; effectLabel = '0★'; }
    else if (star < 10) { effectText = relic.effect_5star; effectLabel = '5★'; }
    else { effectText = relic.effect; effectLabel = '10★'; }
  }
  if (effectText) {
    card.appendChild(equipFieldLabel(`${effectLabel} Skill`));
    card.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(effectText)));
  }

  if (relic.star_stats) {
    const nodes = formatStatBlockNodes(
      Object.fromEntries(Object.entries(relic.star_stats).map(([stat, vals]) => [stat, vals[star]]))
    );
    card.appendChild(equipFieldLabel('Stats'));
    card.appendChild(el('div', { class: 'equip-writeup' }, nodes));
  }

  return card;
}

function renderEquipmentShell() {
  return renderSectionShell(EQUIPMENT_SECTIONS, 'Equipment', clearAllEquipment);
}

function clearAllEquipment() {
  state.equipment = {};
  state.petSlots = state.petSlots.map(() => ({
    itemName: '', arcana: -1, level: 0, armament: '', armamentLevel: 1,
    skills: [{ stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }, { stat: '', val: 0 }],
  }));
  state.mountSlots = [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }];
  state.mountMainSlot = { itemIdx: null };
  state.artifactSlots = [{ itemIdx: null }, { itemIdx: null }, { itemIdx: null }];
  state.artifactMainSlot = { itemIdx: null };
  state.relicSlots = { totem1: null, totem2: null, core: null, guardian: null };
  state.adventurerSlot = { name: '', stars: 0 };
  state.heroSlots = state.heroSlots.map(() => ({ name: '', quality: '', polarization: 0 }));
  state.brandSlots = state.brandSlots.map(() => ({ name: '', quality: '', polarization: 0 }));
  saveState();
  render();
}

// Reusable "Clear All" trigger + confirmation modal, used at the top of
// every Collection section and the whole Equipment tab. Destructive confirm
// button is visually distinct from the neutral cancel button — the trigger
// itself stays low-key until someone actually commits to the modal.
function renderClearAllButton(label, onConfirm, pageWide) {
  return el('button', {
    class: 'clear-all-btn',
    onclick: () => openClearAllModal(label, onConfirm),
  }, pageWide ? `Clear All ${label}` : 'Clear All');
}

function openClearAllModal(label, onConfirm) {
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });
  const box = el('div', { class: 'modal-box modal-box-confirm' }, [
    el('div', { class: 'modal-title' }, `Clear ${label}?`),
    el('p', { class: 'modal-confirm-text' },
      `All data within the ${label} will be cleared.`),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'bulk-action-btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'bulk-action-btn destructive',
        onclick: () => { onConfirm(); closeModal(); },
      }, 'Continue'),
    ]),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  function closeModal() { overlay.remove(); }
}

// Jumps to a Collection section from a different tab — switches tabs first,
// then scrolls once the new content has actually rendered.
function goToCollectionSection(sectionId) {
  activeMainTab = 'collection';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'collection'));
  render();
  setTimeout(() => {
    const target = document.getElementById(sectionId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

/* ---------- Pet card ---------- */
// A proper custom combobox — text input + a clickable filtered dropdown —
// replacing the native <input list> + <datalist> pattern, which has real
// cross-browser reliability problems (Safari's support is especially
// unreliable) and had no way to actually clear a selection once made: the
// box could look empty while the old value stayed active underneath.
// Filtering while typing updates only the dropdown's own DOM locally, not
// a full app re-render, so the input never loses focus mid-type.
function renderSearchCombo({ value, options, placeholder, onSelect, onClear, getImage, showValueIcon }) {
  const container = el('div', { class: 'search-combo' + (showValueIcon ? ' has-value-icon' : '') });
  const input = el('input', {
    type: 'text', class: 'equip-combo-input', placeholder, value: value || '',
    autocomplete: 'off',
  });
  // Only meaningful alongside getImage — shows the currently selected
  // option's own thumbnail inside the input, not just in the dropdown
  // list while it's open, so the icon stays visible as a constant
  // reference rather than only appearing momentarily while choosing.
  if (showValueIcon && getImage && value) {
    const src = getImage(value);
    if (src) {
      container.appendChild(el('img', {
        class: 'search-combo-value-icon', src, alt: '', loading: 'lazy',
        onerror: (e) => { e.target.style.visibility = 'hidden'; },
      }));
    }
  }
  const clearBtn = el('button', {
    type: 'button', class: 'search-combo-clear' + (value ? '' : ' hidden'),
    onclick: (e) => { e.stopPropagation(); input.value = ''; closeDropdown(); if (onClear) onClear(); },
  }, '×');
  const dropdown = el('div', { class: 'search-combo-dropdown hidden' });

  function closeDropdown() { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; }

  function openDropdown(filterText) {
    const q = (filterText || '').toLowerCase();
    const matches = options.filter(o => o.toLowerCase().includes(q)).slice(0, 60);
    dropdown.innerHTML = '';
    if (!matches.length) {
      dropdown.appendChild(el('div', { class: 'search-combo-empty' }, 'No matches'));
    } else {
      matches.forEach(opt => {
        const rowChildren = [];
        // getImage is optional — callers without item art (adventurers,
        // pet skill names, stat names) simply don't pass it, and the row
        // renders as plain text at the same height rather than leaving an
        // empty gap where a thumbnail would've been.
        if (getImage) {
          const src = getImage(opt);
          if (src) {
            rowChildren.push(el('img', {
              class: 'search-combo-option-thumb', src, alt: '', loading: 'lazy',
              onerror: (e) => { e.target.style.visibility = 'hidden'; },
            }));
          }
        }
        rowChildren.push(el('span', {}, opt));
        dropdown.appendChild(el('div', {
          class: 'search-combo-option',
          onmousedown: (e) => {
            // mousedown (not click) fires before the input's blur, so the
            // selection registers before the dropdown gets torn down
            e.preventDefault();
            input.value = opt;
            closeDropdown();
            onSelect(opt);
          },
        }, rowChildren));
      });
    }
    dropdown.classList.remove('hidden');
  }

  // Opening a combo that already has a value shouldn't immediately filter
  // the list down to just that one matching option — the whole point of
  // clicking a filled field is usually to browse and pick something
  // different, not to re-confirm what's already there. Empty string shows
  // everything on focus; typing after that narrows it down as normal.
  input.addEventListener('focus', () => openDropdown(''));
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !input.value);
    openDropdown(input.value);
  });
  input.addEventListener('blur', () => closeDropdown());

  container.appendChild(input);
  container.appendChild(clearBtn);
  container.appendChild(dropdown);
  return container;
}

const PET_SKILL_HELPER_TEXT = {
  'Fierce (Combo Rate)': "Gives this pet's hero a chance to trigger a Combo attack — 5% at SS, 10% at SSS.",
  'Sturdy (Counter Rate)': "Gives this pet's hero a chance to Counterattack — 5% at SS, 10% at SSS.",
  'Brutal (Crit Rate)': "Gives this pet's hero a chance to land a Critical Hit — 5% at SS, 10% at SSS.",
  'Agile (Ignore Combo Rate)': "Gives this pet's hero a chance to stop the enemy from Comboing them — 5% at SS, 10% at SSS.",
  'Majestic (Ignore Counter Rate)': "Gives this pet's hero a chance to stop the enemy from Countering them — 5% at SS, 10% at SSS.",
  'Resilience (Ignore Crit Rate)': "Gives this pet's hero a chance to stop the enemy from landing a Critical Hit on them — 5% at SS, 10% at SSS.",
  'Mutation (Pet Base Stats)': "Boosts this pet's own base stats.",
  'Giant (Pet DMG)': "Boosts this pet's own damage output.",
  'Epic Leader (Epic Pet DMG)': 'Boosts the damage of every Epic-rarity pet you have deployed.',
  'Legendary Leader': 'Boosts the damage of every Legendary-rarity pet you have deployed.',
  'Mythic Leader': 'Boosts the damage of every Mythic-rarity pet you have deployed.',
  'Unmovable (Control Immunity Rate)': "Gives this pet's hero a chance to be immune to control effects (like stun or freeze).",
};

// Matches display wording on the Pet Build screen ("Fierce Combo Rate")
// back to the canonical name pet_attrs.json actually uses ("Fierce
// (Combo Rate)") — same normalize-both-sides approach as the psionic
// matcher, plus this extra alias table since pet skill names diverge more
// between the two screens than psionic names do.
const PET_ATTR_DISPLAY_ALIASES = {
  'fierce combo rate': 'Fierce (Combo Rate)',
  'sturdy counter rate': 'Sturdy (Counter Rate)',
  'brutal crit rate': 'Brutal (Crit Rate)',
  'agile ignore combo rate': 'Agile (Ignore Combo Rate)',
  'majestic ignore counter rate': 'Majestic (Ignore Counter Rate)',
  'resilience ignore crit rate': 'Resilience (Ignore Crit Rate)',
  'unmovable control immunity rate': 'Unmovable (Control Immunity Rate)',
};

function matchPetAttrName(rawName, allAttrs) {
  const clean = normalizePsionicName(rawName);
  if (PET_ATTR_DISPLAY_ALIASES[clean]) return PET_ATTR_DISPLAY_ALIASES[clean];
  const found = allAttrs.find(a => normalizePsionicName(a.name) === clean);
  return found ? found.name : null;
}

function renderPetSkillDropZone(s, allAttrs, fixedTierSkills) {
  const wrap = el('div', { class: 'psi-dropzone-wrap' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
  const statusDiv = el('div', { class: 'psi-dropzone-status' });

  const dropZone = el('div', {
    class: 'psi-dropzone',
    onclick: () => fileInput.click(),
    ondragover: (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); },
    ondragleave: () => dropZone.classList.remove('drag-over'),
    ondrop: (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    },
  }, [
    el('div', { class: 'psi-dropzone-icon' }, '\u25C8'),
    el('div', { class: 'psi-dropzone-text' }, 'Drop a Pet Build screenshot to fill skills'),
    el('div', { class: 'psi-dropzone-subtext' }, 'Reads all 5 Passive Stats rows, including fixed-tier ones'),
  ]);

  async function handleFile(file) {
    statusDiv.textContent = 'Reading…';
    statusDiv.className = 'psi-dropzone-status reading';
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch(PSIONIC_OCR_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
              {
                type: 'text',
                text: `Look at the "Passive Stats" panel of this pet build screenshot (a mobile game UI). It shows exactly 5 rows, each with a tier badge (A, SS, or SSS) on the left, a stat name and value in the middle, and a lock icon on the right.

Extract all 5 rows as JSON. For each row, capture "name" (the stat name, without the tier badge or lock icon) and "value" (the numeric value after the stat name, e.g. 15.1 from "+15.1%").

Some rows show a second, grayed-out percentage in parentheses right after the main value (e.g. "+15.1% (86.29%)") — that's a separate roll-quality indicator, not part of the stat's own value, so don't include it as "value". Some rows (fixed-tier ones like "Fierce Combo Rate+10%") have no parenthetical at all — that's expected, not an error. Ignore the lock/unlock icon entirely.

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "Global HP%", "value": 15.1}, {"name": "Fierce Combo Rate", "value": 10}]`,
              },
            ],
          }],
        }),
      });

      if (response.status === 429) throw new Error("You've hit the testing limit for now — try again later.");
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');
      const textBlock = (data.content || []).find(b => b.type === 'text');
      const rawText = textBlock ? textBlock.text : '';
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const matchedEntries = parsed
        .map(item => ({ item, matchedName: matchPetAttrName(item.name, allAttrs) }))
        .filter(e => e.matchedName);

      if (!matchedEntries.length) {
        statusDiv.textContent = "None of these stats match any pet skill — check this is actually a Pet Build screenshot.";
        statusDiv.className = 'psi-dropzone-status error';
        return;
      }

      let filledCount = 0;
      matchedEntries.forEach(({ item, matchedName }) => {
        let target = s.skills.find(sl => !sl.stat);
        if (!target) target = s.skills.find(sl => sl.stat === matchedName);
        if (!target) return;
        target.stat = matchedName;
        // Fixed-tier skills only ever land on SS(5) or SSS(10) — the
        // screenshot's own number should already be one of those two, but
        // snapping to the nearer one guards against a stray OCR digit
        // (e.g. reading "10%" as "1.0%") producing an invalid third value.
        target.val = fixedTierSkills.has(matchedName)
          ? (Math.abs(item.value - 10) < Math.abs(item.value - 5) ? 10 : 5)
          : item.value;
        filledCount++;
      });

      const unmatchedCount = parsed.length - matchedEntries.length;
      statusDiv.textContent = unmatchedCount > 0
        ? `Filled ${filledCount} — ${unmatchedCount} line${unmatchedCount === 1 ? '' : 's'} didn't match a known pet skill.`
        : `Filled ${filledCount} skill${filledCount === 1 ? '' : 's'}.`;
      statusDiv.className = 'psi-dropzone-status success';
      showPsionicToast('Pet skill values updated');
      saveState();
      render();
    } catch (err) {
      statusDiv.textContent = err.message || 'Something went wrong reading that image.';
      statusDiv.className = 'psi-dropzone-status error';
    }
  }

  fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  wrap.appendChild(dropZone);
  wrap.appendChild(fileInput);
  wrap.appendChild(statusDiv);
  return wrap;
}


function renderEquipPetCard(petIndex) {
  const s = state.petSlots[petIndex];
  const pets = sortByTierDesc(DB.pets || []);
  const pet = pets.find(p => p.n === s.itemName) || null;

  const card = el('div', { class: 'item-card equip-card--pet' });
  card.appendChild(renderEquipHeader('pets', pet, `Pet ${petIndex + 1}`));

  card.appendChild(equipFieldLabel('Pet'));
  card.appendChild(renderSearchCombo({
    value: s.itemName,
    options: pets.map(p => p.n),
    placeholder: 'Search pets…',
    getImage: (name) => {
      const p = pets.find(x => x.n === name);
      return p ? itemImagePath('pets', p) : null;
    },
    onSelect: (name) => {
      s.itemName = name;
      s.arcana = -1;
      saveState();
      render();
    },
    onClear: () => {
      s.itemName = '';
      s.arcana = -1;
      saveState();
      render();
    },
  }));

  if (!pet) return card;

  // Always read-only now, per the updated design — same reasoning and
  // getArcanaEntry() lookup as the equipment card's Arcana section.
  const arcanaEntry = getArcanaEntry(pet.n);
  if (arcanaEntry) {
    card.appendChild(equipFieldLabel('Arcana'));
    const matchedArcana = state.arcana[pet.n];
    if (matchedArcana != null) {
      card.appendChild(el('div', { class: 'equip-readonly-value' }, `A${matchedArcana}`));
      const effectText = getArcanaEffectText(arcanaEntry, matchedArcana);
      if (effectText) card.appendChild(el('div', { class: 'equip-readonly-caption' }, effectText));
    } else {
      card.appendChild(el('div', { class: 'equip-readonly-value' }, '\u2014'));
      card.appendChild(el('div', { class: 'equip-readonly-caption' }, 'Not yet set \u2014 head to Collection \u2192 Arcana.'));
    }
  }

  card.appendChild(el('div', { class: 'equip-section-title' }, 'Battle Skills'));

  // Pingu (so far the only one, per star_battle_skills existing in the
  // data) ties its Battle Skill tier entirely to its own star rating —
  // Pet Level plays no part in its tier resolution below, so the field
  // is hidden rather than shown alongside a value that wouldn't do
  // anything. Every other pet keeps the normal Pet Level input.
  if (!(pet && pet.star_battle_skills)) {
    card.appendChild(equipFieldLabel('Pet Level'));
    const levelInput = el('input', {
      type: 'number', class: 'equip-select', min: '1', max: '100', value: String(s.level || ''),
      placeholder: 'e.g. 23',
      'data-focus-id': `pet-level-${petIndex}`,
    });
    levelInput.addEventListener('input', (e) => {
      s.level = parseInt(e.target.value, 10) || 0;
      saveState();
    });
    levelInput.addEventListener('blur', () => render());
    card.appendChild(levelInput);
  }

  if (pet && pet.star_battle_skills) {
    // Pingu (so far the only one) ties its Battle Skill tier to its own
    // star rating instead of Pet Level, unlike every other pet — driven
    // off star_battle_skills existing in the data rather than checking
    // the pet's name directly, so this picks up correctly if any other
    // pet turns out to use the same star-based mechanic later.
    card.appendChild(equipFieldLabel('Stars'));
    const starInput = el('input', {
      type: 'number', class: 'equip-select', min: '0', max: '10', value: String(s.battleStars || 0),
      'data-focus-id': `pet-battlestars-${petIndex}`,
    });
    starInput.addEventListener('input', (e) => {
      s.battleStars = Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0));
      saveState();
    });
    starInput.addEventListener('blur', () => render());
    card.appendChild(starInput);

    const thresholds = pet.star_thresholds || [0, 1, 3, 5, 8, 10];
    const starKeys = Object.keys(pet.star_battle_skills);
    let activeIdx = 0;
    for (let i = 0; i < thresholds.length; i++) if ((s.battleStars || 0) >= thresholds[i]) activeIdx = i;
    const activeKey = starKeys[activeIdx];
    const activeText = pet.star_battle_skills[activeKey];
    card.appendChild(equipFieldLabel(activeKey || 'Battle Skill'));
    card.appendChild(el('div', { class: 'equip-writeup' }, activeText ? renderTextWithSkillTags(activeText) : '—'));
  } else if (s.level > 0) {
    const battleSkillKeys = Object.keys(pet.battle_skills || {});
    const thresholds = [1, 20, 40, 60, 80];
    let activeIdx = -1;
    for (let i = 0; i < thresholds.length; i++) if (s.level >= thresholds[i]) activeIdx = i;
    const activeKey = activeIdx >= 0 ? battleSkillKeys[activeIdx] : null;
    const activeText = activeKey ? pet.battle_skills[activeKey] : null;
    card.appendChild(equipFieldLabel(activeKey || 'Battle Skill'));
    card.appendChild(el('div', { class: 'equip-writeup' }, activeText ? renderTextWithSkillTags(activeText) : '—'));
  }

  // ---- Pet Armament ----
  card.appendChild(el('div', { class: 'equip-section-title' }, 'Pet Armament'));
  const allArmaments = DB.pet_armaments || [];
  // Exclusive armaments only work on their one matching pet — everything
  // without a restriction (the non-"Exclusive |" ones) stays available
  // regardless of which pet is equipped.
  const armaments = allArmaments.filter(a => !a.restricted_pet || a.restricted_pet === s.itemName);
  // If the pet was changed after an exclusive armament was already
  // selected, that armament may no longer be valid for the new pet — the
  // combo's option list wouldn't include it anymore, but s.armament would
  // still silently hold the stale name unless cleared here.
  if (s.armament && !armaments.some(a => a.n === s.armament)) {
    s.armament = '';
    saveState();
  }
  const armament = armaments.find(a => a.n === s.armament);
  card.appendChild(equipFieldLabel('Armament'));
  card.appendChild(renderSearchCombo({
    value: s.armament,
    options: armaments.map(a => a.n),
    placeholder: 'Search armaments…',
    getImage: (name) => {
      const a = armaments.find(x => x.n === name);
      return a ? itemImagePath('pet_armaments', a) : null;
    },
    onSelect: (name) => { s.armament = name; s.armamentLevel = 1; saveState(); render(); },
    onClear: () => { s.armament = ''; saveState(); render(); },
  }));
  if (armament) {
    card.appendChild(equipFieldLabel('Level'));
    const levelSelect = el('select', { class: 'equip-select' },
      Array.from({ length: 10 }, (_, i) => i + 1).map(lv =>
        el('option', { value: String(lv), selected: lv === s.armamentLevel ? 'true' : null }, `Lv.${lv}`)));
    levelSelect.addEventListener('change', (e) => { s.armamentLevel = parseInt(e.target.value, 10); saveState(); render(); });
    card.appendChild(levelSelect);
    const descText = armament.level_descs && armament.level_descs[s.armamentLevel - 1];
    if (descText) card.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(descText)));
  }

  // ---- 5 Skill Slots ----
  const petInfoIcon = el('span', { class: 'psi-info-icon' }, 'ⓘ');
  petInfoIcon.addEventListener('click', (e) => { e.stopPropagation(); openPetSkillInfoModal(); });
  card.appendChild(el('div', { class: 'equip-section-title psi-section-title-row' }, [
    el('span', {}, 'Pet Skills'),
    petInfoIcon,
  ]));
  const allAttrs = DB.pet_attrs || [];
  const fixedTierSkills = new Set(DB.pet_fixed_tier_skills || []);
  card.appendChild(renderPetSkillDropZone(s, allAttrs, fixedTierSkills));

  s.skills.forEach((slot, si) => {
    card.appendChild(equipFieldLabel(`Skill ${si + 1}`));
    const wrap = el('div', { class: 'equip-inline-row' });

    const combo = renderSearchCombo({
      value: slot.stat,
      options: allAttrs.map(a => a.name),
      placeholder: 'Search skill…',
      onSelect: (name) => {
        slot.stat = name;
        // Fixed-tier skills (Fierce/Sturdy/Brutal/Agile/Majestic/Resilience)
        // only ever offer SS(5)/SSS(10) in their dropdown — defaulting to 0
        // here left the dropdown visually showing "SS (5%)" as the first
        // option (since neither option has explicit `selected` at val=0)
        // while the actual stored value silently stayed 0 until the
        // dropdown was deliberately touched. Defaulting straight to 5
        // keeps what's displayed and what's stored in sync from the start.
        slot.val = fixedTierSkills.has(name) ? 5 : 0;
        saveState();
        render();
      },
      onClear: () => { slot.stat = ''; slot.val = 0; saveState(); render(); },
    });
    wrap.appendChild(combo);

    const isFixed = slot.stat && fixedTierSkills.has(slot.stat);
    // Repairs data from before the selection-time default existed: a
    // fixed-tier skill sitting at val=0 (or anything besides 5/10) can
    // only have gotten there from selecting the skill without ever
    // touching the tier dropdown, since 0 was never a real option — not a
    // deliberate choice to leave it unset, so it's safe to self-correct
    // to the lower tier rather than silently continuing to contribute 0.
    if (isFixed && slot.val !== 5 && slot.val !== 10) {
      slot.val = 5;
      saveState();
    }
    if (isFixed) {
      const tierSelect = el('select', { class: 'equip-select equip-tier-select' }, [
        el('option', { value: '5', selected: slot.val === 5 ? 'true' : null }, 'SS (5%)'),
        el('option', { value: '10', selected: slot.val === 10 ? 'true' : null }, 'SSS (10%)'),
      ]);
      tierSelect.addEventListener('change', (e) => { slot.val = parseInt(e.target.value, 10); saveState(); render(); });
      wrap.appendChild(tierSelect);
    } else {
      const valInput = el('input', {
        type: 'number', class: 'equip-num-input', min: '0', placeholder: '0',
        value: slot.val ? String(slot.val) : '',
        'data-focus-id': `pet-skill-val-${petIndex}-${si}`,
        oninput: (e) => {
          const n = parseFloat(e.target.value);
          if (n < 0) { e.target.classList.add('input-error'); return; }
          e.target.classList.remove('input-error');
          slot.val = Number.isNaN(n) ? 0 : n;
          saveState();
        },
        onblur: (e) => { e.target.classList.remove('input-error'); render(); },
      });
      wrap.appendChild(el('div', { class: 'equip-pct-input-group' }, [valInput, el('span', {}, '%')]));
    }

    const container = el('div', {}, [wrap]);
    if (slot.stat) {
      container.appendChild(el('div', { class: 'equip-writeup' }, `${slot.stat} +${slot.val}%`));
      // Fixed-tier (SS/SSS) skills already spell out both breakpoints
      // right in the stat name/value shown above — the extra plain-English
      // helper paragraph is redundant for those specifically, unlike the
      // free-typed skills where it's the only explanation of what the
      // stat actually does.
      const helper = !isFixed && PET_SKILL_HELPER_TEXT[slot.stat];
      if (helper) container.appendChild(el('div', { class: 'equip-writeup', style: 'color:var(--text-tertiary);font-size:11px;' }, helper));
    }
    card.appendChild(container);
  });

  return card;
}

/* ---------- Deployed Mount / Artifact card ---------- */
function renderDeployCard(kind, mode, slotIndex) {
  const isMount = kind === 'mount';
  const isAwakenMode = mode === 'awaken';
  const s = slotIndex === null
    ? state[isMount ? 'mountMainSlot' : 'artifactMainSlot']
    : state[isMount ? 'mountSlots' : 'artifactSlots'][slotIndex];

  const all = (DB[isMount ? 'mounts' : 'artifacts'] || []).filter(it => it.n !== 'None');
  const bucketKey = isMount ? 'mountState' : 'artifactState';
  const ownedItems = sortByTierDesc(all.filter(it => {
    const st = state[bucketKey][it.idx];
    return st && st.owned;
  }));
  const item = ownedItems.find(it => it.idx === s.itemIdx) || null;
  const itemState = item ? getMountOrArtifactState(bucketKey, item.idx) : null;

  const cardTitle = slotIndex === null
    ? `Main ${isMount ? 'Mount' : 'Artifact'}`
    : `Deployed ${isMount ? 'Mount' : 'Artifact'} ${slotIndex + 1}`;

  const card = el('div', { class: 'item-card equip-card--pulled' });
  card.appendChild(renderEquipHeader(isMount ? 'mounts' : 'artifacts', item, cardTitle));

  const linkText = `Information prefilled from your Collections. To update it, please change it `;
  const link = el('a', {
    href: '#', class: 'equip-collection-link',
    onclick: (e) => { e.preventDefault(); goToCollectionSection(isMount ? 'mounts' : 'artifacts'); },
  }, 'here');
  card.appendChild(el('p', { class: 'equip-prefill-note' }, [linkText, link, '.']));

  card.appendChild(equipFieldLabel(cardTitle));
  if (!ownedItems.length) {
    card.appendChild(el('div', { class: 'equip-writeup' },
      `You haven't marked any ${isMount ? 'mounts' : 'artifacts'} as owned in Collection yet.`));
    return card;
  }

  const select = renderSearchCombo({
    value: item ? item.n : '',
    options: ownedItems.map(it => it.n),
    placeholder: `Search ${isMount ? 'mounts' : 'artifacts'}…`,
    getImage: (name) => {
      const it = ownedItems.find(x => x.n === name);
      return it ? itemImagePath(isMount ? 'mounts' : 'artifacts', it) : null;
    },
    onSelect: (name) => {
      const newItem = ownedItems.find(it => it.n === name);
      s.itemIdx = newItem ? newItem.idx : null;
      saveState();
      render();
    },
    onClear: () => { s.itemIdx = null; saveState(); render(); },
  });
  card.appendChild(select);

  if (!item) return card;

  if (isAwakenMode) {
    const showAwaken = hasAwakenProgression(item);
    if (showAwaken) {
      card.appendChild(equipFieldLabel('Awaken'));
      card.appendChild(el('div', { class: 'equip-prominent-value' }, `A${itemState.awaken}`));
    }
    if (item.star_up) {
      const resolved = resolveAwakenEffect(item, showAwaken ? itemState.awaken : 0);
      card.appendChild(equipFieldLabel('Awaken Skill'));
      card.appendChild(el('div', { class: 'equip-writeup' }, [
        resolved ? renderKeyAwakenBadge(resolved.level) : null,
        resolved ? renderTextWithSkillTags(resolved.text) : '—',
      ]));
    }
  } else {
    const showStars = hasStarProgression(item);
    if (showStars) {
      card.appendChild(equipFieldLabel('Stars'));
      card.appendChild(el('div', { class: 'equip-prominent-value' }, `${itemState.stars}★`));
    }
    if (item.star_effects) {
      const starEff = showStars ? item.star_effects[String(itemState.stars)] : item.star_effects['0'];
      card.appendChild(equipFieldLabel('Skill'));
      card.appendChild(el('div', { class: 'equip-writeup' }, starEff ? renderTextWithSkillTags(starEff) : '—'));
    }
  }

  if (item.star_up) {
    const starDelta = itemState.stars > 0 ? item.star_up.deltas[String(itemState.stars)] : null;
    const awakenDelta = itemState.awaken > 0 ? item.awaken.deltas[`A${itemState.awaken}`] : null;
    const total = sumStatBlocks(item.awaken.base_stats, starDelta, awakenDelta);
    card.appendChild(equipFieldLabel('Current Stats'));
    card.appendChild(el('div', { class: 'equip-writeup' }, formatStatBlockNodes(total, true)));
  }

  return card;
}

// Arcana bonuses are cumulative (confirmed against the datamine's own
// comments) — so instead of listing "A0: ...", "A1: ...", etc as separate
// lines, sum same-named numeric bonuses across every level up to the
// selected one into one condensed line. Lines that don't end in a clean
// "+N%" (procs, stack counts, mid-sentence percentages) can't be summed
// meaningfully, so those pass through verbatim instead of being dropped.
// Arcana descriptions are cumulative — selecting arcana level N means all
// of 0..N are active, not just N alone. Splits into two totals: `all`
// (everything, used for the collated display text) and `trackable`
// (excludes entries explicitly marked "(not tracked)" in the source data
// — usually weapon-specific ATK bonuses or flavor mechanics the data
// itself flags as not meant for tracking/calculation).
function computeArcanaTotals(descs, upToIndex) {
  const all = {};
  const trackable = {};
  const order = [];
  const raw = [];
  for (let i = 0; i <= upToIndex && i < descs.length; i++) {
    const desc = descs[i];
    const m = desc.match(/^(.*?)\s*\+(\d+(?:\.\d+)?)%\s*(\(not tracked\))?$/);
    if (m) {
      const name = m[1].trim();
      const val = parseFloat(m[2]);
      const isNotTracked = !!m[3];
      if (!(name in all)) { all[name] = 0; order.push(name); }
      all[name] += val;
      if (!isNotTracked) trackable[name] = (trackable[name] || 0) + val;
    } else {
      raw.push(desc);
    }
  }
  return { all, trackable, order, raw };
}

function collateArcanaEffects(descs, upToIndex) {
  const { all, order, raw } = computeArcanaTotals(descs, upToIndex);
  const parts = order.map(name => `${name} +${Math.round(all[name] * 100) / 100}%`);
  return [...parts, ...raw].join(', ');
}

// Surpass's actual level cap is now a fixed rule by QUALITY alone, the
// same across every item that has Surpass at all: Epic +2, Legendary
// +3, Mythic and Transcendent +4 (Common/Uncommon/Rare get none). The
// item's own surpass_max field still gates whether Surpass exists on
// this item AT ALL (13 base-tier items — Warrior's Blade, Eagle Ring,
// etc. — have no surpass_max and correctly get 0 regardless of
// quality), but once an item has it, the actual per-quality number
// comes from this table, not from surpass_max's own stored value — so
// an S-grade item's Mythic cap is now +4 same as SS-grade, even though
// its surpass_max is still stored as 3 from before this rule existed.
// Shared by the Equipment card's dropdown/quality-switch clamping and
// the Calculator's own aggregation, so a stale saved state (e.g. a
// Legendary item saved at +4 before the Legendary-specific cap existed)
// can't silently keep counting a Surpass level that quality no longer
// allows.
const SURPASS_MAX_BY_QUALITY = { Epic: 2, Legendary: 3, Mythic: 4, Transcendent: 4 };
function getEffectiveSurpassMax(item, quality) {
  if (!item.surpass_max) return 0;
  return SURPASS_MAX_BY_QUALITY[quality] || 0;
}

// Resolves a single surpass_stats entry's level array against the
// item's CURRENT quality — a stat's value can be either a flat array
// (same regardless of quality) or a {quality: [...]} object (for the
// handful of SS-grade items whose Surpass bonus itself differs between
// Legendary and Mythic). Shared by both the Calculator's aggregation and
// the Equipment card's helper caption, so the two can never silently
// disagree about which array applies to a given quality. Returns null
// if the stat is quality-keyed but has no entry for this item's current
// quality (e.g. data only covers Mythic so far).
function resolveSurpassLevels(statValue, quality) {
  if (Array.isArray(statValue)) return statValue;
  return statValue[quality] || null;
}

function renderEquipCard(slotDef) {
  const s = getEquipState(slotDef.id);
  // Items with no tier assigned aren't real equippable gear — confirmed
  // safe to drop entirely rather than show under a catch-all "Other" group.
  const items = (DB[slotDef.dataKey] || []).filter(it => it.n !== 'None' && it.tier);
  const item = items.find(it => it.n === s.itemName) || null;

  const card = el('div', { class: 'item-card equip-card--slot' });

  // ---- Header: image + slot label ----
  card.appendChild(renderEquipHeader(slotDef.imgKind, item, slotDef.label));

  // ---- Equipped ----
  card.appendChild(equipFieldLabel('Equipped'));
  const tierOrder = ['SS', 'S', 'Basic'];
  const itemsByTier = {};
  items.forEach(it => { (itemsByTier[it.tier] = itemsByTier[it.tier] || []).push(it); });
  const orderedTiers = [...tierOrder.filter(t => itemsByTier[t]), ...Object.keys(itemsByTier).filter(t => !tierOrder.includes(t))];
  // Grouping by tier isn't something a flat search-combo list does the way
  // <optgroup> did — folded straight into each option's own label instead
  // ("Helos Warblade — SS"), so the tier is still visible without needing
  // a separate group header.
  const equipOptionLabel = (it) => `${it.n} — ${it.tier}`;
  const orderedItems = orderedTiers.flatMap(t => itemsByTier[t]);
  card.appendChild(renderSearchCombo({
    value: item ? equipOptionLabel(item) : '',
    options: orderedItems.map(equipOptionLabel),
    placeholder: `Search ${slotDef.label.toLowerCase()}…`,
    getImage: (label) => {
      const it = orderedItems.find(x => equipOptionLabel(x) === label);
      return it ? itemImagePath(slotDef.imgKind, it) : null;
    },
    onSelect: (label) => {
      const newItem = orderedItems.find(x => equipOptionLabel(x) === label);
      if (!newItem) return;
      s.itemName = newItem.n;
      s.quality = newItem.q && newItem.q.length ? newItem.q[newItem.q.length - 1] : ''; // highest tier = last entry, usually Mythic
      s.surpass = 0;
      s.arcana = -1;
      saveState();
      render();
    },
    onClear: () => { s.itemName = ''; saveState(); render(); },
  }));

  // Empty state: nothing past "Equipped" shows until an item is actually
  // selected — matches the reference card exactly.
  if (!item) return card;

  // ---- Quality ----
  card.appendChild(equipFieldLabel('Quality'));
  const qualOpts = item.q || [];
  const qualitySelect = el('select', { class: 'equip-select', disabled: qualOpts.length ? null : 'true' },
    qualOpts.length
      ? qualOpts.map(q => el('option', { value: q, selected: q === s.quality ? 'true' : null }, q))
      : [el('option', { value: '' }, '—')]);
  qualitySelect.addEventListener('change', (e) => {
    s.quality = e.target.value;
    // Legendary quality caps at +3 Surpass regardless of the item's own
    // surpass_max (which represents the Mythic-level cap — +4 for
    // SS-grade, +3 for S-grade, where it's already the same number so
    // this only actually changes anything for SS-grade items). Clamp
    // here so switching FROM Mythic-at-+4 DOWN TO Legendary can't leave
    // the stored surpass value silently out of range for the new
    // quality's own, lower cap.
    s.surpass = Math.min(s.surpass, getEffectiveSurpassMax(item, s.quality));
    saveState(); render();
  });
  card.appendChild(qualitySelect);

  // ---- Surpass ----
  card.appendChild(equipFieldLabel('Surpass'));
  const surpassMax = getEffectiveSurpassMax(item, s.quality);
  const surpassOpts = Array.from({ length: surpassMax + 1 }, (_, i) => i);
  const surpassSelect = el('select', { class: 'equip-select' },
    surpassOpts.map(n => el('option', { value: String(n), selected: n === s.surpass ? 'true' : null }, `+${n}`)));
  surpassSelect.addEventListener('change', (e) => { s.surpass = parseInt(e.target.value, 10); saveState(); render(); });
  card.appendChild(surpassSelect);

  // Helper caption showing what surpass_stats actually gives at the
  // CURRENTLY selected level and quality — recomputed on every render
  // (the select's own change handler already calls render(), which
  // rebuilds this whole card, so no separate update wiring is needed
  // here). Uses the same resolveSurpassLevels() shape-detection and
  // getEffectiveSurpassMax() clamping the Calculator itself uses, so
  // this always matches what's actually being counted, never a
  // separately-maintained copy that could drift out of sync.
  if (item.surpass_stats) {
    const effectiveSurpass = Math.min(s.surpass, getEffectiveSurpassMax(item, s.quality));
    const parts = Object.entries(item.surpass_stats).map(([key, statValue]) => {
      const levels = resolveSurpassLevels(statValue, s.quality);
      if (!levels) return null;
      const idx = Math.min(effectiveSurpass, levels.length - 1);
      const val = levels[idx];
      const label = RELIC_KEY_TO_LABEL[key] || key;
      return val ? `${label} +${val}%` : null;
    }).filter(Boolean);
    if (parts.length) {
      card.appendChild(el('div', { class: 'equip-readonly-caption' }, parts.join(', ')));
    }
  }

  // ---- Arcana ----
  // Always read-only now, per the updated design — Arcana is exclusively
  // set via Collection -> Arcana, matched here by item name through
  // getArcanaEntry(). An item with no Arcana data at all (no entry in
  // arcanas.json) shows nothing here, same as before this existed. One
  // with data but no level set yet still shows the label + a dash, so
  // it's clear this item supports Arcana and where to go set it.
  const arcanaEntry = getArcanaEntry(item.n);
  if (arcanaEntry) {
    const matchedArcana = state.arcana[item.n];
    card.appendChild(equipFieldLabel('Arcana'));
    if (matchedArcana != null) {
      card.appendChild(el('div', { class: 'equip-readonly-value' }, `A${matchedArcana}`));
      const collated = arcanaEntry.arcana_descs ? collateArcanaEffects(arcanaEntry.arcana_descs, matchedArcana) : getArcanaEffectText(arcanaEntry, matchedArcana);
      if (collated) card.appendChild(el('div', { class: 'equip-readonly-caption' }, collated));
    } else {
      card.appendChild(el('div', { class: 'equip-readonly-value' }, '\u2014'));
      card.appendChild(el('div', { class: 'equip-readonly-caption' }, 'Not yet set \u2014 head to Collection \u2192 Arcana.'));
    }
  }

  // Psionic Attributes only ever roll on SS-tier gear — confirmed. Hide the
  // whole section rather than show it disabled/inapplicable for S/Basic.
  if (item.tier === 'SS') {
    const infoIcon = el('span', { class: 'psi-info-icon' }, 'ⓘ');
    infoIcon.addEventListener('click', (e) => { e.stopPropagation(); openPsionicInfoModal(); });
    card.appendChild(el('div', { class: 'equip-section-title psi-section-title-row' }, [
      el('span', {}, 'Psionic Attributes'),
      infoIcon,
    ]));
    const psiOptions = DB.psionics[slotDef.psiKey] || [];
    card.appendChild(renderPsionicDropZone(slotDef, s, psiOptions));
    s.psionics.forEach((slot, i) => {
      card.appendChild(equipFieldLabel(`Slot ${i + 1}`));
      card.appendChild(renderPsionicSlot(slotDef.id, i, slot, psiOptions, s.psionics));
    });
  }

  card.appendChild(el('hr', { class: 'equip-divider' }));

  // ---- Gems ----
  card.appendChild(el('div', { class: 'equip-section-title' }, 'Gems'));
  const gemOptions = DB.gems[slotDef.gemKey] || [];
  s.gems.forEach((slot, i) => {
    card.appendChild(equipFieldLabel(`Slot ${i + 1}`));
    card.appendChild(renderGemSlot(slotDef.id, i, slot, gemOptions, s.gems));
  });

  return card;
}

function equipFieldLabel(text) {
  return el('div', { class: 'equip-field-label' }, text);
}

function psiOptionLabel(o) {
  return `${o.n} — ${o.k === 'n' ? 'Normal' : 'Special'}`;
}

// Same normalization used to validate the OCR prototype — the game
// spells the same stat "Damage" in some places and "DMG" in others, same
// for "Critical"/"Crit", so both sides of a comparison get folded to one
// form rather than needing every spelling enumerated by hand.
function normalizePsionicName(rawName) {
  return rawName
    .replace(/^\[Special\]\s*/i, '')
    .trim()
    .toLowerCase()
    .replace(/\bdamage\b/g, 'dmg')
    .replace(/\bcritical\b/g, 'crit');
}

function matchPsionicOption(rawName, psiOptions) {
  const clean = normalizePsionicName(rawName);
  return psiOptions.find(o => normalizePsionicName(o.n) === clean) || null;
}

const PSIONIC_OCR_WORKER_URL = 'https://solitary-paper-9b01.capydex.workers.dev';

// Desktop gets a floating top-of-screen confirmation since there's room
// for it and it won't cover anything useful; mobile skips it entirely
// since the status text already sitting right below the drop zone serves
// the same "did this work" purpose without needing a second element
// competing for a much smaller screen.
let psiToastTimeout = null;
function showPsionicToast(message) {
  if (window.innerWidth <= 844) return;
  let toast = document.querySelector('.psi-toast');
  if (!toast) {
    toast = el('div', { class: 'psi-toast' });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  clearTimeout(psiToastTimeout);
  requestAnimationFrame(() => toast.classList.add('visible'));
  psiToastTimeout = setTimeout(() => toast.classList.remove('visible'), 5000);
}


// Generic tutorial modal — opens as a centered modal on desktop and a
// bottom-sheet drawer on mobile automatically, via .modal-overlay/
// .modal-box's own existing responsive CSS (no separate drawer component
// needed, since that combination is already exactly what those two
// classes do at the 843px breakpoint). Shared by both the Psionic and
// Pet Skill upload tooltips rather than duplicated per-feature, since
// both follow the same "step text, tutorial image, step text" shape.
function openTutorialModal(title, beforeText, imageSrc, afterText) {
  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });
  function closeModal() { overlay.remove(); }

  const box = el('div', { class: 'modal-box' }, [
    el('div', { class: 'modal-title' }, title),
    el('p', { class: 'section-desc', style: 'margin-bottom:10px;' }, beforeText),
    el('img', { src: imageSrc, alt: title, class: 'tutorial-modal-img' }),
    el('p', { class: 'section-desc', style: 'margin:10px 0 14px;' }, afterText),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'bulk-action-btn primary', onclick: closeModal }, 'Got it'),
    ]),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function openPsionicInfoModal() {
  openTutorialModal(
    'Reading Psionic Attributes',
    'Tap on the equipment and ensure that all the stats are in view before taking a screenshot.',
    'assets/images/psionic-tutorial.webp',
    'Upload the image into their corresponding equipment type.'
  );
}

function openPetSkillInfoModal() {
  openTutorialModal(
    'Reading Pet Skills',
    'Tap on your pet and ensure that you are viewing your "Original Stats".',
    'assets/images/pet-original-tutorial.webp',
    'Upload the image into their corresponding pet type.'
  );
}

function renderPsionicDropZone(slotDef, s, psiOptions) {
  const wrap = el('div', { class: 'psi-dropzone-wrap' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
  const statusDiv = el('div', { class: 'psi-dropzone-status' });

  const dropZone = el('div', {
    class: 'psi-dropzone',
    onclick: () => fileInput.click(),
    ondragover: (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); },
    ondragleave: () => dropZone.classList.remove('drag-over'),
    ondrop: (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    },
  }, [
    el('div', { class: 'psi-dropzone-icon' }, '\u25C8'),
    el('div', { class: 'psi-dropzone-text' }, 'Drop a screenshot to fill psionics'),
    el('div', { class: 'psi-dropzone-subtext' }, 'Reads the Psychic Attributes panel automatically'),
  ]);

  async function handleFile(file) {
    statusDiv.textContent = 'Reading…';
    statusDiv.className = 'psi-dropzone-status reading';
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch(PSIONIC_OCR_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
              {
                type: 'text',
                text: `Look at the "Psychic Attributes" section of this equipment screenshot (a mobile game UI). It's a dark header bar reading "Psychic Attributes" (with a "Loadout N" button on the right), followed by EXACTLY 4 lines of stats. Extract only those 4 lines as JSON.

Each of the 4 lines has a stat name (may be prefixed with "[Special]") and a value (either a percentage like "+29.26%" or a flat number like "+18"). Ignore the parenthetical percentage in gray/muted color next to each line (e.g. "(91.45%)") — that's a roll-quality indicator, not the stat value itself.

Stop reading once you've captured those 4 lines. Below them is a SEPARATE, unrelated list of effect descriptions, each with a green or blue circular bullet icon (e.g. "Release 1 lightning bolt each turn" followed by something like "Lightning Damage +50%"). That lower list is NOT part of Psychic Attributes, even when it happens to mention a stat name that sounds identical to one of the 4 real lines above it — never pull a value from that lower, bulleted section, and never let it overwrite or substitute for one of the 4 real lines. If you can only clearly find fewer than 4 lines in the actual Psychic Attributes panel, only return the ones you're confident about — do not fill in a missing line using text from the bulleted section below.

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "Basic ATK DMG", "value": 29.26, "isPercent": true}]`,
              },
            ],
          }],
        }),
      });

      if (response.status === 429) throw new Error("You've hit the testing limit for now — try again later.");
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'API error');
      const textBlock = (data.content || []).find(b => b.type === 'text');
      const rawText = textBlock ? textBlock.text : '';
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      // Validation: if NONE of the extracted stat names match anything in
      // this specific slot's valid pool, this is very likely the wrong
      // screenshot for this card — e.g. an armor screenshot dropped onto
      // a weapon slot — rather than a misread. Flag it instead of silently
      // filling nothing or filling wrong data.
      const matchedEntries = parsed
        .map(item => ({ item, match: matchPsionicOption(item.name, psiOptions) }))
        .filter(e => e.match);

      if (!matchedEntries.length) {
        statusDiv.textContent = `None of these stats match ${slotDef.label}'s psionic pool — this might be a screenshot from a different equipment slot.`;
        statusDiv.className = 'psi-dropzone-status error';
        return;
      }

      // Fill into empty slots first, then overwrite already-filled ones
      // that share the same stat — never blindly overwrites a slot
      // holding a genuinely different stat than what was just read.
      let filledCount = 0;
      matchedEntries.forEach(({ item, match }) => {
        let target = s.psionics.find(sl => !sl.stat);
        if (!target) target = s.psionics.find(sl => sl.stat === match.c);
        if (!target) return;
        target.stat = match.c;
        target.val = item.value;
        filledCount++;
      });

      const unmatchedCount = parsed.length - matchedEntries.length;
      statusDiv.textContent = unmatchedCount > 0
        ? `Filled ${filledCount} — ${unmatchedCount} line${unmatchedCount === 1 ? '' : 's'} didn't match anything in this slot's pool.`
        : `Filled ${filledCount} attribute${filledCount === 1 ? '' : 's'}.`;
      statusDiv.className = 'psi-dropzone-status success';
      showPsionicToast('Psionic values updated');
      saveState();
      render();
    } catch (err) {
      statusDiv.textContent = err.message || 'Something went wrong reading that image.';
      statusDiv.className = 'psi-dropzone-status error';
    }
  }

  fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  wrap.appendChild(dropZone);
  wrap.appendChild(fileInput);
  wrap.appendChild(statusDiv);
  return wrap;
}


function renderPsionicSlot(slotId, slotIdx, slotState, options, allSlots) {
  const wrap = el('div', { class: 'equip-inline-row' });

  // Normal options first, then Special — folded into the visible label
  // since there's no dropdown grouping in a custom combo the way <select>
  // has <optgroup> ("Stat Name — Normal" / "— Special").
  const sortedOptions = [...options].sort((a, b) => (a.k === b.k ? 0 : a.k === 'n' ? -1 : 1));

  // A stat can only be rolled once across the 4 slots on one item, and at
  // most 2 of the 4 can be "Special" category stats — matching the game's
  // real roll rules, not just a UI nicety.
  const usedStatsElsewhere = new Set(allSlots.filter((_, i) => i !== slotIdx).map(sl => sl.stat).filter(Boolean));
  const specialsElsewhere = allSlots.filter((sl, i) => i !== slotIdx && sl.stat
    && (options.find(o => o.c === sl.stat) || {}).k === 's').length;
  const specialsCapped = specialsElsewhere >= 2;
  const availableOptions = sortedOptions.filter(o => !usedStatsElsewhere.has(o.c) && !(specialsCapped && o.k === 's'));

  const currentMeta = options.find(o => o.c === slotState.stat);
  const combo = renderSearchCombo({
    value: currentMeta ? psiOptionLabel(currentMeta) : '',
    options: availableOptions.map(psiOptionLabel),
    placeholder: 'Search stat…',
    onSelect: (label) => {
      const match = availableOptions.find(o => psiOptionLabel(o) === label);
      if (match) { slotState.stat = match.c; saveState(); render(); }
    },
    onClear: () => { slotState.stat = ''; saveState(); render(); },
  });

  const isSpeed = currentMeta && currentMeta.n === 'Speed'; // flat number, not a percentage
  const valInput = el('input', {
    type: 'number', class: 'equip-num-input' + (isSpeed ? ' equip-num-input-standalone' : ''), min: '0', placeholder: '0',
    value: slotState.val ? String(slotState.val) : '',
    'data-focus-id': `psi-val-${slotId}-${slotIdx}`,
    oninput: (e) => {
      const n = parseFloat(e.target.value);
      // Negative rolls aren't a real state in-game — clamp rather than let
      // a negative value quietly sit in state, and flag the box red while
      // it's happening so it doesn't look like a silent no-op.
      if (n < 0) {
        e.target.classList.add('input-error');
        return;
      }
      e.target.classList.remove('input-error');
      slotState.val = Number.isNaN(n) ? 0 : n;
      saveState();
    },
    onblur: (e) => { e.target.classList.remove('input-error'); render(); },
  });

  wrap.appendChild(combo);
  wrap.appendChild(el('div', { class: 'equip-pct-input-group' }, isSpeed ? [valInput] : [valInput, el('span', {}, '%')]));

  const container = el('div', {}, [wrap]);
  if (slotState.stat) {
    const meta = options.find(o => o.c === slotState.stat);
    const suffix = meta && meta.n === 'Speed' ? '' : '%';
    container.appendChild(el('div', { class: 'equip-writeup' }, `${meta ? meta.n : slotState.stat} +${slotState.val}${suffix}`));
  }
  return container;
}

function renderGemSlot(slotId, slotIdx, slotState, options, allSlots) {
  const wrap = el('div', { class: 'equip-inline-row' });

  // A gem type can only be socketed once per item — having the same stat at
  // two different rarities on one weapon doesn't make sense. Exclude gems
  // already placed in any OTHER slot on this same card from this slot's
  // search results.
  const usedElsewhere = new Set(allSlots.filter((_, i) => i !== slotIdx).map(sl => sl.gemId).filter(Boolean));
  const availableOptions = options.filter(o => !usedElsewhere.has(o.id));

  // Gem names are baked with their Peerless (max-tier) numbers, but the
  // helper text below shows the number for whichever tier is actually
  // selected — those two numbers only match at Peerless. Showing both at
  // once looks like conflicting data, so the dropdown masks its own number
  // to X% and lets the helper text underneath be the one real source of
  // the actual selected-tier value. Confirmed no two gems in any slot
  // collide once masked, so matching on the masked label is still safe.
  // Speed gems are a flat number, not a percentage — "Speed +X" reads
  // oddly next to everything else's "+X%", so those collapse to just
  // "Speed" instead of masking the number.
  const maskGemName = (name) => (/^Speed\s*\+\d/.test(name) ? 'Speed' : name.replace(/\d+(\.\d+)?%/g, 'X%'));

  const combo = renderSearchCombo({
    value: slotState.gemId ? maskGemName((options.find(o => o.id === slotState.gemId) || {}).n || '') : '',
    options: availableOptions.map(o => maskGemName(o.n)),
    placeholder: 'Search gem…',
    onSelect: (maskedName) => {
      const match = availableOptions.find(o => maskGemName(o.n) === maskedName);
      if (!match) return;
      slotState.gemId = match.id;
      if (!slotState.tier) slotState.tier = 9; // default Peerless — every gem's data now runs the full 9 tiers
      saveState();
      render();
    },
    onClear: () => { slotState.gemId = ''; saveState(); render(); },
  });

  const tierSelect = renderSearchCombo({
    value: slotState.gemId ? GEM_TIER_NAMES[slotState.tier - 1] : '',
    options: GEM_TIER_NAMES,
    placeholder: 'Rarity…',
    getImage: (name) => `assets/images/gem_tiers/${slugify(name)}.webp`,
    showValueIcon: true,
    onSelect: (name) => { slotState.tier = GEM_TIER_NAMES.indexOf(name) + 1; saveState(); render(); },
  });
  if (!slotState.gemId) tierSelect.querySelector('.equip-combo-input').disabled = true;

  wrap.appendChild(combo);
  wrap.appendChild(tierSelect);

  const container = el('div', {}, [wrap]);
  if (slotState.gemId) {
    const meta = options.find(o => o.id === slotState.gemId);
    if (meta) {
      // tier_desc carries the real per-tier wording straight from source —
      // e.g. "Increased Damage to Shielded Targets +40%" at Transcendent —
      // rather than a generic short name + computed percentage, which for
      // most gems (the ones with no clean numeric value, only a described
      // effect) was never accurate to begin with.
      const realText = meta.tier_desc && meta.tier_desc[slotState.tier];
      if (realText) {
        container.appendChild(el('div', { class: 'equip-writeup' }, renderTextWithSkillTags(realText)));
      } else if (meta.t && meta.t[slotState.tier - 1] != null) {
        container.appendChild(el('div', { class: 'equip-writeup' }, `${meta.n} +${meta.t[slotState.tier - 1]}%`));
      } else {
        container.appendChild(el('div', { class: 'equip-writeup placeholder' }, 'No effect documented at this tier.'));
      }
    }
  }
  return container;
}

let scrollObserver;

function render() {
  root.innerHTML = '';
  if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }

  if (activeMainTab === 'collection') {
    root.appendChild(renderCollectionShell());
  } else if (activeMainTab === 'calculator') {
    root.appendChild(renderCalculator());
  } else if (activeMainTab === 'equipment') {
    root.appendChild(renderEquipmentShell());
  } else if (activeMainTab === 'inheritance') {
    // Lighter-release scope: Inheritance Tree is being held back for a later
    // update (needs more thought on UI/interaction) — showing a "Coming
    // soon" placeholder instead of the real page for now.
    // root.appendChild(renderInheritanceShell());
    root.appendChild(renderPlaceholder('Inheritance Tree', "We're still refining this one — check back soon!"));
  } else if (activeMainTab === 'specialization') {
    // Lighter-release scope: same as Inheritance above — held back for now.
    // root.appendChild(renderSpecializationShell());
    root.appendChild(renderPlaceholder('Specialization', "We're still refining this one — check back soon!"));
  } else {
    const labels = { inheritance: 'Inheritance Tree' };
    root.appendChild(renderPlaceholder(labels[activeMainTab] || activeMainTab));
  }

  focusActiveStepperInput();
  restorePendingFocus();
}

function renderSectionShell(sections, pageLabel, pageClearAllFn) {
  const outer = el('div', { class: 'collection-page-outer' });

  const shell = el('div', { class: 'collection-shell' });

  // Click handler shared by all sidenav anchor links. Deliberately does NOT
  // rely on native <a href="#..."> navigation: on file:// pages, Chrome can
  // throw "Unsafe attempt to load URL ...#hash from frame with URL ...#hash"
  // and refuse to navigate, since it treats every file:// + fragment
  // combination as a distinct resource. Scrolling manually via JS sidesteps
  // that entirely and works identically once this is hosted for real too.
  function scrollToAnchor(e, id) {
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Desktop: sticky sidenav with anchor links (unchanged, hidden on mobile via CSS)
  const nav = el('nav', { class: 'sidenav' });
  const linksList = el('ul', { class: 'sidenav-links' });

  // Mobile: native <select> — big native touch target, immune to the
  // fixed-position/z-index overlap bugs a custom drawer toggle can hit.
  const mobileSelect = el('select', {
    class: 'mobile-section-select',
    onchange: (e) => {
      const id = e.target.value;
      if (id) document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      e.target.selectedIndex = 0;
    },
  });
  mobileSelect.appendChild(el('option', { value: '' }, 'Jump to section…'));

  sections.forEach(sec => {
    const li = el('li', {});
    li.appendChild(el('a', { href: `#${sec.id}`, class: 'sidenav-link', onclick: (e) => scrollToAnchor(e, `#${sec.id}`) }, sec.label));
    mobileSelect.appendChild(el('option', { value: `#${sec.id}` }, sec.label));

    if (sec.sub) {
      const groups = sec.sub();
      if (groups.length > 1) {
        const sub = el('ul', { class: 'sidenav-sublist' });
        groups.forEach(g => {
          const anchorId = `#${sec.id}-${g.slug}`;
          sub.appendChild(el('li', {}, el('a', {
            href: anchorId, class: 'sidenav-sublink p-default', onclick: (e) => scrollToAnchor(e, anchorId),
          }, g.tier)));
          mobileSelect.appendChild(el('option', { value: anchorId }, `— ${sec.label}: ${g.tier}`));
        });
        li.appendChild(sub);
      }
    }
    linksList.appendChild(li);
  });
  nav.appendChild(linksList);

  const content = el('div', { class: 'collection-content' });
  // The page-level title ("Collection" + its Clear All) belongs inside
  // .collection-content, not as a full-width row above the sidenav+content
  // grid — Figma's own "Title" frame sits inside "Main Content" at column
  // 3, aligned with the content column, not the page edge above the
  // sidenav.
  if (pageLabel) {
    content.appendChild(el('div', { class: 'section-title-row page-title-row' }, [
      el('div', { class: 'section-title page-title' }, pageLabel),
      pageClearAllFn ? renderClearAllButton(pageLabel, pageClearAllFn, true) : null,
    ]));
  }
  sections.forEach(sec => {
    const section = el('section', { id: sec.id, class: 'page-section' });
    if (sec.clearAll) {
      section.appendChild(el('div', { class: 'section-title-row' }, [
        el('h2', { class: 'section-title' }, sec.label),
        renderClearAllButton(sec.label, sec.clearAll, true),
      ]));
    } else {
      section.appendChild(el('h2', { class: 'section-title' }, sec.label));
    }
    section.appendChild(sec.build());
    content.appendChild(section);
  });

  shell.appendChild(mobileSelect);
  shell.appendChild(nav);
  shell.appendChild(content);

  setupScrollSpy(nav);
  outer.appendChild(shell);
  return outer;
}

function renderCollectionShell() {
  return renderSectionShell(COLLECTION_SECTIONS, 'Collection', clearAllCollection);
}

// Page-wide clear for Collection — everything COLLECTION_SECTIONS' own
// per-section clearAll callbacks cover, run together in one go.
function clearAllCollection() {
  clearAllRelics();
  clearAllCollectibles();
  clearAllMountsOrArtifacts('mounts');
  clearAllMountsOrArtifacts('artifacts');
  state.fashionLevel = 0;
  state.capymon = {};
  state.homestead = {};
  saveState();
  render();
}

function setupScrollSpy(navEl) {
  if (typeof IntersectionObserver === 'undefined') return;
  const targets = document.querySelectorAll('.page-section, .tier-group-title[id]');
  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const link = navEl.querySelector(`a[href="#${entry.target.id}"]`);
      if (!link) return;
      navEl.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
    });
  }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
  targets.forEach(t => scrollObserver.observe(t));
}

/* ---------- Relics ---------- */
let relicSearch = '';
let relicRarityFilter = 'All';
let relicOwnedFilter = 'All';
let relicStatFilter = 'All';

function renderSetMemberIcon(kind, name) {
  const img = el('img', {
    src: itemImagePath(kind, { n: name }),
    alt: name,
    loading: 'lazy',
    onerror: (e) => { e.target.style.visibility = 'hidden'; },
  });
  return el('div', { class: 'set-member-icon' }, img);
}

function renderSetCard({ kind, name, statLabel, tierLabels, vals, members, allOwned, minStar, tierIdx, incomplete }) {
  const ownedCount = members.filter(m => m.owned).length;

  const card = el('div', { class: 'set-card' });
  card.appendChild(el('div', { class: 'set-card-header' }, [
    el('div', { class: 'set-card-name' }, name),
    el('div', { class: 'set-card-count' + (!incomplete && ownedCount === members.length ? ' complete' : '') },
      `${ownedCount}/${members.length} owned`),
  ]));
  if (incomplete) {
    card.appendChild(el('div', { class: 'set-card-stat-label' },
      `This set is currently incomplete — a relic hasn't been released yet.`));
  } else if (allOwned && tierIdx >= 0) {
    // The per-tier pips below show what each individual bracket adds on
    // its own, but the set bonus itself stacks — every bracket reached
    // stays active alongside the ones after it, not replaced by them. So
    // "how much is this set actually giving me right now" is the sum of
    // every tier up through the current one, not just the current tier's
    // own number.
    const cumulative = vals.slice(0, tierIdx + 1).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
    // No separate "%" suffix here — statLabel itself already carries the
    // unit for stats where it applies (e.g. "DEF%"), so appending one
    // again would just duplicate it; flat-value stats (Tenacity, etc.)
    // read correctly as plain numbers without a label ending in "%".
    card.appendChild(el('div', { class: 'set-card-total' }, `Set: ${statLabel} +${cumulative}`));
  } else if (statLabel) {
    card.appendChild(el('div', { class: 'set-card-stat-label' }, `Increases: ${statLabel}`));
  }

  const memberList = el('div', { class: 'set-member-list' });
  members.forEach(m => {
    memberList.appendChild(el('div', { class: 'set-member-row' + (m.unreleased ? ' unreleased' : '') }, [
      el('div', { class: 'set-member-left' }, [
        renderSetMemberIcon(kind, m.name),
        el('div', { class: 'set-member-name' + (m.owned ? ' owned' : '') }, m.name),
      ]),
      el('div', { class: 'set-member-value' }, m.unreleased ? 'Unreleased' : (m.owned ? `${m.star}★` : '—')),
    ]));
  });
  card.appendChild(memberList);

  if (!incomplete) {
    const tierGrid = el('div', { class: 'set-tier-grid' });
    vals.forEach((v, i) => {
      const active = allOwned && i === tierIdx;
      tierGrid.appendChild(el('div', { class: 'set-tier-pip2' + (active ? ' active' : '') }, [
        el('span', { class: 'pip-star' }, tierLabels[i]),
        el('span', { class: 'pip-val' }, `${v}${typeof v === 'number' && v < 20 ? '%' : ''}`),
      ]));
    });
    card.appendChild(tierGrid);
  }

  return card;
}

/* ============================================================
   Bulk actions: per-tier "Own All", and cross-tier multi-select
   with a modal to assign a star level to many items at once.
   ============================================================ */
const BULK_CONFIG = {
  relics: {
    idKey: (it) => it.n,
    getOwned: (name) => !!state.relicOwned[name],
    getStar: (name) => state.relicStars[name] || 0,
    maxStar: () => 10,
    apply: (name, owned, star) => { state.relicOwned[name] = owned; state.relicStars[name] = star; },
  },
  collectibles: {
    idKey: (it) => it.n,
    getOwned: (name) => !!state.collectibleOwned[name],
    getStar: (name) => state.collectibleStars[name] || 0,
    maxStar: () => 10,
    apply: (name, owned, star) => { state.collectibleOwned[name] = owned; state.collectibleStars[name] = star; },
  },
  mounts: {
    idKey: (it) => it.idx,
    hasAwaken: true,
    getOwned: (idx) => !!(state.mountState[idx] && state.mountState[idx].owned),
    getStar: (idx) => (state.mountState[idx] && state.mountState[idx].stars) || 0,
    getAwaken: (idx) => (state.mountState[idx] && state.mountState[idx].awaken) || 0,
    maxStar: () => 5,
    maxAwaken: () => 10,
    apply: (idx, owned, star, awaken) => {
      const s = getMountOrArtifactState('mountState', idx);
      s.owned = owned;
      if (star !== undefined) s.stars = star;
      if (awaken !== undefined) s.awaken = awaken;
    },
  },
  artifacts: {
    idKey: (it) => it.idx,
    hasAwaken: true,
    getOwned: (idx) => !!(state.artifactState[idx] && state.artifactState[idx].owned),
    getStar: (idx) => (state.artifactState[idx] && state.artifactState[idx].stars) || 0,
    getAwaken: (idx) => (state.artifactState[idx] && state.artifactState[idx].awaken) || 0,
    maxStar: () => 5,
    maxAwaken: () => 10,
    apply: (idx, owned, star, awaken) => {
      const s = getMountOrArtifactState('artifactState', idx);
      s.owned = owned;
      if (star !== undefined) s.stars = star;
      if (awaken !== undefined) s.awaken = awaken;
    },
  },
};

const selectMode = { relics: false, collectibles: false, mounts: false, artifacts: false };
const selectedItems = { relics: new Set(), collectibles: new Set(), mounts: new Set(), artifacts: new Set() };

function renderTierGroupHeader(kind, tierLabel, groupId, groupItems) {
  const cfg = BULK_CONFIG[kind];
  const allSelected = groupItems.length > 0 && groupItems.every(it => selectedItems[kind].has(cfg.idKey(it)));

  const header = el('div', { class: 'tier-group-header' });
  header.appendChild(el('div', { class: 'tier-group-title', id: groupId, style: 'margin:0;border:none;padding:0;' }, tierLabel));

  const btnRow = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' });
  // A plain toggle into selection mode, available at every tier group —
  // not just "Select Tier" (which pre-selects everything in the group,
  // forcing a deselect pass if someone only wants a few items from a
  // large tier) and not just the toolbar's own toggle up at the top of
  // the page, which a tester flagged as real scroll friction to reach
  // once already deep into a long list.
  btnRow.appendChild(el('button', {
    class: 'bulk-action-btn' + (selectMode[kind] ? ' active' : ''),
    onclick: () => toggleSelectMode(kind),
  }, selectMode[kind] ? 'Cancel selecting' : 'Select multiple…'));

  // Bulk-selecting a tier only makes sense when there's more than one item
  // in it — with just one, "Select Tier" is a pointless extra step before
  // doing exactly what tapping the item directly would do.
  if (groupItems.length > 1) {
    btnRow.appendChild(el('button', {
      class: 'bulk-action-btn',
      onclick: () => {
        if (allSelected) {
          // Deselect just this tier's items, leaving any others untouched
          groupItems.forEach(it => selectedItems[kind].delete(cfg.idKey(it)));
        } else {
          // Add this tier's items to whatever's already selected, rather
          // than replacing it — lets multiple tiers build up together
          // (Legendary + Rare both selected, not either/or), so a second
          // "Select Tier" click on a different tier no longer wipes out
          // the first one. Still only within the same kind, though —
          // exitOtherSelectModes keeps a different category (Collectibles
          // vs Relics) from being selectable at the same time.
          exitOtherSelectModes(kind);
          selectMode[kind] = true;
          groupItems.forEach(it => selectedItems[kind].add(cfg.idKey(it)));
        }
        render();
      },
    }, allSelected ? 'Deselect Tier' : 'Select Tier'));
    header.appendChild(btnRow);
  } else {
    header.appendChild(btnRow);
  }

  return header;
}

// Only one category can be "in select mode" at a time across the whole
// Collection page — it's one continuous scroll with every section visible
// together, so letting two sections both stay in select mode independently
// produced two separate floating bulk-action bars stacked on screen at
// once, with no way to tell which "Mark as Owned" applied to which
// selection. Entering select mode for one kind now force-exits any other.
function exitOtherSelectModes(exceptKind) {
  Object.keys(selectMode).forEach(kind => {
    if (kind !== exceptKind && selectMode[kind]) {
      selectMode[kind] = false;
      selectedItems[kind].clear();
    }
  });
}

function toggleSelectMode(kind) {
  selectMode[kind] = !selectMode[kind];
  if (!selectMode[kind]) {
    selectedItems[kind].clear();
  } else {
    exitOtherSelectModes(kind);
  }
  render();
}

function toggleItemSelected(kind, id) {
  const set = selectedItems[kind];
  if (set.has(id)) set.delete(id); else set.add(id);
  render();
}

function renderBulkActionBar(kind) {
  const count = selectedItems[kind].size;
  if (!selectMode[kind]) return null;
  const cfg = BULK_CONFIG[kind];
  return el('div', { class: 'bulk-action-bar' }, [
    el('span', { class: 'bulk-action-count' }, count > 0 ? `${count} selected` : 'Tap items or "Select Tier" to select them'),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
      el('button', {
        class: 'bulk-action-btn',
        disabled: count === 0 ? 'true' : null,
        onclick: () => {
          if (count === 0) return;
          [...selectedItems[kind]].forEach(id => cfg.apply(id, true, cfg.getStar(id), cfg.hasAwaken ? cfg.getAwaken(id) : undefined));
          saveState();
          render();
        },
      }, 'Mark as Owned'),
      el('button', {
        class: 'bulk-action-btn',
        disabled: count === 0 ? 'true' : null,
        onclick: () => { if (count > 0) { cfg.hasAwaken ? openStarAwakenModal(kind) : openStarAssignModal(kind); } },
      }, cfg.hasAwaken ? 'Star & Awaken Update' : 'Star Update'),
      el('button', { class: 'bulk-action-btn secondary', onclick: () => toggleSelectMode(kind) }, 'Done'),
    ]),
  ]);
}

function openStarAwakenModal(kind) {
  const cfg = BULK_CONFIG[kind];
  const ids = [...selectedItems[kind]];
  const dataKey = kind === 'mounts' ? 'mounts' : 'artifacts';
  const itemsById = Object.fromEntries(DB[dataKey].map(it => [it.idx, it]));
  const maxStar = cfg.maxStar();
  const maxAwaken = cfg.maxAwaken();
  let starVal = maxStar;
  let awakenVal = maxAwaken;

  // Uncommon/Rare/Epic mounts have no real star progression, and at least
  // one artifact (Sword of Victory Oath) has neither stars nor awaken —
  // both confirmed by every delta being empty for those items. Showing a
  // picker for a dimension that does nothing is just confusing. Bulk
  // selection is always scoped to a single tier at a time, so this only
  // ever needs to check the first selected item.
  const firstItem = ids.length ? itemsById[ids[0]] : null;
  const showStars = !firstItem || hasStarProgression(firstItem);
  const showAwaken = !firstItem || hasAwakenProgression(firstItem);

  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });

  const starDisplay = el('div', { class: 'modal-star-value' }, `${starVal}★`);
  const starInput = el('input', {
    type: 'number', class: 'modal-star-input', min: '0', max: String(maxStar), value: String(starVal),
    oninput: (e) => {
      const n = parseInt(e.target.value, 10);
      starVal = Number.isNaN(n) ? 0 : Math.max(0, Math.min(maxStar, n));
      starDisplay.textContent = `${starVal}★`;
    },
  });
  const awakenDisplay = el('div', { class: 'modal-star-value' }, `A${awakenVal}`);
  const awakenInput = el('input', {
    type: 'number', class: 'modal-star-input', min: '0', max: String(maxAwaken), value: String(awakenVal),
    oninput: (e) => {
      const n = parseInt(e.target.value, 10);
      awakenVal = Number.isNaN(n) ? 0 : Math.max(0, Math.min(maxAwaken, n));
      awakenDisplay.textContent = `A${awakenVal}`;
    },
  });

  const titleParts = [];
  if (showStars) titleParts.push('stars');
  if (showAwaken) titleParts.push('awaken');
  const box = el('div', { class: 'modal-box' }, [
    el('div', { class: 'modal-title' }, titleParts.length
      ? `Set ${titleParts.join(' & ')} for ${ids.length} item${ids.length === 1 ? '' : 's'}`
      : `Nothing to set for ${ids.length} item${ids.length === 1 ? '' : 's'}`),
    showStars ? el('div', { class: 'modal-input-label', style: 'text-align:center;margin-bottom:6px;' }, 'Stars') : null,
    showStars ? el('div', { class: 'modal-star-picker' }, [
      el('button', { class: 'modal-star-btn', onclick: () => { starVal = Math.max(0, starVal - 1); starDisplay.textContent = `${starVal}★`; starInput.value = String(starVal); } }, '−'),
      starDisplay,
      el('button', { class: 'modal-star-btn', onclick: () => { starVal = Math.min(maxStar, starVal + 1); starDisplay.textContent = `${starVal}★`; starInput.value = String(starVal); } }, '+'),
    ]) : null,
    showStars ? el('div', { class: 'modal-input-row' }, [el('span', { class: 'modal-input-label' }, 'or type a number:'), starInput]) : null,
    showAwaken ? el('div', { class: 'modal-input-label', style: `text-align:center;margin:${showStars ? '14px' : '0'} 0 6px;` }, 'Awaken') : null,
    showAwaken ? el('div', { class: 'modal-star-picker' }, [
      el('button', { class: 'modal-star-btn', onclick: () => { awakenVal = Math.max(0, awakenVal - 1); awakenDisplay.textContent = `A${awakenVal}`; awakenInput.value = String(awakenVal); } }, '−'),
      awakenDisplay,
      el('button', { class: 'modal-star-btn', onclick: () => { awakenVal = Math.min(maxAwaken, awakenVal + 1); awakenDisplay.textContent = `A${awakenVal}`; awakenInput.value = String(awakenVal); } }, '+'),
    ]) : null,
    showAwaken ? el('div', { class: 'modal-input-row' }, [el('span', { class: 'modal-input-label' }, 'or type a number:'), awakenInput]) : null,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'bulk-action-btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'bulk-action-btn primary',
        onclick: () => {
          ids.forEach(id => cfg.apply(id, true, showStars ? starVal : undefined, showAwaken ? awakenVal : undefined));
          saveState();
          selectedItems[kind].clear();
          selectMode[kind] = false;
          closeModal();
          render();
        },
      }, 'Apply'),
    ]),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function closeModal() { overlay.remove(); }
}

function openStarAssignModal(kind) {
  const cfg = BULK_CONFIG[kind];
  const names = [...selectedItems[kind]];
  const itemsByName = Object.fromEntries((kind === 'relics' ? DB.relics : DB.collectibles).map(it => [it.n, it]));
  const maxAllowed = Math.min(...names.map(n => cfg.maxStar(itemsByName[n])));
  let value = maxAllowed;

  const overlay = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === overlay) closeModal(); } });
  const valDisplay = el('div', { class: 'modal-star-value' }, `${value}★`);
  const numInput = el('input', {
    type: 'number', class: 'modal-star-input', min: '0', max: String(maxAllowed), value: String(value),
    oninput: (e) => {
      const n = parseInt(e.target.value, 10);
      value = Number.isNaN(n) ? 0 : Math.max(0, Math.min(maxAllowed, n));
      valDisplay.textContent = `${value}★`;
    },
  });

  const box = el('div', { class: 'modal-box' }, [
    el('div', { class: 'modal-title' }, `Set stars for ${names.length} item${names.length === 1 ? '' : 's'}`),
    el('div', { class: 'modal-star-picker' }, [
      el('button', { class: 'modal-star-btn', onclick: () => { value = Math.max(0, value - 1); valDisplay.textContent = `${value}★`; numInput.value = String(value); } }, '−'),
      valDisplay,
      el('button', { class: 'modal-star-btn', onclick: () => { value = Math.min(maxAllowed, value + 1); valDisplay.textContent = `${value}★`; numInput.value = String(value); } }, '+'),
    ]),
    el('div', { class: 'modal-input-row' }, [
      el('span', { class: 'modal-input-label' }, 'or type a number:'),
      numInput,
    ]),
    maxAllowed < 10 ? el('div', { class: 'modal-note' }, `Capped at ${maxAllowed}★ — the lowest max among your selected items.`) : null,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'bulk-action-btn secondary', onclick: closeModal }, 'Cancel'),
      el('button', {
        class: 'bulk-action-btn primary',
        onclick: () => {
          names.forEach(n => cfg.apply(n, true, Math.min(value, cfg.maxStar(itemsByName[n]))));
          saveState();
          selectedItems[kind].clear();
          selectMode[kind] = false;
          closeModal();
          render();
        },
      }, 'Apply'),
    ]),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function closeModal() { overlay.remove(); }
}

function clearAllRelics() {
  state.relicOwned = {};
  state.relicStars = {};
  saveState();
  render();
}

function renderRelics() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'You may filter relics by tier, multi-select them and either mark them as owned or assign stars to the selection. Relics marked as owned here will be selectable in the equipments page.'));

  const toolbar = el('div', { class: 'toolbar toolbar-stacked' });
  const search = el('input', {
    class: 'search-input', type: 'text', placeholder: 'Search relics…', value: relicSearch,
    oninput: (e) => { relicSearch = e.target.value; renderRelicGroups(groupsWrap); },
  });
  const selectMultipleBtn = el('button', {
    class: 'filter-chip' + (selectMode.relics ? ' active' : ''),
    onclick: () => toggleSelectMode('relics'),
  }, selectMode.relics ? 'Cancel selecting' : 'Select multiple…');
  toolbar.appendChild(el('div', { class: 'toolbar-row' }, [search, selectMultipleBtn]));

  // Derived from the actual data, not a hand-maintained list — a hardcoded
  // array here is exactly how a real tier (Rare) went missing from this
  // filter before. If a new rarity is ever added to the data, it shows up
  // here automatically instead of silently needing a matching code edit.
  const relicTierOptions = ['All', ...buildTierGroups(DB.relics, 'rarity').map(g => g.tier)];
  const tierDropdown = renderFilterDropdown('Tier', relicTierOptions, relicRarityFilter, (v) => {
    relicRarityFilter = v;
    renderRelicGroups(groupsWrap);
  });
  const ownedDropdown = renderFilterDropdown('Owned', ['All', 'Owned', 'Not Owned'], relicOwnedFilter, (v) => {
    relicOwnedFilter = v;
    renderRelicGroups(groupsWrap);
  });
  const statDropdown = renderFilterDropdown('Stat', ['All', 'Tenacity', 'Tenacity Res', 'Armor Break', 'Armor Break Res'], relicStatFilter, (v) => {
    relicStatFilter = v;
    renderRelicGroups(groupsWrap);
  });
  toolbar.appendChild(renderFilterToggleSection('relics', el('div', { class: 'filter-row-dropdowns' }, [tierDropdown, ownedDropdown, statDropdown])));
  wrap.appendChild(toolbar);

  const groupsWrap = el('div', {});
  wrap.appendChild(groupsWrap);
  renderRelicGroups(groupsWrap);

  // Sets, at the bottom
  wrap.appendChild(el('div', { class: 'tier-group-title', id: 'relics-sets' }, 'Relic Sets'));
  const setsGrid = el('div', { class: 'sets-grid' });
  const allSets = Object.values(DB.relic_sets).flat();
  allSets.forEach(set => setsGrid.appendChild(renderRelicSetPanel(set)));
  wrap.appendChild(setsGrid);

  return wrap;
}

function renderRelicGroups(container) {
  container.innerHTML = '';
  const STAT_FILTER_KEY = {
    'Tenacity': 'tenacity',
    'Tenacity Res': 'tenacity_res',
    'Armor Break': 'armor_break',
    'Armor Break Res': 'armor_break_res',
  };
  const items = DB.relics.filter(r => {
    if (relicRarityFilter !== 'All' && r.rarity !== relicRarityFilter) return false;
    if (relicSearch && !r.n.toLowerCase().includes(relicSearch.toLowerCase())) return false;
    const owned = !!state.relicOwned[r.n];
    if (relicOwnedFilter === 'Owned' && !owned) return false;
    if (relicOwnedFilter === 'Not Owned' && owned) return false;
    if (STAT_FILTER_KEY[relicStatFilter]) {
      const statKeys = Object.keys(r.star_stats || {});
      if (!statKeys.includes(STAT_FILTER_KEY[relicStatFilter])) return false;
    }
    return true;
  });
  const groups = buildTierGroups(items, 'rarity');
  groups.forEach(g => {
    container.appendChild(renderTierGroupHeader('relics', g.tier, `relics-${g.slug}`, g.items));
    const grid = el('div', { class: 'card-grid cols-4' });
    g.items.forEach(r => grid.appendChild(renderRelicCard(r)));
    container.appendChild(grid);
  });
  const bar = renderBulkActionBar('relics');
  if (bar) container.appendChild(bar);
}

function renderSelectionOverlay(kind, name) {
  const selected = selectedItems[kind].has(name);
  return el('button', {
    type: 'button',
    class: 'select-checkbox' + (selected ? ' checked' : ''),
    onclick: (e) => { e.stopPropagation(); toggleItemSelected(kind, name); },
  }, selected ? '✓' : '');
}

function renderRelicCard(relic) {
  const owned = !!state.relicOwned[relic.n];
  // null (not 0) while unowned — the stepper displays an em dash for
  // that state regardless of whatever's still stored underneath, and
  // only resolves to a real number once actually owned.
  const star = owned ? (state.relicStars[relic.n] || 0) : null;

  const card = el('div', { class: 'item-card' + (selectMode.relics && selectedItems.relics.has(relic.n) ? ' selected' : '') });
  if (selectMode.relics) card.appendChild(renderSelectionOverlay('relics', relic.n));

  card.appendChild(renderCardTitleRow('relics', relic, relic.rarity));

  // Owned badge alone on its own row — no stepper beside it.
  card.appendChild(el('div', { class: 'card-badge-row' }, [
    renderOwnedBadge(owned, (checked) => {
      state.relicOwned[relic.n] = checked;
      if (!checked) state.relicStars[relic.n] = 0;
      saveState();
      render();
    }),
  ]));

  // Stars: its own full-width row with an explicit label above the
  // stepper, not sharing space with the badge or any other control.
  card.appendChild(el('div', { class: 'card-stepper-row' }, [
    el('div', { class: 'card-stepper-label' }, 'Stars'),
    renderStepper(`relic-${relic.n}`, star, 0, 10, (next) => setRelicStar(relic.n, next)),
  ]));

  const infoLines = [];
  if (owned) {
    // Relics with base/5★/10★ effect text (35 of them, from the "Relic
    // Equip effect" sheet) should show whichever tier actually matches the
    // current star level — not always the 10★ version regardless of where
    // the star stepper actually sits. Relics with only a single "effect"
    // field (no tiered variants) keep showing that one either way, since
    // it's all the source data has.
    let effectText = relic.effect;
    let effectLabel = '10★';
    if (relic.effect_base) {
      if (star < 5) { effectText = relic.effect_base; effectLabel = '0★'; }
      else if (star < 10) { effectText = relic.effect_5star; effectLabel = '5★'; }
      else { effectText = relic.effect; effectLabel = '10★'; }
    }
    if (effectText) {
      infoLines.push(el('div', { class: 'item-effect' },
        el('span', {}, [`${effectLabel}: `, renderTextWithSkillTags(effectText)])));
    }

    if (relic.star_stats) {
      const nodes = formatStatBlockNodes(
        Object.fromEntries(Object.entries(relic.star_stats).map(([stat, vals]) => [stat, vals[star]]))
      );
      infoLines.push(el('div', { class: 'item-effect' }, nodes));
    }
  }
  if (infoLines.length) card.appendChild(el('div', { class: 'card-info' }, infoLines));

  return card;
}

function setRelicStar(relicName, next) {
  state.relicStars[relicName] = next;
  // Always true here, not just "next > 0" — this only ever fires from a
  // deliberate + click or typed edit (the − button is disabled while
  // unowned, so it can never reach this function in that state), and the
  // first + click from the em dash passes 0 itself, which needs to count
  // as owned too, not just values above it.
  state.relicOwned[relicName] = true;
  saveState();
  render();
}

const RELIC_TIER_STARS = [0, 2, 4, 6, 8, 10];
const RELIC_TIER_LABELS = ['Set', '2★', '4★', '6★', '8★', '10★'];

function renderRelicSetPanel(set) {
  const members = set.items.map(name => {
    const r = DB.relics.find(x => x.n === name);
    if (!r) return { name, owned: false, star: 0, unreleased: true };
    return { name, owned: !!state.relicOwned[r.n], star: state.relicStars[r.n] || 0, unreleased: false };
  });
  const incomplete = set.tracked === false;
  const allOwned = !incomplete && members.length > 0 && members.every(m => m.owned && !m.unreleased);
  const minStar = allOwned ? Math.min(...members.map(m => m.star)) : -1;

  let tierIdx = -1;
  if (allOwned) {
    tierIdx = 0;
    for (let i = RELIC_TIER_STARS.length - 1; i >= 0; i--) {
      if (minStar >= RELIC_TIER_STARS[i]) { tierIdx = i; break; }
    }
  }

  return renderSetCard({
    kind: 'relics', name: set.set, statLabel: set.stat,
    tierLabels: RELIC_TIER_LABELS, vals: set.vals,
    members, allOwned, minStar, tierIdx, incomplete,
  });
}

/* ---------- Collectibles ---------- */
let collectibleSearch = '';
let collectibleRarityFilter = 'All';
let collectibleOwnedFilter = 'All';

function clearAllCollectibles() {
  state.collectibleOwned = {};
  state.collectibleStars = {};
  saveState();
  render();
}

function renderCollectibles() {
  const wrap = el('div', {});
  wrap.appendChild(el('p', { class: 'section-desc' },
    'You may filter collectibles by tier, multi-select them and either mark them as owned or assign stars to the selection.'));

  const toolbar = el('div', { class: 'toolbar toolbar-stacked' });
  const search = el('input', {
    class: 'search-input', type: 'text', placeholder: 'Search collectibles…', value: collectibleSearch,
    oninput: (e) => { collectibleSearch = e.target.value; renderCollectibleGroups(groupsWrap); },
  });
  const selectMultipleBtn = el('button', {
    class: 'filter-chip' + (selectMode.collectibles ? ' active' : ''),
    onclick: () => toggleSelectMode('collectibles'),
  }, selectMode.collectibles ? 'Cancel selecting' : 'Select multiple…');
  toolbar.appendChild(el('div', { class: 'toolbar-row' }, [search, selectMultipleBtn]));

  // Derived from the actual data, not a hand-maintained list — see the
  // matching comment in renderRelics for why: a hardcoded list here was
  // exactly how Rare-tier collectibles went missing from this filter.
  const collectibleTierOptions = ['All', ...buildTierGroups(DB.collectibles, 'rarity').map(g => g.tier)];
  const tierDropdown = renderFilterDropdown('Tier', collectibleTierOptions, collectibleRarityFilter, (v) => {
    collectibleRarityFilter = v;
    renderCollectibleGroups(groupsWrap);
  });
  const ownedDropdown = renderFilterDropdown('Owned', ['All', 'Owned', 'Not Owned'], collectibleOwnedFilter, (v) => {
    collectibleOwnedFilter = v;
    renderCollectibleGroups(groupsWrap);
  });
  toolbar.appendChild(renderFilterToggleSection('collectibles', el('div', { class: 'filter-row-dropdowns' }, [tierDropdown, ownedDropdown])));
  wrap.appendChild(toolbar);

  const groupsWrap = el('div', {});
  wrap.appendChild(groupsWrap);
  renderCollectibleGroups(groupsWrap);

  wrap.appendChild(el('div', { class: 'tier-group-title', id: 'collectibles-sets' }, 'Collectible Sets'));
  const setsGrid = el('div', { class: 'sets-grid' });
  const allSets = Object.values(DB.collectible_sets).flat();
  allSets.forEach(set => setsGrid.appendChild(renderCollectibleSetPanel(set)));
  wrap.appendChild(setsGrid);

  return wrap;
}

function renderCollectibleGroups(container) {
  container.innerHTML = '';
  const items = DB.collectibles.filter(c => {
    if (collectibleRarityFilter !== 'All' && c.rarity !== collectibleRarityFilter) return false;
    if (collectibleSearch && !c.n.toLowerCase().includes(collectibleSearch.toLowerCase())) return false;
    const owned = !!state.collectibleOwned[c.n];
    if (collectibleOwnedFilter === 'Owned' && !owned) return false;
    if (collectibleOwnedFilter === 'Not Owned' && owned) return false;
    return true;
  });
  const groups = buildTierGroups(items, 'rarity');
  groups.forEach(g => {
    container.appendChild(renderTierGroupHeader('collectibles', g.tier, `collectibles-${g.slug}`, g.items));
    const grid = el('div', { class: 'card-grid cols-4' });
    g.items.forEach(c => grid.appendChild(renderCollectibleCard(c)));
    container.appendChild(grid);
  });
  const bar = renderBulkActionBar('collectibles');
  if (bar) container.appendChild(bar);
}

function renderCollectibleCard(item) {
  const owned = !!state.collectibleOwned[item.n];
  const maxStar = 10;
  // null (not 0) while unowned — same em-dash pattern as Relic.
  const stars = owned ? Math.min(state.collectibleStars[item.n] || 0, maxStar) : null;
  const card = el('div', { class: 'item-card' + (selectMode.collectibles && selectedItems.collectibles.has(item.n) ? ' selected' : '') });
  if (selectMode.collectibles) card.appendChild(renderSelectionOverlay('collectibles', item.n));

  card.appendChild(renderCardTitleRow('collectibles', item, item.rarity));

  card.appendChild(el('div', { class: 'card-badge-row' }, [
    renderOwnedBadge(owned, (checked) => {
      state.collectibleOwned[item.n] = checked;
      if (!checked) state.collectibleStars[item.n] = 0;
      saveState();
      render();
    }),
  ]));

  card.appendChild(el('div', { class: 'card-stepper-row' }, [
    el('div', { class: 'card-stepper-label' }, 'Stars'),
    renderStepper(`collectible-${item.n}`, stars, 0, maxStar, (next) => setCollectibleStar(item.n, next, maxStar)),
  ]));

  if (owned) {
    const val = item.star_vals[stars];
    let effectLine;
    if (val == null) {
      effectLine = el('div', { class: 'item-effect placeholder' },
        `${item.stat_label}: not documented at ${stars}★ yet`);
    } else {
      // New source data gives raw numbers directly (percent stats are
      // already whole percentages like 1.0 = 1%, not a 0.01 fraction) —
      // no more ×100 conversion, and flat stats (HP/ATK/DEF/Block) get no
      // "%" at all since they're not percentages to begin with.
      const display = isPercentLabel(item.stat_label) ? `${val}%` : `${val}`;
      effectLine = el('div', { class: 'item-effect' }, [
        item.stat_label.replace(/\s*%$/, '') + ': ',
        el('span', { class: 'stat-value-live' }, display),
      ]);
    }
    const lines = [effectLine];
    // Second stat line — Immortal-rarity collectibles only, currently
    // (Laurel Jade Rabbit onward), but rendered purely off star_vals2's
    // presence rather than checking rarity directly, same as the
    // Calculator side, so any future item gets this for free just by
    // having the field populated.
    if (item.star_vals2) {
      const val2 = item.star_vals2[stars];
      if (val2 == null) {
        lines.push(el('div', { class: 'item-effect placeholder' },
          `${item.stat_label2}: not documented at ${stars}★ yet`));
      } else {
        const display2 = isPercentLabel(item.stat_label2) ? `${val2}%` : `${val2}`;
        lines.push(el('div', { class: 'item-effect' }, [
          item.stat_label2.replace(/\s*%$/, '') + ': ',
          el('span', { class: 'stat-value-live' }, display2),
        ]));
      }
    }
    card.appendChild(el('div', { class: 'card-info' }, lines));
  }
  return card;
}

function setCollectibleStar(name, next, maxStar) {
  state.collectibleStars[name] = Math.max(0, Math.min(maxStar != null ? maxStar : 10, next));
  // Always true, same reasoning as setRelicStar — only ever fires from a
  // deliberate + click or typed edit, and the first + click passes 0
  // itself, which needs to count as owned too.
  state.collectibleOwned[name] = true;
  saveState();
  render();
}

const COLLECTIBLE_TIER_STARS = [0, 3, 6, 10];
const COLLECTIBLE_TIER_LABELS = ['0★', '3★', '6★', '10★'];

function renderCollectibleSetPanel(set) {
  const incomplete = set.tracked === false;
  const allOwned = !incomplete && set.items.every(name => state.collectibleOwned[name]);
  const minStar = allOwned ? Math.min(...set.items.map(name => state.collectibleStars[name] || 0)) : -1;
  let tierIdx = 0;
  if (allOwned) {
    for (let i = COLLECTIBLE_TIER_STARS.length - 1; i >= 0; i--) {
      if (minStar >= COLLECTIBLE_TIER_STARS[i]) { tierIdx = i; break; }
    }
  }

  const members = set.items.map(name => {
  const exists = DB.collectibles.some(c => c.n === name);
  return {
    name,
    owned: !!state.collectibleOwned[name],
    star: state.collectibleStars[name] || 0,
    unreleased: !exists,
  };
});

    return renderSetCard({
    kind: 'collectibles', name: set.set, statLabel: set.stat,
    tierLabels: COLLECTIBLE_TIER_LABELS, vals: set.vals,
    members, allOwned, minStar, tierIdx: allOwned ? tierIdx : -1, incomplete,
  });
}

/* ---------- Mounts & Artifacts ---------- */
const TIER_ORDER = ['Transcendent', 'Immortal', 'Mythic', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Great', 'Common'];

// Highest tier first, matching TIER_ORDER — used anywhere a dropdown or
// search list needs items sorted by tier rather than left in whatever
// order they happened to load from the source data.
function sortByTierDesc(items, field = 'tier') {
  return [...items].sort((a, b) => {
    const ai = TIER_ORDER.indexOf(a[field]);
    const bi = TIER_ORDER.indexOf(b[field]);
    return (ai === -1 ? TIER_ORDER.length : ai) - (bi === -1 ? TIER_ORDER.length : bi);
  });
}

const mountArtifactFilters = {
  mounts: { search: '', tier: 'All', owned: 'All' },
  artifacts: { search: '', tier: 'All', owned: 'All' },
};

function clearAllMountsOrArtifacts(kind) {
  const bucketKey = kind === 'mounts' ? 'mountState' : 'artifactState';
  state[bucketKey] = {};
  saveState();
  render();
}

function renderMountsOrArtifacts(kind) {
  const isMount = kind === 'mounts';
  const bucket = isMount ? 'mountState' : 'artifactState';
  const filters = mountArtifactFilters[kind];

  const wrap = el('div', { class: isMount ? 'scope-mounts' : '' });
  wrap.appendChild(el('p', { class: 'section-desc' },
    isMount
      ? 'You may filter mounts by tier, multi-select them and either mark them as owned or assign stars to the selection. Mounts marked as owned here will be selectable in the equipments page.'
      : 'You may filter artifacts by tier, multi-select them and either mark them as owned or assign stars to the selection. Artifacts marked as owned here will be selectable in the equipments page.'));

  const toolbar = el('div', { class: 'toolbar toolbar-stacked' });
  const search = el('input', {
    class: 'search-input', type: 'text', placeholder: `Search ${kind}…`, value: filters.search,
    oninput: (e) => { filters.search = e.target.value; renderMountArtifactGroups(kind, groupsWrap); },
  });
  const selectMultipleBtn = el('button', {
    class: 'filter-chip' + (selectMode[kind] ? ' active' : ''),
    onclick: () => toggleSelectMode(kind),
  }, selectMode[kind] ? 'Cancel selecting' : 'Select multiple…');
  toolbar.appendChild(el('div', { class: 'toolbar-row' }, [search, selectMultipleBtn]));

  const allItems = (isMount ? DB.mounts : DB.artifacts).filter(x => x.n !== 'None');
  const tierOptions = ['All', ...buildTierGroups(allItems).map(g => g.tier)];
  const tierDropdown = renderFilterDropdown('Tier', tierOptions, filters.tier, (v) => {
    filters.tier = v;
    renderMountArtifactGroups(kind, groupsWrap);
  });
  const ownedDropdown = renderFilterDropdown('Owned', ['All', 'Owned', 'Not Owned'], filters.owned, (v) => {
    filters.owned = v;
    renderMountArtifactGroups(kind, groupsWrap);
  });
  toolbar.appendChild(renderFilterToggleSection(kind, el('div', { class: 'filter-row-dropdowns' }, [tierDropdown, ownedDropdown])));
  wrap.appendChild(toolbar);

  const groupsWrap = el('div', {});
  wrap.appendChild(groupsWrap);
  renderMountArtifactGroups(kind, groupsWrap);

  return wrap;
}

function renderMountArtifactGroups(kind, container) {
  container.innerHTML = '';
  const isMount = kind === 'mounts';
  const bucket = isMount ? 'mountState' : 'artifactState';
  const filters = mountArtifactFilters[kind];

  const allItems = (isMount ? DB.mounts : DB.artifacts).filter(it => it.n !== 'None');
  const items = allItems.filter(it => {
    if (filters.tier !== 'All' && it.tier !== filters.tier) return false;
    if (filters.search && !it.n.toLowerCase().includes(filters.search.toLowerCase())) return false;
    const owned = !!(state[bucket][it.idx] && state[bucket][it.idx].owned);
    if (filters.owned === 'Owned' && !owned) return false;
    if (filters.owned === 'Not Owned' && owned) return false;
    return true;
  });

  const groups = buildTierGroups(items);
  groups.forEach(g => {
    container.appendChild(renderTierGroupHeader(kind, g.tier, `${kind}-${g.slug}`, g.items));
    const grid = el('div', { class: 'card-grid cols-2' });
    g.items.forEach(item => grid.appendChild(renderMountArtifactCard(item, bucket, isMount)));
    container.appendChild(grid);
  });

  const bar = renderBulkActionBar(kind);
  if (bar) container.appendChild(bar);
}

function sumStatBlocks(...blocks) {
  const out = {};
  blocks.forEach(b => {
    Object.entries(b || {}).forEach(([k, v]) => {
      if (k === '_unparsed') return;
      out[k] = (out[k] || 0) + v;
    });
  });
  return out;
}

function resolveAwakenEffect(item, awakenLevel) {
  for (let lvl = awakenLevel; lvl >= 0; lvl--) {
    const text = lvl === 0 ? item.awaken_base_effect : (item.awaken_effects && item.awaken_effects[`A${lvl}`]);
    if (text && !text.startsWith('No additional effect')) {
      return { level: lvl, text, isCarried: lvl !== awakenLevel };
    }
  }
  return null;
}

// A0/A4/A10 are the awaken levels the game itself now highlights as the
// meaningful skill milestones for every Artifact and Mount alike (not
// per-item — confirmed this is a universal pattern, unlike the
// min_awaken thresholds in flat_stats_awaken_tiers/stacking_stats_
// awaken_tiers, which genuinely do vary per item).
const KEY_AWAKEN_LEVELS = new Set([0, 4, 10]);
function renderKeyAwakenBadge(level) {
  return KEY_AWAKEN_LEVELS.has(level) ? el('span', { class: 'key-awaken-badge' }, 'Key') : null;
}

function hasStarProgression(item) {
  const deltas = item.star_up && item.star_up.deltas;
  if (!deltas) return false;
  return Object.values(deltas).some(d => d && Object.keys(d).length > 0);
}

function hasAwakenProgression(item) {
  const deltas = item.awaken && item.awaken.deltas;
  const hasNumericDeltas = deltas && Object.values(deltas).some(d => d && Object.keys(d).length > 0);
  if (hasNumericDeltas) return true;
  // Artifacts' awaken levels upgrade skill text, not flat stats, so their
  // awaken.deltas are always empty even when awakening is genuinely real —
  // confirmed against the user's own curated database (Artifacts
  // StarUpAwakening sheet) for most artifacts. Sword of Victory Oath was
  // originally thought to be included too, since the sheet had text for
  // it — but confirmed directly against the actual in-game UI, this
  // item's awaken progression never actually displays anything, so its
  // awaken_effects were cleared to "No additional effect" strings
  // specifically so this function correctly excludes it. The sheet
  // itself wasn't wrong to have that text, it just doesn't reflect what
  // the game actually shows for this one item.
  const textEffects = item.awaken_effects;
  if (!textEffects) return false;
  return Object.values(textEffects).some(t => t && !t.startsWith('No additional effect'));
}

function renderMountArtifactCard(item, bucket, isMount) {
  const kind = isMount ? 'mounts' : 'artifacts';
  const s = getMountOrArtifactState(bucket, item.idx);
  const card = el('div', { class: 'item-card' + (selectMode[kind] && selectedItems[kind].has(item.idx) ? ' selected' : '') });
  if (selectMode[kind]) card.appendChild(renderSelectionOverlay(kind, item.idx));

  card.appendChild(renderCardTitleRow(isMount ? 'mounts' : 'artifacts', item, item.tier));

  card.appendChild(el('div', { class: 'card-badge-row' }, [
    renderOwnedBadge(s.owned, (checked) => { s.owned = checked; saveState(); render(); }),
  ]));

  // Uncommon/Rare/Epic mounts have a star stepper in-game that does
  // nothing — confirmed by every star delta being an empty object, unlike
  // Legendary+ mounts where starring up genuinely changes stats. Showing
  // the stepper there is misleading, so it's hidden for those tiers.
  // Same idea applies per-item now, not just per-tier — Sword of Victory
  // Oath (Legendary artifact) has neither star nor awaken progression at
  // all, confirmed the same way.
  const showStars = hasStarProgression(item);
  const showAwaken = hasAwakenProgression(item);

  // Each stepper gets its own full-width, labeled row — Stars and
  // Awakening never share a row, per Figma. Each shows an em dash and a
  // disabled − while !s.owned, same as Relic/Collectible — the onChange
  // handlers below already set s.owned = true on any interaction, so no
  // separate change needed there.
  if (showStars) {
    card.appendChild(el('div', { class: 'card-stepper-row' }, [
      el('div', { class: 'card-stepper-label' }, 'Stars'),
      renderStepper(`${bucket}-${item.idx}-stars`, s.owned ? s.stars : null, 0, 5,
        (next) => { s.stars = next; s.owned = true; saveState(); render(); }),
    ]));
  }
  if (showAwaken) {
    card.appendChild(el('div', { class: 'card-stepper-row' }, [
      el('div', { class: 'card-stepper-label' }, 'Awakening'),
      renderStepper(`${bucket}-${item.idx}-awaken`, s.owned ? s.awaken : null, 0, 10,
        (next) => { s.awaken = next; s.owned = true; saveState(); render(); },
        (v) => `A${v}`),
    ]));
  }

  if (!s.owned) return card;

  if (!item.star_up) {
    card.appendChild(el('div', { class: 'card-info' }, [
      el('div', { class: 'item-effect placeholder' },
        el('span', { class: 'coming-soon-badge' }, 'Coming Soon')),
    ]));
    return card;
  }

  // Show live totals = base + star delta + awaken delta. Base stats live in
  // awaken.base_stats for both item types (mounts don't scale stats by star
  // at all, so star_up.base_stats is empty there — awaken.base_stats is the
  // one reliable source, and it's identical to star_up.base_stats for
  // artifacts anyway, so this works for both without branching.)
  const starDelta = showStars && s.stars > 0 ? item.star_up.deltas[String(s.stars)] : null;
  const awakenDelta = s.awaken > 0 ? item.awaken.deltas[`A${s.awaken}`] : null;
  const total = sumStatBlocks(item.awaken.base_stats, starDelta, awakenDelta);
  const labelParts = [];
  if (showStars) labelParts.push(`${s.stars}★`);
  if (showAwaken) labelParts.push(`A${s.awaken}`);

  const infoLines = [
    el('div', { class: 'item-effect' },
      [labelParts.length ? `At ${labelParts.join(' / ')}: ` : '', formatStatBlockNodes(total, true)]),
  ];

  const starEff = showStars && item.star_effects && item.star_effects[String(s.stars)];
  if (starEff) infoLines.push(el('div', { class: 'item-effect', style: 'font-style:italic;' }, [`★${s.stars}: `, renderTextWithSkillTags(starEff)]));

  const resolved = resolveAwakenEffect(item, s.awaken);
  if (resolved) {
    infoLines.push(el('div', { class: 'item-effect', style: 'font-style:italic;' },
      [renderKeyAwakenBadge(resolved.level), `A${s.awaken}: `, renderTextWithSkillTags(resolved.text)]));
  }
  card.appendChild(el('div', { class: 'card-info' }, infoLines));

  return card;
}

/* ============================================================
   Calculator — PvP stat aggregation engine
   ============================================================
   Pulls a flat map of every numeric stat from everything already
   tracked in Collection (owned + starred). A fixed, curated list of named
   PvP-relevant stats (CALC_STAT_DEFS below) then pulls whichever raw keys
   feed into each one — some stats (Crit Rate, Combo Rate) are the sum of
   several differently-named keys across relics/mounts/artifacts/
   collectibles that all mean the same thing in-game. */

function sumBlockAtLevel(item, stars, awaken) {
  const starDelta = stars > 0 ? item.star_up.deltas[String(stars)] : null;
  const awakenDelta = awaken > 0 ? item.awaken.deltas[`A${awaken}`] : null;
  return sumStatBlocks(item.awaken.base_stats, starDelta, awakenDelta);
}

// Quick Stats used to run its own separate, much more limited aggregation
// (only relics/collectibles/mounts/artifacts) — meaning every other fix
// this session (gems, psionics, arcana, hero polarization, set bonuses,
// inheritance) only ever reached the Full Stat Breakdown table, never
// Quick Stats. This just extracts the totals from the same comprehensive
// aggregation the full table already uses, so the two can never drift
// out of sync with each other again.
function aggregatePvpStats(round = null) {
  const full = aggregateFullStatsWithSources(round);
  const totals = {};
  Object.entries(full).forEach(([label, entry]) => { totals[label] = entry.total; });
  return totals;
}

// ---- Full-detail stat table (with per-source attribution) ----
// Walks every structured, numeric data source in the app — equipment
// psionics, gems with a real numeric value, pet skills, relics,
// collectibles, mounts/artifacts, adventurer stat buffs, fashion, and
// homestead — and records not just the total per stat but exactly which
// item contributed how much, keyed by the same display label used
// throughout the app (mostly the psionic stat names, since those already
// match this table's requested labels almost one-to-one).
//
// Deliberately NOT included: Hero and Brand quality/polarization bonuses.
// Those only exist as free-form prose ("Camera Smash reduces enemy final
// damage bonus by 15%") with no structured stat-key + numeric-value pair
// to aggregate — extracting one reliably would mean guessing at a parser
// for arbitrary game-design text, which risks being silently wrong rather
// than just incomplete. They're still visible on their own cards.
//
// Also NOT included: a round-by-round (R1–R5) breakdown. Some sources are
// genuinely conditional on turn count ("first 3 turns", "every 3 turns"),
// but that timing lives only in unstructured effect text, not as tagged
// data — building a fabricated 5-column split from that would look far
// more precise than it actually is.

  // Merged into General Final Damage — both keys describe the same kind of
  // conditional bonus Holy Grail grants at different star tiers
  // (final_dmg_bonus for 0★/5★, conditional_final_dmg for 10★), and a
  // separate "Conditional Final Damage" bucket became redundant once the
  // round-by-round table itself shows exactly which round a conditional
  // effect activates — the round display does that job now, not a
  // parallel category name. final_dmg_bonus was never actually mapped to
  // anything before this, so Holy Grail's 0★/5★ tiers were silently
  // contributing nothing even before this change.

  // Collectibles use a different (but conceptually identical) key-naming
  // convention than relics/mounts/artifacts — without these, their
  // contributions were silently computed but never shown, since the
  // fallback (raw stat_label text, e.g. "Crit DMG %") never matches any
  // of the Calculator's exact category label strings. Only added where
  // the concept is an unambiguous match to an existing category — stats
  // with no real Calculator category (gold gain, AFK gains, lifesteal,
  // shield bonus, etc.) are deliberately left out rather than force-fit.
const RELIC_KEY_TO_LABEL = {
  dmg_reduction: 'Generic DMG Reduction',
  final_dmg_reduction: 'General Final Damage Reduction',

  dmg_bonus: 'Bonus Damage',
  final_dmg: 'General Final Damage',

  final_dmg_to_shields: 'Final Damage to Shields',

  sword_qi_dmg: 'Sword Qi DMG', 
  final_sword_qi_dmg: 'Final Sword Qi DMG',

  crit_rate_pct: 'Crit Rate (Generic)', 
  ignore_crit_pct: 'Ignore Crit',
  ignore_skill_crit: 'Ignore Skill Crit',
  
  crit_dmg: 'Crit DMG', 
  crit_dmg_reduction: 'Crit DMG Reduction', 

  basic_atk_crit_rate: 'Basic ATK Crit Rate', 
  dagger_crit_rate: 'Dagger Crit Rate',
  ignore_normal_attack_crit_rate: 'Ignore Normal ATK Crit',
  
  final_basic_atk_dmg: 'Final Normal ATK DMG', 
  final_basic_atk_dmg_reduction: 'Basic Attack Final Damage Reduction',

  skill_crit_rate: 'Skill Crit Rate', 
  skill_crit_dmg: 'Skill Crit DMG',
  ignore_skill_crit_rate: 'Ignore Skill Crit', 

  skill_dmg: 'Skill DMG', 
  final_skill_dmg: 'Final Skill Damage', 
  skill_dmg_reduction: 'Skill DMG Reduction',
  final_skill_dmg_reduction: 'Skill Damage Final Damage Reduction',
  
  lightning_crit_rate: 'Lightning Crit Rate',
  lightning_dmg: 'Lightning DMG', 
  lightning_dmg_reduction: 'Lightning DMG Reduction',
  final_lightning_dmg: 'Final Lightning DMG', 

  conditional_final_dmg: 'General Final Damage',
  conditional_dmg_reduction: 'Conditional Damage Reduction',
  conditional_final_dmg_reduction: 'Conditional Final Damage Reduction',
  conditional_dmg: 'Conditional Damage',  
  
  crit_dmg: 'Crit DMG', 
  crit_dmg_reduction: 'Crit DMG Reduction', 

  armor_break: 'Armor Break', 
  armor_break_res: 'Armor Break Resistance',
  tenacity: 'Tenacity', 
  tenacity_res: 'Tenacity Resistance',

  hp: 'HP', 
  hp_pct: 'HP%',
  global_hp: 'Global HP', 
  global_hp_pct: 'Global HP%', 

  atk: 'ATK', 
  atk_pct: 'ATK%',
  global_atk: 'Global ATK', 
  global_attack_pct: 'Global ATK', 

  global_def_pct: 'Global DEF%',
  
  combo: 'Combo Rate', 
  combo_rate_pct: 'Combo Rate', 
  ignore_combo: 'Ignore Combo', 
  ignore_combo_pct: 'Ignore Combo',

  combo_dmg: 'Combo DMG', 
  combo_dmg_reduction: 'Combo DMG Reduction',
  final_combo_dmg: 'Final Combo DMG',
  
  counter: 'Counter Rate',
  counter_rate_pct: 'Counter Rate',
  ignore_counter: 'Ignore Counter', 
  ignore_counter_pct: 'Ignore Counter',
  counter_dmg: 'Counter DMG', 
  counter_dmg_reduction: 'Counter DMG Reduction',
  final_counter_dmg: 'Final Counter DMG',

  basic_atk_dmg: 'Basic ATK DMG', 
  basic_atk_dmg_reduction: 'Basic ATK DMG Reduction',

  pet_dmg_pct: 'Pet DMG', 

  speed: 'Speed', 

  suppression: 'Suppression',

  control_immunity: 'Control Immunity Rate', 
  ignore_control_immunity: 'Ignore Control Immunity Rate',

  dot_crit_rate: 'DoT Crit Rates',
  dot_dmg: 'DoT DMG',
  ignore_dot_crit_rate: 'Ignore DoT Crit', 

  block: 'Block',

  dagger_crit_dmg: 'Dagger Crit DMG',
  dagger_dmg: 'Dagger DMG',
  final_dagger_dmg: 'Final Dagger DMG',

  fire_dmg: 'Fire DMG',

  light_spear_dmg: 'Light Spear DMG'
};

// Gem names carry their number baked in (e.g. "Combo Damage Boost +45%"),
// so they never matched any Calculator category label directly — this was
// true even for the 47 gems with a tracked numeric value, not just the
// text-only ones. Strip the number to get a stable base phrase, then map
// that to the matching category label. Only unambiguous, general-purpose
// gems are mapped; character-specific synergy gems (e.g. "Clown damage
// +X", "Electro Dragon's paralysis chance +X") have no general PvP
// category to belong to and are deliberately left out.
function gemNameBase(name) {
  return name.replace(/\+?\d+(\.\d+)?%?/g, '+X').trim();
}
const GEM_NAME_TO_LABEL = {
  'Basic Attack Damage Boost +X': 'Basic ATK DMG', 'Basic Attack Damage Reduction +X': 'Basic ATK DMG Reduction',
  'Combo Damage Boost +X': 'Combo DMG', 'Combo Damage Reduction +X': 'Combo DMG Reduction',
  'Counterattack Damage Boost +X': 'Counter DMG', 'Counterattack Damage Reduction +X': 'Counter DMG Reduction',
  'Explosion Damage Boost +X': 'Explosion DMG',
  'Final Damage Boost +X': 'General Final Damage', 'Final Damage Reduction +X': 'General Final Damage Reduction',
  'Fire Damage Boost +X': 'Fire DMG', 'Fire Damage Reduction +X': 'Fire DMG Reduction',
  'Lightning Damage Boost +X': 'Lightning DMG', 'Lightning Damage Reduction +X': 'Lightning DMG Reduction',
  'Physical Damage Boost +X': 'Physical DMG',
  'Combo Rate +X': 'Combo Rate', 'Counter Rate +X': 'Counter Rate',
  'Dagger Crit Rate +X': 'Dagger Crit Rate', 'DoT Crit Rate +X': 'DoT Crit Rates',
  'Lightning Crit Rate +X': 'Lightning Crit Rate', 'Sword Qi Crit Rate +X': 'Sword Qi Crit Rate',
  'Weapon Crit Rate +X': 'Weapon Crit Rate',
  'Ignore Combo Rate +X': 'Ignore Combo', 'Ignore Counter Rate +X': 'Ignore Counter', 'Ignore Critical Rate +X': 'Ignore Crit',
  'Global Attack +X': 'Global ATK', 'Speed +X': 'Speed',
  'Combo Damage Coefficient +X': 'Combo DMG Coef', 'Counterattack Damage Coefficient +X': 'Counter DMG Coef',
  'Dagger Damage Coefficient +X': 'Dagger DMG Coef', 'Lightning Damage Coefficient +X': 'Lightning DMG Coef',
};

// Pulls the tier-scaling numeric value out of a gem, whether it has a
// tracked numeric array or only ever had descriptive text. For text-only
// gems: if the description has exactly one percentage, that's the value.
// If it has more than one (e.g. "+30% damage to targets with HP above
// 70%" — a scaling bonus alongside a static threshold), compare against
// the lowest tier's text to find which number actually changes between
// tiers — that's the real one, not just whichever appears first.
function extractGemScalingValue(meta, tier) {
  if (meta.t && meta.t[tier - 1] != null) return meta.t[tier - 1];
  const td = meta.tier_desc;
  if (!td || !td[tier]) return null;
  const currentPcts = [...td[tier].matchAll(/\d+(?:\.\d+)?%/g)].map(m => m[0]);
  if (currentPcts.length === 0) return null;
  if (currentPcts.length === 1) return parseFloat(currentPcts[0]);
  const basePcts = td[1] ? [...td[1].matchAll(/\d+(?:\.\d+)?%/g)].map(m => m[0]) : [];
  for (let i = 0; i < currentPcts.length; i++) {
    if (currentPcts[i] !== basePcts[i]) return parseFloat(currentPcts[i]);
  }
  return null; // couldn't isolate which number scales — don't guess
}

// Most psionic stat names already match a Calculator category exactly
// (e.g. "Combo DMG", "Lightning DMG Reduction"), but a handful use a
// shorter/abbreviated form that doesn't — and some of those have two
// different spellings depending on which equipment slot they're rolled
// on (Armor uses "Final Adventurer DMG Red", Accessory uses "Adventurer
// FDR" for the same stat). Falls back to the psionic's own name when
// there's no override, which covers the majority case correctly.
const PSIONIC_NAME_TO_LABEL = {
  'Final DMG Reduction': 'General Final Damage Reduction',
  'DMG Reduction': 'Generic DMG Reduction',
  'Final Adventurer DMG Red': 'Adventurer Final Damage Reduction', 'Adventurer FDR': 'Adventurer Final Damage Reduction',
  'Final Artifact DMG Red': 'Artifact Final Damage Reduction', 'Artifact FDR': 'Artifact Final Damage Reduction',
  'Final Mount DMG Red': 'Mount Final Damage Reduction', 'Mount FDR': 'Mount Final Damage Reduction',
  'Final Pet DMG Red': 'Pet Final Damage Reduction', 'Pet FDR': 'Pet Final Damage Reduction',
  'DoT Crit Rate': 'DoT Crit Rates',
  'Ignore Crit Rate': 'Ignore Crit',
};

// Set bonus stat labels mostly match a Calculator category directly, but
// a few use "X Rate" where the category drops "Rate", or "Boost"/"Final"
// wording that doesn't line up character-for-character.
const SET_STAT_TO_LABEL = {
  'Final DMG Boost': 'General Final Damage', 'Final DMG Reduction': 'General Final Damage Reduction',
  'Ignore Combo Rate': 'Ignore Combo', 'Ignore Counter Rate': 'Ignore Counter',
  'Ignore Skill Crit Rate': 'Ignore Skill Crit', 'Ignore Normal Attack Crit Rate': 'Ignore Normal ATK Crit',
};

// Arcana bonus names mostly match a Calculator category exactly, or need
// the "Global " prefix stripped to match. Character/weapon-specific
// unique mechanics (Angel Bow X, Bishop Staff X, Star Staff X, etc.) have
// no general PvP category and are deliberately left unmapped — the
// fallback to the raw name means they just won't display, same as
// unmapped gems and collectibles.
const ARCANA_NAME_TO_LABEL = {
  'Global Basic ATK DMG': 'Basic ATK DMG', 'Global Basic ATK DMG Reduction': 'Basic ATK DMG Reduction',
  'Global Combo DMG': 'Combo DMG', 'Global Counter DMG': 'Counter DMG', 'Global Dagger DMG': 'Dagger DMG',
  'Global Lightning DMG': 'Lightning DMG', 'Global Sword Qi DMG': 'Sword Qi DMG', 'Global Skill DMG': 'Skill DMG',
  'Global HP': 'Global HP', 'Damage Reduction': 'Generic DMG Reduction', 'Ignore Crit Rate': 'Ignore Crit',
};

// Hero/Brand polarization text ("Final Damage Reduction +0.5%") follows
// the same "{name} +{val}%" shape as arcana — confirmed against the
// datamine's own structured polD/polCalc/polLabel fields for the heroes
// that have them, which matched this text exactly. Only 4 distinct base
// names appear across every hero/brand's polarization text; ATK%/HP%
// have no matching category, same as everywhere else in the app.
const POLARIZATION_NAME_TO_LABEL = {
  'Final Damage': 'General Final Damage', 'Final Damage Reduction': 'General Final Damage Reduction',
};
function parsePolarizationValue(text) {
  const m = text && text.match(/^(.*?)\s*\+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { name: m[1].trim(), val: parseFloat(m[2]) };
}

// Hero/Brand quality_effects text uses slightly different naming than the
// Calculator's own labels — mapped here rather than assuming a 1:1 match.
const HERO_BRAND_QUALITY_STAT_TO_LABEL = {
  'Global HP': 'Global HP%', 'Global ATK': 'Global ATK',
  'Global Lightning DMG': 'Lightning DMG', 'Global Combo DMG': 'Combo DMG', 'Global Counter DMG': 'Counter DMG',
  'Global Dagger DMG': 'Dagger DMG', 'Global Sword Qi DMG': 'Sword Qi DMG', 'Global Skill DMG': 'Skill DMG',
  'Final Lightning DMG': 'Final Lightning DMG', 'Final Combo DMG': 'Final Combo DMG', 'Final Sword Qi DMG': 'Final Sword Qi DMG',
  'Sword Qi DMG Coefficient': 'Sword Qi DMG Coef', 'Lightning DMG Coefficient': 'Lightning DMG Coef',
  'Weapon Crit Rate': 'Weapon Crit Rate', 'Combo Rate': 'Combo Rate', 'Lightning Crit Rate': 'Lightning Crit Rate',
  'Final Damage Reduction': 'General Final Damage Reduction',
};

// Inheritance tree nodes — calc/ty pairs confirmed against the datamine's
// INHERIT_NODE_CALC table. Nodes not listed here are the ones the
// datamine itself documents as untracked: flat HP/ATK/DEF stat-allocation
// nodes (no calc bucket for raw stat points), HP%/ATK%/DEF% right-column
// nodes, hero-unlock/segment-unlock slots, and a couple of "Pet DMG — no
// bucket" nodes with no matching Calculator category.
const INHERIT_CALC_TO_LABEL = {
  'dmgbonus:combo': 'Combo DMG', 'dmgbonus:counter': 'Counter DMG', 'dmgbonus:critdmg': 'Crit DMG',
  'dmgbonus:dagger': 'Dagger DMG', 'dmgbonus:fire': 'Fire DMG', 'dmgbonus:global_atk': 'Global ATK',
  'dmgbonus:lightning': 'Lightning DMG', 'dmgbonus:lightspear': 'Light Spear DMG',
  'dmgbonus:normal': 'Basic ATK DMG', 'dmgbonus:skill': 'Skill DMG', 'dmgbonus:swordqi': 'Sword Qi DMG',
  'dmgred:combo': 'Combo DMG Reduction', 'dmgred:counter': 'Counter DMG Reduction', 'dmgred:crit': 'Crit DMG Reduction',
  'dmgred:fdr_adv': 'Adventurer Final Damage Reduction', 'dmgred:fdr_art': 'Artifact Final Damage Reduction',
  'dmgred:fdr_mnt': 'Mount Final Damage Reduction', 'dmgred:fdr_pet': 'Pet Final Damage Reduction',
  'dmgred:normal': 'Basic ATK DMG Reduction', 'dmgred:skill': 'Skill DMG Reduction',
  'fdr:general': 'General Final Damage Reduction',
  'rate:basiccrit': 'Basic ATK Crit Rate', 'rate:combo': 'Combo Rate', 'rate:counter': 'Counter Rate',
  'rate:icombo': 'Ignore Combo', 'rate:icounter': 'Ignore Counter',
  'rate:skillcrit': 'Skill Crit Rate', 'rate:weapcrit': 'Weapon Crit Rate',
};

// Quality-scaled base stats baked directly into specific weapons/armors/
// rings/accessories (confirmed against the datamine's `contributions`
// field) — separate from that same item's arcana bonuses. "fd" here
// means Final Damage specifically (distinct from "dmgbonus", the plain
// Bonus Damage bucket), matching the Final Damage category's own labels.
const EQUIP_CONTRIB_TO_LABEL = {
  'basiccrit::': 'Basic ATK Crit Rate', 'combo::': 'Combo Rate', 'counter::': 'Counter Rate',
  'daggercrit::': 'Dagger Crit Rate', 'dmgbonus::skill': 'Skill DMG',
  'fd::counter': 'Final Counter DMG', 'fd::dagger': 'Final Dagger DMG', 'fd::general': 'General Final Damage', 'fd:conditional:': 'General Final Damage',
  'fd::lightning': 'Final Lightning DMG', 'fd::normal': 'Final Normal ATK DMG', 'fd::swordqi': 'Final Sword Qi DMG',
  'fdr:basic:': 'Basic Attack Final Damage Reduction', 'fdr:conditional:': 'General Final Damage Reduction',
  'fdr:general:': 'General Final Damage Reduction', 'fdr:skill:': 'Skill Damage Final Damage Reduction',
  'icombo::': 'Ignore Combo', 'icounter::': 'Ignore Counter', 'icrit::': 'Ignore Crit',
  'skillcrit::': 'Skill Crit Rate', 'skilldmg::': 'Skill DMG', 'weapcrit::': 'Weapon Crit Rate',
};

// Specialization (General tab) track names → Calculator labels, for the
// clean/unconditional tracks only. PVP ATK%/DEF%/HP%/Damage Reduction are
// a genuinely new stat family not in the original ~80-label list — added
// as their own category since they're conceptually distinct from general
// combat stats, not folded into an existing one.
// Pet Skill attribute names mostly match a Calculator label directly, but
// a few don't: "Crit DMG" (offensive boost) is missing the "(Default to
// 200% as base)" suffix the category actually uses, "Global ATK%" needs
// the % dropped, and the fixed-tier skills' parenthetical names (e.g.
// "Fierce (Combo Rate)") need mapping to their underlying stat.
const PET_ATTR_TO_LABEL = {
  'Global ATK%': 'Global ATK',
  'Increased Damage Over Time': 'DoT DMG', 'Damage Over Time Reduction': 'DoT DMG Reduction',
  'Fierce (Combo Rate)': 'Combo Rate', 'Sturdy (Counter Rate)': 'Counter Rate',
  'Brutal (Crit Rate)': 'Crit Rate (Generic)', 'Agile (Ignore Combo Rate)': 'Ignore Combo',
  'Majestic (Ignore Counter Rate)': 'Ignore Counter', 'Resilience (Ignore Crit Rate)': 'Ignore Crit',
};

const SPEC_TRACK_TO_LABEL = {
  'ATK%': 'ATK%', 'HP%': 'HP%', 'DEF%': 'Global DEF%',
  'PVP Damage Reduction': 'PVP Damage Reduction', 'PVP Attack%': 'PVP ATK%',
  'PVP Defence%': 'PVP DEF%', 'PVP HP%': 'PVP HP%',
  'Final Adventurer Damage Reduction': 'Adventurer Final Damage Reduction',
  'Final Artifact Damage Reduction': 'Artifact Final Damage Reduction',
  'Crit DMG Reduction': 'Crit DMG Reduction',
};

// A handful of mount names in the spreadsheet don't exactly match the
// mount's real name in the app's own mount data — reconciled here rather
// than silently failing to match.
const SPEC_MOUNT_NAME_FIX = { 'Calamity': 'Catastrophe', 'Don Quixote': "Don Quixote Sugar" };

// Mounted DMG Reduction (East) track name → which mount it's conditional
// on. Only Main Mount counts as "ridden" — deployed support mounts don't
// grant these bonuses, since only one mount can actually be ridden.
const SPEC_MOUNT_TRACK_TO_MOUNT = {
  "Luminous Dragon's Blessing": 'Luminous Dragon', "Toffee's Blessing": 'Toffee',
  "Catastrophe's Blessing": 'Catastrophe', "Sphinx's Blessing": 'Sphinx', "Diego's Blessing": 'Diego',
  'Blessing of the Sea Hero': 'Sea Hero', 'Blessing of Capytti Veyron': 'Capytti Veyron',
  'Blessing of Overlord Deer': 'Overlord Deer', 'Blessing of Don Quixote': "Don Quixote Sugar",
  "Dragon Armor Beast's Blessing": 'Imperial Dragon-Armor Beast', 'Blessing of Flyer No. 1': 'Flyer No. 1',
  'Blessing of the Ash Progenitor Dragon': 'Ash Progenitor Dragon', "dapper Goose's Protection": 'Dapper Goose',
  "Rosy Cloud's Grace": 'Marshmallow Cloud', "Dreamy Bathtub's Protection": 'Dreamy Bathtub',
  'Frost Dragon Grace': 'Frost Dragon',
};
// Quality-tier conditional (not a specific mount name) — checked against
// the ridden mount's own tier instead of its name.
const SPEC_MOUNT_TRACK_TO_TIER = {
  'Beast Blessing': ['Rare', 'Epic'], // "Epic or Lower"
  "Beast King's Blessing": ['Legendary'],
};

function parseSpecEffectValue(text) {
  const m = text && text.match(/\+(\d+(?:\.\d+)?)%/);
  return m ? parseFloat(m[1]) : null;
}

// Round-tracking: a universal default window for when conditional (proc/
// trigger-based) effects are assumed active, since modeling each item's
// actual in-battle trigger condition and duration precisely isn't
// feasible without simulating combat itself. Per-item overrides exist
// for the rare case where a specific effect's real timing is known and
// worth being more precise about; everything else just follows the
// universal default.
const CONDITIONAL_ACTIVE_FROM_ROUND = 1;
const CONDITIONAL_ACTIVE_UNTIL_ROUND = 5;

// Generic primitive — takes already-resolved from/until values (or
// undefined, falling back to the universal window) rather than reading
// a specific field name off an item directly. This is what lets every
// item type (Relics, Mounts/Artifacts, Equipment, Collectibles) share
// one round-check, even though each type's own JSON schema uses
// different field names for its round-window override.
function isRoundInWindow(round, from, until) {
  if (round == null) return true; // non-round-specific view: always active (ceiling behavior)
  const resolvedFrom = from ?? CONDITIONAL_ACTIVE_FROM_ROUND;
  const resolvedUntil = until ?? CONDITIONAL_ACTIVE_UNTIL_ROUND;
  return round >= resolvedFrom && round <= resolvedUntil;
}

function aggregateFullStatsWithSources(round = null) {
  const stats = {}; // label -> { total, sources: [{name, val, groupKey}] }
  // groupKey is a stable identifier for "this exact source" across
  // different round calls, separate from the human-readable name — needed
  // because a stacking source's own display name changes per round (e.g.
  // "3 stacks" at round 3 vs "1 stack" at round 1), so matching the same
  // source across rounds by name text alone silently fails once the
  // stack count in the name itself differs. Defaults to sourceName for
  // every other call site, where the name is already round-stable.
  const add = (label, val, sourceName, groupKey) => {
    if (typeof val !== 'number' || Number.isNaN(val) || val === 0) return;
    if (!stats[label]) stats[label] = { total: 0, sources: [] };
    stats[label].total += val;
    stats[label].sources.push({ name: sourceName, val, groupKey: groupKey || sourceName });
  };

  add('Crit DMG', 200, 'Base');
  add('Speed', 5, 'Base');

// Relics — passive star_stats (Tenacity, Armor Break, ATK, etc.) apply
// just from being owned, matching every other Collection-tab item.
// flat_stats is different: that's the relic's own active, triggered
// proc effect (e.g. Skythunder Vajra Pestle's Final Lightning DMG
// bonus), which only actually fires in battle once the relic is
// deployed in one of the 4 slots — so that part alone needs the
// equipped check, not the relic's stats as a whole.
const equippedRelicNames = new Set(Object.values(state.relicSlots).filter(Boolean));
DB.relics.forEach(r => {
  if (!state.relicOwned[r.n]) return;
  const star = state.relicStars[r.n] || 0;
  Object.entries(r.star_stats || {}).forEach(([key, vals]) => {
    const val = vals[star];
    const label = RELIC_KEY_TO_LABEL[key];
    if (label && val) add(label, val, `${r.n} (${star}★)`);
  });
  
if (!equippedRelicNames.has(r.n)) return;
let flatStats = r.flat_stats_base;
let activeFrom = r.flat_stats_base_active_from;
let activeUntil = r.flat_stats_base_active_until;
let stackingStats = r.stacking_stats_base;
if (star >= 10) {
  flatStats = r.flat_stats;
  activeFrom = r.flat_stats_active_from;
  activeUntil = r.flat_stats_active_until;
  stackingStats = r.stacking_stats;
} else if (star >= 5) {
  flatStats = r.flat_stats_5star;
  activeFrom = r.flat_stats_5star_active_from;
  activeUntil = r.flat_stats_5star_active_until;
  stackingStats = r.stacking_stats_5star;
}
if (isRoundInWindow(round, activeFrom, activeUntil)) {
  Object.entries(flatStats || {}).forEach(([key, val]) => {
    const label = RELIC_KEY_TO_LABEL[key];
    if (label && val) add(label, val, `${r.n} (${star}★, effect)`);
  });
}
Object.entries(stackingStats || {}).forEach(([key, cfg]) => {
  const startsRound = cfg.starts_round ?? CONDITIONAL_ACTIVE_FROM_ROUND;
  if (round != null && round < startsRound) return;
  const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
  const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
  const val = cfg.per_stack * currentStacks;
  const label = RELIC_KEY_TO_LABEL[key];
  if (label && val) add(label, val, `${r.n} (${star}★, ${currentStacks} stack${currentStacks === 1 ? '' : 's'})`, `${r.n}:stacking:${key}`);
  });
  });

  // Collectibles
  DB.collectibles.forEach(c => {
    if (!state.collectibleOwned[c.n]) return;
    const star = Math.min(state.collectibleStars[c.n] || 0, 10);
    const val = c.star_vals[star];
    // No more is_percent-gated fallback to the raw stat_label here — it
    // never actually fired for any existing collectible (is_percent was
    // never populated on any of them), so removing it changes nothing
    // in practice. Inferring "is this a percent" from the label text
    // (isPercentLabel, used for the UI's "%" suffix) is NOT reused here:
    // roughly two dozen collectibles have an unmapped stat_key with a
    // percent-looking label (Daily Gem Bonus %, Battle Gold Gain %, and
    // similar economy/utility stats that were never meant to be tracked
    // combat categories at all) — applying that same inference here
    // would suddenly start counting all of them as bogus stats, a real
    // behavior change rather than the display-only fix this was meant
    // to be. So this stays a straightforward mapped-or-nothing lookup.
    const label = RELIC_KEY_TO_LABEL[c.stat_key];
    if (label && val) add(label, val, `${c.n} (${star}★)`);
    // A second, independent stat — currently only Immortal-rarity
    // collectibles carry this (e.g. Laurel Jade Rabbit), but the field
    // itself isn't rarity-gated in any way here: any collectible with
    // star_vals2 populated gets it applied, the same way the first stat
    // works. Mirrors the primary stat's own fields exactly (stat_key2/
    // stat_label2/star_vals2) rather than a nested object, so an item
    // with only one stat needs no structural change at all.
    if (c.star_vals2) {
      const val2 = c.star_vals2[star];
      const label2 = RELIC_KEY_TO_LABEL[c.stat_key2];
      if (label2 && val2) add(label2, val2, `${c.n} (${star}★)`);
    }
    // conditional_stats — same optional, separate-field pattern as
    // Relics' flat_stats and Mounts/Artifacts' conditional_stats. Nothing
    // populates this for any real Collectible yet.
    if (c.conditional_stats && isRoundInWindow(round, c.conditional_active_from, c.conditional_active_until)) {
      Object.entries(c.conditional_stats).forEach(([key, condVal]) => {
        const condLabel = RELIC_KEY_TO_LABEL[key];
        if (condLabel && condVal) add(condLabel, condVal, `${c.n} (effect)`);
      });
    }
  });

  // Mounts & Artifacts
  [['mounts', 'mountState', 'mountSlots'], ['artifacts', 'artifactState', 'artifactSlots']].forEach(([kind, bucketKey, slotsKey]) => {
    DB[kind].forEach(item => {
      if (item.n === 'None' || !item.star_up) return;
      const s = getMountOrArtifactState(bucketKey, item.idx);
      if (!s.owned) return;
      const block = sumBlockAtLevel(item, s.stars, s.awaken);
      Object.entries(block).forEach(([key, val]) => {
        const label = RELIC_KEY_TO_LABEL[key];
        if (label && val) add(label, val, `${item.n} (${s.stars}★/A${s.awaken})`);
      });

      // Every mechanism below this point derives from base_effect/
      // star_effects text specifically, which is the item's Main-slot
      // skill — it only actually applies while this exact item sits in
      // mountMainSlot/artifactMainSlot, a separate single slot from
      // sumBlockAtLevel() above (the item's own star_up/awaken numeric
      // growth, which every owned item contributes regardless of Main/
      // deployed status) and from the 3 deploy slots the awaken-tier
      // mechanisms further below require instead. An owned-but-neither-
      // Main-nor-deployed item contributes its own flat stats but none
      // of its skill text — confirmed directly: Don Quixote Sugar merely
      // owned (not Main) was incorrectly showing its decaying Ignore
      // Crit Rate/Crit DMG Reduction alongside Catastrophe, the actual
      // Main mount.
      const isMain = state[kind === 'mounts' ? 'mountMainSlot' : 'artifactMainSlot'].itemIdx === item.idx;
      if (isMain) {
      // flat_stats_star_tiers — same {min_X, stats} shape as the awaken
      // tiers below, but keyed to STAR level instead, and deliberately
      // NOT gated behind isDeployed. This represents base_effect/
      // star_effects text specifically (e.g. Transcendent mounts' "Ignore
      // Crit Rate +10%" scaling up every star level) — a Main-slot-
      // compatible passive, unlike the awaken skill tiers below, which
      // only ever fire once deployed into one of the 3 rotation slots.
      const pickStarTier = (tiers) => {
        if (!tiers || !tiers.length) return null;
        let picked = null;
        tiers.forEach(tier => {
          if (s.stars >= tier.min_star && (!picked || tier.min_star > picked.min_star)) picked = tier;
        });
        return picked;
      };
      const starTier = pickStarTier(item.flat_stats_star_tiers);
      if (starTier) {
        // "Active" rather than a star-level/tier label — this comes from
        // base_effect, which applies the moment the item is owned,
        // whether it's the Main slot or actually deployed. Distinct from
        // the awaken-tier version below, which genuinely does require
        // deployment into one of the 3 rotation slots.
        const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
        Object.entries(starTier.stats || {}).forEach(([key, val]) => {
          const label = RELIC_KEY_TO_LABEL[key];
          // Star level moves into groupKey (invisible, matching-only)
          // rather than the visible name — the description toggle in
          // buildFullCalcTable still needs the actual level to show the
          // right star_effects[level] text, it just no longer needs to
          // be printed on the row itself now that the label reads
          // "Active mount"/"Active artifact" instead.
          if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:${s.stars}★`);
        });
      }

      // decaying_stats — the inverse of stacking_stats: starts at a fixed
      // value on the turn it activates and gets WORSE by a fixed amount
      // every turn after that, floored at 0, expiring entirely once
      // duration is exceeded (e.g. Don Quixote Sugar's Ignore Crit Rate
      // starting at +20% and losing 4% per turn for 5 turns). Only
      // per_turn is required to be negative — stacking_stats' per_stack
      // building up from 0 can't represent "starts high, decays down."
      // Same Main-slot-compatible, non-deploy-gated treatment as
      // flat_stats_star_tiers above, since this also comes from
      // base_effect text. The ceiling (round === null) view shows the
      // starting value, since a decaying effect is strongest at the
      // moment it first activates, never afterward.
      Object.entries(item.decaying_stats || {}).forEach(([key, cfg]) => {
        const turnsElapsed = round == null ? 0 : round - 1;
        const expired = round != null && round > cfg.duration;
        const val = expired ? 0 : Math.max(0, cfg.start + cfg.per_turn * turnsElapsed);
        const label = RELIC_KEY_TO_LABEL[key];
        const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
        if (label && val) add(label, val, `${item.n} (${kindLabel})`);
      });

      // decaying_stats_star_tiers — same {min_star, stats} tier-picking
      // shape as flat_stats_star_tiers/stacking_stats_star_tiers, but
      // each tier holds a decaying config (start/per_turn/duration)
      // instead of a flat value or stacking config — for effects whose
      // decay itself scales at a star threshold (e.g. Don Quixote
      // Sugar's Ignore Crit Rate starting at +20%/-4% per turn normally,
      // but +30%/-6% per turn at 5★, same 5-turn duration either way).
      const pickDecayStarTier = (tiers) => {
        if (!tiers || !tiers.length) return null;
        let picked = null;
        tiers.forEach(tier => {
          if (s.stars >= tier.min_star && (!picked || tier.min_star > picked.min_star)) picked = tier;
        });
        return picked;
      };
      const decayStarTier = pickDecayStarTier(item.decaying_stats_star_tiers);
      if (decayStarTier) {
        Object.entries(decayStarTier.stats || {}).forEach(([key, cfg]) => {
          const turnsElapsed = round == null ? 0 : round - 1;
          const expired = round != null && round > cfg.duration;
          const val = expired ? 0 : Math.max(0, cfg.start + cfg.per_turn * turnsElapsed);
          const label = RELIC_KEY_TO_LABEL[key];
          const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
          if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:${s.stars}★`);
        });
      }

      // stacking_stats — same shape and math as Relics' own stacking_stats
      // (per_stack/max_stacks/starts_round, one stack per round from
      // starts_round onward), and like flat_stats_star_tiers/
      // decaying_stats above, NOT deploy-gated, since this represents
      // base_effect text (e.g. Diego's "+5% Combo Rate per turn, up to
      // 20%" — a flat, always-on stacking effect that works as a Main
      // mount too, unlike stacking_stats_awaken_tiers below, which
      // requires being deployed into one of the 3 rotation slots.
      Object.entries(item.stacking_stats || {}).forEach(([key, cfg]) => {
        const startsRound = cfg.starts_round ?? CONDITIONAL_ACTIVE_FROM_ROUND;
        if (round != null && round < startsRound) return;
        const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
        const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
        const val = cfg.per_stack * currentStacks;
        const label = RELIC_KEY_TO_LABEL[key];
        const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
        if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:stacking:${key}`);
      });

      // stacking_stats_star_tiers — same {min_star, stats} tier-picking
      // shape as flat_stats_star_tiers, but each tier holds a stacking
      // config (per_stack/max_stacks) instead of a flat value — for
      // effects whose PER-STACK VALUE itself changes at a star threshold
      // (e.g. King Kong's Counter DMG stacking staying capped at 10
      // stacks the whole time, but going from +10%/stack to +15%/stack
      // at 5★). Once the right tier is picked, the actual stack buildup
      // uses the same conservative "1 stack per round from round 1"
      // assumption as the plain stacking_stats above — the source text
      // triggers stacks on landing a counterattack, not on a fixed
      // per-round tick, but counterattack frequency depends on the
      // Protagonist's own build, not a property of the mount itself, so
      // this is the same approximation already used for Heaven's Mark.
      const pickStackStarTier = (tiers) => {
        if (!tiers || !tiers.length) return null;
        let picked = null;
        tiers.forEach(tier => {
          if (s.stars >= tier.min_star && (!picked || tier.min_star > picked.min_star)) picked = tier;
        });
        return picked;
      };
      const stackStarTier = pickStackStarTier(item.stacking_stats_star_tiers);
      if (stackStarTier) {
        Object.entries(stackStarTier.stats || {}).forEach(([key, cfg]) => {
          const startsRound = cfg.starts_round ?? CONDITIONAL_ACTIVE_FROM_ROUND;
          if (round != null && round < startsRound) return;
          const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
          const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
          const val = cfg.per_stack * currentStacks;
          const label = RELIC_KEY_TO_LABEL[key];
          const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
          // groupKey still keys on stacking:key for per-round matching
          // (the stack count itself changes per round), with the star
          // level appended so the description toggle can still resolve
          // the right star_effects[level] text — same reasoning as
          // flat_stats_star_tiers's groupKey above.
          if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:stacking:${key}:${s.stars}★`);
        });
      }

      // phased_stats_star_tiers — same {min_star, ...} tier-picking shape
      // as the others, but for effects that swap to a DIFFERENT set of
      // stats after a turn threshold, rather than scaling one stat up
      // (e.g. Flyer No. 1: Final DMG Reduction for turns 1-2, then Skill
      // Crit Rate/Crit DMG from turn 3 onward — 2 entirely different stat
      // categories, not one stat growing). phase_1_until_round marks the
      // last turn phase_1_stats applies; every round after that uses
      // phase_2_stats instead. The ceiling (round === null) view applies
      // BOTH phases at once — safe to do since they never touch the same
      // stat, so there's no double-counting risk, and each stat's own
      // peak value only ever occurs during its own phase anyway.
      const pickPhaseTier = (tiers) => {
        if (!tiers || !tiers.length) return null;
        let picked = null;
        tiers.forEach(tier => {
          if (s.stars >= tier.min_star && (!picked || tier.min_star > picked.min_star)) picked = tier;
        });
        return picked;
      };
      const phaseTier = pickPhaseTier(item.phased_stats_star_tiers);
      if (phaseTier) {
        const kindLabel = kind === 'mounts' ? 'Active mount' : 'Active artifact';
        const applyPhase = (statsBlock) => {
          Object.entries(statsBlock || {}).forEach(([key, val]) => {
            const label = RELIC_KEY_TO_LABEL[key];
            if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:${s.stars}★`);
          });
        };
        if (round == null) {
          applyPhase(phaseTier.phase_1_stats);
          applyPhase(phaseTier.phase_2_stats);
        } else if (round <= phaseTier.phase_1_until_round) {
          applyPhase(phaseTier.phase_1_stats);
        } else {
          applyPhase(phaseTier.phase_2_stats);
        }
      }
      } // end if (isMain)

      // flat_stats_awaken_tiers / stacking_stats_awaken_tiers — same idea
      // as Relics' flat_stats_base/5star/(10★), but shaped as a list of
      // {min_awaken, stats} thresholds instead of 3 fixed tier names.
      // Artifacts don't share Relics' clean 0/5/10★ breakpoints — their
      // awaken_effects upgrade at whichever levels the item's own skill
      // actually changes (A2/A4/A7/A10 is common but not universal), so
      // the tier list itself defines its own breakpoints per item rather
      // than assuming a fixed set. Picks the highest tier whose
      // min_awaken is at or below the current awaken level.
      //
      // Both fields represent the item's AWAKEN skill specifically — and
      // the awaken skill only ever fires while the item sits in one of
      // the 3 deploy slots, cycling round-robin (slot 0 fires on turn 1,
      // 4, 7...; slot 1 on turn 2, 5, 8...; slot 2 on turn 3, 6, 9...).
      // The separate Main slot never triggers this at all — an item kept
      // there only ever contributes its star_up/base_effect progression,
      // confirmed directly. So both tiers are skipped outright unless
      // this specific item is actually found in one of the 3 rotation
      // slots right now.
      const deploySlots = state[slotsKey] || [];
      const deploySlotIdx = deploySlots.findIndex(slot => slot && slot.itemIdx === item.idx);
      const isDeployed = deploySlotIdx !== -1;

      const pickAwakenTier = (tiers) => {
        if (!tiers || !tiers.length) return null;
        let picked = null;
        tiers.forEach(tier => {
          if (s.awaken >= tier.min_awaken && (!picked || tier.min_awaken > picked.min_awaken)) picked = tier;
        });
        return picked;
      };

      if (isDeployed) {
        const flatTier = pickAwakenTier(item.flat_stats_awaken_tiers);
        if (flatTier && isRoundInWindow(round, flatTier.active_from, flatTier.active_until)) {
          // "Deployed" rather than an awaken-level label — this only
          // ever applies once the item is actually in one of the 3
          // rotation slots, unlike the star-tier version above, which
          // applies from base_effect regardless of deployment. Awaken
          // level moves into groupKey (invisible) so the description
          // toggle can still show the correct awaken_effects text for
          // this exact level, same reasoning as the star-tier version.
          const kindLabel = kind === 'mounts' ? 'Deployed mount' : 'Deployed artifact';
          Object.entries(flatTier.stats || {}).forEach(([key, val]) => {
            const label = RELIC_KEY_TO_LABEL[key];
            if (label && val) add(label, val, `${item.n} (${kindLabel})`, `${item.n}:A${s.awaken}`);
          });
        }

        const stackTier = pickAwakenTier(item.stacking_stats_awaken_tiers);
        if (stackTier) {
          // The item's own turn is (deploySlotIdx + 1), then every 3rd
          // turn after that — this comes entirely from which of the 3
          // slots it's deployed in, not any per-item starts_round value,
          // since the real trigger cadence is a deployment mechanic, not
          // an intrinsic item property.
          const firstTurn = deploySlotIdx + 1;
          const stackKindLabel = kind === 'mounts' ? 'Deployed mount' : 'Deployed artifact';
          Object.entries(stackTier.stats || {}).forEach(([key, cfg]) => {
            if (round != null && round < firstTurn) return;
            const triggersElapsed = round == null ? cfg.max_stacks : Math.floor((round - firstTurn) / 3) + 1;
            const currentStacks = Math.max(0, Math.min(cfg.max_stacks, triggersElapsed));
            const val = cfg.per_stack * currentStacks;
            const label = RELIC_KEY_TO_LABEL[key];
            if (label && val) add(label, val, `${item.n} (${stackKindLabel})`, `${item.n}:stacking:${key}:A${s.awaken}`);
          });
        }

        // decaying_stats_awaken_tiers — same deploy-slot trigger cadence
        // as stacking_stats_awaken_tiers above (firstTurn = deploySlotIdx
        // + 1), but the cadence's own INTERVAL is per-tier rather than a
        // fixed "every 3rd turn", since some items' proc interval itself
        // changes at a later awaken level (e.g. Capytti Veyron's [ Rapid
        // Dash ] firing every 4 turns normally, every 3 turns from A7).
        // And rather than accumulating stacks, each trigger RESETS the
        // buff back to its start value, which then decays by per_turn
        // every turn until either duration is exceeded or the next
        // trigger resets it again — modeling a mount that (assuming it
        // doesn't die) perpetually remains on the field and keeps
        // re-triggering its proc, unlike a one-shot decaying_stats effect
        // that fires once and never returns. The ceiling (round === null)
        // view shows the reset/starting value, same reasoning as
        // decaying_stats — that's the peak this ever reaches.
        const decayAwakenTier = pickAwakenTier(item.decaying_stats_awaken_tiers);
        if (decayAwakenTier) {
          const firstTurn = deploySlotIdx + 1;
          const interval = decayAwakenTier.interval;
          const decayKindLabel = kind === 'mounts' ? 'Deployed mount' : 'Deployed artifact';
          Object.entries(decayAwakenTier.stats || {}).forEach(([key, cfg]) => {
            let val;
            if (round == null) {
              val = cfg.start;
            } else if (round < firstTurn) {
              val = 0;
            } else {
              const lastTrigger = firstTurn + interval * Math.floor((round - firstTurn) / interval);
              const turnsSinceTrigger = round - lastTrigger;
              val = turnsSinceTrigger < cfg.duration ? Math.max(0, cfg.start + cfg.per_turn * turnsSinceTrigger) : 0;
            }
            const label = RELIC_KEY_TO_LABEL[key];
            if (label && val) add(label, val, `${item.n} (${decayKindLabel})`, `${item.n}:A${s.awaken}`);
          });
        }

        // pulse_stats_awaken_tiers — same deploy-slot trigger cadence as
        // stacking_stats_awaken_tiers (firstTurn = deploySlotIdx + 1,
        // every 3rd turn BY DEFAULT), but for a buff that's temporary
        // rather than accumulating: active for exactly `duration` turns
        // starting on each trigger turn, then OFF again until the next
        // one (e.g. Imperial Dragon-Armor Beast's "5% Final DMG
        // Reduction for 2 turns" pulsing alongside its own every-3rd-
        // turn Photon Annihilation cast). cfg.interval is an optional
        // per-stat override for effects that only trigger every Nth
        // release of the item's own proc rather than every release (e.g.
        // Pan Gu Axe's A10 "every 2 releases" global DMG bonus firing
        // every 6 turns, alongside its base "every release" DMG to
        // Shields bonus still firing every 3 turns in the same tier) —
        // defaults to 3 when omitted, matching every prior use of this
        // mechanism. cfg.one_time is a separate override for a
        // genuinely single-fire trigger (e.g. Crimson Glow Drake's
        // [ Glowflame ] buff, which fires once "after the enemy lands
        // their first Crit" — not a recurring, deploy-slot-staggered
        // cadence at all): when set, the pulse always starts at round 1
        // (regardless of deploy slot) and never recurs afterward, per
        // this session's established "assume it happens on round 1"
        // convention for one-time, hard-to-predict procs. The ceiling
        // (round === null) view shows the flat value either way, since
        // that's the peak this ever reaches — it never stacks.
        const pulseTier = pickAwakenTier(item.pulse_stats_awaken_tiers);
        if (pulseTier) {
          const firstTurn = deploySlotIdx + 1;
          const pulseKindLabel = kind === 'mounts' ? 'Deployed mount' : 'Deployed artifact';
          Object.entries(pulseTier.stats || {}).forEach(([key, cfg]) => {
            let active;
            if (round == null) {
              active = true;
            } else if (cfg.one_time) {
              active = round >= 1 && round < 1 + cfg.duration;
            } else {
              const interval = cfg.interval ?? 3;
              if (round < firstTurn) {
                active = false;
              } else {
                const turnsSinceTrigger = (round - firstTurn) % interval;
                active = turnsSinceTrigger < cfg.duration;
              }
            }
            const val = active ? cfg.val : 0;
            const label = RELIC_KEY_TO_LABEL[key];
            if (label && val) add(label, val, `${item.n} (${pulseKindLabel})`, `${item.n}:A${s.awaken}`);
          });
        }

        // paired_stats_awaken_tiers — for effects that only activate when
        // a SPECIFIC other named item is also deployed at the same time
        // (e.g. Imperial Dragon-Armor Beast's awaken text explicitly
        // referencing being deployed alongside Holy Sword, and vice
        // versa). requires_paired_name is looked up across both Mounts
        // and Artifacts, since the pair can span either kind — deployed
        // status is checked against both state.mountSlots and
        // state.artifactSlots rather than assuming which kind the named
        // partner belongs to. Uses the same {min_awaken, stats} tier-
        // picking shape as the other awaken-tier mechanisms.
        const pairedTier = pickAwakenTier(item.paired_stats_awaken_tiers);
        if (pairedTier) {
          const partnerName = pairedTier.requires_paired_name;
          const partner = DB.mounts.find(m => m.n === partnerName) || DB.artifacts.find(a => a.n === partnerName);
          const partnerDeployed = partner && (
            (state.mountSlots || []).some(slot => slot && slot.itemIdx === partner.idx) ||
            (state.artifactSlots || []).some(slot => slot && slot.itemIdx === partner.idx)
          );
          if (partnerDeployed) {
            Object.entries(pairedTier.stats || {}).forEach(([key, val]) => {
              const label = RELIC_KEY_TO_LABEL[key];
              if (label && val) add(label, val, `${item.n} (A${s.awaken}, paired with ${partnerName})`);
            });
          }
        }
      }
    });
  });



  // Equipment Arcana — cumulative (selecting A4 activates A0-A4 together),
  // using only the "trackable" totals (excludes entries the source data
  // itself marks "(not tracked)", usually weapon-specific ATK bonuses).
  // Reads exclusively from DB.arcanas now (via getArcanaEntry, matched by
  // item name) rather than an embedded arcana_descs field on the item
  // itself — that embedded copy no longer exists once migrated out. The
  // effective arcana level is matched from the Collection tab's name-
  // keyed record; an item with no Collection entry at all contributes
  // nothing, since Arcana is no longer settable any other way.
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.itemName) return;
    const effectiveArcana = state.arcana ? state.arcana[s.itemName] : null;
    if (effectiveArcana == null || effectiveArcana < 0) return;
    const arcanaEntry = getArcanaEntry(s.itemName);
    const descs = arcanaEntry && arcanaEntry.arcana_descs;
    if (!descs || !descs.length) return;
    const { trackable } = computeArcanaTotals(descs, effectiveArcana);
    Object.entries(trackable).forEach(([name, val]) => {
      const label = ARCANA_NAME_TO_LABEL[name] || name;
      add(label, val, `${slotDef.label} arcana`);
    });

    // stacking_stats — a genuinely new-since-arcanas.json mechanism for
    // arcana entries whose top milestone describes a per-hit/per-trigger
    // stack rather than a flat unlock (e.g. Whisperer's dagger crit
    // rate/damage per hit, up to 10 stacks). Uses the same conservative
    // "1 stack per round from round 1" approximation as every other
    // combat-event-triggered stacking mechanism this session, since the
    // real trigger frequency depends on the Protagonist's own build, not
    // a fixed cadence.
    if (arcanaEntry && arcanaEntry.stacking_stats && effectiveArcana >= arcanaEntry.stacking_stats.min_arcana) {
      const startsRound = CONDITIONAL_ACTIVE_FROM_ROUND;
      Object.entries(arcanaEntry.stacking_stats.stats).forEach(([key, cfg]) => {
        if (round != null && round < startsRound) return;
        const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
        const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
        const val = cfg.per_stack * currentStacks;
        const label = RELIC_KEY_TO_LABEL[key];
        if (label && val) add(label, val, `${slotDef.label} arcana (A${effectiveArcana})`);
      });
    }

    // flat_stats — a flat, always-on bonus once the milestone is met, for
    // arcana effects that are simpler than a stacking build-up (e.g.
    // Piggy's own pet-side flat bonus uses the same shape below).
    if (arcanaEntry && arcanaEntry.flat_stats && effectiveArcana >= arcanaEntry.flat_stats.min_arcana) {
      Object.entries(arcanaEntry.flat_stats.stats).forEach(([key, val]) => {
        const label = RELIC_KEY_TO_LABEL[key];
        if (label && val) add(label, val, `${slotDef.label} arcana (A${effectiveArcana})`);
      });
    }
  });

  // Equipment quality-scaled base contributions — bonuses baked directly
  // into specific items, on top of (not instead of) their arcana text.
  // Two additive pieces: qualD[qualityIndex] + surpassBonus × Surpass
  // (existing), plus arcanaD — a second array indexed by arcana milestone
  // band, not a 1:1 arcana level. Confirmed against the datamine's own
  // notes for Winter Ice Soul Guard ("Mythic passive: +10% FDR. 4★: +6%
  // Ignore Crit. 10★: +10% FDR cumulative, +10% FD") and its own
  // arcana_descs text: the array's 4 slots map to bands [A0-3, A4-6,
  // A7-9, A10], since some contributions kick in at A4 and stay constant
  // through A10 (Ignore Crit) while others only appear at A10 exactly
  // (FDR/FD) — a single flat index wouldn't reproduce both patterns.
  // Equipment Surpass — a clean, dedicated structure separate from the
  // older, buried quality_contributions.surpassBonus field (which only
  // ever got populated for 4 items). surpass_stats lives directly on the
  // equipment item itself (in equipment.json, not arcanas.json), as
  // EITHER a flat {statKey: [valueAt+0, valueAt+1, ...]} map (when the
  // values are the same regardless of the item's own quality — most
  // items) OR, for the handful of SS-grade items whose Surpass bonus
  // itself differs between Legendary and Mythic, a nested
  // {statKey: {quality: [valueAt+0, valueAt+1, ...]}} map instead. Which
  // shape a given stat uses is detected per-key (an array vs. a plain
  // object) by the shared resolveSurpassLevels() helper (defined near
  // the other equipment-card helpers), so one item can freely mix both,
  // and both this Calculator block and the Equipment card's helper
  // caption stay in sync automatically — a stat that doesn't vary by
  // quality doesn't need to be needlessly duplicated under both tiers.
  // Either way, the array holds the EXPLICIT total value at each Surpass
  // level, not a per-level delta to multiply, so this is transcribed
  // directly from source data without computing anything first, and
  // doesn't assume a linear progression.
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.itemName || !s.surpass) return;
    const item = (DB[slotDef.dataKey] || []).find(it => it.n === s.itemName);
    if (!item || !item.surpass_stats) return;
    // Clamped against the current quality's own effective max, not just
    // the item's raw surpass_max — protects against a stale saved state
    // (a Legendary item stored at +4 from before this rule existed)
    // still counting a level that quality no longer allows.
    const effectiveSurpass = Math.min(s.surpass, getEffectiveSurpassMax(item, s.quality));
    Object.entries(item.surpass_stats).forEach(([key, statValue]) => {
      const levels = resolveSurpassLevels(statValue, s.quality);
      if (!levels) return;
      const label = RELIC_KEY_TO_LABEL[key];
      const idx = Math.min(effectiveSurpass, levels.length - 1);
      const val = levels[idx];
      if (label && val) add(label, val, `${item.n} (${s.quality}, +${effectiveSurpass} Surpass)`);
    });
  });

  // Equipment surpass_skills — unlike surpass_stats above (a numeric
  // per-level array keyed by RELIC_KEY_TO_LABEL), these three fields are
  // a hand-picked numeric encoding of specific tier-11 ("Surpass"/
  // "Mythic") surpass_skills text entries: the ones that are either a
  // flat, unconditional % bonus, or a clean stacking/conversion
  // mechanic with an explicit cap stated in the source text. The large
  // majority of surpass_skills entries are proc-based (chance to
  // trigger), tied to a specific named skill/summon rather than a
  // general tracked stat, a non-percentage effect (shield grants, HP
  // recovery amounts, status effects), or "stackable" with no stated
  // cap — those are deliberately left as descriptive-only text on the
  // Equipment card, same as the rest of the regular (non-surpass)
  // skills tiers, rather than guessing a number that isn't in the data.
  // Gated on quality === 'Mythic' alone: every item's own rarity_tiers
  // table places tier 11 ("Surpass" or "Mythic", depending on the
  // item's grade) at quality 6 = Mythic, regardless of grade, so the
  // surpass_skill content itself is on/off at Mythic quality — the
  // separate `s.surpass` +N counter only scales surpass_stats' own
  // per-level numeric array above, not whether these fire at all.
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.itemName || s.quality !== 'Mythic') return;
    const item = (DB[slotDef.dataKey] || []).find(it => it.n === s.itemName);
    if (!item) return;
    Object.entries(item.surpass_flat_stats || {}).forEach(([label, val]) => {
      if (val) add(label, val, `${item.n} (Mythic Surpass)`);
    });
    Object.entries(item.surpass_stacking_stats || {}).forEach(([label, cfg]) => {
      const startsRound = cfg.starts_round ?? CONDITIONAL_ACTIVE_FROM_ROUND;
      if (round != null && round < startsRound) return;
      const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
      const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
      const val = cfg.per_stack * currentStacks;
      if (val) add(label, val, `${item.n} (Mythic Surpass, ${currentStacks} stack${currentStacks === 1 ? '' : 's'})`, `${item.n}:surpass_stacking:${label}`);
    });
  });

  const arcanaBandIndex = (arcana) => {
    if (arcana >= 10) return 3;
    if (arcana >= 7) return 2;
    if (arcana >= 4) return 1;
    return 0;
  };
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.itemName) return;
    const effectiveArcana = state.arcana ? state.arcana[s.itemName] : null;
    const item = (DB[slotDef.dataKey] || []).find(it => it.n === s.itemName);
    const arcanaEntry = getArcanaEntry(s.itemName);
    if (!item || !arcanaEntry || !arcanaEntry.quality_contributions) return;
    const qualIdx = (item.q || []).indexOf(s.quality);
    arcanaEntry.quality_contributions.forEach(c => {
      const qualPart = c.qualD && qualIdx !== -1 ? (c.qualD[qualIdx] || 0) : 0;
      const surpassPart = c.qualD && qualIdx !== -1 ? (c.surpassBonus || 0) * (s.surpass || 0) : 0;
      const arcanaPart = c.arcanaD && effectiveArcana != null && effectiveArcana >= 0 ? (c.arcanaD[arcanaBandIndex(effectiveArcana)] || 0) : 0;
      // A simple threshold unlock — "once arcana reaches arcanaFlatAt, add
      // arcanaFlat" — not round-dependent like qualV5, so safe to include
      // unconditionally once the arcana level is actually met.
      const arcanaFlatPart = (c.arcanaFlat != null && effectiveArcana != null && effectiveArcana >= c.arcanaFlatAt) ? c.arcanaFlat : 0;
      if (!c.qualD && !c.arcanaD && c.arcanaFlat == null) return;
      // Round-gating only applies to a contribution that explicitly opts
      // in via active_from/active_until — otherwise every existing,
      // genuinely passive quality/surpass/arcana bonus stays exactly as
      // it is now (always on), rather than silently becoming implicitly
      // round-limited just because the capability exists.
      const isConditional = c.active_from != null || c.active_until != null;
      if (isConditional && !isRoundInWindow(round, c.active_from, c.active_until)) return;
      const total = (qualPart + surpassPart + arcanaPart + arcanaFlatPart) * 100;
      const key = `${c.calc}:${c.cond || ''}:${c.ty || ''}`;
      const label = EQUIP_CONTRIB_TO_LABEL[key];
      if (label && total) {
        const qualifiers = [s.quality, s.surpass ? `+${s.surpass}` : null, effectiveArcana >= 0 ? `A${effectiveArcana}` : null].filter(Boolean).join(', ');
        add(label, total, `${item.n} (${qualifiers})`);
      }
    });
  });

// Equipment Psionics — most stat names already match this table's labels
// directly; PSIONIC_NAME_TO_LABEL covers the ones that don't.
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.psionics) return;
    const psiOptions = DB.psionics[slotDef.psiKey] || [];
    s.psionics.forEach(slot => {
      if (!slot.stat || !slot.val) return;
      const meta = psiOptions.find(o => o.c === slot.stat);
      if (meta) add(PSIONIC_NAME_TO_LABEL[meta.n] || meta.n, slot.val, `${slotDef.label} psionic`);
    });
  });

  // Equipment Gems — numeric value from meta.t where tracked, otherwise
  // extracted directly from the tier_desc text (covers the majority of
  // gems, which only ever had a text description, not a numeric array —
  // those were previously silently skipped entirely here). Label comes
  // from GEM_NAME_TO_LABEL, not the raw gem name, since gem names carry
  // their own baked-in number and never matched a category directly.
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.gems) return;
    const gemOptions = DB.gems[slotDef.gemKey] || [];
    s.gems.forEach(slot => {
      if (!slot.gemId) return;
      const meta = gemOptions.find(o => o.id === slot.gemId);
      if (!meta) return;
      const label = GEM_NAME_TO_LABEL[gemNameBase(meta.n)];
      if (!label) return;
      const val = extractGemScalingValue(meta, slot.tier);
      if (val != null) add(label, val, `${slotDef.label} gem`);
    });
  });

  // Pet Skills — mostly matches labels directly; PET_ATTR_TO_LABEL covers the ones that don't.
  state.petSlots.forEach((p, pi) => {
    if (!p.itemName) return;
    p.skills.forEach(sl => {
      if (!sl.stat || !sl.val) return;
      add(PET_ATTR_TO_LABEL[sl.stat] || sl.stat, sl.val, `Pet ${pi + 1}: ${p.itemName}`);
    });

    // Pet Arcana — previously purely decorative (write-up text only);
    // now feeds real stats for the handful of pets whose arcana entry
    // has stacking_stats/flat_stats built out (Elsa, Piggy). Matched the
    // same way as equipment arcana: by name via getArcanaEntry() against
    // the Collection tab's record, not any per-slot field.
    const effectiveArcana = state.arcana ? state.arcana[p.itemName] : null;
    if (effectiveArcana != null && effectiveArcana >= 0) {
      const arcanaEntry = getArcanaEntry(p.itemName);
      if (arcanaEntry && arcanaEntry.stacking_stats && effectiveArcana >= arcanaEntry.stacking_stats.min_arcana) {
        const startsRound = CONDITIONAL_ACTIVE_FROM_ROUND;
        Object.entries(arcanaEntry.stacking_stats.stats).forEach(([key, cfg]) => {
          if (round != null && round < startsRound) return;
          const stacksElapsed = round == null ? cfg.max_stacks : (round - startsRound + 1);
          const currentStacks = Math.max(0, Math.min(cfg.max_stacks, stacksElapsed));
          const val = cfg.per_stack * currentStacks;
          const label = RELIC_KEY_TO_LABEL[key];
          if (label && val) add(label, val, `Pet ${pi + 1}: ${p.itemName} arcana (A${effectiveArcana})`);
        });
      }
      if (arcanaEntry && arcanaEntry.flat_stats && effectiveArcana >= arcanaEntry.flat_stats.min_arcana) {
        Object.entries(arcanaEntry.flat_stats.stats).forEach(([key, val]) => {
          const label = RELIC_KEY_TO_LABEL[key];
          if (label && val) add(label, val, `Pet ${pi + 1}: ${p.itemName} arcana (A${effectiveArcana})`);
        });
      }
    }
  });

  // Adventurer stat buffs (ATK/HP only — the only structured numeric part)
  const adv = state.adventurerSlot;
  if (adv && adv.name) {
    const advData = (DB.adventurers || []).find(a => a.n === adv.name);
    if (advData) {
      const { statTotals } = computeAdventurerDisplay(advData.tier_effects, adv.stars);
      Object.entries(statTotals).forEach(([stat, val]) => add(`${stat}%`, val, `Adventurer: ${adv.name}`));
    }
  }

  // Fashion Level
  if (state.fashionLevel > 0) {
    const levels = DB.fashion_levels || [];
    let totalFd = 0, totalFdr = 0;
    const statTotals = {};
    for (let i = 1; i <= state.fashionLevel; i++) {
      const lv = levels[i];
      if (!lv) continue;
      totalFd += lv.fd || 0;
      totalFdr += lv.fdr || 0;
      Object.entries(parseFashionNoteStats(lv.note)).forEach(([stat, val]) => { statTotals[stat] = (statTotals[stat] || 0) + val; });
    }
    if (totalFd) add('General Final Damage', Math.round(totalFd * 10000) / 100, `Fashion Level ${state.fashionLevel}`);
    if (totalFdr) add('General Final Damage Reduction', Math.round(totalFdr * 10000) / 100, `Fashion Level ${state.fashionLevel}`);
    Object.entries(statTotals).forEach(([stat, val]) => add(`${stat}%`, val, `Fashion Level ${state.fashionLevel}`));
  }

  // Capymon Cards
  {
    const { breakdown } = computeCapymonStats();
    breakdown.forEach(({ name, fd, fdr }) => {
      if (fd) add('General Final Damage', Math.round(fd * 10000) / 100, `Capymon: ${name}`);
      if (fdr) add('General Final Damage Reduction', Math.round(fdr * 10000) / 100, `Capymon: ${name}`);
    });
  }

  // Homestead
  (DB.homestead_buildings || []).forEach(b => {
    const lv = state.homestead[b.id];
    if (!lv) return;
    const val = b.values[lv - 1];
    if (val == null) return;
    const pct = Math.round(val * 10000) / 100;
    const label = RELIC_KEY_TO_LABEL[b.calc] || (b.label === 'Final DMG Boost' ? 'General Final Damage' : b.label === 'Final DMG Red' ? 'General Final Damage Reduction' : b.label);
    add(label, pct, `${b.name} (Lv.${lv})`);
  });

  // Hero/Brand Polarization — only Mythic quality actually rolls
  // polarization, matching the same gate the Equipment card UI uses.
  [['heroSlots', DB.heroes], ['brandSlots', DB.brands]].forEach(([slotsKey, pool]) => {
    (state[slotsKey] || []).forEach((s, i) => {
      if (!s.name || s.quality !== 'Mythic' || !s.polarization) return;
      const entity = (pool || []).find(e => e.n === s.name);
      const text = entity && entity.polarization_effects && entity.polarization_effects[`P${s.polarization}`];
      const parsed = parsePolarizationValue(text);
      if (parsed) add(POLARIZATION_NAME_TO_LABEL[parsed.name] || parsed.name, parsed.val, `${s.name} (P${s.polarization})`);
    });
  });

  // Hero/Brand quality-tier bonuses — mostly free-form prose describing
  // conditional mechanics ("every 3 stacks...", "after each hit...") with
  // no reliable way to parse the condition itself, so this only extracts
  // the subset that's genuinely unconditional: a quality_effects entry is
  // often several period-separated sentences, and only sentences that are
  // ENTIRELY just "{Stat Name} +{Value}%" (nothing else in that sentence)
  // get pulled — e.g. "Lightning Crit Rate +15%. After each lightning
  // strike..." extracts the first sentence and correctly leaves the
  // conditional second one alone. A sentence with any extra words besides
  // the stat name and percentage is skipped entirely rather than guessed at.
  [['heroSlots', DB.heroes], ['brandSlots', DB.brands]].forEach(([slotsKey, pool]) => {
    (state[slotsKey] || []).forEach(s => {
      if (!s.name || !s.quality) return;
      const entity = (pool || []).find(e => e.n === s.name);
      const text = entity && entity.quality_effects && entity.quality_effects[s.quality];
      if (!text) return;
      text.split('. ').forEach(sentence => {
        const clean = sentence.trim().replace(/\.$/, '');
        const m = clean.match(/^([A-Za-z][A-Za-z %]*?) \+(\d+(?:\.\d+)?)%$/);
        if (!m) return;
        const [, rawName, valStr] = m;
        const label = HERO_BRAND_QUALITY_STAT_TO_LABEL[rawName] || rawName;
        add(label, parseFloat(valStr), `${s.name} (${s.quality})`);
      });
    });
  });

  // Inheritance Tree — only the Active Tree counts, matching "deployed in
  // battle" (viewing/editing other trees doesn't apply their bonuses).
  // Node values from INHERIT_NODE_CALC, confirmed against the datamine —
  // most left-column stat nodes and hero-unlock slots have no calc bucket
  // at all (flat HP/ATK/DEF or display-only), so plenty of invested points
  // still won't show up here, which matches the source data, not a gap.
  {
    const treeKey = state.inheritance.activeTree;
    const progress = state.inheritance.progress[treeKey] || {};
    Object.entries(progress).forEach(([nodeId, points]) => {
      if (!points) return;
      const entries = DB.inherit_node_calc[`${treeKey}_${nodeId}`];
      if (!entries) return;
      entries.forEach(entry => {
        const val = entry.vals[Math.min(points, entry.vals.length) - 1];
        const label = INHERIT_CALC_TO_LABEL[`${entry.calc}:${entry.ty}`];
        if (label && val != null) add(label, val * 100, `${INHERIT_TREE_NAMES[treeKey]} Tree (${nodeId})`);
      });
    });
  }

  // Specialization (General tab) — clean, unconditional tracks map
  // directly via SPEC_TRACK_TO_LABEL. Mounted DMG Reduction (East) tracks
  // are conditional on which mount is actually ridden — only Main Mount
  // counts, and only ONE mount's bonus applies even if multiple
  // mount-specific tracks are maxed, since only one mount can be ridden
  // at a time. Quality-tier tracks (Epic/Legendary) check the ridden
  // mount's own tier instead of its name. Anything else (pet-specific,
  // weapon-specific conditional bonuses in South/West) isn't wired up
  // yet — those follow the same pattern but weren't part of this pass.
  //
  // "Ridden" here specifically means deployed mount slot 1 (mountSlots[0])
  // — confirmed this is what the mounted-DMG-reduction mechanic actually
  // keys off, not mountMainSlot (a separate, single "active" mount concept
  // used elsewhere for star-skill display, distinct from the 3 deployed
  // slots).
  const riddenMountIdx = state.mountSlots && state.mountSlots[0] && state.mountSlots[0].itemIdx;
  const riddenMount = riddenMountIdx != null ? (DB.mounts || []).find(m => m.idx === riddenMountIdx) : null;

  (DB.General || []).forEach(group => {
    group.tracks.forEach(track => {
      const level = getSpecTrackLevel('General', group.group, track.name);
      if (!level) return;
      const text = track.levels[level - 1];
      const val = parseSpecEffectValue(text);
      if (val == null) return;
      const sourceName = `${group.group}: ${track.name} (Lv${level})`;

      if (SPEC_TRACK_TO_LABEL[text.replace(/\s*\+\d+(\.\d+)?%$/, '')]) {
        add(SPEC_TRACK_TO_LABEL[text.replace(/\s*\+\d+(\.\d+)?%$/, '')], val, sourceName);
      } else if (track.name === "Knight's Wall") {
        if (riddenMount) add('Mounted DMG Reduction', val, sourceName); // generic "while Mounted" still only fires with a mount actually ridden
      } else if (SPEC_MOUNT_TRACK_TO_MOUNT[track.name]) {
        const targetName = SPEC_MOUNT_TRACK_TO_MOUNT[track.name];
        if (riddenMount && riddenMount.n === targetName) add('Mounted DMG Reduction', val, sourceName);
      } else if (SPEC_MOUNT_TRACK_TO_TIER[track.name]) {
        if (riddenMount && SPEC_MOUNT_TRACK_TO_TIER[track.name].includes(riddenMount.tier)) {
          add('Mounted DMG Reduction', val, sourceName);
        }
      }
    });
  });

  // Specialization (Adventure tab) — Speed Enhancement specifically. Its
  // level text is a flat number ("Speed 5"), not a "+N%" percentage like
  // everything else on this page, confirmed by the user: level N = +N
  // Speed exactly. Everything else in the Adventure tab still isn't
  // wired up, since those level texts remain unresolved placeholders.
  (DB.Adventure || []).forEach(group => {
    group.tracks.forEach(track => {
      if (track.name !== 'Speed Enhancement') return;
      const level = getSpecTrackLevel('Adventure', group.group, track.name);
      if (!level) return;
      const text = track.levels[level - 1];
      const m = text && text.match(/(\d+)\s*$/);
      if (!m) return;
      add('Speed', parseFloat(m[1]), `${group.group}: Speed Enhancement (Lv${level})`);
    });
  });

  // Relic Sets & Collectible Sets — same "lowest star among owned members"
  // rule the set panel UI already uses, just reused here instead of
  // reimplemented, so this can never drift out of sync with what the
  // panel actually displays.
  Object.values(DB.relic_sets).flat().forEach(set => {
  if (set.tracked === false) return; // game hasn't named the missing relic yet
  const members = set.items.map(name => DB.relics.find(r => r.n === name)).filter(Boolean);
  if (members.length !== set.items.length) return; // at least one member is unreleased
    // Every member must actually be owned, not just default to a 0★
    // fallback — both RELIC_TIER_STARS and COLLECTIBLE_TIER_STARS start
    // at 0, so an unowned member (whose star value is undefined) and an
    // owned-but-0★ member were indistinguishable here before this check,
    // both incorrectly satisfying the lowest tier's threshold and
    // granting the set bonus even when nothing was actually owned.
    if (!members.every(r => state.relicOwned[r.n])) return;
    const minStar = Math.min(...members.map(r => state.relicStars[r.n] || 0));
    let tierIdx = 0;
    for (let i = RELIC_TIER_STARS.length - 1; i >= 0; i--) {
      if (minStar >= RELIC_TIER_STARS[i]) { tierIdx = i; break; }
    }
    const val = set.vals[tierIdx];
    const label = SET_STAT_TO_LABEL[set.stat] || set.stat;
    if (val != null) add(label, val, `${set.set} (Set Bonus)`);
  });

  Object.values(DB.collectible_sets).flat().forEach(set => {
  if (set.tracked === false) return; // game hasn't named the missing item yet
  const members = set.items.map(name => DB.collectibles.find(c => c.n === name)).filter(Boolean);
  if (members.length !== set.items.length) return; // at least one member is unreleased
    // Same ownership guard as Relic Sets above — see that comment.
    if (!members.every(c => state.collectibleOwned[c.n])) return;
    const minStar = Math.min(...members.map(c => state.collectibleStars[c.n] || 0));
    let tierIdx = 0;
    for (let i = COLLECTIBLE_TIER_STARS.length - 1; i >= 0; i--) {
      if (minStar >= COLLECTIBLE_TIER_STARS[i]) { tierIdx = i; break; }
    }
    const val = set.vals[tierIdx];
    const label = SET_STAT_TO_LABEL[set.stat] || set.stat;
    if (val != null) add(label, val, `${set.set} (Set Bonus)`);
  });

  // Arcana conversion_stats — a genuinely new mechanism (e.g. Dragon Ball
  // Ring/Judgement Ring: "every 1% Basic ATK Crit Rate grants 0.4%
  // Global Basic ATK DMG, capped at 40%"). Must run as a final pass
  // AFTER every other contribution, since it derives its value from
  // another stat's own already-fully-aggregated total — computing it
  // any earlier would silently miss whatever added to the source stat
  // afterward. Only applies while the linked item is actually equipped
  // in some slot (checked directly, not just "has an arcana record"),
  // and only once the Collection-set arcana level meets the entry's own
  // min_arcana threshold.
  (DB.arcanas || []).forEach(entry => {
    if (!entry.conversion_stats) return;
    const effectiveArcana = state.arcana ? state.arcana[entry.linked_item] : null;
    if (effectiveArcana == null || effectiveArcana < entry.conversion_stats.min_arcana) return;
    const isEquipped = Object.values(state.equipment || {}).some(s => s && s.itemName === entry.linked_item);
    if (!isEquipped) return;
    const { source, target, ratio, cap } = entry.conversion_stats;
    const sourceLabel = RELIC_KEY_TO_LABEL[source];
    const targetLabel = RELIC_KEY_TO_LABEL[target];
    if (!sourceLabel || !targetLabel) return;
    const sourceVal = stats[sourceLabel] ? stats[sourceLabel].total : 0;
    const converted = Math.min(sourceVal * ratio, cap);
    if (converted > 0) add(targetLabel, converted, `${entry.linked_item} arcana (A${effectiveArcana}, converted)`);
  });

  // Equipment surpass_conversion — same "derive from another stat's
  // already-aggregated total" shape as arcana's conversion_stats just
  // above, so this also has to run as this final pass, after every
  // other equipment/relic/collectible/psionic/gem contribution earlier
  // in this function. Independent of (and stacks with) that item's own
  // arcana-side conversion_stats, where one exists — these are two
  // separate in-game mechanics that happen to share the same 4 rings
  // (Salama Dragon Pearl Ring, Verdan Ring of Judgement, Dragon Ball
  // Ring, Judgement Ring), not a duplicate of it: the arcana-side one
  // converts crit rate into flat ATK/Skill DMG at min_arcana 10, this
  // one converts the same crit rate into Crit DMG once the item itself
  // reaches Mythic quality (see surpass_flat_stats/surpass_stacking_stats
  // above for why quality is the right gate for surpass_skills content).
  EQUIPMENT_SLOTS.forEach(slotDef => {
    const s = state.equipment[slotDef.id];
    if (!s || !s.itemName || s.quality !== 'Mythic') return;
    const item = (DB[slotDef.dataKey] || []).find(it => it.n === s.itemName);
    if (!item || !item.surpass_conversion) return;
    const { source, target, ratio, cap } = item.surpass_conversion;
    const sourceVal = stats[source] ? stats[source].total : 0;
    const converted = cap != null ? Math.min(sourceVal * ratio, cap) : sourceVal * ratio;
    if (converted > 0) add(target, converted, `${item.n} (Mythic Surpass, converted)`);
  });

  return stats;
}

const CALC_TABLE_CATEGORIES = [
  // Per damage_formula.md: Global ATK and the PVP ATK/DEF/HP% stats feed the
  // ATK/DEF/HP buildup stage ("ATK = (flat ATK + ...) x (1 + ATK% + ...) x
  // (1 + Global ATK)"), which runs BEFORE the hit-damage chain even starts —
  // they were previously grouped into Bonus Damage, which is the DMG pool
  // stage further down the chain. Pulled out into their own category so the
  // grouping matches which multiplicative stage they actually belong to.
  { title: 'Attribute Boosts (ATK/DEF/HP)', labels: ['Global ATK', 'PVP ATK%', 'PVP DEF%', 'PVP HP%'] },
  // Per damage_formula.md's "Crit" section: Crit Rate and Crit DMG (plus
  // their per-type variants and the enemy's Crit DMG Reduction) are all one
  // multiplicative stage — "crit chance" decides whether it fires, "crit
  // multiplier" decides how much it multiplies by. Previously split across
  // Proc Rates (the rate side) and Bonus Damage / DMG Reduction (the DMG
  // side), which obscured that they're the same stage. Combo Rate and
  // Counter Rate stay in Proc Rates below — those gate a different trigger
  // mechanic (whether a combo/counter attack happens at all), not a crit.
  { title: 'Crit', labels: ['Crit Rate (Generic)', 'Skill Crit Rate', 'Basic ATK Crit Rate', 'Weapon Crit Rate', 'Lightning Crit Rate', 'DoT Crit Rates', 'Dagger Crit Rate', 'Sword Qi Crit Rate', 'Light Spear Crit Rate', 'Crit DMG', 'Skill Crit DMG', 'Dagger Crit DMG', 'Crit DMG Reduction', 'Skill Crit DMG Red', 'Basic ATK Crit DMG Red', 'DoT Crit DMG Red'] },
  // PVP Damage Reduction and Mounted DMG Reduction are both defensive
  // reduction stats, so they live in DMG Reduction rather than their own
  // category.
  { title: 'Bonus Damage', labels: ['Skill DMG', 'Basic ATK DMG', 'Combo DMG', 'Counter DMG', 'Lightning DMG', 'Dagger DMG', 'Sword Qi DMG', 'Light Spear DMG', 'DoT DMG', 'Fire DMG', 'Explosion DMG', 'Physical DMG', 'Pet DMG', 'Bonus Damage',] },
  { title: 'Final Damage', labels: ['General Final Damage', 'Final Skill Damage', 'Final Lightning DMG', 'Final Sword Qi DMG', 'Final Dagger DMG', 'Final Combo DMG', 'Final Counter DMG', 'Final Normal ATK DMG', 'Final Damage to Shields'] },
  { title: 'Proc Rates', labels: ['Combo Rate', 'Counter Rate'] },
  { title: 'Damage Coefficients', labels: ['General DMG Coef', 'Skill DMG Coef', 'Normal ATK DMG Coef', 'Combo DMG Coef', 'Counter DMG Coef', 'Lightning DMG Coef', 'Dagger DMG Coef', 'Sword Qi DMG Coef', 'Fire DMG Coef'] },
  { title: 'Speed', labels: ['Speed'] },
  { title: 'DMG Reduction', labels: ['Generic DMG Reduction', 'Skill DMG Reduction', 'Basic ATK DMG Reduction', 'Combo DMG Reduction', 'Counter DMG Reduction', 'Lightning DMG Reduction', 'Dagger DMG Reduction', 'Sword Qi DMG Reduction', 'Light Spear DMG Red', 'Fire DMG Reduction', 'DoT DMG Reduction', 'PVP Damage Reduction', 'Mounted DMG Reduction', 'Conditional Damage Reduction'] },
  { title: 'Final Damage Reduction', labels: ['General Final Damage Reduction', 'Skill Damage Final Damage Reduction', 'Basic Attack Final Damage Reduction', 'Adventurer Final Damage Reduction', 'Artifact Final Damage Reduction', 'Mount Final Damage Reduction', 'Pet Final Damage Reduction'] },
  { title: 'Tenacity & Armor Break', labels: ['Tenacity', 'Tenacity Resistance', 'Armor Break', 'Armor Break Resistance', 'Control Immunity Rate', 'Ignore Control Immunity Rate', 'Suppression'] },
  { title: 'Ignore Proc Rates', labels: ['Ignore Combo', 'Ignore Crit', 'Ignore Weapon Crit', 'Ignore Skill Crit', 'Ignore Normal ATK Crit', 'Ignore Lightning Crit', 'Ignore DoT Crit', 'Ignore Dagger Crit', 'Ignore Sword Qi Crit', 'Ignore Light Spear Crit', 'Ignore Counter', 'Ignore Suppression'] },
];

// Simple collapsible accordion — pure DOM toggle, no state persistence
// needed since it's just a display convenience, not something worth
// remembering across renders. ghost=true drops the boxed-card look (no
// border/background) for cases that just need the collapse behavior
// without looking like a distinct container.
function renderAccordion(title, contentEl, defaultOpen, ghost) {
  const wrap = el('div', { class: 'accordion' + (defaultOpen ? ' open' : '') + (ghost ? ' ghost' : '') });
  const header = el('div', { class: 'accordion-header' }, [
    el('span', { class: 'accordion-title' }, title),
    el('span', { class: 'accordion-chevron' }, '\u25BE'),
  ]);
  const body = el('div', { class: 'accordion-body' }, contentEl);
  header.addEventListener('click', () => {
    wrap.classList.toggle('open');
  });
  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

const CALC_NON_PERCENT_LABELS = new Set(['Tenacity', 'Tenacity Resistance', 'Armor Break', 'Armor Break Resistance', 'Speed', 'Suppression']);

// Attack-type filter — per the game's own attribute rules (an attack can
// carry multiple attributes at once, e.g. Lightning is both "skill" and
// "lightning", and all matching stat types add together for that one
// attack rather than only the single narrowest one applying), each
// chip's labels are the stats it ADDS on top of the always-on generic
// baseline — not a self-contained list repeating "Crit Rate (Generic)"
// itself — so turning on several chips at once sums generic + the union
// of every enabled chip's own labels, without double-counting generic.
// Physical Crit Rate is deliberately left out of Dagger/Sword Qi/Light
// Spear's crit rate list below — nothing in the item data currently
// tracks it as its own stat, so including a label that never appears
// would just be dead weight, not a real omission.
const CALC_FILTER_GENERIC = {
  critRate: ['Crit Rate (Generic)'],
  dmgBoost: ['Global ATK'],
  critDmg: ['Crit DMG'],
  finalDmg: ['General Final Damage'],
  dmgRed: ['Generic DMG Reduction'],
  finalDmgRed: ['General Final Damage Reduction'],
};
const ATTACK_TYPE_DEFS = [
  { name: 'Basic Attack',
    critRate: ['Basic ATK Crit Rate', 'Weapon Crit Rate'],
    dmgBoost: ['Basic ATK DMG'],
    critDmg: [],
    finalDmg: ['Final Normal ATK DMG'],
    dmgRed: ['Basic ATK DMG Reduction'],
    finalDmgRed: ['Basic Attack Final Damage Reduction'] },
  { name: 'Combo',
    critRate: ['Basic ATK Crit Rate', 'Weapon Crit Rate'],
    dmgBoost: ['Basic ATK DMG', 'Combo DMG'],
    critDmg: [],
    finalDmg: ['Final Combo DMG'],
    dmgRed: ['Basic ATK DMG Reduction', 'Combo DMG Reduction'],
    finalDmgRed: ['Basic Attack Final Damage Reduction'] },
  { name: 'Counter',
    critRate: ['Basic ATK Crit Rate', 'Weapon Crit Rate'],
    dmgBoost: ['Basic ATK DMG', 'Counter DMG'],
    critDmg: [],
    finalDmg: ['Final Counter DMG'],
    dmgRed: ['Basic ATK DMG Reduction', 'Counter DMG Reduction'],
    finalDmgRed: ['Basic Attack Final Damage Reduction'] },
  { name: 'Rage Skill',
    critRate: ['Skill Crit Rate', 'Weapon Crit Rate'],
    dmgBoost: ['Skill DMG'],
    critDmg: ['Skill Crit DMG'],
    finalDmg: ['Final Skill Damage'],
    dmgRed: ['Skill DMG Reduction'],
    finalDmgRed: ['Skill Damage Final Damage Reduction'] },
  { name: 'Lightning',
    critRate: ['Skill Crit Rate', 'Lightning Crit Rate'],
    dmgBoost: ['Skill DMG', 'Lightning DMG'],
    critDmg: ['Skill Crit DMG'],
    finalDmg: ['Final Skill Damage', 'Final Lightning DMG'],
    dmgRed: ['Skill DMG Reduction', 'Lightning DMG Reduction'],
    finalDmgRed: ['Skill Damage Final Damage Reduction'] },
  { name: 'Dagger',
    critRate: ['Skill Crit Rate', 'Dagger Crit Rate'],
    dmgBoost: ['Skill DMG', 'Dagger DMG', 'Physical DMG'],
    critDmg: ['Skill Crit DMG', 'Dagger Crit DMG'],
    finalDmg: ['Final Skill Damage', 'Final Dagger DMG'],
    dmgRed: ['Skill DMG Reduction', 'Dagger DMG Reduction'],
    finalDmgRed: ['Skill Damage Final Damage Reduction'] },
  { name: 'Sword Qi',
    critRate: ['Skill Crit Rate', 'Sword Qi Crit Rate'],
    dmgBoost: ['Skill DMG', 'Sword Qi DMG', 'Physical DMG'],
    critDmg: ['Skill Crit DMG'],
    finalDmg: ['Final Skill Damage', 'Final Sword Qi DMG'],
    dmgRed: ['Skill DMG Reduction', 'Sword Qi DMG Reduction'],
    finalDmgRed: ['Skill Damage Final Damage Reduction'] },
  { name: 'Light Spear',
    critRate: ['Skill Crit Rate', 'Light Spear Crit Rate'],
    dmgBoost: ['Skill DMG', 'Light Spear DMG', 'Physical DMG'],
    critDmg: ['Skill Crit DMG'],
    finalDmg: ['Final Skill Damage'],
    dmgRed: ['Skill DMG Reduction', 'Light Spear DMG Red'],
    finalDmgRed: ['Skill Damage Final Damage Reduction'] },
];

// Reverse index: which Full Stat Breakdown table LABELS belong to which
// attack-type chip(s), so the table can hide rows that don't match any
// currently-enabled chip. Built once from ATTACK_TYPE_DEFS + the generic
// baseline rather than hand-maintained separately, so the table filter
// can never drift out of sync with the card definitions above it.
// Every label from every category is included — a label belonging to
// ANY enabled chip stays visible.
const CALC_LABEL_TO_TYPES = {};
[CALC_FILTER_GENERIC, ...ATTACK_TYPE_DEFS].forEach(def => {
  const typeName = def.name || '__generic__';
  ['critRate', 'dmgBoost', 'critDmg', 'finalDmg', 'dmgRed', 'finalDmgRed'].forEach(cat => {
    (def[cat] || []).forEach(label => {
      CALC_LABEL_TO_TYPES[label] = CALC_LABEL_TO_TYPES[label] || new Set();
      CALC_LABEL_TO_TYPES[label].add(typeName);
    });
  });
});

// Short explanation of what each stat actually covers, drawn from the
// game's own attribute rules — shown as each card's caption so the
// write-up lives on the page itself, not only in chat. Deliberately
// terse (one line) since this repeats on every card; labels not listed
// here (Set Bonus-derived or otherwise unmapped) just render without a
// caption rather than a blank placeholder.
const CALC_STAT_EXPLANATIONS = {
  'Crit Rate (Generic)': 'Applies to every attack, regardless of type.',
  'Skill Crit Rate': 'Affects Rage Skill, Sword Qi, Lightning, Dagger, Light Spear, and any other damaging skill.',
  'Basic ATK Crit Rate': 'Affects Normal Attack, Combo, and Counter.',
  'Weapon Crit Rate': 'Affects Normal Attack, Combo, Counter, and Rage Skill.',
  'Lightning Crit Rate': 'Only affects Lightning specifically.',
  'Dagger Crit Rate': 'Only affects Dagger specifically.',
  'Sword Qi Crit Rate': 'Only affects Sword Qi specifically.',
  'Light Spear Crit Rate': 'Only affects Light Spear specifically.',
  'Global ATK': 'Applies to all damage, regardless of type.',
  'Skill DMG': 'Affects Rage Skill, Sword Qi, Lightning, Dagger, Light Spear, and other damaging skills.',
  'Basic ATK DMG': 'Affects Normal Attack, Combo, and Counter.',
  'Combo DMG': 'Only affects Combo specifically.',
  'Counter DMG': 'Only affects Counter specifically.',
  'Lightning DMG': 'Only affects Lightning specifically.',
  'Dagger DMG': 'Only affects Dagger specifically.',
  'Sword Qi DMG': 'Only affects Sword Qi specifically.',
  'Light Spear DMG': 'Only affects Light Spear specifically.',
  'Physical DMG': 'Affects Dagger, Sword Qi, and Light Spear (physical-attribute skills).',
  'Crit DMG': 'Applies to every critical hit, regardless of type.',
  'Skill Crit DMG': 'Affects critical hits from skills specifically.',
  'Dagger Crit DMG': 'Only affects critical hits from Dagger.',
  'General Final Damage': 'Applies to all damage, regardless of type.',
  'Final Skill Damage': 'Affects all skill-type damage.',
  'Final Normal ATK DMG': 'Only affects Normal Attack damage.',
  'Final Combo DMG': 'Only affects Combo damage.',
  'Final Counter DMG': 'Only affects Counter damage.',
  'Final Lightning DMG': 'Only affects Lightning damage.',
  'Final Dagger DMG': 'Only affects Dagger damage.',
  'Final Sword Qi DMG': 'Only affects Sword Qi damage.',
  'Generic DMG Reduction': 'Reduces damage taken from any attack, regardless of type.',
  'Skill DMG Reduction': 'Reduces damage taken from skill-type attacks.',
  'Basic ATK DMG Reduction': 'Reduces damage taken from Normal Attack, Combo, and Counter.',
  'Combo DMG Reduction': 'Only reduces damage taken from Combo specifically.',
  'Counter DMG Reduction': 'Only reduces damage taken from Counter specifically.',
  'Lightning DMG Reduction': 'Only reduces damage taken from Lightning specifically.',
  'Dagger DMG Reduction': 'Only reduces damage taken from Dagger specifically.',
  'Sword Qi DMG Reduction': 'Only reduces damage taken from Sword Qi specifically.',
  'Light Spear DMG Red': 'Only reduces damage taken from Light Spear specifically.',
  'General Final Damage Reduction': 'Reduces damage taken from any attack, regardless of type.',
  'Skill Damage Final Damage Reduction': 'Reduces damage taken from skill-type attacks.',
  'Basic Attack Final Damage Reduction': 'Reduces damage taken from Normal Attack, Combo, and Counter.',
};

// Shared filter state + a listener list so the chips (in
// renderAttackTypeFilter) and the Full Stat Breakdown table (in
// buildFullCalcTable) can stay in sync without a full page re-render —
// toggling a chip just updates this Set and notifies whoever's listening,
// same pattern as the rest of the calculator's in-place DOM updates.
let calcFilterEnabledTypes = new Set();
const calcFilterListeners = [];
function setCalcFilterTypes(next) {
  calcFilterEnabledTypes = next;
  calcFilterListeners.forEach(fn => fn(calcFilterEnabledTypes));
}

function renderAttackTypeFilter() {
  const wrap = el('div', { class: 'calc-attack-filter' });
  wrap.appendChild(el('div', { class: 'section-title-row' }, [
    el('div', { class: 'accordion-title', style: 'font-weight:600;' }, 'Filter by Attack Type'),
  ]));
  wrap.appendChild(el('p', { class: 'section-desc' },
    'The cards below always show your generic totals. Toggle on an attack type to add its own section underneath — e.g. Lightning is both Skill and Lightning, so turning it on adds a Lightning DMG section with its own cards for Skill Crit Rate, Lightning Crit Rate, Skill DMG, Lightning DMG and so on, each shown on its own rather than added together.'));

  const chipRow = el('div', { class: 'calc-attack-chip-row' });
  const chipButtons = {};
  ATTACK_TYPE_DEFS.forEach(def => {
    const chip = el('button', { class: 'filter-chip' }, def.name);
    chip.addEventListener('click', () => {
      const next = new Set(calcFilterEnabledTypes);
      if (next.has(def.name)) next.delete(def.name); else next.add(def.name);
      chip.classList.toggle('active', next.has(def.name));
      setCalcFilterTypes(next);
    });
    chipButtons[def.name] = chip;
    chipRow.appendChild(chip);
  });
  const clearAllBtn = el('button', { class: 'filter-chip' }, 'Clear All');
  clearAllBtn.addEventListener('click', () => {
    Object.values(chipButtons).forEach(b => b.classList.remove('active'));
    setCalcFilterTypes(new Set());
  });
  chipRow.appendChild(clearAllBtn);
  wrap.appendChild(chipRow);

  // Fixed, always-visible row — the 6 generic baseline stats alone,
  // never combined with anything a chip adds. Built once since none of
  // these ever change based on chip selection.
  const genericGrid = el('div', { class: 'calc-stat-grid' });
  wrap.appendChild(genericGrid);

  // One section per currently-enabled type, each with its own H3 title
  // ("Lightning DMG", "Counter DMG", etc.) and its own grid of cards
  // directly underneath — kept as fully separate sections rather than
  // merged into one grid, so a label shared by two enabled types (e.g.
  // "Skill Crit Rate" under both Lightning and Dagger) correctly appears
  // once per section it belongs to, since each section stands on its own.
  const extraSectionsWrap = el('div', { class: 'calc-extra-sections' });
  wrap.appendChild(extraSectionsWrap);

  const renderGeneric = () => {
    const stats = aggregateFullStatsWithSources();
    const val = (l) => stats[l] ? stats[l].total : 0;
    const card = (cardLabel, statLabel) =>
      renderStatCard(cardLabel, `${val(statLabel).toFixed(1)}%`, CALC_STAT_EXPLANATIONS[statLabel]);
    genericGrid.appendChild(card('Crit Rate (Generic)', CALC_FILTER_GENERIC.critRate[0]));
    genericGrid.appendChild(card('Damage Boost (Global ATK)', CALC_FILTER_GENERIC.dmgBoost[0]));
    genericGrid.appendChild(card('Crit Damage', CALC_FILTER_GENERIC.critDmg[0]));
    genericGrid.appendChild(card('Final Damage Boost (General)', CALC_FILTER_GENERIC.finalDmg[0]));
    genericGrid.appendChild(card('DMG Reduction (Generic)', CALC_FILTER_GENERIC.dmgRed[0]));
    genericGrid.appendChild(card('Final DMG Reduction (General)', CALC_FILTER_GENERIC.finalDmgRed[0]));
  };
  renderGeneric();

  const renderExtras = (enabledTypes) => {
    const stats = aggregateFullStatsWithSources();
    extraSectionsWrap.innerHTML = '';
    // Fixed canonical order (same as the chip row) rather than click
    // order, so sections don't reshuffle depending on the sequence
    // someone happened to toggle them in.
    ATTACK_TYPE_DEFS.filter(d => enabledTypes.has(d.name)).forEach(def => {
      const labelSet = new Set();
      ['critRate', 'dmgBoost', 'critDmg', 'finalDmg', 'dmgRed', 'finalDmgRed'].forEach(cat => def[cat].forEach(l => labelSet.add(l)));

      const section = el('div', { class: 'calc-extra-section' });
      section.appendChild(el('h3', { class: 'calc-extra-section-title' }, `${def.name} DMG`));
      const grid = el('div', { class: 'calc-stat-grid' });
      [...labelSet].forEach(label => {
        const total = stats[label] ? stats[label].total : 0;
        grid.appendChild(renderStatCard(label, `${total.toFixed(1)}%`, CALC_STAT_EXPLANATIONS[label]));
      });
      section.appendChild(grid);
      extraSectionsWrap.appendChild(section);
    });
  };

  calcFilterListeners.push(renderExtras);
  renderExtras(calcFilterEnabledTypes);

  return wrap;
}

function buildFullCalcTable() {
  const wrap = el('div', {});
  const rounds = [1, 2, 3, 4, 5];
  // Ceiling view (round=null) still drives the full list of sources that
  // exist at all, so the expandable breakdown can show a source even if
  // it contributes 0 by round 5 specifically. The stat row's own "Total"
  // now comes from round 5's actual aggregation instead, so it matches
  // what the round columns underneath actually add up to rather than a
  // separate, hypothetical best-case number.
  const stats = aggregateFullStatsWithSources();
  const statsByRound = rounds.map(r => aggregateFullStatsWithSources(r));

  const controls = el('div', { class: 'calc-full-table-controls' });
  let allExpanded = false;
  let emptyHidden = false;
  const allEntries = []; // { statRow, sourceRows, chevron, hasSources, emptyRow }

  const expandAllBtn = el('button', { class: 'filter-chip' }, 'Expand All');
  const hideEmptyBtn = el('button', { class: 'filter-chip' }, 'Hide Empty');
  expandAllBtn.addEventListener('click', () => {
    allExpanded = !allExpanded;
    expandAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
    allEntries.forEach(({ sourceRows, chevron, hasSources }) => {
      if (!hasSources) return;
      sourceRows.forEach(r => r.classList.toggle('collapsed', !allExpanded));
      chevron.classList.toggle('expanded', allExpanded);
    });
  });
  hideEmptyBtn.addEventListener('click', () => {
    emptyHidden = !emptyHidden;
    hideEmptyBtn.textContent = emptyHidden ? 'Show Empty' : 'Hide Empty';
    allEntries.forEach(({ statRow, hasSources, emptyRow }) => {
      if (hasSources) return;
      statRow.classList.toggle('calc-row-hidden', emptyHidden);
      if (emptyRow) emptyRow.classList.toggle('calc-row-hidden', emptyHidden);
    });
  });
  controls.appendChild(expandAllBtn);
  controls.appendChild(hideEmptyBtn);
  wrap.appendChild(controls);

  // Shown/hidden by the filter-application listener registered at the
  // end of this function, once allEntries is fully populated.
  const filterNotice = el('div', { class: 'calc-filter-notice calc-row-hidden' }, 'Detailed stats are currently being filtered by attack type.');
  wrap.appendChild(filterNotice);

  // Quick-jump nav — clicking scrolls straight to that category's title,
  // skipping the scroll-and-hunt through every section above it.
  const jumpNav = el('div', { class: 'calc-jump-nav' });
  CALC_TABLE_CATEGORIES.forEach((cat, i) => {
    const anchorId = `calc-cat-${i}`;
    jumpNav.appendChild(el('a', {
      href: `#${anchorId}`, class: 'calc-jump-link',
      onclick: (e) => {
        e.preventDefault();
        document.getElementById(anchorId).scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, cat.title));
  });
  wrap.appendChild(jumpNav);

  CALC_TABLE_CATEGORIES.forEach((cat, catIdx) => {
    wrap.appendChild(el('div', { class: 'equip-section-title calc-category-title', id: `calc-cat-${catIdx}` }, cat.title));
    const table = el('table', { class: 'calc-full-table' });
    // Sticky header carrying the R1-R5 column labels — stays visible
    // while scrolling down a long category's source rows, so it's
    // always clear which column is which round.
    const thead = el('thead', {}, el('tr', {}, [
      el('th', {}, 'Stat'),
      ...rounds.map(r => el('th', { class: 'calc-full-table-total' }, `R${r}`)),
    ]));
    table.appendChild(thead);
    const tbody = el('tbody', {});
    cat.labels.forEach(label => {
      const entry = stats[label];
      // Back to the ceiling total (ignoring round 5 specifically) — the
      // round-5-only version undersold items whose stacks/tiers genuinely
      // need more than 5 rounds to reach their stated cap, which was its
      // own kind of misleading in the other direction. The description
      // toggle below each source row is the actual fix: it surfaces the
      // item's own effect text so the person can see *why* the ceiling
      // and the round-by-round numbers might not match up, rather than
      // picking one single number that's honest in one direction and
      // wrong in the other.
      const total = entry ? Math.round(entry.total * 100) / 100 : 0;
      const suffix = CALC_NON_PERCENT_LABELS.has(label) ? '' : '%';
      const hasSources = entry && entry.sources.length > 0;

      const sourceRows = [];
      let emptyRow = null;
      if (hasSources) {
        entry.sources.forEach(s => {
          // Looks up this exact source's own value at each of the 5
          // rounds — not the stat's overall total, the individual
          // source's contribution specifically, since that's what
          // actually varies round to round (a still-owned-but-not-yet-
          // triggered relic effect shows 0 in early rounds here, even
          // though the stat's own ceiling total above stays constant).
          // Matches by groupKey, not the display name — a stacking
          // source's name text itself changes per round ("1 stack" vs
          // "3 stacks"), so matching by name silently failed to find the
          // same source across rounds whenever its own stack count
          // differed from the ceiling view's.
          const roundVals = statsByRound.map(roundStats => {
            const roundEntry = roundStats[label];
            const match = roundEntry && roundEntry.sources.find(rs => rs.groupKey === s.groupKey);
            return match ? match.val : 0;
          });

          // Every conditional-mechanism source name is written as
          // "${item.n} (...)" — pulling the part before " (" and looking
          // it up across every item DB recovers the actual item without
          // needing to thread a description through every add() call
          // site individually. Falls back to null (no toggle rendered)
          // for sources this doesn't resolve — Set Bonuses and plain
          // star_up/awaken numeric deltas have no single natural
          // "description" sentence anyway, so silently skipping them is
          // correct, not a gap to fill in later.
          //
          // Explicitly excludes the "★/A" pattern specifically — that's
          // sumBlockAtLevel()'s own signature format (e.g. "King Kong
          // (0★/A0)"), used for the item's flat, unconditional star_up/
          // awaken stat deltas like Speed. base_effect describes the
          // item's special conditional skill, which has nothing to do
          // with a flat Speed bonus — showing it there was actively
          // misleading, not just unhelpful. Every OTHER mechanism
          // (flat_stats_star_tiers, stacking_stats, decaying_stats, the
          // awaken-tier and phased variants) uses a different format and
          // genuinely does derive from base_effect/awaken_base_effect
          // text, so those still get the toggle.
          const isFlatStarAwakenDelta = /★\/A\d+\)$/.test(s.name);
          const itemName = s.name.split(' (')[0];
          const sourceItem = isFlatStarAwakenDelta ? null : [DB.mounts, DB.artifacts, DB.relics, DB.collectibles]
            .flatMap(list => list || [])
            .find(it => it.n === itemName);
          // base_effect is always the 0★/A0 text specifically — using it
          // unconditionally was wrong for anything star- or awaken-tiered
          // (e.g. Dapper Goose at 5★ showing its 0★ "+10%" wording while
          // the actual applied number was 20%). Pull the star or awaken
          // level out of whichever of name/groupKey actually carries it —
          // most mechanisms still put it in the visible name ("King Kong
          // (5★, 3 stacks)"), but flat_stats_star_tiers/
          // flat_stats_awaken_tiers now show a plain "Active mount"/
          // "Deployed mount" label instead and carry the level in
          // groupKey (invisible) instead — and use star_effects/
          // resolveAwakenEffect for that specific level, so the
          // description always matches the number actually shown.
          let description = null;
          if (sourceItem) {
            const searchText = `${s.name} ${s.groupKey}`;
            const starMatch = searchText.match(/(\d+)★/);
            const awakenMatch = searchText.match(/A(\d+)/);
            if (starMatch && sourceItem.star_effects && sourceItem.star_effects[starMatch[1]]) {
              description = sourceItem.star_effects[starMatch[1]];
            } else if (awakenMatch) {
              const resolved = resolveAwakenEffect(sourceItem, Number(awakenMatch[1]));
              description = resolved ? resolved.text : sourceItem.base_effect;
            } else {
              description = sourceItem.base_effect;
            }
          }

          const nameCell = el('td', {}, [s.name]);
          let descRow = null;
          if (description) {
            const toggle = el('span', { class: 'calc-source-desc-toggle' }, ' ⓘ');
            descRow = el('tr', { class: 'calc-full-table-desc-row collapsed calc-row-hidden' }, [
              el('td', { colspan: String(rounds.length + 1), class: 'calc-full-table-desc-text' }, description),
            ]);
            toggle.addEventListener('click', (e) => {
              e.stopPropagation();
              descRow.classList.toggle('calc-row-hidden');
            });
            nameCell.appendChild(toggle);
          }

          sourceRows.push(el('tr', {
            // The "has-desc" class drops this row's own border-bottom
            // when it's immediately followed by its description row, so
            // the 2 read as one continuous unit rather than the number
            // row being visually closed off before the description
            // starts underneath it.
            class: 'calc-full-table-source-row collapsed' + (descRow ? ' has-desc' : ''),
          }, [
            nameCell,
            ...roundVals.map(v => el('td', { class: 'calc-full-table-total' }, `${Math.round(v * 100) / 100}`)),
          ]));
          if (descRow) sourceRows.push(descRow);
        });
      } else {
        emptyRow = el('tr', { class: 'calc-full-table-source-row collapsed' }, [
          el('td', {}, '\u2014'), ...rounds.map(() => el('td', {}, '')),
        ]);
        sourceRows.push(emptyRow);
      }

      const chevron = hasSources ? el('span', { class: 'calc-full-table-chevron' }, '\u25BE') : null;
      const statRow = el('tr', {
        class: 'calc-full-table-stat-row' + (hasSources ? ' clickable' : ''),
        onclick: hasSources ? () => {
          sourceRows.forEach(r => r.classList.toggle('collapsed'));
          chevron.classList.toggle('expanded');
        } : null,
      }, [
        el('td', {}, [chevron, label]),
        // One cell spanning all 5 round columns — the stat's own row
        // keeps showing the ceiling total as a single number, same as
        // before; only the source rows underneath break it out by round.
        el('td', { class: 'calc-full-table-total', colspan: String(rounds.length) }, `Total: ${total}${suffix}`),
      ]);
      tbody.appendChild(statRow);
      sourceRows.forEach(r => tbody.appendChild(r));
      allEntries.push({ statRow, sourceRows, chevron, hasSources, emptyRow, label });
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  });

  // Applies the current attack-type chip selection to every row: a label
  // with no entry in CALC_LABEL_TO_TYPES at all (Speed, Tenacity, Global
  // ATK's own generic contributions via sumBlockAtLevel, etc.) is not
  // attack-type-specific and always stays visible; a label that IS
  // mapped only stays visible while no chips are enabled, or while at
  // least one of its mapped types is currently enabled. Registered as a
  // listener rather than computed once, so toggling a chip re-applies
  // this in place without rebuilding the whole table.
  const applyAttackTypeFilter = (enabledTypes) => {
    filterNotice.classList.toggle('calc-row-hidden', enabledTypes.size === 0);
    allEntries.forEach(({ statRow, emptyRow, label }) => {
      const mappedTypes = CALC_LABEL_TO_TYPES[label];
      const visible = enabledTypes.size === 0 || !mappedTypes ||
        [...mappedTypes].some(t => t === '__generic__' || enabledTypes.has(t));
      statRow.classList.toggle('calc-row-filtered', !visible);
      if (emptyRow) emptyRow.classList.toggle('calc-row-filtered', !visible);
    });
  };
  calcFilterListeners.push(applyAttackTypeFilter);
  applyAttackTypeFilter(calcFilterEnabledTypes);

  return wrap;
}

// each pulls and sums whichever raw keys represent that stat across every
// data source, since the same real-world stat often ended up with
// different key names in relics vs. mounts/artifacts vs. collectibles.
const CALC_STAT_DEFS = [
  { label: 'Tenacity', keys: ['Tenacity'], notPct: true },
  { label: 'Ignore Tenacity', keys: ['Tenacity Resistance'], notPct: true },
  { label: 'Armor Break', keys: ['Armor Break'], notPct: true },
  { label: 'Ignore Armor Break', keys: ['Armor Break Resistance'], notPct: true },
  { label: 'Damage Reduction', keys: ['Generic DMG Reduction', 'Conditional Damage Reduction', 'Skill DMG Reduction', 'Basic ATK DMG Reduction', 'Combo DMG Reduction', 'Counter DMG Reduction', 'Lightning DMG Reduction', 'Dagger DMG Reduction', 'Sword Qi DMG Reduction', 'Light Spear DMG Red', 'Fire DMG Reduction', 'DoT DMG Reduction'] },
  { label: 'Final Damage Reduction', keys: ['General Final Damage Reduction', 'Skill Damage Final Damage Reduction', 'Basic Attack Final Damage Reduction', 'Conditional Final Damage Reduction', 'Adventurer Final Damage Reduction', 'Artifact Final Damage Reduction', 'Mount Final Damage Reduction', 'Pet Final Damage Reduction'], highlight: true },
  { label: 'Damage Boost', keys: ['Conditional Damage Boost', 'Global ATK', 'Skill DMG', 'Basic ATK DMG', 'Combo DMG', 'Counter DMG', 'Lightning DMG', 'Dagger DMG', 'Sword Qi DMG', 'Light Spear DMG', 'DoT DMG', 'Fire DMG', 'Explosion DMG', 'Physical DMG', 'Pet DMG'], caption: 'Affected by enemy tenacity' },
  { label: 'Final Damage Boost', keys: ['General Final Damage', 'Final Skill Damage', 'Final Lightning DMG', 'Final Sword Qi DMG', 'Final Dagger DMG', 'Final Combo DMG', 'Final Counter DMG', 'Final Normal ATK DMG','Conditional Final Damage'], highlight: true },
  { label: 'Final Basic Attack Damage', keys: ['Final Normal ATK DMG'] },
  { label: 'Final Basic Attack Damage Reduction', keys: ['Basic Attack Final Damage Reduction'] },
  { label: 'Final Skill Damage', keys: ['Final Skill Damage'] },
  { label: 'Final Skill Damage Reduction', keys: ['Skill Damage Final Damage Reduction'] },
  { label: 'Crit Rate', keys: ['Crit Rate (Generic)', 'Skill Crit Rate', 'Basic ATK Crit Rate', 'Weapon Crit Rate', 'Lightning Crit Rate', 'DoT Crit Rates', 'Dagger Crit Rate', 'Sword Qi Crit Rate', 'Light Spear Crit Rate'] },
  { label: 'Ignore Crit Rate', keys: ['Ignore Crit', 'Ignore Skill Crit', 'Ignore Weapon Crit', 'Ignore Normal ATK Crit', 'Ignore Lightning Crit', 'Ignore DoT Crit', 'Ignore Dagger Crit', 'Ignore Sword Qi Crit', 'Ignore Light Spear Crit'] },
  { label: 'Crit Damage', keys: ['Crit DMG'] },
  { label: 'Ignore Crit Damage', keys: ['Crit DMG Reduction'] },
  { label: 'Combo Rate', keys: ['Combo Rate'] },
  { label: 'Ignore Combo Rate', keys: ['Ignore Combo'] },
  { label: 'Counter Rate', keys: ['Counter Rate'] },
  { label: 'Ignore Counter Rate', keys: ['Ignore Counter'] },
  { label: 'Block', keys: ['Block'], notPct: true },
  { label: 'Speed', keys: ['Speed'], notPct: true },
];

// Exact order requested: 4 per row, 7 rows.
const QUICK_STATS_ORDER = [
  'Final Damage Reduction', 'Damage Reduction', 'Final Basic Attack Damage Reduction', 'Final Skill Damage Reduction',
  'Final Damage Boost', 'Damage Boost', 'Final Basic Attack Damage', 'Final Skill Damage',
  'Tenacity', 'Ignore Tenacity', 'Armor Break', 'Ignore Armor Break',
  'Ignore Combo Rate', 'Ignore Counter Rate', 'Ignore Crit Rate', 'Ignore Crit Damage',
  'Combo Rate', 'Counter Rate', 'Crit Rate', 'Crit Damage',
  'Final ATK', 'Final HP', 'Global DEF%', 'Effective HP',
  'Tenacity Eff', 'Armor Break Eff', 'Block', 'Speed',
];

function pctEffectiveness(delta) {
  const A = 7000, cap = 0.85;
  return Math.min(Math.max(0, delta) / (A + Math.max(0, delta)), cap) * 100;
}

/* ---------- Calculator UI ---------- */
function renderCalculator() {
  // Fresh listener list (and cleared chip selection) each time this page
  // renders — matches the existing Expand All/Hide Empty toggles, which
  // are also local, per-render UI state rather than persisted across
  // re-renders, and avoids stale listeners piling up against detached
  // DOM from a previous visit to this tab.
  calcFilterListeners.length = 0;
  calcFilterEnabledTypes = new Set();

  const wrap = el('div', {});
  wrap.appendChild(el('div', { class: 'section-title-row' }, [
    el('div', { class: 'section-title' }, 'Calculator'),
    renderCalcDataControls(),
  ]));
  wrap.appendChild(el('p', { class: 'section-desc' }, 'Values will auto populate as changes are made to the sheet'));
  wrap.appendChild(el('p', { class: 'section-desc', style: 'font-style:italic;' },
  'Some contributions come from conditional or proc-based effects (e.g. a relic bonus that only activates after a trigger, or a stat that applies "for 1 round" rather than the whole battle) — these are still counted as if fully active, so the numbers shown here represent the ceiling for what your build can reach, not a guaranteed constant.'
));

  wrap.appendChild(renderAttackTypeFilter());

  /* ---- Quick Stats — commented out, not deleted, per her call that it
     wasn't proving useful; trivial to restore by uncommenting if that
     changes. ----
  const totals = aggregatePvpStats();

  // Final ATK / Final HP — base stat × (1 + %-bonuses), same pattern
  // Effective HP is built from. No absolute Final DEF is shown since
  // nothing tracked so far grants a flat DEF value — only Global DEF% —
  // so that's shown as its own % card instead of a fabricated total.
  const flatATK = totals['ATK'] || 0;
  const atkPctBonus = (totals['ATK%'] || 0) + (totals['Global ATK'] || 0);
  const finalATK = flatATK * (1 + atkPctBonus / 100);

  const flatHP = totals['HP'] || 0;
  const hpPctBonus = (totals['HP%'] || 0) + (totals['Global HP'] || 0) + (totals['Global HP%'] || 0);
  const finalHP = flatHP * (1 + hpPctBonus / 100);

  const dmgRed = totals['Damage Reduction'] || 0;
  const fdr = totals['Final Damage Reduction'] || 0;
  const ehp = finalHP > 0 ? finalHP / ((1 - Math.min(dmgRed, 99) / 100) * (1 - Math.min(fdr, 99) / 100)) : 0;

  const cardsByLabel = {};
  cardsByLabel['Final ATK'] = renderStatCard('Final ATK', formatBigNumber(finalATK));
  cardsByLabel['Final HP'] = renderStatCard('Final HP', formatBigNumber(finalHP));
  cardsByLabel['Global DEF%'] = renderStatCard('Global DEF%', `${(totals['Global DEF%'] || 0).toFixed(1)}%`);
  cardsByLabel['Effective HP'] = renderStatCard('Effective HP', formatBigNumber(ehp), null, true);

  CALC_STAT_DEFS.forEach(def => {
    const sum = def.keys.reduce((a, k) => a + (totals[k] || 0), 0);
    const value = def.notPct ? sum.toLocaleString() : `${sum.toFixed(1)}%`;
    cardsByLabel[def.label] = renderStatCard(def.label, value, def.caption, def.highlight);
  });

  const tenacity = totals['Tenacity'] || 0;
  const armorBreak = totals['Armor Break'] || 0;
  cardsByLabel['Tenacity Eff'] = renderStatCard('Tenacity Eff', `${pctEffectiveness(tenacity).toFixed(1)}%`, null, false, pctEffectiveness(tenacity));
  cardsByLabel['Armor Break Eff'] = renderStatCard('Armor Break Eff', `${pctEffectiveness(armorBreak).toFixed(1)}%`, null, false, pctEffectiveness(armorBreak));

  const orderedCards = QUICK_STATS_ORDER.filter(l => cardsByLabel[l]).map(l => cardsByLabel[l]);
  // Safety net — anything not in the explicit order list still shows up,
  // just appended at the end, rather than silently disappearing.
  const remaining = Object.keys(cardsByLabel).filter(l => !QUICK_STATS_ORDER.includes(l)).map(l => cardsByLabel[l]);

  wrap.appendChild(renderAccordion('Quick Stats', el('div', { class: 'calc-stat-grid' }, [...orderedCards, ...remaining]), true, true));
  ---- end Quick Stats ---- */

  const fullBreakdownAccordion = renderAccordion('Full Stat Breakdown', buildFullCalcTable(), true, true);
  // The shared .accordion base class has overflow:hidden (used to clip
  // its rounded corners), which breaks position:sticky on anything
  // inside it — the sticky header needs its ancestor chain to actually
  // allow overflow for the browser to track it against the real
  // viewport. Scoped to just this one accordion instance rather than
  // touching the shared class, since every other accordion in the app
  // still relies on the clipping behavior.
  fullBreakdownAccordion.classList.add('calc-breakdown-accordion');
  wrap.appendChild(fullBreakdownAccordion);

  return wrap;
}

function formatBigNumber(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function renderStatCard(label, value, caption, highlight, effPct) {
  const children = [
    el('div', { class: 'calc-stat-card-label' }, label),
    el('div', { class: 'calc-stat-card-value' + (highlight ? ' highlight' : '') }, value),
  ];
  if (caption) children.push(el('div', { class: 'calc-stat-card-caption' }, caption));
  if (typeof effPct === 'number') {
    children.push(el('div', { class: 'calc-stat-card-bar' },
      el('div', { class: 'calc-stat-card-bar-fill', style: `width:${Math.min(effPct / 85 * 100, 100)}%` })));
  }
  return el('div', { class: 'calc-stat-card' }, children);
}


function syncTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  if (topbar) document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
}
syncTopbarHeight();
window.addEventListener('resize', syncTopbarHeight);

const backToTopBtn = document.getElementById('back-to-top');
backToTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  const delta = y - lastScrollY;

  const select = document.querySelector('.mobile-section-select');
  if (select) {
    if (y < 80 || delta < -4) {
      select.classList.remove('select-hidden');
    } else if (delta > 4) {
      select.classList.add('select-hidden');
    }
  }

  backToTopBtn.classList.toggle('visible', y > 400 && !selectMode.relics && !selectMode.collectibles);
  lastScrollY = y;
}, { passive: true });

/* ============================================================
   Light / dark theme toggle — persisted across sessions
   ============================================================ */
const THEME_KEY = 'capydex_theme_v1';
const themeToggleBtn = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'light' ? '☀' : '☾';
}

(function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
  applyTheme(saved === 'light' ? 'light' : 'dark');
})();

themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
});

/* ============================================================
   Init
   ============================================================ */
render();
