/* ========== StickyFlow App ========== */
const COLORS = ['green', 'blue', 'pink', 'peach', 'lavender', 'yellow', 'mint', 'sky', 'coral', 'rose', 'indigo', 'orange'];
const ZOOM_KEY = 'stickyflow.zoom';
const MIN_ZOOM = 0.5, MAX_ZOOM = 2.0, ZOOM_STEP = 0.1;
let zoom = parseFloat(localStorage.getItem(ZOOM_KEY)) || 1;

/* User-scoped storage key. Changes when Clerk user signs in/out. */
let CURRENT_USER_ID = 'guest';
function storageKey() { return `stickyflow.notes.${CURRENT_USER_ID}`; }

/* Cloud sync state (Convex) */
let convexUnsub = null;
let suppressSubscribe = false; // avoid re-render loops on our own writes

async function cloudUpsert(note) {
  if (!window.stickyflowDB || !window.clerk || !window.clerk.user) return;
  try {
    setSyncStatus('saving');
    await window.stickyflowDB.upsert(note);
    setSyncStatus('synced');
  } catch (e) {
    console.warn('Convex upsert failed:', e);
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
    console.warn('Convex remove failed:', e);
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
let modalMode = 'note'; // 'note' | 'todo'
let selectedColor = 'yellow';
let draftTasks = []; // [{text, done}]

/* ---------- Storage ---------- */
/* localStorage is an offline cache; Convex is source of truth when signed in. */
function loadLocal() {
  try {
    const raw = localStorage.getItem(storageKey());
    notes = raw ? JSON.parse(raw) : seedDemo();
  } catch { notes = seedDemo(); }
}
function saveLocal() {
  localStorage.setItem(storageKey(), JSON.stringify(notes));
}
/** Called after any mutation — persists locally and (if signed in) to Convex. */
function save() {
  saveLocal();
}

function seedDemo() {
  const now = Date.now();
  return [
    { id: uid(), type: 'note', color: 'green', title: 'Welcome!',
      content: 'Click "+ New Note" to capture an idea or "+ New To-Do" for a task list.\n\nHover a note to lift it.',
      createdAt: now },
    { id: uid(), type: 'todo', color: 'pink', title: 'Daily Goals',
      tasks: [
        { text: 'Drink water', done: true },
        { text: 'Read 10 pages', done: false },
        { text: 'Ship a feature', done: false },
      ],
      createdAt: now + 1 },
    { id: uid(), type: 'note', color: 'blue', title: 'Meeting Notes',
      content: 'Discuss Q4 roadmap, design review on Friday.',
      createdAt: now + 2 },
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

  track.innerHTML = '';
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    track.style.display = 'none';
  } else {
    emptyState.classList.add('hidden');
    track.style.display = '';
    filtered.forEach((n, i) => track.appendChild(renderNote(n, i)));
  }
}

function renderNote(n, idx) {
  const el = document.createElement('article');
  const rot = `rot-${(idx % 4) + 1}`;
  el.className = `note c-${n.color} ${rot}`;
  el.dataset.id = n.id;

  const indexLabel = String(idx + 1).padStart(2, '0');
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
          <button class="icon-btn danger" data-action="delete">Delete</button>
        </span>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="pushpin"></div>
    <div class="note-index">${indexLabel}</div>
    <h3 class="note-title">${escapeHtml(n.title || 'Untitled')}</h3>
    ${bodyHtml}
  `;

  // Events
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'edit') openModal(n.type, n);
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

  return el;
}

function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== id);
  save();
  render();
  cloudRemove(id);
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

/* Wheel: Ctrl = zoom, otherwise horizontal scroll */
track.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault();
    track.scrollLeft += e.deltaY;
  }
}, { passive: false });

/* ---------- Zoom ---------- */
function setZoom(v) {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(v * 100) / 100));
  track.style.transform = `scale(${zoom})`;
  track.style.transformOrigin = 'top left';
  const z = document.getElementById('zoomLevel');
  if (z) z.textContent = Math.round(zoom * 100) + '%';
  localStorage.setItem(ZOOM_KEY, String(zoom));
}

document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + ZOOM_STEP));
document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - ZOOM_STEP));
document.getElementById('zoomReset').addEventListener('click', () => setZoom(1));

/* Prevent browser page zoom on Ctrl+wheel over the app */
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive: false });

/* Keyboard zoom: Ctrl +/-/0 */
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + ZOOM_STEP); }
  else if (e.key === '-') { e.preventDefault(); setZoom(zoom - ZOOM_STEP); }
  else if (e.key === '0') { e.preventDefault(); setZoom(1); }
});

/* ---------- Init ---------- */
let migrationAttempted = false;

function bootForUser(user) {
  CURRENT_USER_ID = user ? user.id : 'guest';
  loadLocal();
  render();
  setZoom(zoom);

  // Tear down any previous subscription.
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
    // One-time migration: if cloud is empty on first load, push local notes up.
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
        return; // subscription will fire again with the inserted notes
      }
    }

    // Adopt cloud state as source of truth.
    notes = (cloudNotes || []).map((c) => ({
      id: c.clientId,
      type: c.type,
      color: c.color,
      title: c.title,
      content: c.content,
      tasks: c.tasks,
      createdAt: c.createdAt,
      order: c.order,
    })).sort((a, b) => (b.order || 0) - (a.order || 0));
    saveLocal();
    setSyncStatus('synced');
    render();
  });
}

/* Wait for Clerk to tell us which user signed in; fall back to guest. */
window.addEventListener('stickyflow:user', (e) => bootForUser(e.detail));

/* If Clerk isn't configured / loads later, boot as guest after a short grace. */
setTimeout(() => {
  if (!window.clerk || !window.clerk.user) {
    const appVisible = !document.getElementById('app').classList.contains('hidden');
    if (appVisible) bootForUser(null);
  }
}, 1500);
