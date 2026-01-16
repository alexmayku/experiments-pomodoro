# frozen_string_literal: true

class PomodoroSession < ApplicationRecord
  self.table_name = "pomodoros"

  validates :duration_minutes, presence: true

  # Set completed_date from completed_at before saving
  before_save :set_completed_date, if: :completed_at_changed?

  # Pomodoros that have been completed (have a completed_at timestamp)
  scope :completed, -> { where.not(completed_at: nil) }

  # Pomodoros completed today (based on completed_date)
  scope :completed_today, -> {
    completed.where(completed_date: Date.current)
  }

  # Pomodoros for a specific date
  scope :for_date, ->(date) {
    completed.where(completed_date: date)
  }

  def completed?
    completed_at.present?
  end

  # Returns all unique tags used across all pomodoros
  # Tags are stored as comma-separated strings, so we split and flatten
  def self.all_tags
    completed
      .where.not(tags: [nil, ""])
      .pluck(:tags)
      .flat_map { |t| t.split(",").map(&:strip) }
      .uniq
      .sort
  end

  # Returns count of pomodoros per tag for pie chart visualization
  # Returns array of hashes: [{ tag: String, count: Integer }, ...]
  # Sorted by count descending
  def self.tag_statistics
    completed
      .where.not(tags: [nil, ""])
      .pluck(:tags)
      .tally
      .map { |tag, count| { tag: tag.strip, count: count } }
      .sort_by { |h| -h[:count] }
  end

  # Returns daily counts for the past N days (excluding today)
  # Returns array of hashes: [{ date: Date, count: Integer }, ...]
  def self.daily_counts(days: 30)
    start_date = Date.current - days.days
    end_date = Date.current - 1.day

    counts = completed
      .where(completed_date: start_date..end_date)
      .group(:completed_date)
      .count

    # Build array with all dates, filling in zeros for days with no pomodoros
    (start_date..end_date).map do |date|
      { date: date, count: counts[date] || 0 }
    end.reverse # Most recent first
  end

  private

  def set_completed_date
    self.completed_date = completed_at&.to_date
  end
end
