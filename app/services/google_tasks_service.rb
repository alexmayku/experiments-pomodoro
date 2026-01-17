# frozen_string_literal: true

# Service object to interact with Google Tasks API
# Handles token refresh, pagination, and error handling
class GoogleTasksService
  class Error < StandardError; end
  class AuthorizationError < Error; end
  class ListNotFoundError < Error; end
  class RateLimitError < Error; end

  MAX_RESULTS_PER_PAGE = 100

  def initialize(user)
    @user = user
  end

  # Fetch all incomplete tasks from a specific list
  # @param list_id [String, nil] The task list ID (uses user's default if nil)
  # @return [Array<Hash>] Array of task hashes with :id, :title, :notes, :due, :updated
  def incomplete_tasks(list_id = nil)
    list_id ||= @user.google_tasks_list_id
    raise ListNotFoundError, "No task list ID specified" if list_id.blank?

    ensure_valid_token!
    fetch_incomplete_tasks(list_id)
  rescue Google::Apis::AuthorizationError => e
    handle_authorization_error(e, list_id)
  rescue Google::Apis::ClientError => e
    handle_client_error(e)
  rescue Google::Apis::RateLimitError => e
    raise RateLimitError, "Rate limit exceeded. Please try again later."
  end

  # Fetch all task lists for the user (useful for letting user choose a list)
  # @return [Array<Hash>] Array of task list hashes with :id and :title
  def task_lists
    ensure_valid_token!
    fetch_all_task_lists
  rescue Google::Apis::AuthorizationError => e
    handle_authorization_error_for_lists(e)
  rescue Google::Apis::RateLimitError
    raise RateLimitError, "Rate limit exceeded. Please try again later."
  end

  private

  def fetch_incomplete_tasks(list_id)
    tasks = []
    page_token = nil

    loop do
      # The API supports showCompleted=false to filter server-side
      response = client.list_tasks(
        list_id,
        max_results: MAX_RESULTS_PER_PAGE,
        page_token: page_token,
        show_completed: false,  # Only fetch incomplete tasks
        show_hidden: false      # Don't show hidden tasks
      )

      if response.items.present?
        tasks.concat(response.items.map { |task| task_to_hash(task) })
      end

      page_token = response.next_page_token
      break if page_token.nil?
    end

    tasks
  end

  def fetch_all_task_lists
    lists = []
    page_token = nil

    loop do
      response = client.list_tasklists(
        max_results: MAX_RESULTS_PER_PAGE,
        page_token: page_token
      )

      if response.items.present?
        lists.concat(response.items.map { |list| { id: list.id, title: list.title } })
      end

      page_token = response.next_page_token
      break if page_token.nil?
    end

    lists
  end

  def task_to_hash(task)
    {
      id: task.id,
      title: task.title,
      notes: task.notes,
      due: task.due ? Time.parse(task.due) : nil,
      updated: task.updated ? Time.parse(task.updated) : nil,
      parent: task.parent,
      position: task.position
    }
  end

  def ensure_valid_token!
    @user.refresh_access_token! if @user.token_expired?
    @client = nil # Reset client to use new token
  end

  def handle_authorization_error(error, list_id)
    # Try to refresh token once and retry
    @user.refresh_access_token!
    @client = nil
    fetch_incomplete_tasks(list_id)
  rescue Signet::AuthorizationError
    raise AuthorizationError, "Unable to authenticate with Google. Please sign in again."
  end

  def handle_authorization_error_for_lists(error)
    @user.refresh_access_token!
    @client = nil
    fetch_all_task_lists
  rescue Signet::AuthorizationError
    raise AuthorizationError, "Unable to authenticate with Google. Please sign in again."
  end

  def handle_client_error(error)
    if error.status_code == 404
      raise ListNotFoundError, "Task list not found. It may have been deleted."
    else
      raise Error, "Google Tasks API error: #{error.message}"
    end
  end

  def client
    @client ||= begin
      service = Google::Apis::TasksV1::TasksService.new
      service.authorization = access_token_credentials
      service
    end
  end

  def access_token_credentials
    Google::Auth::UserRefreshCredentials.new(
      client_id: Rails.application.credentials.dig(:google, :client_id),
      client_secret: Rails.application.credentials.dig(:google, :client_secret),
      access_token: @user.access_token,
      refresh_token: @user.refresh_token,
      expires_at: @user.token_expires_at
    )
  end
end

