/* ========== StickyFlow App ========== */
const COLORS = ['green', 'blue', 'pink', 'peach', 'lavender', 'yellow', 'mint', 'sky', 'coral', 'rose', 'indigo', 'orange'];
const ZOOM_KEY = 'stickyflow.zoom';
const MIN_ZOOM = 0.5, MAX_ZOOM = 2.0, ZOOM_STEP = 0.1;
let zoom = parseFloat(localStorage.getItem(ZOOM_KEY)) || 1;

let CURRENT_USER_ID = 'guest';
function storageKey() { return `stickyflow.notes.${CURRENT_USER_ID}`; }

let convexUnsub = null;
let suppressSubscribe = false;

function flashConvexError(op, e) {
  const msg = String(e && e.message || e);
  console.warn(`[StickyFlow] Convex ${op} failed:`, e);
  const toast = document.getElementById('stickyflowToast');
  if (toast) {
    toast.textContent = `Convex ${op} failed: ${msg.slice(0, 200)}`;
    toast.classList.add('show');
    clearTimeout(flashConvexError._t);
    flashConvexError._t = setTimeout(() => toast.classList.remove('show'), 8000);
  }
}

async function cloudUpsert(note) {
  if (!window.stickyflowDB || !window.clerk || !window.clerk.user) return;
  try {
    setSyncStatus('saving');
    await window.stickyflowDB.upsert(note);
    setSyncStatus('synced');
  } catch (e) {
    flashConvexError('upsert', e);
    setSyncStatus('error');
  }
}
async function cloudRemove(clientId) {
  if (!window.stickyflowDB || !window.clerk || !window.clerk.user) return;
  try {
    setSyncStatus('saving');
    await window.stickyflowDB.remove(clientId);
    setSyncStatus('synced');
  } catch (e) {
    flashConvexError('remove', e);
    setSyncStatus('error');
  }
}
function setSyncStatus(state) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    saving: '· saving…',
    synced: '· ✓ synced to cloud',
    error:  '· ⚠ sync error (local only)',
    local:  '· local only',
  };
  el.textContent = map[state] || '';
  el.dataset.state = state;
}

/** @type {Array<Note>} */
let notes = [];
let currentFilter = 'all';
let searchQuery = '';
let editingId = null;
let modalMode = 'note';
let selectedColor = 'yellow';
let draftTasks = [];
let copiedNote = null;

/* ---------- Storage ---------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(storageKey());
    notes = raw ? JSON.parse(raw) : seedDemo();
  } catch { notes = seedDemo(); }
}
function saveLocal() {
  localStorage.setItem(storageKey(), JSON.stringify(notes));
}
function save() {
  saveLocal();
}

function seedDemo() {
  const now = Date.now();
  return [
    { id: uid(), type: 'note', color: 'green', title: 'Welcome!',
      content: 'Click "+ New Note" to capture an idea or "+ New To-Do" for a task list.\n\nHover a note to lift it.',
      createdAt: now, order: now },
    { id: uid(), type: 'todo', color: 'pink', title: 'Daily Goals',
      tasks: [
        { text: 'Drink water', done: true },
        { text: 'Read 10 pages', done: false },
        { text: 'Ship a feature', done: false },
      ],
      createdAt: now + 1, order: now + 1 },
    { id: uid(), type: 'note', color: 'blue', title: 'Meeting Notes',
      content: 'Discuss Q4 roadmap, design review on Friday.',
      createdAt: now + 2, order: now + 2 },
  ];
}

/* ---------- Utils ---------- */
function uid() { return Math.random().toString(36).slice(2, 10); }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ---------- Stable note number ---------- */
/* Number based on createdAt — never changes when notes are dragged/reordered */
function getNoteNumber(id) {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  const idx = sorted.findIndex(n => n.id === id);
  return String(idx + 1).padStart(2, '0');
}

function getStableRotIdx(id) {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  return sorted.findIndex(n => n.id === id);
}

/* ---------- Drag & Drop ---------- */
let dragSrcId = null;
let dragOverId = null;

