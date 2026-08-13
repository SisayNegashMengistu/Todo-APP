/**
 * tasks.js
 * Data layer: the Task shape, category registry, and TaskManager class
 * responsible for CRUD, filtering, sorting, and statistics.
 * Has no knowledge of the DOM — UI code consumes this module's API.
 */

const CATEGORIES = [
  { id: 'personal', name: 'Personal', color: '#4A3AFF', icon: 'fa-house' },
  { id: 'work', name: 'Work', color: '#C98A1F', icon: 'fa-briefcase' },
  { id: 'study', name: 'Study', color: '#2FA88B', icon: 'fa-graduation-cap' },
  { id: 'programming', name: 'Programming', color: '#3F8CE0', icon: 'fa-code' },
  { id: 'important', name: 'Important', color: '#E0503F', icon: 'fa-star' },
];

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

class TaskManager {
  constructor() {
    /** @type {Array<object>} */
    this.tasks = Storage.getTasks();
  }

  /** Persist current state. */
  _persist() {
    Storage.setTasks(this.tasks);
  }

  /** Create and store a new task. Returns the created task. */
  createTask(input) {
    const now = new Date().toISOString();
    const task = {
      id: Utils.generateId(),
      title: Utils.cleanText(input.title),
      description: Utils.cleanText(input.description || ''),
      priority: ['low', 'medium', 'high'].includes(input.priority) ? input.priority : 'medium',
      category: input.category || CATEGORIES[0].id,
      dueDate: input.dueDate || null,
      tags: Array.isArray(input.tags) ? input.tags.slice(0, 12) : [],
      completed: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    this.tasks.unshift(task);
    this._persist();
    return task;
  }

  /** Update an existing task by id with a partial patch. */
  updateTask(id, patch) {
    const task = this.getById(id);
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this._persist();
    return task;
  }

  /** Remove a task by id. Returns true if something was removed. */
  deleteTask(id) {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this._persist();
    return this.tasks.length < before;
  }

  /** Duplicate a task (new id, "(copy)" suffix, not completed). */
  duplicateTask(id) {
    const original = this.getById(id);
    if (!original) return null;
    const now = new Date().toISOString();
    const copy = {
      ...original,
      id: Utils.generateId(),
      title: `${original.title} (copy)`,
      completed: false,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const idx = this.tasks.findIndex((t) => t.id === id);
    this.tasks.splice(idx + 1, 0, copy);
    this._persist();
    return copy;
  }

  /** Toggle completed state for a task. */
  toggleComplete(id) {
    const task = this.getById(id);
    if (!task) return null;
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    task.updatedAt = new Date().toISOString();
    this._persist();
    return task;
  }

  getById(id) {
    return this.tasks.find((t) => t.id === id) || null;
  }

  getAll() {
    return this.tasks;
  }

  /** Check whether a title already exists (case-insensitive), optionally excluding an id. */
  isDuplicateTitle(title, excludeId = null) {
    const clean = Utils.cleanText(title).toLowerCase();
    return this.tasks.some((t) => t.id !== excludeId && t.title.toLowerCase() === clean);
  }

  /**
   * Apply a named filter + optional category + search term to the task list.
   * Filters: all | active | completed | high | today | overdue
   */
  applyFilter(tasks, filter, categoryId, searchTerm) {
    let result = tasks;

    switch (filter) {
      case 'active':
        result = result.filter((t) => !t.completed);
        break;
      case 'completed':
        result = result.filter((t) => t.completed);
        break;
      case 'high':
        result = result.filter((t) => t.priority === 'high' && !t.completed);
        break;
      case 'today':
        result = result.filter((t) => Utils.isToday(t.dueDate) && !t.completed);
        break;
      case 'overdue':
        result = result.filter((t) => Utils.isOverdue(t.dueDate) && !t.completed);
        break;
      default:
        break; // 'all'
    }

    if (categoryId) {
      result = result.filter((t) => t.category === categoryId);
    }

    if (searchTerm && searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    return result;
  }

  /** Sort a list of tasks by a named strategy without mutating the input. */
  applySort(tasks, sortBy) {
    const list = [...tasks];
    switch (sortBy) {
      case 'oldest':
        return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      case 'priority':
        return list.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      case 'dueDate':
        return list.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        });
      case 'alphabetical':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  }

  /** Compute dashboard statistics from the full (unfiltered) task set. */
  getStats() {
    const all = this.tasks;
    const active = all.filter((t) => !t.completed);
    const completed = all.filter((t) => t.completed);
    const overdue = active.filter((t) => Utils.isOverdue(t.dueDate));
    const highPriority = active.filter((t) => t.priority === 'high');
    const dueToday = active.filter((t) => Utils.isToday(t.dueDate));

    return {
      total: all.length,
      active: active.length,
      completed: completed.length,
      overdue: overdue.length,
      highPriority: highPriority.length,
      today: dueToday.length,
      completionRate: all.length ? Math.round((completed.length / all.length) * 100) : 0,
    };
  }

  /** Count of tasks per category id (from the full set). */
  getCategoryCounts() {
    const counts = {};
    CATEGORIES.forEach((c) => { counts[c.id] = 0; });
    this.tasks.forEach((t) => {
      if (counts[t.category] === undefined) counts[t.category] = 0;
      counts[t.category] += 1;
    });
    return counts;
  }

  static getCategory(id) {
    return CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
  }
}
