import { Controller } from "@hotwired/stimulus"

/**
 * Pomodoro Timer Controller
 *
 * Implements a state machine for the Pomodoro technique with:
 * - 25-minute focus sessions
 * - 5-minute short breaks (after most pomodoros)
 * - Variable long breaks every 3 pomodoros (30/60/30 minute cycle)
 *
 * States:
 * 1. ready - Initial state, waiting to start
 * 2. pomodoro_running - 25-minute focus session in progress
 * 3. break_running - Break in progress (short or long)
 * 4. completed_break - Brief transition state before returning to ready
 *
 * Visual Indicators:
 * - Focus mode: Warm amber background
 * - Break mode: Calming teal/green background
 * - Break ending: Pulse animation before returning to ready
 */
export default class extends Controller {
  static targets = ["timer", "status", "startButton", "stopButton", "description", "tagInput", "tagDropdown", "addNewOption", "addNewText", "combobox", "count", "container", "activeTitle", "sidebar", "sidebarToggle", "sidebarToggleIcon", "todayProgress", "progressBar", "tagStatsModal", "pieChart", "pieChartContainer", "tagStatsLegend", "tasksContent", "tasksList", "tasksLoading", "tasksError", "historySection", "historySectionContent", "historySectionIcon", "tasksSection", "tasksSectionContent", "tasksSectionIcon", "calendarSection", "calendarSectionContent", "calendarSectionIcon", "calendarContent", "calendarList", "calendarLoading", "calendarError", "todayPomodorosSection", "todayPomodorosSectionContent", "todayPomodorosSectionIcon", "todayPomodorosList"]
  static values = { todayCount: Number, todayDate: String, dailyTarget: Number, tagStatistics: Array, userSignedIn: Boolean, hasTaskList: Boolean }
  
  // Colors for pie chart slices - distinct, accessible palette
  static PIE_COLORS = [
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Violet
    "#06b6d4", // Cyan
    "#f97316", // Orange
    "#84cc16", // Lime
    "#ec4899", // Pink
    "#6366f1", // Indigo
    "#14b8a6", // Teal
    "#a855f7"  // Purple
  ]

  // Timer durations in seconds
  static POMODORO_DURATION = 25 * 60       // 25 minutes
  static SHORT_BREAK_DURATION = 5 * 60     // 5 minutes
  // Long break duration cycle: 30min -> 60min -> 30min -> repeat
  static LONG_BREAK_DURATIONS = [30 * 60, 60 * 60, 30 * 60]

  connect() {
    this.state = "ready"
    this.secondsRemaining = this.constructor.POMODORO_DURATION
    this.intervalId = null
    this.completedToday = this.todayCountValue
    this.currentDate = this.todayDateValue // Track date for midnight reset
    this.dailyTarget = this.dailyTargetValue || 11
    this.pomodoroStartedAt = null
    this.notificationPermissionRequested = false
    this.sidebarCollapsed = false
    this.historySectionCollapsed = false
    this.tasksSectionCollapsed = false
    this.calendarSectionCollapsed = false
    this.todayPomodorosSectionCollapsed = false
    this.tasksLoaded = false
    this.calendarLoaded = false

    this.updateDisplay()
    this.updateVisualState()
    this.updateButtons()
    this.updateTodayProgress()
    
    // Set up click outside listener for combobox
    this.handleClickOutside = this.handleClickOutside.bind(this)
    document.addEventListener("click", this.handleClickOutside)
    
    // Debug: keyboard shortcut to force complete (Ctrl+Shift+D)
    this.handleDebugKeydown = this.handleDebugKeydown.bind(this)
    document.addEventListener("keydown", this.handleDebugKeydown)
    
    // Load tasks on connect if user has a task list configured
    if (this.hasTaskListValue && !this.tasksLoaded) {
      this.fetchTasks()
    }
    
    // Load calendar events on connect if user is signed in
    if (this.userSignedInValue && !this.calendarLoaded) {
      this.fetchCalendarEvents()
    }
  }
  
  /**
   * Handle debug keyboard shortcuts
   */
  handleDebugKeydown(event) {
    const isCtrlOrCmd = event.ctrlKey || event.metaKey
    
    // Alt+Enter to force complete current pomodoro
    if (event.altKey && event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      console.log("[Pomodoro] Debug shortcut triggered (Alt+Enter)")
      this.debugForceComplete()
      return
    }
    
    // Ctrl+Shift+D or Cmd+Shift+D - force complete pomodoro
    if (isCtrlOrCmd && event.shiftKey && (event.key === "D" || event.key === "d")) {
      event.preventDefault()
      event.stopPropagation()
      console.log("[Pomodoro] Debug shortcut triggered (Ctrl+Shift+D)")
      this.debugForceComplete()
      return
    }
    
    // Ctrl+Shift+B or Cmd+Shift+B - end break early
    if (isCtrlOrCmd && event.shiftKey && (event.key === "B" || event.key === "b")) {
      event.preventDefault()
      event.stopPropagation()
      console.log("[Pomodoro] Debug shortcut triggered (Ctrl+Shift+B) - ending break")
      this.debugEndBreak()
      return
    }
    
    // Ctrl+Shift+F as backup for pomodoro complete
    if (isCtrlOrCmd && event.shiftKey && (event.key === "F" || event.key === "f")) {
      event.preventDefault()
      event.stopPropagation()
      console.log("[Pomodoro] Debug shortcut triggered (Ctrl+Shift+F)")
      this.debugForceComplete()
    }
  }

  disconnect() {
    this.stopTimer()
    document.removeEventListener("click", this.handleClickOutside)
    document.removeEventListener("keydown", this.handleDebugKeydown)
  }

  /**
   * Toggle the left sidebar (history) visibility
   */
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed
    
    if (this.hasSidebarTarget) {
      this.sidebarTarget.classList.toggle("collapsed", this.sidebarCollapsed)
    }
    
    if (this.hasContainerTarget) {
      this.containerTarget.classList.toggle("sidebar-collapsed", this.sidebarCollapsed)
    }
    
