/**
 * app.js
 * Wires user interaction to the data layer (TaskManager) and the render
 * layer (UI). Owns transient view state: current filter, category, sort,
 * search term, and which task (if any) is being edited.
 */

(() => {
  const manager = new TaskManager();
  const ui = new UI();

  const prefs = Storage.getPrefs();
  const state = {
    filter: prefs.filter || 'all',
    category: prefs.category || null,
    sort: prefs.sort || 'newest',
    search: '',
    editingId: null,   // task id currently loaded in the modal (edit/view)
    pendingDeleteId: null,
  };

  const FILTER_TITLES = {
    all: 'All Tasks',
    active: 'Active Tasks',
    completed: 'Completed Tasks',
    high: 'High Priority',
    today: 'Due Today',
    overdue: 'Overdue Tasks',
  };

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------
  function init() {
    initTheme();
    ui.populateCategorySelect(CATEGORIES);
    ui.dom.sortSelect ? null : null;
    document.getElementById('sortSelect').value = state.sort;
    bindEvents();
    render();
    setTimeout(() => ui.hideLoadScreen(), 450);
  }

  function persistPrefs() {
    Storage.setPrefs({ filter: state.filter, category: state.category, sort: state.sort });
  }

  // -----------------------------------------------------------------------
  // Rendering (single source of truth: re-derive from manager + state)
  // -----------------------------------------------------------------------
  function render() {
    const stats = manager.getStats();
    const counts = manager.getCategoryCounts();

    ui.renderStats(stats);
    ui.renderCategories(CATEGORIES, counts, state.category);
    ui.setActiveFilter(state.category ? null : state.filter);
    if (state.category) ui.setActiveCategory(state.category);

    let list = manager.applyFilter(manager.getAll(), state.filter, state.category, state.search);
    list = manager.applySort(list, state.sort);

    const activeCategoryName = state.category ? TaskManager.getCategory(state.category).name : null;
    const title = activeCategoryName || FILTER_TITLES[state.filter] || 'All Tasks';

    ui.renderTaskList(list, { viewTitle: title, searchActive: !!state.search });
  }

  // -----------------------------------------------------------------------
  // Theme
  // -----------------------------------------------------------------------
  function initTheme() {
    const saved = Storage.getTheme();
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
    Storage.setTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // -----------------------------------------------------------------------
  // Task form (create / edit) submission
  // -----------------------------------------------------------------------
  function openCreateModal() {
    state.editingId = null;
    ui.openTaskModal({ mode: 'create', task: null, categories: CATEGORIES });
  }

  function openViewModal(id) {
    const task = manager.getById(id);
    if (!task) return;
    state.editingId = id;
    ui.openTaskModal({ mode: 'view', task, categories: CATEGORIES });
  }

  function openEditModal(id) {
    const task = manager.getById(id);
    if (!task) return;
    state.editingId = id;
    ui.openTaskModal({ mode: 'edit', task, categories: CATEGORIES });
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    const title = Utils.cleanText(ui.dom.taskTitle.value);

    if (!title) {
      ui.showTitleError('Give the task a title.');
      ui.dom.taskTitle.focus();
      return;
    }
    if (title.length > 120) {
      ui.showTitleError('Keep titles under 120 characters.');
      return;
    }
    if (manager.isDuplicateTitle(title, state.editingId)) {
      ui.showTitleError('A task with this title already exists.');
      return;
    }
    ui.clearTitleError();

    const dueDateValue = ui.dom.taskDueDate.value || null;
    if (dueDateValue) {
      const parsed = new Date(dueDateValue);
      if (Number.isNaN(parsed.getTime())) {
        ui.toast('That due date looks invalid.', 'error');
        return;
      }
    }

    const payload = {
      title,
      description: Utils.cleanText(ui.dom.taskDescription.value),
      priority: ui.getSelectedPriority(),
      category: ui.dom.taskCategory.value,
      dueDate: dueDateValue,
      tags: ui.getPendingTags(),
    };

    if (state.editingId) {
      manager.updateTask(state.editingId, payload);
      ui.toast('Task updated', 'success');
    } else {
      manager.createTask(payload);
      ui.toast('Task added successfully', 'success');
    }

    state.editingId = null;
    ui.closeTaskModal();
    render();
  }

  // -----------------------------------------------------------------------
  // Task list actions (event delegation)
  // -----------------------------------------------------------------------
  function handleTaskListClick(e) {
    const actionBtn = e.target.closest('[data-action]');
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;

    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      if (action === 'toggle') return handleToggle(id);
      if (action === 'edit') return openEditModal(id);
      if (action === 'duplicate') return handleDuplicate(id);
      if (action === 'delete') return handleDeleteRequest(id);
      return;
    }
    openViewModal(id);
  }

  function handleTaskListKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.task-card');
    if (!card || e.target.closest('[data-action]')) return;
    e.preventDefault();
    openViewModal(card.dataset.id);
  }

  function handleToggle(id) {
    const task = manager.toggleComplete(id);
    if (!task) return;
    ui.toast(task.completed ? 'Task completed' : 'Task marked active', 'success');
    render();
  }

  function handleDuplicate(id) {
    const copy = manager.duplicateTask(id);
    if (!copy) return;
    ui.toast('Task duplicated', 'success');
    render();
  }

  async function handleDeleteRequest(id) {
    const task = manager.getById(id);
    if (!task) return;
    const confirmed = await ui.confirmDialog({
      title: 'Delete this task?',
      text: `"${task.title}" will be permanently removed. This can't be undone.`,
      acceptLabel: 'Delete',
    });
    if (!confirmed) return;

    ui.removeTaskCardAnimated(id, () => {
      manager.deleteTask(id);
      ui.toast('Task deleted', 'success');
      render();
    });
  }

  // -----------------------------------------------------------------------
  // Filters, sorting, search
  // -----------------------------------------------------------------------
  function setFilter(filterKey) {
    state.filter = filterKey;
    state.category = null;
    persistPrefs();
    render();
  }

  function setCategory(categoryId) {
    state.category = state.category === categoryId ? null : categoryId;
    if (state.category) state.filter = 'all';
    persistPrefs();
    render();
  }

  function setSort(sortKey) {
    state.sort = sortKey;
    persistPrefs();
    render();
  }

  const handleSearchInput = Utils.debounce((value) => {
    state.search = value;
    render();
  }, 180);

  // -----------------------------------------------------------------------
  // Event binding
  // -----------------------------------------------------------------------
  function bindEvents() {
    // Header
    document.getElementById('openAddTask').addEventListener('click', openCreateModal);
    document.getElementById('emptyAddTask').addEventListener('click', openCreateModal);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    searchInput.addEventListener('input', (e) => {
      searchClear.hidden = !e.target.value;
      handleSearchInput(e.target.value);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.hidden = true;
      state.search = '';
      render();
      searchInput.focus();
    });

    // Sidebar filters
    document.getElementById('filterList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      setFilter(btn.dataset.filter);
      ui.toggleSidebar(false);
    });
    document.getElementById('categoryList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      setCategory(btn.dataset.category);
      ui.toggleSidebar(false);
    });

    // Sort
    document.getElementById('sortSelect').addEventListener('change', (e) => setSort(e.target.value));

    // Task list delegation
    ui.dom.taskList.addEventListener('click', handleTaskListClick);
    ui.dom.taskList.addEventListener('keydown', handleTaskListKeydown);

    // Task form
    ui.dom.taskForm.addEventListener('submit', handleFormSubmit);
    document.getElementById('cancelTaskForm').addEventListener('click', () => { state.editingId = null; ui.closeTaskModal(); });
    document.getElementById('closeTaskModal').addEventListener('click', () => { state.editingId = null; ui.closeTaskModal(); });
    document.getElementById('editFromView').addEventListener('click', () => {
      const task = manager.getById(state.editingId);
      ui.switchModalToEditMode();
    });
    ui.dom.taskModalOverlay.addEventListener('click', (e) => {
      if (e.target === ui.dom.taskModalOverlay) { state.editingId = null; ui.closeTaskModal(); }
    });

    // Priority selector
    ui.dom.prioritySelect.addEventListener('click', (e) => {
      const btn = e.target.closest('.priority-opt');
      if (!btn || btn.disabled) return;
      ui._setPriority(btn.dataset.priority);
    });

    // Tag input
    ui.dom.taskTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        ui.addTag(ui.dom.taskTagInput.value);
        ui.dom.taskTagInput.value = '';
      }
    });
    ui.dom.tagChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (!btn) return;
      ui.removeTag(btn.dataset.tag);
    });

    // Confirm dialog
    document.getElementById('confirmAccept').addEventListener('click', () => ui.resolveConfirm(true));
    document.getElementById('confirmCancel').addEventListener('click', () => ui.resolveConfirm(false));
    ui.dom.confirmOverlay.addEventListener('click', (e) => {
      if (e.target === ui.dom.confirmOverlay) ui.resolveConfirm(false);
    });

    // Mobile sidebar
    document.getElementById('mobileFilterBtn').addEventListener('click', () => ui.toggleSidebar());

    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
  }

  function handleGlobalKeydown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (!ui.dom.confirmOverlay.hidden) return ui.resolveConfirm(false);
      if (!ui.dom.taskModalOverlay.hidden) { state.editingId = null; return ui.closeTaskModal(); }
      if (ui.dom.sidebar.classList.contains('is-open')) return ui.toggleSidebar(false);
      return;
    }

    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
      return;
    }

    if (e.key === 'Enter' && isTyping && e.target.id === 'taskTitle') {
      // Let form submit naturally unless inside the description textarea.
      return;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