function onDragStart(e, id) {
  dragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(() => {
    const el = track.querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function onDragOver(e, id) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (id === dragSrcId) return;
  if (id !== dragOverId) {
    if (dragOverId) {
      const prev = track.querySelector(`[data-id="${dragOverId}"]`);
      if (prev) prev.classList.remove('drag-over');
    }
    dragOverId = id;
    const el = track.querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add('drag-over');
  }
}

function onDragLeave(e, id) {
  const el = track.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.remove('drag-over');
  if (dragOverId === id) dragOverId = null;
}

function onDrop(e, targetId) {
  e.preventDefault();
  if (!dragSrcId || dragSrcId === targetId) return;

  const srcIdx = notes.findIndex(n => n.id === dragSrcId);
  const tgtIdx = notes.findIndex(n => n.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [moved] = notes.splice(srcIdx, 1);
  notes.splice(tgtIdx, 0, moved);

  // Update order for cloud sync — do NOT touch createdAt (keeps number stable)
  const now = Date.now();
  notes.forEach((n, i) => { n.order = now - i; });

  save();
  render();
  notes.forEach(n => cloudUpsert(n));
}

function onDragEnd(e, id) {
  dragSrcId = null;
  dragOverId = null;
  track.querySelectorAll('.dragging, .drag-over').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
  });
}

/* ---------- Render ---------- */
const track = document.getElementById('notesTrack');
const emptyState = document.getElementById('emptyState');

function render() {
  const q = searchQuery.trim().toLowerCase();
  const filtered = notes.filter(n => {
    if (currentFilter !== 'all' && n.type !== currentFilter) return false;
    if (!q) return true;
    const hay = [n.title, n.content, ...(n.tasks || []).map(t => t.text)].join(' ').toLowerCase();
    return hay.includes(q);
  });

  /* Pinned notes always on top */
  filtered.sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.order || 0) - (a.order || 0);
  });

  track.innerHTML = '';
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    track.style.display = 'none';
  } else {
    emptyState.classList.add('hidden');
    track.style.display = '';
    filtered.forEach((n) => track.appendChild(renderNote(n)));
  }
}

function renderNote(n) {
  const el = document.createElement('article');

  // Rotation & number stable — based on createdAt, not display position
  const stableIdx = getStableRotIdx(n.id);
  const rot = `rot-${(stableIdx % 4) + 1}`;
  el.className = `note c-${n.color} ${rot} ${n.pinned ? 'pinned' : ''}`;
  el.dataset.id = n.id;

  // Only allow drag from the drag-handle so text selection works normally
  el.draggable = false;
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.drag-handle')) el.draggable = true;
  });
  el.addEventListener('mouseup', () => { el.draggable = false; });
  el.addEventListener('dragstart',  (e) => onDragStart(e, n.id));
  el.addEventListener('dragover',   (e) => onDragOver(e, n.id));
  el.addEventListener('dragleave',  (e) => onDragLeave(e, n.id));
  el.addEventListener('drop',       (e) => onDrop(e, n.id));
  el.addEventListener('dragend',    (e) => { onDragEnd(e, n.id); el.draggable = false; });

  const indexLabel = getNoteNumber(n.id);

  let bodyHtml = '';

  if (n.type === 'todo') {
    const tasks = n.tasks || [];
    const doneCount = tasks.filter(t => t.done).length;
    bodyHtml = `
      <ul class="note-tasks">
        ${tasks.map((t, ti) => `
          <li>
            <input type="checkbox" data-task="${ti}" ${t.done ? 'checked' : ''}>
            <span class="${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
          </li>
        `).join('') || '<li style="opacity:.6">No tasks yet.</li>'}
      </ul>
      <div class="note-actions">
        <span class="task-progress">${doneCount}/${tasks.length} done</span>
        <span>
          <button class="icon-btn" data-action="edit">Edit</button>
          <button class="icon-btn copy" data-action="copy">Copy</button>
          <button class="icon-btn ${n.pinned ? 'unpin' : 'pin'}" data-action="pin">${n.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </span>
      </div>
    `;
  } else {
    bodyHtml = `
      <div class="note-content">${escapeHtml(n.content)}</div>
      <div class="note-actions">
        <span class="meta">${fmtDate(n.createdAt)}</span>
        <span>
          <button class="icon-btn" data-action="edit">Edit</button>
          <button class="icon-btn copy" data-action="copy">Copy</button>
          <button class="icon-btn ${n.pinned ? 'unpin' : 'pin'}" data-action="pin">${n.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </span>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="pushpin"></div>
    <div class="drag-handle" title="Drag to reorder">⠿</div>
    <div class="note-index">${indexLabel}</div>
    <h3 class="note-title copyable-text" title="Click to copy title">${escapeHtml(n.title || 'Untitled')}</h3>
    ${bodyHtml}
  `;

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'edit') openModal(n.type, n);
      if (action === 'copy') copyNote(n.id);
      if (action === 'pin') togglePin(n.id);
      if (action === 'delete') deleteNote(n.id);
    });
  });
  el.querySelectorAll('input[type=checkbox][data-task]').forEach(cb => {
    cb.addEventListener('change', () => {
      const ti = Number(cb.dataset.task);
      n.tasks[ti].done = cb.checked;
      save();
      render();
      cloudUpsert(n);
    });
  });

  /* Click-to-copy on title */
  const titleEl = el.querySelector('.note-title');
  if (titleEl) {
    titleEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(n.title || '');
        flashToast('Title copied!');
      } catch (err) { console.warn('Copy failed:', err); }
    });
  }

  /* Click-to-copy on note content */
  const contentEl = el.querySelector('.note-content');
  if (contentEl) {
    contentEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(n.content || '');
        flashToast('Content copied!');
      } catch (err) { console.warn('Copy failed:', err); }
    });
  }

  return el;
}

