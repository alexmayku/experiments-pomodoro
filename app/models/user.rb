# frozen_string_literal: true

class User < ApplicationRecord
  validates :email, presence: true, uniqueness: true
  validates :google_uid, presence: true, uniqueness: true

  # Check if the OAuth access token has expired
  def token_expired?
    token_expires_at.present? && token_expires_at < Time.current
  end

  # Refresh the access token using the refresh token
  # This calls Google's OAuth endpoint to get a new access_token
  def refresh_access_token!
    return unless refresh_token.present?

    client = Signet::OAuth2::Client.new(
      client_id: Rails.application.credentials.dig(:google, :client_id),
      client_secret: Rails.application.credentials.dig(:google, :client_secret),
      token_credential_uri: "https://oauth2.googleapis.com/token",
      refresh_token: refresh_token
    )

    client.fetch_access_token!

    update!(
      access_token: client.access_token,
      token_expires_at: Time.current + client.expires_in.seconds
    )
  rescue Signet::AuthorizationError => e
    Rails.logger.error("Failed to refresh access token for user #{id}: #{e.message}")
    raise
  end

  # Create or update a user from OmniAuth callback data
  def self.from_omniauth(auth)
    find_or_initialize_by(google_uid: auth.uid).tap do |user|
      user.email = auth.info.email
      user.access_token = auth.credentials.token
      user.refresh_token = auth.credentials.refresh_token if auth.credentials.refresh_token.present?
      user.token_expires_at = Time.at(auth.credentials.expires_at) if auth.credentials.expires_at
      user.save!
    end
  end
end

