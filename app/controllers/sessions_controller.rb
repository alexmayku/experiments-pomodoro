# frozen_string_literal: true

class SessionsController < ApplicationController
  # Skip CSRF protection for OmniAuth callback (handled by omniauth-rails_csrf_protection gem)
  skip_before_action :verify_authenticity_token, only: [:create]

  # GET /auth/google_oauth2/callback
  # OmniAuth callback - creates or updates user from Google OAuth data
  def create
    user = User.from_omniauth(auth_hash)
    session[:user_id] = user.id
    redirect_to root_path, notice: "Successfully signed in with Google!"
  rescue ActiveRecord::RecordInvalid => e
    Rails.logger.error("OAuth login failed: #{e.message}")
    redirect_to root_path, alert: "Authentication failed. Please try again."
  end

  # GET /auth/failure
  # Handles OmniAuth failures (user denied access, etc.)
  def failure
    redirect_to root_path, alert: "Authentication failed: #{params[:message].humanize}"
  end

  # DELETE /logout
  def destroy
    session.delete(:user_id)
    redirect_to root_path, notice: "Signed out successfully."
  end

  private

  def auth_hash
    request.env["omniauth.auth"]
  end
end