function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== id);
  save();
  render();
  cloudRemove(id);
}

/* ---------- Copy / Paste ---------- */
function copyNote(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  copiedNote = JSON.parse(JSON.stringify(n));
  delete copiedNote.id;
  delete copiedNote.createdAt;
  delete copiedNote.order;

  flashToast('Note copied! Click Paste to duplicate.', 2500);
}

function pasteNote() {
  if (!copiedNote) {
    flashToast('Nothing to paste. Copy a note first.', 2000);
    return;
  }
  const now = Date.now();
  const base = {
    id: uid(),
    type: copiedNote.type,
    color: copiedNote.color,
    title: copiedNote.title,
    content: copiedNote.content,
    tasks: copiedNote.tasks ? JSON.parse(JSON.stringify(copiedNote.tasks)) : undefined,
    createdAt: now,
    order: now,
  };
  notes.unshift(base);
  save();
  render();
  cloudUpsert(base);

  flashToast('Note pasted!', 2000);
}

function togglePin(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  n.pinned = !n.pinned;
  if (n.pinned) n.order = Date.now() + 1e9;
  save();
  render();
  cloudUpsert(n);
}

function flashToast(msg, ms = 1500) {
  const toast = document.getElementById('stickyflowToast');
  if (!toast) {
    console.warn('[StickyFlow] toast element not found');
    return;
  }
  toast.textContent = msg;
  // Force re-trigger animation
  toast.classList.remove('show');
  void toast.offsetWidth; // reflow
  toast.classList.add('show');
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => toast.classList.remove('show'), ms);
  console.log('[StickyFlow] toast:', msg);
}

/* ---------- Modal ---------- */
const modal = document.getElementById('modal');
const fTitle = document.getElementById('fTitle');
const fContent = document.getElementById('fContent');
const noteBody = document.getElementById('noteBody');
const todoBody = document.getElementById('todoBody');
const taskList = document.getElementById('taskList');
const newTaskInput = document.getElementById('newTaskInput');
const colorPicker = document.getElementById('colorPicker');
const modalTitle = document.getElementById('modalTitle');

function openModal(mode, existing) {
  modalMode = mode;
  editingId = existing ? existing.id : null;
  modalTitle.textContent = existing
    ? (mode === 'todo' ? 'Edit To-Do' : 'Edit Note')
    : (mode === 'todo' ? 'New To-Do' : 'New Note');

  fTitle.value = existing ? (existing.title || '') : '';
  fContent.value = existing && mode === 'note' ? (existing.content || '') : '';
  draftTasks = existing && mode === 'todo'
    ? JSON.parse(JSON.stringify(existing.tasks || []))
    : [];
  selectedColor = existing ? existing.color : randomColor();

  noteBody.classList.toggle('hidden', mode !== 'note');
  todoBody.classList.toggle('hidden', mode !== 'todo');

  renderColorPicker();
  renderDraftTasks();
  modal.classList.remove('hidden');
  setTimeout(() => fTitle.focus(), 50);
}

