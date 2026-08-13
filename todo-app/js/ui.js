/**
 * ui.js
 * Everything that touches the DOM: rendering task cards, the sidebar,
 * stats, modals, and toast notifications. Reads data via TaskManager
 * but never mutates it directly — app.js wires user actions to state changes.
 */

class UI {
  constructor() {
    this.dom = {
      loadScreen: document.getElementById('loadScreen'),
      taskList: document.getElementById('taskList'),
      emptyState: document.getElementById('emptyState'),
      emptyTitle: document.getElementById('emptyTitle'),
      emptyText: document.getElementById('emptyText'),
      viewTitle: document.getElementById('viewTitle'),
      viewSubtitle: document.getElementById('viewSubtitle'),
      categoryList: document.getElementById('categoryList'),
      filterList: document.getElementById('filterList'),
      ringFill: document.getElementById('ringFill'),
      ringValue: document.getElementById('ringValue'),
      progressCaption: document.getElementById('progressCaption'),
      toastStack: document.getElementById('toastStack'),
      sidebar: document.getElementById('sidebar'),

      // Task modal
      taskModalOverlay: document.getElementById('taskModalOverlay'),
      taskModalTitle: document.getElementById('taskModalTitle'),
      taskForm: document.getElementById('taskForm'),
      taskId: document.getElementById('taskId'),
      taskTitle: document.getElementById('taskTitle'),
      titleError: document.getElementById('titleError'),
      taskDescription: document.getElementById('taskDescription'),
      taskCategory: document.getElementById('taskCategory'),
      taskDueDate: document.getElementById('taskDueDate'),
      prioritySelect: document.getElementById('prioritySelect'),
      tagChips: document.getElementById('tagChips'),
      taskTagInput: document.getElementById('taskTagInput'),
      formMeta: document.getElementById('formMeta'),
      metaCreated: document.getElementById('metaCreated'),
      metaStatus: document.getElementById('metaStatus'),

      // Confirm modal
      confirmOverlay: document.getElementById('confirmOverlay'),
      confirmTitle: document.getElementById('confirmTitle'),
      confirmText: document.getElementById('confirmText'),
      confirmAccept: document.getElementById('confirmAccept'),
      confirmCancel: document.getElementById('confirmCancel'),
    };

    this._ringCircumference = 2 * Math.PI * 52;
    this.dom.ringFill.style.strokeDasharray = `${this._ringCircumference}`;
    this._pendingTags = [];
    this._confirmResolver = null;
  }

  // ---------------------------------------------------------------------
  // Loading screen
  // ---------------------------------------------------------------------
  hideLoadScreen() {
    this.dom.loadScreen.classList.add('is-hidden');
    setTimeout(() => this.dom.loadScreen.remove(), 600);
  }

  // ---------------------------------------------------------------------
  // Category sidebar
  // ---------------------------------------------------------------------
  renderCategories(categories, counts, activeCategoryId) {
    this.dom.categoryList.innerHTML = categories.map((c) => `
      <li>
        <button class="filter-item ${activeCategoryId === c.id ? 'is-active' : ''}" data-category="${c.id}">
          <span class="cat-dot" style="background:${c.color}"></span>
          <span>${Utils.escapeHTML(c.name)}</span>
          <em class="count">${counts[c.id] || 0}</em>
        </button>
      </li>
    `).join('');
  }

  populateCategorySelect(categories) {
    this.dom.taskCategory.innerHTML = categories.map((c) =>
      `<option value="${c.id}">${Utils.escapeHTML(c.name)}</option>`
    ).join('');
  }

