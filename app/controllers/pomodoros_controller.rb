# frozen_string_literal: true

class PomodorosController < ApplicationController
  def index
    @today_count = PomodoroSession.completed_today.count
    @today_pomodoros = PomodoroSession.completed_today.order(started_at: :desc)
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
      # Return the new pomodoro data along with counts and stats
      render json: {
        success: true,
        today_count: PomodoroSession.completed_today.count,
        today_date: Date.current.iso8601,
        available_tags: Tag.all_names,
        tag_statistics: PomodoroSession.tag_statistics,
        pomodoro: {
          id: @pomodoro.id,
          description: @pomodoro.description,
          started_at: @pomodoro.started_at&.strftime("%H:%M")
        }
      }, status: :created
    else
      render json: {
        success: false,
        errors: @pomodoro.errors.full_messages
      }, status: :unprocessable_entity
    end
  end

  def destroy
    @pomodoro = PomodoroSession.find_by(id: params[:id])
    
    if @pomodoro
      @pomodoro.destroy
    end
    
    # Always return success with updated stats so UI can update
    respond_to do |format|
      format.json do
        render json: {
          success: true,
          today_count: PomodoroSession.completed_today.count,
          tag_statistics: PomodoroSession.tag_statistics
        }
      end
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
