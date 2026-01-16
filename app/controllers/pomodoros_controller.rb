# frozen_string_literal: true

class PomodorosController < ApplicationController
  def index
    @today_count = PomodoroSession.completed_today.count
    @daily_history = PomodoroSession.daily_counts(days: 5)
    @today_date = Date.current.iso8601
    @available_tags = Tag.all_names
    @tag_statistics = PomodoroSession.tag_statistics
  end

  def tag_statistics
    stats = PomodoroSession.tag_statistics
    render json: { success: true, statistics: stats }
  end

  def create
    @pomodoro = PomodoroSession.new(pomodoro_params)

    if @pomodoro.save
      render json: {
        success: true,
        today_count: PomodoroSession.completed_today.count,
        today_date: Date.current.iso8601,
        available_tags: Tag.all_names
      }, status: :created
    else
      render json: {
        success: false,
        errors: @pomodoro.errors.full_messages
      }, status: :unprocessable_entity
    end
  end

  private

  def pomodoro_params
    params.require(:pomodoro).permit(
      :description,
      :tags,
      :started_at,
      :completed_at,
      :duration_minutes
    )
  end
end
