# frozen_string_literal: true

Rails.application.config.middleware.use OmniAuth::Builder do
  provider :google_oauth2,
           Rails.application.credentials.dig(:google, :client_id),
           Rails.application.credentials.dig(:google, :client_secret),
           {
             scope: "email,https://www.googleapis.com/auth/tasks",
             access_type: "offline",      # Required to get refresh_token
             prompt: "consent",           # Force consent screen to always get refresh_token
             name: "google_oauth2"
           }
end

# Handle OmniAuth failures gracefully
OmniAuth.config.on_failure = proc { |env|
  OmniAuth::FailureEndpoint.new(env).redirect_to_failure
}

