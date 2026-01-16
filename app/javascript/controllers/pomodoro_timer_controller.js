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
  static targets = ["timer", "status", "startButton", "stopButton", "description", "tagInput", "tagDropdown", "addNewOption", "addNewText", "combobox", "count", "container", "activeTitle", "sidebar", "sidebarToggle", "sidebarToggleIcon", "todayProgress", "tagStatsModal", "pieChart", "pieChartContainer", "tagStatsLegend"]
  static values = { todayCount: Number, todayDate: String, dailyTarget: Number, tagStatistics: Array }
  
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

    this.updateDisplay()
    this.updateVisualState()
    this.updateButtons()
    this.updateTodayProgress()
    
    // Set up click outside listener for combobox
    this.handleClickOutside = this.handleClickOutside.bind(this)
    document.addEventListener("click", this.handleClickOutside)
  }

  disconnect() {
    this.stopTimer()
    document.removeEventListener("click", this.handleClickOutside)
  }

  /**
   * Toggle the sidebar visibility
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
      this.stopTimer()

      if (this.state === "pomodoro_running") {
        this.completePomodoro()
      } else if (this.state === "break_running") {
        this.completeBreak()
      }
    }
  }

  /**
   * Handle Pomodoro completion
   * - Persists to server
   * - Determines break type
   * - Starts appropriate break
   */
  async completePomodoro() {
    const completedAt = new Date()

    // Check for date change before saving
    this.checkDateChange()

    // Persist to server
    const response = await this.savePomodoro(completedAt)

    // Update count from server response if available, otherwise increment locally
    if (response && response.today_count !== undefined) {
      this.completedToday = response.today_count
      this.currentDate = response.today_date || this.currentDate
      
      // Update tags dropdown with any new tags from the database
      if (response.available_tags) {
        this.updateTagsDropdown(response.available_tags)
      }
    } else {
      this.completedToday++
    }
    this.updateCount()

    // Determine break type and duration
    const { isLongBreak, duration, durationMinutes } = this.determineBreak()

    // Show notification
    this.showNotification(
      "Pomodoro complete",
      isLongBreak
        ? `${durationMinutes} minute long break.`
        : `${durationMinutes} minute break.`
    )

    // Start break automatically
    this.state = "break_running"
    this.secondsRemaining = duration
    this.updateUI()
    this.startTimer()
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

    try {
      const response = await fetch("/pomodoros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          pomodoro: {
            started_at: this.pomodoroStartedAt.toISOString(),
            completed_at: completedAt.toISOString(),
            description: this.descriptionTarget.value || null,
            tags: this.getSelectedTag(),
            duration_minutes: 25
          }
        })
      })

      if (response.ok) {
        return await response.json()
      } else {
        console.error("Failed to save pomodoro:", await response.text())
        return null
      }
    } catch (error) {
      console.error("Error saving pomodoro:", error)
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
    this.countTarget.textContent = this.completedToday
    this.updateTodayProgress()
  }

  /**
   * Update today's progress bar fill
   */
  updateTodayProgress() {
    if (!this.hasTodayProgressTarget) return
    
    const progress = Math.min((this.completedToday / this.dailyTarget) * 100, 100)
    this.todayProgressTarget.style.setProperty("--progress", `${progress}%`)
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
    if (!this.hasTagStatsLegendTarget) return
    
    const colorDots = this.tagStatsLegendTarget.querySelectorAll(".legend-color")
    colorDots.forEach((dot, index) => {
      const colorIndex = index % this.constructor.PIE_COLORS.length
      dot.style.backgroundColor = this.constructor.PIE_COLORS[colorIndex]
    })
  }

  /**
   * Render the pie chart on the canvas
   */
  renderPieChart() {
    if (!this.hasPieChartTarget) return
    
    const stats = this.tagStatisticsValue || []
    const canvas = this.pieChartTarget
    const ctx = canvas.getContext("2d")
    
    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    
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
    const radius = Math.min(centerX, centerY) - 20
    
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