    if (this.hasSidebarToggleIconTarget) {
      this.sidebarToggleIconTarget.textContent = this.sidebarCollapsed ? "▶" : "◀"
    }
  }

  /**
   * Toggle the history section visibility
   */
  toggleHistorySection() {
    this.historySectionCollapsed = !this.historySectionCollapsed
    
    if (this.hasHistorySectionContentTarget) {
      this.historySectionContentTarget.classList.toggle("collapsed", this.historySectionCollapsed)
    }
    
    if (this.hasHistorySectionIconTarget) {
      this.historySectionIconTarget.textContent = this.historySectionCollapsed ? "▶" : "▼"
    }
  }

  /**
   * Toggle the tasks section visibility
   */
  toggleTasksSection() {
    this.tasksSectionCollapsed = !this.tasksSectionCollapsed
    
    if (this.hasTasksSectionContentTarget) {
      this.tasksSectionContentTarget.classList.toggle("collapsed", this.tasksSectionCollapsed)
    }
    
    if (this.hasTasksSectionIconTarget) {
      this.tasksSectionIconTarget.textContent = this.tasksSectionCollapsed ? "▶" : "▼"
    }
  }

  /**
   * Toggle the calendar section visibility
   */
  toggleCalendarSection() {
    this.calendarSectionCollapsed = !this.calendarSectionCollapsed
    
    if (this.hasCalendarSectionContentTarget) {
      this.calendarSectionContentTarget.classList.toggle("collapsed", this.calendarSectionCollapsed)
    }
    
    if (this.hasCalendarSectionIconTarget) {
      this.calendarSectionIconTarget.textContent = this.calendarSectionCollapsed ? "▶" : "▼"
    }
  }

  /**
   * Toggle the today's pomodoros section visibility
   */
  toggleTodayPomodorosSection() {
    this.todayPomodorosSectionCollapsed = !this.todayPomodorosSectionCollapsed
    
    if (this.hasTodayPomodorosSectionContentTarget) {
      this.todayPomodorosSectionContentTarget.classList.toggle("collapsed", this.todayPomodorosSectionCollapsed)
    }
    
    if (this.hasTodayPomodorosSectionIconTarget) {
      this.todayPomodorosSectionIconTarget.textContent = this.todayPomodorosSectionCollapsed ? "▶" : "▼"
    }
  }

  /**
   * Delete a pomodoro
   */
  async deletePomodoro(event) {
    event.preventDefault()
    event.stopPropagation()
    
    // Store references BEFORE the async call (event.currentTarget changes after await)
    const button = event.currentTarget
    const itemEl = button.closest(".today-pomodoro-item")
    const pomodoroId = button.dataset.pomodoroId
    
    console.log("[Pomodoro] Deleting pomodoro:", pomodoroId, "Element:", itemEl)
    
    if (!pomodoroId) {
      console.error("[Pomodoro] No pomodoro ID found")
      return
    }
    
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    
    try {
      const response = await fetch(`/pomodoros/${pomodoroId}`, {
        method: "DELETE",
        headers: {
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        }
      })
      
      console.log("[Pomodoro] Delete response status:", response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log("[Pomodoro] Delete response data:", data)
        
        if (data.success) {
          // Remove the item from the DOM
          if (itemEl) {
            console.log("[Pomodoro] Removing element from DOM")
            itemEl.remove()
          }
          
          // Update the count
          this.completedToday = data.today_count
          this.updateCount()
          
          // Update tag statistics chart
          if (data.tag_statistics) {
            this.tagStatisticsValue = data.tag_statistics
            this.updateTagStatsDisplay()
          }
          
          // Check if list is now empty
          if (this.hasTodayPomodorosListTarget) {
            const remainingItems = this.todayPomodorosListTarget.querySelectorAll(".today-pomodoro-item")
            if (remainingItems.length === 0) {
              this.todayPomodorosListTarget.innerHTML = `
                <div class="today-pomodoros-empty">
                  <p>No pomodoros completed today</p>
                </div>
              `
            }
          }
        } else {
          console.error("[Pomodoro] Delete failed:", data.error)
        }
      } else {
        const errorText = await response.text()
        console.error("[Pomodoro] Delete request failed:", response.status, errorText)
      }
    } catch (error) {
      console.error("[Pomodoro] Error deleting pomodoro:", error)
    }
  }

  /**
   * Add a new pomodoro to the today's list
   */
  addPomodoroToTodayList(pomodoro) {
    console.log("[Pomodoro] addPomodoroToTodayList called with:", pomodoro)
    
    // Try to find the list element directly if Stimulus target isn't available
    let listEl = this.hasTodayPomodorosListTarget 
      ? this.todayPomodorosListTarget 
      : document.querySelector(".today-pomodoros-list")
    
    console.log("[Pomodoro] List element found:", !!listEl)
    
    if (!listEl) {
      console.error("[Pomodoro] Cannot find today-pomodoros-list element!")
      return
    }
    
    // Ensure the sidebar is expanded
    const sidebar = document.querySelector(".sidebar-column")
    if (sidebar && sidebar.classList.contains("collapsed")) {
      sidebar.classList.remove("collapsed")
    }
    
    // Ensure the Today's Pomodoros section is expanded
    const sectionContent = document.querySelector('[data-pomodoro-timer-target="todayPomodorosSectionContent"]')
    const sectionIcon = document.querySelector('[data-pomodoro-timer-target="todayPomodorosSectionIcon"]')
    if (sectionContent && sectionContent.classList.contains("collapsed")) {
      sectionContent.classList.remove("collapsed")
      if (sectionIcon) sectionIcon.textContent = "▼"
    }
    
    // Remove empty message if present
    const emptyEl = listEl.querySelector(".today-pomodoros-empty")
    if (emptyEl) {
      console.log("[Pomodoro] Removing empty message")
      emptyEl.remove()
    }
    
    // Create new item HTML
    const itemHtml = `
      <div class="today-pomodoro-item" data-pomodoro-id="${pomodoro.id}">
        <div class="pomodoro-item-content">
          <span class="pomodoro-item-time">${this.escapeHtml(pomodoro.started_at || "")}</span>
          <span class="pomodoro-item-title">${this.escapeHtml(pomodoro.description || "Untitled")}</span>
        </div>
        <button 
          class="pomodoro-item-delete" 
          data-action="click->pomodoro-timer#deletePomodoro"
          data-pomodoro-id="${pomodoro.id}"
          aria-label="Delete pomodoro"
        >
          ×
        </button>
      </div>
    `
    
    // Insert at the beginning (most recent first)
    console.log("[Pomodoro] Inserting pomodoro item into list")
    listEl.insertAdjacentHTML("afterbegin", itemHtml)
    console.log("[Pomodoro] Pomodoro item added successfully!")
    
    // Flash the new item to make it visible
    const newItem = listEl.querySelector(".today-pomodoro-item")
    if (newItem) {
      newItem.style.transition = "background-color 0.3s"
      newItem.style.backgroundColor = "rgba(34, 197, 94, 0.3)"
      setTimeout(() => {
        newItem.style.backgroundColor = ""
      }, 1000)
    }
  }

  /**
   * Fetch calendar events from Google Calendar API
   */
  async fetchCalendarEvents() {
    if (!this.hasCalendarListTarget) return
    
    // Show loading state
    if (this.hasCalendarLoadingTarget) {
      this.calendarLoadingTarget.classList.remove("hidden")
    }
    if (this.hasCalendarErrorTarget) {
      this.calendarErrorTarget.classList.add("hidden")
    }
    this.calendarListTarget.classList.add("hidden")

    try {
      const response = await fetch("/calendar_events.json", {
        headers: {
          "Accept": "application/json"
        }
      })

      const data = await response.json()

      // Hide loading
      if (this.hasCalendarLoadingTarget) {
        this.calendarLoadingTarget.classList.add("hidden")
      }

      if (response.ok && data.success) {
        this.calendarLoaded = true
        this.renderCalendarEvents(data.events)
      } else {
        this.showCalendarError(data.error || "Failed to load events")
        
        if (data.reauth) {
          window.location.reload()
        }
      }
    } catch (error) {
      console.error("Error fetching calendar events:", error)
      if (this.hasCalendarLoadingTarget) {
        this.calendarLoadingTarget.classList.add("hidden")
      }
      this.showCalendarError("Failed to connect to Google Calendar")
    }
  }

  /**
   * Render calendar events in the sidebar
   */
  renderCalendarEvents(events) {
    if (!this.hasCalendarListTarget) return

    if (events.length === 0) {
      this.calendarListTarget.innerHTML = `
        <div class="calendar-empty-list">
          <p>No events today</p>
        </div>
      `
    } else {
      const eventsHtml = events.map(event => {
        const timeDisplay = event.all_day 
          ? '<span class="event-time">All day</span>'
          : `<span class="event-time">${this.formatEventTime(event.start_time)} - ${this.formatEventTime(event.end_time)}</span>`
        
        return `
          <div class="calendar-event-item">
            <div class="event-time-indicator"></div>
            <div class="event-content">
              <span class="event-title">${this.escapeHtml(event.title)}</span>
              ${timeDisplay}
            </div>
          </div>
        `
      }).join("")
      
      this.calendarListTarget.innerHTML = eventsHtml
    }
    
    this.calendarListTarget.classList.remove("hidden")
  }

  /**
   * Format event time for display (HH:MM format)
   */
  formatEventTime(timeString) {
    if (!timeString) return ""
    const date = new Date(timeString)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  /**
   * Show an error message in the calendar sidebar
   */
  showCalendarError(message) {
    if (!this.hasCalendarErrorTarget) return
    
    this.calendarErrorTarget.innerHTML = `<p>${this.escapeHtml(message)}</p>`
    this.calendarErrorTarget.classList.remove("hidden")
  }

  /**
   * Fetch tasks from Google Tasks API
   */
  async fetchTasks() {
    if (!this.hasTasksListTarget) return
    
    // Show loading state
    if (this.hasTasksLoadingTarget) {
      this.tasksLoadingTarget.classList.remove("hidden")
    }
    if (this.hasTasksErrorTarget) {
      this.tasksErrorTarget.classList.add("hidden")
    }
    this.tasksListTarget.classList.add("hidden")

    try {
      const response = await fetch("/tasks.json", {
        headers: {
          "Accept": "application/json"
        }
      })

      const data = await response.json()

      // Hide loading
      if (this.hasTasksLoadingTarget) {
        this.tasksLoadingTarget.classList.add("hidden")
      }

      if (response.ok && data.success) {
        this.tasksLoaded = true
        this.renderTasks(data.tasks)
      } else {
        this.showTasksError(data.error || "Failed to load tasks")
        
        if (data.reauth) {
          // User needs to re-authenticate
          window.location.reload()
        }
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
      if (this.hasTasksLoadingTarget) {
        this.tasksLoadingTarget.classList.add("hidden")
      }
      this.showTasksError("Failed to connect to Google Tasks")
    }
  }

  /**
   * Render tasks in the sidebar
   */
  renderTasks(tasks) {
    if (!this.hasTasksListTarget) return

    if (tasks.length === 0) {
      this.tasksListTarget.innerHTML = `
        <div class="tasks-empty-list">
          <p>No incomplete tasks</p>
        </div>
      `
    } else {
      const tasksHtml = tasks.map(task => `
        <div class="task-item task-item-clickable" data-task-id="${this.escapeHtml(task.id || "")}" data-task-title="${this.escapeHtml(task.title || "")}">
          <div class="task-checkbox" data-task-id="${this.escapeHtml(task.id || "")}">
            <span class="task-checkbox-icon">○</span>
          </div>
          <div class="task-content">
            <span class="task-title">${this.escapeHtml(task.title || "Untitled")}</span>
            ${task.notes ? `<p class="task-notes">${this.escapeHtml(task.notes)}</p>` : ""}
            ${task.due ? `<span class="task-due">Due: ${this.formatDate(task.due)}</span>` : ""}
          </div>
        </div>
      `).join("")
      
      this.tasksListTarget.innerHTML = tasksHtml
      
      // Add click handlers to task content (for selecting as description)
      this.tasksListTarget.querySelectorAll(".task-content").forEach(contentEl => {
        contentEl.addEventListener("click", (e) => this.selectTaskForPomodoro(e))
      })
      
      // Add click handlers to checkboxes (for completing tasks)
      this.tasksListTarget.querySelectorAll(".task-checkbox").forEach(checkboxEl => {
        checkboxEl.addEventListener("click", (e) => this.completeTask(e))
      })
    }
    
    this.tasksListTarget.classList.remove("hidden")
  }

  /**
   * Select a task to use as the pomodoro description
   */
  selectTaskForPomodoro(event) {
    event.stopPropagation()
    const taskEl = event.currentTarget.closest(".task-item")
    const taskTitle = taskEl?.dataset.taskTitle
    
    if (taskTitle && this.hasDescriptionTarget) {
      this.descriptionTarget.value = taskTitle
      
      // Visual feedback - briefly highlight the selected task
      taskEl.classList.add("task-item-selected")
      setTimeout(() => {
        taskEl.classList.remove("task-item-selected")
      }, 300)
      
      // Focus the description field
      this.descriptionTarget.focus()
    }
  }

  /**
   * Complete a task in Google Tasks
   */
  async completeTask(event) {
    event.stopPropagation()
    
    const checkboxEl = event.currentTarget
    const taskEl = checkboxEl.closest(".task-item")
    const taskId = checkboxEl.dataset.taskId
    
    if (!taskId) return
    
    // Visual feedback - show completing state
    checkboxEl.classList.add("task-checkbox-completing")
    checkboxEl.querySelector(".task-checkbox-icon").textContent = "..."
    
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    
    try {
      const response = await fetch(`/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        }
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show completed state briefly, then remove task
        checkboxEl.classList.remove("task-checkbox-completing")
        checkboxEl.classList.add("task-checkbox-completed")
        checkboxEl.querySelector(".task-checkbox-icon").textContent = "✓"
        taskEl.classList.add("task-item-completed")
        
        // Remove from list after animation
        setTimeout(() => {
          taskEl.remove()
          
          // Check if list is now empty
          if (this.tasksListTarget.querySelectorAll(".task-item").length === 0) {
            this.tasksListTarget.innerHTML = `
              <div class="tasks-empty-list">
                <p>No incomplete tasks</p>
              </div>
            `
          }
        }, 500)
      } else {
        // Show error state
        checkboxEl.classList.remove("task-checkbox-completing")
        checkboxEl.querySelector(".task-checkbox-icon").textContent = "○"
        console.error("Failed to complete task:", data.error)
        
        if (data.reauth) {
          window.location.reload()
        }
      }
    } catch (error) {
      // Reset on error
      checkboxEl.classList.remove("task-checkbox-completing")
      checkboxEl.querySelector(".task-checkbox-icon").textContent = "○"
      console.error("Error completing task:", error)
    }
  }

  /**
   * Show an error message in the tasks sidebar
   */
  showTasksError(message) {
    if (!this.hasTasksErrorTarget) return
    
    this.tasksErrorTarget.innerHTML = `<p>${this.escapeHtml(message)}</p>`
    this.tasksErrorTarget.classList.remove("hidden")
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Format a date string for display
   */
  formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  /**
   * Refresh tasks (can be called to reload)
   */
  refreshTasks() {
    this.tasksLoaded = false
    this.fetchTasks()
  }

  /**
   * Start a new Pomodoro session
   * Called when user clicks the Start button
   */
  start() {
    if (this.state !== "ready") return

    // Request notification permission on first interaction
    this.requestNotificationPermission()

    // Check if date has changed (midnight crossed)
    this.checkDateChange()

    this.state = "pomodoro_running"
    this.pomodoroStartedAt = new Date()
    this.secondsRemaining = this.constructor.POMODORO_DURATION

    this.updateUI()
    this.startTimer()
  }

  /**
   * Stop/cancel the current pomodoro
   * Does NOT log the pomodoro - simply resets to ready state
   */
  stop() {
    if (this.state !== "pomodoro_running") return

    this.stopTimer()
    
    // Reset to ready state without saving
    this.state = "ready"
    this.secondsRemaining = this.constructor.POMODORO_DURATION
    this.pomodoroStartedAt = null

    this.updateUI()
  }

  /**
   * Check if the date has changed (midnight crossed)
   * If so, reset the daily counter to 0
   */
  checkDateChange() {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    
    if (this.currentDate && today !== this.currentDate) {
      // Date has changed - reset counter
      this.completedToday = 0
      this.currentDate = today
      this.updateCount()
    }
  }

  /**
   * Request notification permission if not already granted
   * Gracefully degrades if denied or unavailable
   */
  requestNotificationPermission() {
    if (this.notificationPermissionRequested) return
    this.notificationPermissionRequested = true

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission()
    }
  }

  /**
   * Start the countdown timer
   * Ticks every second until time runs out
   */
  startTimer() {
    this.stopTimer() // Clear any existing interval
    this.intervalId = setInterval(() => this.tick(), 1000)
  }

  /**
   * Stop the countdown timer
   */
  stopTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Timer tick - decrements time and checks for completion
   */
  tick() {
    this.secondsRemaining--
    this.updateDisplay()

    if (this.secondsRemaining <= 0) {
      console.log("[Pomodoro] Timer reached zero, state:", this.state)
      this.stopTimer()

      if (this.state === "pomodoro_running") {
        this.completePomodoro()
      } else if (this.state === "break_running") {
        this.completeBreak()
      }
    }
  }

  /**
   * Debug: Force complete the current pomodoro (for testing)
   * Called via keyboard shortcut Ctrl+Shift+D
   */
  async debugForceComplete() {
    console.log("[Pomodoro] Debug: debugForceComplete called, state:", this.state)
    if (this.state === "pomodoro_running") {
      console.log("[Pomodoro] Debug: Stopping timer...")
      this.stopTimer()
      console.log("[Pomodoro] Debug: Timer stopped, intervalId:", this.intervalId)
      
      try {
        console.log("[Pomodoro] Debug: Calling completePomodoro...")
        await this.completePomodoro()
        console.log("[Pomodoro] Debug: completePomodoro finished, new state:", this.state)
      } catch (error) {
        console.error("[Pomodoro] Debug: Error in completePomodoro:", error)
      }
    } else {
      console.log("[Pomodoro] Debug: Not in pomodoro_running state, current state:", this.state)
    }
  }

  /**
   * Debug: End the current break early
   * Called via keyboard shortcut Ctrl+Shift+B
   */
  debugEndBreak() {
    console.log("[Pomodoro] Debug: debugEndBreak called, state:", this.state)
    if (this.state === "break_running") {
      console.log("[Pomodoro] Debug: Ending break early...")
      this.stopTimer()
      this.completeBreak()
      console.log("[Pomodoro] Debug: Break ended, new state:", this.state)
    } else {
      console.log("[Pomodoro] Debug: Not in break_running state, current state:", this.state)
    }
  }

  /**
   * Handle Pomodoro completion
   * - Persists to server
   * - Determines break type
   * - Starts appropriate break
   */
  async completePomodoro() {
    try {
      const completedAt = new Date()
      console.log("[Pomodoro] Timer completed, saving pomodoro...")

      // Check for date change before saving
      this.checkDateChange()

      // Persist to server
      const response = await this.savePomodoro(completedAt)
      console.log("[Pomodoro] Save response:", response)

      // Update count from server response if available, otherwise increment locally
      if (response && response.today_count !== undefined) {
        this.completedToday = response.today_count
        this.currentDate = response.today_date || this.currentDate
        console.log("[Pomodoro] Updated count to:", this.completedToday)
        
        // Update tags dropdown with any new tags from the database
        if (response.available_tags) {
          this.updateTagsDropdown(response.available_tags)
        }
        
        // Update tag statistics chart
        if (response.tag_statistics) {
          this.tagStatisticsValue = response.tag_statistics
          this.updateTagStatsDisplay()
        }
        
        // Add the new pomodoro to the today's list
        if (response.pomodoro) {
          console.log("[Pomodoro] Adding to today's list:", response.pomodoro)
          this.addPomodoroToTodayList(response.pomodoro)
        } else {
          console.log("[Pomodoro] WARNING: No pomodoro in response!", response)
        }
      } else {
        this.completedToday++
        console.log("[Pomodoro] No server response, incrementing locally to:", this.completedToday)
      }
      
      this.updateCount()
      console.log("[Pomodoro] Count updated")

      // Determine break type and duration
      const { isLongBreak, duration, durationMinutes } = this.determineBreak()
      console.log("[Pomodoro] Break determined:", { isLongBreak, duration, durationMinutes })

      // Show notification
      this.showNotification(
        "Pomodoro complete",
        isLongBreak
          ? `${durationMinutes} minute long break.`
          : `${durationMinutes} minute break.`
      )

      // Start break automatically
      console.log("[Pomodoro] Starting break...")
      this.state = "break_running"
      this.secondsRemaining = duration
      this.updateUI()
      this.startTimer()
      console.log("[Pomodoro] Break started, state:", this.state)
    } catch (error) {
      console.error("[Pomodoro] Error in completePomodoro:", error)
      // Still try to start break even if there was an error
      this.state = "break_running"
      this.secondsRemaining = 5 * 60 // Default to 5 min break
      this.updateUI()
      this.startTimer()
    }
  }

  /**
   * Determine which type of break and its duration
   *
   * Long break rules:
   * - Occurs every 3 completed pomodoros (when completedToday % 3 === 0)
   * - Duration cycles through [30, 60, 30] minutes based on long break index
   *
   * Long break index calculation:
   * - After 3 pomodoros: index = (3/3 - 1) % 3 = 0 → 30 min
   * - After 6 pomodoros: index = (6/3 - 1) % 3 = 1 → 60 min
   * - After 9 pomodoros: index = (9/3 - 1) % 3 = 2 → 30 min
   * - After 12 pomodoros: index = (12/3 - 1) % 3 = 0 → 30 min (cycle repeats)
   */
  determineBreak() {
    // Check if this is a long break (every 3 pomodoros)
    const isLongBreak = this.completedToday % 3 === 0

    if (isLongBreak) {
      // Calculate which long break this is (0-indexed)
      // After 3 pomodoros: longBreakNumber = 1, index = 0
      // After 6 pomodoros: longBreakNumber = 2, index = 1
      // After 9 pomodoros: longBreakNumber = 3, index = 2
      // After 12 pomodoros: longBreakNumber = 4, index = 0 (cycle)
      const longBreakNumber = Math.floor(this.completedToday / 3)
      const longBreakIndex = (longBreakNumber - 1) % 3

      const duration = this.constructor.LONG_BREAK_DURATIONS[longBreakIndex]
      const durationMinutes = duration / 60

      return { isLongBreak: true, duration, durationMinutes }
    }

    return {
      isLongBreak: false,
      duration: this.constructor.SHORT_BREAK_DURATION,
      durationMinutes: this.constructor.SHORT_BREAK_DURATION / 60
    }
  }

  /**
   * Handle break completion
   * - Shows visual feedback
   * - Shows notification
   * - Resets to ready state
   */
  completeBreak() {
    // Show break ending animation
    this.showBreakEndingAnimation()

    this.showNotification("Break over", "Ready to focus again.")

    // Reset to ready state after a brief delay for animation
    setTimeout(() => {
      this.state = "ready"
      this.secondsRemaining = this.constructor.POMODORO_DURATION
      this.pomodoroStartedAt = null
      this.updateUI()
    }, 1500) // 1.5 second delay for animation
  }

  /**
   * Show visual feedback when break ends
   */
  showBreakEndingAnimation() {
    if (this.hasContainerTarget) {
      this.containerTarget.classList.add("break-ending")
      this.statusTarget.textContent = "Break over!"
      
      // Remove animation class after it completes
      setTimeout(() => {
        this.containerTarget.classList.remove("break-ending")
      }, 1500)
    }
  }

  /**
   * Save completed Pomodoro to server
   * Returns the response data or null on error
   */
  async savePomodoro(completedAt) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content
    
    const pomodoroData = {
      pomodoro: {
        started_at: this.pomodoroStartedAt?.toISOString(),
        completed_at: completedAt.toISOString(),
        description: this.descriptionTarget.value || null,
        tags: this.getSelectedTag(),
        duration_minutes: 25
      }
    }
    
    console.log("[Pomodoro] Saving with data:", pomodoroData)

    try {
      const response = await fetch("/pomodoros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        },
        body: JSON.stringify(pomodoroData)
      })

      if (response.ok) {
        const data = await response.json()
        console.log("[Pomodoro] Save successful:", data)
        return data
      } else {
        const errorText = await response.text()
        console.error("[Pomodoro] Failed to save:", response.status, errorText)
        return null
      }
    } catch (error) {
      console.error("[Pomodoro] Error saving:", error)
      return null
    }
  }

  /**
   * Show browser notification
   * Gracefully degrades if permission denied or unavailable
   */
  showNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body })
    }
  }

  /**
   * Update the timer display (MM:SS format)
   */
  updateDisplay() {
    const minutes = Math.floor(this.secondsRemaining / 60)
    const seconds = this.secondsRemaining % 60
    this.timerTarget.textContent =
      `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  /**
   * Update count display
   */
  updateCount() {
    console.log("[Pomodoro] updateCount called, completedToday:", this.completedToday)
    if (this.hasCountTarget) {
      this.countTarget.textContent = this.completedToday
      console.log("[Pomodoro] Count display updated")
    } else {
      console.log("[Pomodoro] No countTarget found")
    }
    this.updateTodayProgress()
  }

  /**
   * Update today's progress bar segments
   */
  updateTodayProgress() {
    console.log("[Pomodoro] updateTodayProgress called, hasProgressBarTarget:", this.hasProgressBarTarget)
    if (!this.hasProgressBarTarget) return
    
    const segments = this.progressBarTarget.querySelectorAll(".today-count-segment")
    segments.forEach((segment, index) => {
      if (index < this.completedToday) {
        segment.classList.add("filled")
      } else {
        segment.classList.remove("filled")
      }
    })
  }

  /**
   * Update visual state classes on container
   * Provides clear visual feedback for different timer states
   */
  updateVisualState() {
    if (!this.hasContainerTarget) return

    // Remove all state classes
    this.containerTarget.classList.remove("focus-mode", "break-mode", "ready-mode")

    // Add appropriate state class
    switch (this.state) {
      case "pomodoro_running":
        this.containerTarget.classList.add("focus-mode")
        break
      case "break_running":
        this.containerTarget.classList.add("break-mode")
        break
      default:
        this.containerTarget.classList.add("ready-mode")
    }
  }

  /**
   * Update button visibility based on state
   * - Ready: Show start button, hide stop button
   * - Pomodoro running: Hide start button, show stop button
   * - Break running: Hide both buttons
   */
  updateButtons() {
    const isPomodoroRunning = this.state === "pomodoro_running"
    const isBreakRunning = this.state === "break_running"

    // Start button: visible only in ready state
    if (this.hasStartButtonTarget) {
      this.startButtonTarget.classList.toggle("hidden", isPomodoroRunning || isBreakRunning)
      this.startButtonTarget.disabled = isPomodoroRunning || isBreakRunning
    }

    // Stop button: visible only during pomodoro
    if (this.hasStopButtonTarget) {
      this.stopButtonTarget.classList.toggle("hidden", !isPomodoroRunning)
    }

    // Update form inputs
    const isRunning = this.state !== "ready"
    this.descriptionTarget.disabled = isRunning
    if (this.hasTagInputTarget) {
      this.tagInputTarget.disabled = isRunning
    }
  }

  /**
   * Get the selected tag from the combobox input
   */
  getSelectedTag() {
    if (this.hasTagInputTarget && this.tagInputTarget.value.trim()) {
      return this.tagInputTarget.value.trim()
    }
    return null
  }

  // ===========================================
  // Tag Combobox Methods
  // ===========================================

  /**
   * Open the tag dropdown when input is focused
   * If a tag is already selected, clear it so user can start fresh
   */
  openTagDropdown() {
    if (!this.hasTagDropdownTarget) return
    
    // If there's already a value, clear it so user can start fresh
    if (this.hasTagInputTarget && this.tagInputTarget.value.trim()) {
      this.tagInputTarget.value = ""
    }
    
    this.tagDropdownTarget.classList.remove("hidden")
    this.filterTags()
  }

  /**
   * Close the tag dropdown
   */
  closeTagDropdown() {
    if (!this.hasTagDropdownTarget) return
    this.tagDropdownTarget.classList.add("hidden")
  }

  /**
   * Handle clicks outside the combobox to close dropdown
   */
  handleClickOutside(event) {
    if (!this.hasComboboxTarget) return
    
    if (!this.comboboxTarget.contains(event.target)) {
      this.closeTagDropdown()
    }
  }

  /**
   * Filter tag options based on input value
   */
  filterTags() {
    if (!this.hasTagDropdownTarget || !this.hasTagInputTarget) return

    const searchValue = this.tagInputTarget.value.toLowerCase().trim()
    const options = this.tagDropdownTarget.querySelectorAll(".combobox-option")
    let hasVisibleOptions = false
    let hasExactMatch = false

    options.forEach(option => {
      const tagValue = option.dataset.tag.toLowerCase()
      const matches = tagValue.includes(searchValue)
      option.classList.toggle("hidden", !matches)
      
      if (matches) hasVisibleOptions = true
      if (tagValue === searchValue) hasExactMatch = true
    })

    // Show "Add new" option if there's text and no exact match
    if (this.hasAddNewOptionTarget && this.hasAddNewTextTarget) {
      if (searchValue && !hasExactMatch) {
        this.addNewOptionTarget.classList.remove("hidden")
        this.addNewTextTarget.textContent = this.tagInputTarget.value.trim()
      } else {
        this.addNewOptionTarget.classList.add("hidden")
      }
    }
  }

  /**
   * Handle keyboard navigation in tag combobox
   */
  handleTagKeydown(event) {
    if (event.key === "Escape") {
      this.closeTagDropdown()
      this.tagInputTarget.blur()
    } else if (event.key === "Enter") {
      event.preventDefault()
      const tagValue = this.tagInputTarget.value.trim()
      
      if (tagValue) {
        // Check if this tag already exists in the dropdown
        const existingOptions = this.tagDropdownTarget.querySelectorAll(".combobox-option")
        const existingTags = Array.from(existingOptions).map(opt => opt.dataset.tag.toLowerCase())
        
        if (!existingTags.includes(tagValue.toLowerCase())) {
          // It's a new tag - save it to the database
          this.saveTagToDatabase(tagValue)
        }
        
        this.closeTagDropdown()
      }
    }
  }

  /**
   * Select a tag from the dropdown
   * If the tag is already selected, clear the input (toggle behavior)
   */
  selectTag(event) {
    const tag = event.currentTarget.dataset.tag?.trim()
    if (!tag || !this.hasTagInputTarget) {
      this.closeTagDropdown()
      return
    }
    
    const currentValue = this.tagInputTarget.value.trim()
    
    // Toggle: if already selected, clear it; otherwise select it
    if (currentValue.toLowerCase() === tag.toLowerCase()) {
      this.tagInputTarget.value = ""
    } else {
      this.tagInputTarget.value = tag
    }
    
    this.closeTagDropdown()
  }

  /**
   * Update the tags dropdown with a new list of tags from the server
   * This ensures the dropdown stays in sync with the database
   */
  updateTagsDropdown(tags) {
    if (!this.hasTagDropdownTarget || !this.hasAddNewOptionTarget) return
    
    // Get current tags in the dropdown
    const existingOptions = this.tagDropdownTarget.querySelectorAll(".combobox-option")
    const existingTags = new Set()
    existingOptions.forEach(opt => existingTags.add(opt.dataset.tag))
    
    // Add any new tags that aren't already in the dropdown
    tags.forEach(tag => {
      if (!existingTags.has(tag)) {
        const newOption = document.createElement("div")
        newOption.className = "combobox-option"
        newOption.dataset.tag = tag
        newOption.dataset.action = "click->pomodoro-timer#selectTag"
        newOption.textContent = tag
        
        // Insert before the "Add new" option
        this.tagDropdownTarget.insertBefore(newOption, this.addNewOptionTarget)
      }
    })
  }

  /**
   * Add a new tag to the dropdown and select it
   * Called when clicking the "Add [tagname]" option
   */
  addNewTag(event) {
    event.preventDefault()
    event.stopPropagation()
    
    if (!this.hasTagInputTarget || !this.hasTagDropdownTarget) return
    
    const newTagName = this.tagInputTarget.value.trim()
    if (!newTagName) return
    
    // Save tag to database immediately
    this.saveTagToDatabase(newTagName)
    
    // Close dropdown
    this.closeTagDropdown()
  }

  /**
   * Save a new tag to the database
   * Creates the tag in the database and adds it to the dropdown
   */
  async saveTagToDatabase(tagName) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const response = await fetch("/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        },
        body: JSON.stringify({ name: tagName })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        // Add the tag to the dropdown if it's new
        if (data.is_new) {
          this.addTagToDropdown(data.tag)
        }
        
        // Select the tag in the input
        if (this.hasTagInputTarget) {
          this.tagInputTarget.value = data.tag
        }
      } else {
        console.error("Failed to save tag:", data.errors || data.error)
      }
    } catch (error) {
      console.error("Error saving tag:", error)
    }
  }

  /**
   * Add a tag option to the dropdown
   */
  addTagToDropdown(tagName) {
    if (!this.hasTagDropdownTarget) return
    
    // Check if tag already exists in dropdown
    const existingOptions = this.tagDropdownTarget.querySelectorAll(".combobox-option")
    const existingTags = Array.from(existingOptions).map(opt => opt.dataset.tag)
    
    if (existingTags.includes(tagName)) return
    
    // Create new option element
    const newOption = document.createElement("div")
    newOption.className = "combobox-option"
    newOption.dataset.tag = tagName
    newOption.dataset.action = "click->pomodoro-timer#selectTag"
    newOption.textContent = tagName
    
    // Insert in alphabetical order before the "Add new" option
    const addNewOption = this.hasAddNewOptionTarget ? this.addNewOptionTarget : null
    let inserted = false
    
    for (const option of existingOptions) {
      if (option.dataset.tag.toLowerCase() > tagName.toLowerCase()) {
        this.tagDropdownTarget.insertBefore(newOption, option)
        inserted = true
        break
      }
    }
    
    if (!inserted) {
      if (addNewOption) {
        this.tagDropdownTarget.insertBefore(newOption, addNewOption)
      } else {
        this.tagDropdownTarget.appendChild(newOption)
      }
    }
  }

  /**
   * Update the active title display
   * Shows the pomodoro description above the timer when running
   */
  updateActiveTitle() {
    if (!this.hasActiveTitleTarget) return

    const isPomodoroRunning = this.state === "pomodoro_running"
    const description = this.descriptionTarget.value.trim()

    if (isPomodoroRunning && description) {
      this.activeTitleTarget.textContent = description
      this.activeTitleTarget.classList.remove("hidden")
    } else {
      this.activeTitleTarget.classList.add("hidden")
      this.activeTitleTarget.textContent = ""
    }
  }

  /**
   * Update all UI elements based on current state
   */
  updateUI() {
    this.updateDisplay()
    this.updateVisualState()
    this.updateButtons()
    this.updateActiveTitle()

    // Update status text
    const statusMap = {
      ready: "Ready to start",
      pomodoro_running: "Focus time",
      break_running: "Break time"
    }
    this.statusTarget.textContent = statusMap[this.state] || ""
  }

  // ===========================================
  // Tag Statistics Modal & Pie Chart
  // ===========================================

  /**
   * Update the tag statistics display (chart and legend)
   * Called when pomodoros are added or deleted
   */
  updateTagStatsDisplay() {
    const stats = this.tagStatisticsValue || []
    
    // Find the modal body
    const modalBody = this.hasTagStatsModalTarget 
      ? this.tagStatsModalTarget.querySelector(".modal-body")
      : null
    
    if (!modalBody) return
    
    if (stats.length === 0) {
      // Show empty state
      modalBody.innerHTML = `
        <div class="empty-chart-state">
          <div class="empty-chart-placeholder">
            <svg viewBox="0 0 100 100" class="empty-chart-icon">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" stroke-width="8"/>
              <path d="M50 10 A40 40 0 0 1 90 50" fill="none" stroke="#d1d5db" stroke-width="8" stroke-linecap="round"/>
            </svg>
          </div>
          <p class="empty-chart-message">Complete your first pomodoro with a tag to start tracking time</p>
        </div>
      `
    } else {
      // Build chart and legend HTML
      const total = stats.reduce((sum, s) => sum + s.count, 0)
      const legendHtml = stats.map((stat, index) => `
        <div class="legend-item">
          <span class="legend-color" data-color-index="${index}"></span>
          <span class="legend-label">${this.escapeHtml(stat.tag)}</span>
          <span class="legend-value">${stat.count} (${((stat.count / total) * 100).toFixed(1)}%)</span>
        </div>
      `).join("")
      
      modalBody.innerHTML = `
        <div class="pie-chart-container" data-pomodoro-timer-target="pieChartContainer">
          <canvas data-pomodoro-timer-target="pieChart" width="300" height="300"></canvas>
        </div>
        <div class="tag-stats-legend" data-pomodoro-timer-target="tagStatsLegend">
          ${legendHtml}
        </div>
      `
      
      // Re-render the chart and apply colors
      this.renderPieChart()
      this.applyLegendColors()
    }
  }

  /**
   * Open the tag statistics modal and render the pie chart
   */
  openTagStats() {
    if (!this.hasTagStatsModalTarget) return
    
    this.tagStatsModalTarget.classList.remove("hidden")
    this.renderPieChart()
    this.applyLegendColors()
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden"
  }

  /**
   * Close the tag statistics modal
   */
  closeTagStats() {
    if (!this.hasTagStatsModalTarget) return
    
    this.tagStatsModalTarget.classList.add("hidden")
    document.body.style.overflow = ""
  }

  /**
   * Handle clicks on the modal overlay - close if clicking outside content
   */
  handleModalClick(event) {
    // Close if clicking on the overlay itself (not the modal content)
    if (event.target === this.tagStatsModalTarget) {
      this.closeTagStats()
    }
  }

  /**
   * Apply colors to legend items based on their index
   */
  applyLegendColors() {
    // Query legend directly since it may be dynamically added
    const legend = this.hasTagStatsModalTarget 
      ? this.tagStatsModalTarget.querySelector(".tag-stats-legend")
      : null
    
    if (!legend) return
    
    const colorDots = legend.querySelectorAll(".legend-color")
    colorDots.forEach((dot, index) => {
      const colorIndex = index % this.constructor.PIE_COLORS.length
      dot.style.backgroundColor = this.constructor.PIE_COLORS[colorIndex]
    })
  }

  /**
   * Render the pie chart on the canvas
   */
  renderPieChart() {
    // Query canvas directly since it may be dynamically added
    const canvas = this.hasTagStatsModalTarget 
      ? this.tagStatsModalTarget.querySelector("canvas")
      : null
    
    if (!canvas) {
      console.log("[Pomodoro] No canvas found for pie chart")
      return
    }
    
    // Don't render if modal is hidden (canvas will have 0 dimensions)
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.log("[Pomodoro] Skipping pie chart render - modal is hidden")
      return
    }
    
    const stats = this.tagStatisticsValue || []
    const ctx = canvas.getContext("2d")
    
    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1
    
    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    
    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height)
    
    if (stats.length === 0) {
      // Draw empty state
      this.drawEmptyPieChart(ctx, rect.width, rect.height)
      return
    }
    
    const total = stats.reduce((sum, s) => sum + s.count, 0)
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const radius = Math.max(0, Math.min(centerX, centerY) - 20) // Ensure radius is never negative
    
    let currentAngle = -Math.PI / 2 // Start from top
    
    stats.forEach((stat, index) => {
      const sliceAngle = (stat.count / total) * 2 * Math.PI
      const colorIndex = index % this.constructor.PIE_COLORS.length
      
      // Draw slice
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
      ctx.closePath()
      ctx.fillStyle = this.constructor.PIE_COLORS[colorIndex]
      ctx.fill()
      
      // Draw slice border for separation
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 2
      ctx.stroke()
      
      currentAngle += sliceAngle
    })
    
    // Draw center circle (donut style)
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    
    // Draw total in center
    ctx.fillStyle = "#1a1a2e"
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(total.toString(), centerX, centerY - 8)
    
    ctx.font = "14px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#6b7280"
    ctx.fillText("pomodoros", centerX, centerY + 14)
  }

  /**
   * Draw an empty state pie chart
   */
  drawEmptyPieChart(ctx, width, height) {
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(centerX, centerY) - 20
    
    // Draw empty circle
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.fillStyle = "#e5e7eb"
    ctx.fill()
    
    // Draw center circle
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    
    // Draw text
    ctx.fillStyle = "#9ca3af"
    ctx.font = "14px system-ui, -apple-system, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("No data", centerX, centerY)
  }
}
