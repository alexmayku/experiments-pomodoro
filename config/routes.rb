Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # OmniAuth routes
  get "/auth/:provider/callback", to: "sessions#create"
  get "/auth/failure", to: "sessions#failure"
  delete "/logout", to: "sessions#destroy", as: :logout

  # Google Tasks
  resources :tasks, only: [:index] do
    member do
      post :complete
    end
    collection do
      get :lists
      post :select_list
    end
  end

  # Google Calendar
  resources :calendar_events, only: [:index]

  # Pomodoro timer app
  root "pomodoros#index"
  resources :pomodoros, only: [:create, :destroy] do
    collection do
      get :tag_statistics
    end
  end
  resources :tags, only: [:create]
end