function closeModal() {
  modal.classList.add('hidden');
  editingId = null;
  draftTasks = [];
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function renderColorPicker() {
  colorPicker.innerHTML = COLORS.map(c =>
    `<div class="color-swatch sw-${c} ${c === selectedColor ? 'selected' : ''}" data-color="${c}" title="${c}"></div>`
  ).join('');
  colorPicker.querySelectorAll('.color-swatch').forEach(el => {
    el.addEventListener('click', () => {
      selectedColor = el.dataset.color;
      renderColorPicker();
    });
  });
}

function renderDraftTasks() {
  taskList.innerHTML = draftTasks.map((t, i) => `
    <li>
      <input type="checkbox" ${t.done ? 'checked' : ''} data-i="${i}">
      <input type="text" value="${escapeHtml(t.text)}" data-i="${i}" data-field="text">
      <button class="remove-task" data-i="${i}" aria-label="Remove">×</button>
    </li>
  `).join('');
  taskList.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      draftTasks[Number(cb.dataset.i)].done = cb.checked;
    });
  });
  taskList.querySelectorAll('input[data-field=text]').forEach(inp => {
    inp.addEventListener('input', () => {
      draftTasks[Number(inp.dataset.i)].text = inp.value;
    });
  });
  taskList.querySelectorAll('.remove-task').forEach(btn => {
    btn.addEventListener('click', () => {
      draftTasks.splice(Number(btn.dataset.i), 1);
      renderDraftTasks();
    });
  });
}

function addDraftTask() {
  const v = newTaskInput.value.trim();
  if (!v) return;
  draftTasks.push({ text: v, done: false });
  newTaskInput.value = '';
  renderDraftTasks();
  newTaskInput.focus();
}

function saveFromModal() {
  const title = fTitle.value.trim();
  if (!title) { fTitle.focus(); fTitle.style.borderColor = '#ff5e9c'; return; }

  let saved;
  if (editingId) {
    const n = notes.find(x => x.id === editingId);
    if (!n) return;
    n.title = title;
    n.color = selectedColor;
    if (modalMode === 'note') n.content = fContent.value;
    else n.tasks = draftTasks.filter(t => t.text.trim());
    saved = n;
  } else {
    const base = {
      id: uid(), type: modalMode, color: selectedColor,
      title, createdAt: Date.now(), order: Date.now(),
    };
    if (modalMode === 'note') base.content = fContent.value;
    else base.tasks = draftTasks.filter(t => t.text.trim());
    notes.unshift(base);
    saved = base;
  }
  save();
  render();
  closeModal();
  cloudUpsert(saved);
}

/* ---------- Wire up ---------- */
document.getElementById('addNoteBtn').addEventListener('click', () => openModal('note'));
document.getElementById('addTodoBtn').addEventListener('click', () => openModal('todo'));
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('saveBtn').addEventListener('click', saveFromModal);
document.getElementById('addTaskBtn').addEventListener('click', addDraftTask);
newTaskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftTask(); } });
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    render();
  });
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  render();
});

document.getElementById('scrollLeft').addEventListener('click', () => {
  track.scrollBy({ left: -340, behavior: 'smooth' });
});
document.getElementById('scrollRight').addEventListener('click', () => {
  track.scrollBy({ left: 340, behavior: 'smooth' });
});

track.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }
  // Normal wheel scrolls vertically (up/down) naturally.
  // Horizontal scroll (left/right) only via manual arrow buttons or drag-to-scroll.
}, { passive: false });

/* ---------- Drag-to-scroll (horizontal) ---------- */
let isTrackDragging = false;
let trackDragStartX = 0;
let trackScrollStart = 0;

track.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.note') || e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
  isTrackDragging = true;
  track.classList.add('dragging-track');
  trackDragStartX = e.pageX;
  trackScrollStart = track.scrollLeft;
});

document.addEventListener('mousemove', (e) => {
  if (!isTrackDragging) return;
  e.preventDefault();
  const dx = e.pageX - trackDragStartX;
  track.scrollLeft = trackScrollStart - dx;
});

document.addEventListener('mouseup', () => {
  if (!isTrackDragging) return;
  isTrackDragging = false;
  track.classList.remove('dragging-track');
});

/* ---------- Zoom ---------- */
function setZoom(v) {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(v * 100) / 100));

  // Genuine reflow zoom: change note width & gap so cards fill free space
  const trackEl = document.getElementById('notesTrack');
  if (trackEl) {
    const baseW = 268;
    const baseGapX = 32;
    const baseGapY = 48;
    trackEl.style.setProperty('--note-width', `${Math.round(baseW * zoom)}px`);
    trackEl.style.setProperty('--gap-x', `${Math.round(baseGapX * zoom)}px`);
    trackEl.style.setProperty('--gap-y', `${Math.round(baseGapY * zoom)}px`);
    trackEl.style.setProperty('--note-base-font', `${Math.max(10, Math.round(14 * zoom))}px`);
  }

  const z = document.getElementById('zoomLevel');
  if (z) z.textContent = Math.round(zoom * 100) + '%';
  localStorage.setItem(ZOOM_KEY, String(zoom));
}

document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
document.getElementById('zoomReset').addEventListener('click', () => setZoom(1));

