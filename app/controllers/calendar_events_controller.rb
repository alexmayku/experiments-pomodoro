# frozen_string_literal: true

class CalendarEventsController < ApplicationController
  before_action :require_authentication

  def index
    service = GoogleCalendarService.new(current_user)
    events = service.todays_events

    respond_to do |format|
      format.json { render json: { success: true, events: events } }
    end
  rescue GoogleCalendarService::AuthorizationError => e
    respond_to do |format|
      format.json { render json: { success: false, error: e.message, reauth: true }, status: :unauthorized }
    end
  rescue GoogleCalendarService::RateLimitError => e
    respond_to do |format|
      format.json { render json: { success: false, error: e.message }, status: :too_many_requests }
    end
  rescue GoogleCalendarService::Error => e
    respond_to do |format|
      format.json { render json: { success: false, error: e.message }, status: :internal_server_error }
    end
  end
end

