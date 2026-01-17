# frozen_string_literal: true

class TasksController < ApplicationController
  before_action :require_authentication
  before_action :require_task_list, only: [:index]

  # GET /tasks
  # Fetches and displays incomplete tasks from Google Tasks
  # Supports both HTML and JSON responses for the sidebar
  def index
    @tasks = google_tasks_service.incomplete_tasks
    
    respond_to do |format|
      format.html
      format.json { render json: { success: true, tasks: @tasks } }
    end
  rescue GoogleTasksService::AuthorizationError => e
    # Token refresh failed - user needs to re-authenticate
    session.delete(:user_id)
    respond_to do |format|
      format.html { redirect_to root_path, alert: "Session expired. Please sign in again." }
      format.json { render json: { success: false, error: "Session expired", reauth: true }, status: :unauthorized }
    end
  rescue GoogleTasksService::ListNotFoundError => e
    # Task list was deleted or doesn't exist
    current_user.update(google_tasks_list_id: nil)
    respond_to do |format|
      format.html { redirect_to lists_tasks_path, alert: "Task list not found. Please select another list." }
      format.json { render json: { success: false, error: "Task list not found", no_list: true }, status: :not_found }
    end
  rescue GoogleTasksService::RateLimitError => e
    @error = e.message
    @tasks = []
    respond_to do |format|
      format.html
      format.json { render json: { success: false, error: e.message }, status: :too_many_requests }
    end
  rescue GoogleTasksService::Error => e
    @error = e.message
    @tasks = []
    respond_to do |format|
      format.html
      format.json { render json: { success: false, error: e.message }, status: :internal_server_error }
    end
  end

  # GET /tasks/lists
  # Shows available task lists for the user to choose from
  def lists
    @task_lists = google_tasks_service.task_lists
  rescue GoogleTasksService::AuthorizationError
    session.delete(:user_id)
    redirect_to root_path, alert: "Session expired. Please sign in again."
  rescue GoogleTasksService::Error => e
    @error = e.message
    @task_lists = []
  end

  # POST /tasks/select_list
  # Saves the selected task list ID to the user's profile
  def select_list
    current_user.update!(google_tasks_list_id: params[:list_id])
    redirect_to tasks_path, notice: "Task list selected successfully."
  rescue ActiveRecord::RecordInvalid => e
    redirect_to lists_tasks_path, alert: "Failed to save task list selection."
  end

  private

  def google_tasks_service
    @google_tasks_service ||= GoogleTasksService.new(current_user)
  end

  def require_task_list
    if current_user.google_tasks_list_id.blank?
      redirect_to lists_tasks_path, notice: "Please select a task list first."
    end
  end
end