/* ---------- Paste button ---------- */
const pasteBtn = document.getElementById('pasteBtn');
if (pasteBtn) pasteBtn.addEventListener('click', pasteNote);

/* ---------- Copy selected text inside note (Google Keep style) ---------- */
let selectionCopyBtn = null;

function getSelectionCopyBtn() {
  if (!selectionCopyBtn) {
    selectionCopyBtn = document.createElement('button');
    selectionCopyBtn.className = 'sf-selection-copy';
    selectionCopyBtn.textContent = 'Copy';
    selectionCopyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) {
        try {
          await navigator.clipboard.writeText(sel.toString());
          selectionCopyBtn.textContent = 'Copied!';
          setTimeout(() => {
            if (selectionCopyBtn) selectionCopyBtn.textContent = 'Copy';
          }, 1200);
        } catch (err) {
          console.warn('Clipboard write failed:', err);
        }
      }
      hideSelectionCopyBtn();
    });
    document.body.appendChild(selectionCopyBtn);
  }
  return selectionCopyBtn;
}

function showSelectionCopyBtn(rect) {
  const btn = getSelectionCopyBtn();
  btn.style.display = 'block';
  btn.style.opacity = '1';
  const offset = 8;
  btn.style.left = `${window.scrollX + rect.left + (rect.width / 2) - (btn.offsetWidth / 2)}px`;
  btn.style.top = `${window.scrollY + rect.top - btn.offsetHeight - offset}px`;
}

function hideSelectionCopyBtn() {
  if (selectionCopyBtn) {
    selectionCopyBtn.style.opacity = '0';
    setTimeout(() => { if (selectionCopyBtn) selectionCopyBtn.style.display = 'none'; }, 150);
  }
}

document.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const noteEl = container.nodeType === 1 ? container.closest('.note') : container.parentElement?.closest('.note');
    if (noteEl) {
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        showSelectionCopyBtn(rect);
        return;
      }
    }
  }
  hideSelectionCopyBtn();
});

document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.sf-selection-copy')) return;
  hideSelectionCopyBtn();
});

document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + ZOOM_STEP); }
  else if (e.key === '-') { e.preventDefault(); setZoom(zoom - ZOOM_STEP); }
  else if (e.key === '0') { e.preventDefault(); setZoom(1); }
  else if (e.key === 'v') {
    // Only paste note when NOT in an editable field — allow normal Ctrl+V text paste in inputs
    const tag = document.activeElement?.tagName;
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
    if (!isEditable) {
      e.preventDefault();
      pasteNote();
    }
  }
});

/* ---------- Init ---------- */
let migrationAttempted = false;

function bootForUser(user) {
  CURRENT_USER_ID = user ? user.id : 'guest';
  loadLocal();
  render();
  setZoom(zoom);

  if (convexUnsub) { convexUnsub(); convexUnsub = null; }

  if (user && window.stickyflowDB) {
    subscribeConvex();
  } else {
    setSyncStatus('local');
  }
}

async function subscribeConvex() {
  let firstResult = true;
  convexUnsub = window.stickyflowDB.subscribe(async (cloudNotes) => {
    if (firstResult) {
      firstResult = false;
      if ((!cloudNotes || cloudNotes.length === 0) && notes.length > 0 && !migrationAttempted) {
        migrationAttempted = true;
        try {
          setSyncStatus('saving');
          const res = await window.stickyflowDB.migrateFromLocal(notes);
          console.info(`[StickyFlow] migrated local → cloud:`, res);
        } catch (e) {
          console.warn('Migration failed:', e);
          setSyncStatus('error');
        }
        return;
      }
    }

    notes = (cloudNotes || []).map((c) => ({
      id: c.clientId,
      type: c.type,
      color: c.color,
      title: c.title,
      content: c.content,
      tasks: c.tasks,
      pinned: c.pinned,
      createdAt: c.createdAt,
      order: c.order,
    })).sort((a, b) => (b.order || 0) - (a.order || 0));
    saveLocal();
    setSyncStatus('synced');
    render();
  });
}

window.addEventListener('stickyflow:user', (e) => bootForUser(e.detail));

// If Clerk already loaded before this script, boot immediately
if (window.clerk && window.clerk.user) {
  bootForUser(window.clerk.user);
} else {
  setTimeout(() => {
    if (!window.clerk || !window.clerk.user) {
      const appVisible = !document.getElementById('app').classList.contains('hidden');
      if (appVisible) bootForUser(null);
    }
  }, 1500);
}