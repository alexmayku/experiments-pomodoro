# frozen_string_literal: true

# Service object to interact with Google Calendar API
# Fetches today's events for the signed-in user
class GoogleCalendarService
  class Error < StandardError; end
  class AuthorizationError < Error; end
  class RateLimitError < Error; end

  def initialize(user)
    @user = user
  end

  # Fetch today's events from the user's primary calendar
  # @return [Array<Hash>] Array of event hashes with :id, :title, :start_time, :end_time, :all_day
  def todays_events
    ensure_valid_token!
    fetch_todays_events
  rescue Google::Apis::AuthorizationError => e
    handle_authorization_error(e)
  rescue Google::Apis::RateLimitError
    raise RateLimitError, "Rate limit exceeded. Please try again later."
  end

  private

  def fetch_todays_events
    # Get today's date range in user's timezone (or UTC)
    today_start = Time.current.beginning_of_day.iso8601
    today_end = Time.current.end_of_day.iso8601

    events = []

    response = client.list_events(
      "primary",
      time_min: today_start,
      time_max: today_end,
      single_events: true,
      order_by: "startTime",
      max_results: 50
    )

    if response.items.present?
      events = response.items.map { |event| event_to_hash(event) }
    end

    events
  end

  def event_to_hash(event)
    # Handle all-day events vs timed events
    if event.start.date
      # All-day event
      {
        id: event.id,
        title: event.summary || "Untitled",
        start_time: nil,
        end_time: nil,
        all_day: true
      }
    else
      # Timed event
      {
        id: event.id,
        title: event.summary || "Untitled",
        start_time: event.start.date_time&.to_time,
        end_time: event.end&.date_time&.to_time,
        all_day: false
      }
    end
  end

  def ensure_valid_token!
    @user.refresh_access_token! if @user.token_expired?
    @client = nil # Reset client to use new token
  end

  def handle_authorization_error(error)
    # Try to refresh token once and retry
    @user.refresh_access_token!
    @client = nil
    fetch_todays_events
  rescue Signet::AuthorizationError
    raise AuthorizationError, "Unable to authenticate with Google. Please sign in again."
  end

  def client
    @client ||= begin
      service = Google::Apis::CalendarV3::CalendarService.new
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