  setActiveFilter(filterKey) {
    this.dom.filterList.querySelectorAll('.filter-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === filterKey);
    });
    if (filterKey) {
      // Clear category highlighting when a view filter is chosen
      this.dom.categoryList.querySelectorAll('.filter-item').forEach((btn) => btn.classList.remove('is-active'));
    }
  }

  setActiveCategory(categoryId) {
    this.dom.categoryList.querySelectorAll('.filter-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.category === categoryId);
    });
    if (categoryId) {
      this.dom.filterList.querySelectorAll('.filter-item').forEach((btn) => btn.classList.remove('is-active'));
    }
  }

  updateFilterCounts(stats) {
    document.querySelector('[data-count="all"]').textContent = stats.total;
    document.querySelector('[data-count="active"]').textContent = stats.active;
    document.querySelector('[data-count="completed"]').textContent = stats.completed;
    document.querySelector('[data-count="high"]').textContent = stats.highPriority;
    document.querySelector('[data-count="today"]').textContent = stats.today;
    document.querySelector('[data-count="overdue"]').textContent = stats.overdue;
  }

  // ---------------------------------------------------------------------
  // Stats + progress ring
  // ---------------------------------------------------------------------
  renderStats(stats) {
    Utils.animateCounter(document.querySelector('[data-value="total"]'), stats.total);
    Utils.animateCounter(document.querySelector('[data-value="active"]'), stats.active);
    Utils.animateCounter(document.querySelector('[data-value="completed"]'), stats.completed);
    Utils.animateCounter(document.querySelector('[data-value="overdue"]'), stats.overdue);
    Utils.animateCounter(document.querySelector('[data-value="highPriority"]'), stats.highPriority);

    document.querySelectorAll('.stat-card').forEach((card) => {
      card.classList.remove('pulse');
      void card.offsetWidth; // restart animation
      card.classList.add('pulse');
    });

    const offset = this._ringCircumference * (1 - stats.completionRate / 100);
    this.dom.ringFill.style.strokeDashoffset = `${offset}`;
    this.dom.ringValue.textContent = `${stats.completionRate}%`;
    this.dom.progressCaption.textContent = `${stats.completed} of ${stats.total} tasks complete`;

    this.updateFilterCounts(stats);
  }

  // ---------------------------------------------------------------------
  // Task list
  // ---------------------------------------------------------------------
  renderTaskList(tasks, { viewTitle, searchActive } = {}) {
    this.dom.viewTitle.textContent = viewTitle || 'All Tasks';
    this.dom.viewSubtitle.textContent = `${tasks.length} ${tasks.length === 1 ? 'entry' : 'entries'}`;

    if (tasks.length === 0) {
      this.dom.taskList.innerHTML = '';
      this.dom.emptyState.hidden = false;
      if (searchActive) {
        this.dom.emptyTitle.textContent = 'No matches found';
        this.dom.emptyText.textContent = 'Try a different search term or clear your filters.';
      } else {
        this.dom.emptyTitle.textContent = 'No entries yet';
        this.dom.emptyText.textContent = 'This ledger is clean. Add your first task to get started.';
      }
      return;
    }

    this.dom.emptyState.hidden = true;
    this.dom.taskList.innerHTML = tasks.map((t, i) => this._taskCardHTML(t, i)).join('');
  }

  _taskCardHTML(task, index) {
    const category = TaskManager.getCategory(task.category);
    const overdue = !task.completed && Utils.isOverdue(task.dueDate);
    const dueToday = !task.completed && Utils.isToday(task.dueDate);

    const duePill = task.dueDate ? `
      <span class="pill pill-due ${overdue ? 'is-overdue' : ''} ${dueToday ? 'is-today' : ''}">
        <i class="fa-regular fa-calendar"></i>${Utils.escapeHTML(Utils.formatDueLabel(task.dueDate))}
      </span>` : '';

    const tagPills = task.tags.slice(0, 4).map((tag) =>
      `<span class="pill pill-tag">#${Utils.escapeHTML(tag)}</span>`
    ).join('');

    return `
      <article class="task-card ${task.completed ? 'is-completed' : ''}" data-id="${task.id}" data-priority="${task.priority}" style="animation-delay:${Math.min(index * 30, 300)}ms" tabindex="0" role="button" aria-label="Open task: ${Utils.escapeHTML(task.title)}">
        <button class="task-check" data-action="toggle" aria-label="${task.completed ? 'Mark incomplete' : 'Mark complete'}">
          <i class="fa-solid fa-check"></i>
        </button>
        <div class="task-body">
          <div class="task-title-row">
            <span class="task-title">${Utils.escapeHTML(task.title)}</span>
          </div>
          ${task.description ? `<p class="task-desc">${Utils.escapeHTML(task.description)}</p>` : ''}
          <div class="task-meta">
            <span class="pill pill-priority-${task.priority}"><i class="fa-solid fa-flag"></i>${task.priority}</span>
            <span class="pill pill-category" style="border-color:${category.color}30"><i class="fa-solid ${category.icon}" style="color:${category.color}"></i>${Utils.escapeHTML(category.name)}</span>
            ${duePill}
            ${tagPills}
          </div>
        </div>
        <div class="task-actions">
          <button class="icon-btn" data-action="duplicate" aria-label="Duplicate task"><i class="fa-regular fa-copy"></i></button>
          <button class="icon-btn" data-action="edit" aria-label="Edit task"><i class="fa-regular fa-pen-to-square"></i></button>
          <button class="icon-btn danger" data-action="delete" aria-label="Delete task"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </article>
    `;
  }

  removeTaskCardAnimated(id, onDone) {
    const card = this.dom.taskList.querySelector(`.task-card[data-id="${id}"]`);
    if (!card) { onDone(); return; }
    card.style.height = `${card.offsetHeight}px`;
    void card.offsetWidth;
    card.classList.add('is-removing');

    let done = false;
    const finish = () => { if (done) return; done = true; onDone(); };
    card.addEventListener('animationend', finish, { once: true });
    // Fallback in case animationend doesn't fire (e.g. element removed mid-flow).
    setTimeout(finish, 420);
  }

  // ---------------------------------------------------------------------
  // Task form modal (create / view / edit)
  // ---------------------------------------------------------------------
  openTaskModal({ mode, task, categories }) {
    const d = this.dom;
    d.taskForm.reset();
    d.titleError.textContent = '';
    d.taskTitle.classList.remove('has-error');
    this._pendingTags = task ? [...task.tags] : [];
    this._renderTagChips();

    const readOnly = mode === 'view';
    [d.taskTitle, d.taskDescription, d.taskCategory, d.taskDueDate, d.taskTagInput].forEach((el) => {
      el.disabled = readOnly;
    });
    d.prioritySelect.querySelectorAll('.priority-opt').forEach((btn) => { btn.disabled = readOnly; });

    if (task) {
      d.taskId.value = task.id;
      d.taskTitle.value = task.title;
      d.taskDescription.value = task.description;
      d.taskCategory.value = task.category;
      d.taskDueDate.value = task.dueDate || '';
      this._setPriority(task.priority);
      d.formMeta.hidden = false;
      d.metaCreated.textContent = `Created ${Utils.formatDate(task.createdAt)}`;
      d.metaStatus.textContent = task.completed ? 'Completed' : 'Active';
    } else {
      d.taskId.value = '';
      this._setPriority('medium');
      d.formMeta.hidden = true;
    }

    d.taskModalTitle.textContent = mode === 'create' ? 'New Task' : (mode === 'edit' ? 'Edit Task' : task.title);
    document.getElementById('submitTaskForm').hidden = readOnly;
    document.getElementById('editFromView').hidden = !readOnly;
    document.getElementById('submitTaskForm').innerHTML = mode === 'edit'
      ? '<i class="fa-solid fa-check"></i><span>Save Changes</span>'
      : '<i class="fa-solid fa-check"></i><span>Save Task</span>';
    document.getElementById('cancelTaskForm').textContent = readOnly ? 'Close' : 'Cancel';

    this._showOverlay(d.taskModalOverlay);
    if (!readOnly) setTimeout(() => d.taskTitle.focus(), 260);
  }

  switchModalToEditMode() {
    const d = this.dom;
    [d.taskTitle, d.taskDescription, d.taskCategory, d.taskDueDate, d.taskTagInput].forEach((el) => { el.disabled = false; });
    d.prioritySelect.querySelectorAll('.priority-opt').forEach((btn) => { btn.disabled = false; });
    document.getElementById('submitTaskForm').hidden = false;
    document.getElementById('editFromView').hidden = true;
    document.getElementById('cancelTaskForm').textContent = 'Cancel';
    d.taskModalTitle.textContent = 'Edit Task';
    d.taskTitle.focus();
  }

  closeTaskModal() {
    this._hideOverlay(this.dom.taskModalOverlay);
  }

  isTaskModalOpen() {
    return !this.dom.taskModalOverlay.hidden;
  }

  _setPriority(priority) {
    this.dom.prioritySelect.querySelectorAll('.priority-opt').forEach((btn) => {
      const selected = btn.dataset.priority === priority;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-checked', String(selected));
    });
  }

  getSelectedPriority() {
    const btn = this.dom.prioritySelect.querySelector('.priority-opt.is-selected');
    return btn ? btn.dataset.priority : 'medium';
  }

  addTag(tag) {
    const clean = Utils.cleanText(tag).toLowerCase().replace(/^#/, '');
    if (!clean) return;
    if (this._pendingTags.includes(clean)) return;
    if (this._pendingTags.length >= 12) return;
    this._pendingTags.push(clean);
    this._renderTagChips();
  }

  removeTag(tag) {
    this._pendingTags = this._pendingTags.filter((t) => t !== tag);
    this._renderTagChips();
  }

  getPendingTags() {
    return [...this._pendingTags];
  }

  _renderTagChips() {
    this.dom.tagChips.innerHTML = this._pendingTags.map((tag) => `
      <span class="tag-chip">#${Utils.escapeHTML(tag)}<button type="button" data-tag="${Utils.escapeHTML(tag)}" aria-label="Remove tag ${Utils.escapeHTML(tag)}"><i class="fa-solid fa-xmark"></i></button></span>
    `).join('');
  }

  showTitleError(message) {
    this.dom.titleError.textContent = message;
    this.dom.taskTitle.classList.add('has-error');
  }

  clearTitleError() {
    this.dom.titleError.textContent = '';
    this.dom.taskTitle.classList.remove('has-error');
  }

  // ---------------------------------------------------------------------
  // Confirm dialog — returns a Promise<boolean>
  // ---------------------------------------------------------------------
  confirmDialog({ title, text, acceptLabel = 'Delete' }) {
    const d = this.dom;
    d.confirmTitle.textContent = title;
    d.confirmText.textContent = text;
    d.confirmAccept.textContent = acceptLabel;
    this._showOverlay(d.confirmOverlay);

    return new Promise((resolve) => {
      this._confirmResolver = resolve;
    });
  }

  resolveConfirm(result) {
    this._hideOverlay(this.dom.confirmOverlay);
    if (this._confirmResolver) {
      this._confirmResolver(result);
      this._confirmResolver = null;
    }
  }

  // ---------------------------------------------------------------------
  // Generic overlay show/hide with exit animation
  // ---------------------------------------------------------------------
  _showOverlay(overlay) {
    overlay.hidden = false;
    overlay.classList.remove('is-closing');
    document.body.style.overflow = 'hidden';
  }

  _hideOverlay(overlay) {
    overlay.classList.add('is-closing');
    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('is-closing');
      if (this.dom.taskModalOverlay.hidden && this.dom.confirmOverlay.hidden) {
        document.body.style.overflow = '';
      }
    }, 150);
  }

  // ---------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------
  toast(message, type = 'info') {
    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      info: 'fa-circle-info',
    };
    const el = document.createElement('div');
    el.className = `toast is-${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${Utils.escapeHTML(message)}</span>`;
    this.dom.toastStack.appendChild(el);

    const remove = () => {
      el.classList.add('is-leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };
    setTimeout(remove, 3200);
  }

  // ---------------------------------------------------------------------
  // Mobile sidebar
  // ---------------------------------------------------------------------
  toggleSidebar(force) {
    this.dom.sidebar.classList.toggle('is-open', force);
  }
}
