Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :me, only: [:show], controller: :me do
        get :leads
      end
      get "me/saved_listings", to: "saved_listings#index"
      resources :listings, only: [:index, :show] do
        post :save, on: :member, to: "saved_listings#create"
        delete :save, on: :member, to: "saved_listings#destroy"
      end
      resources :villages, only: [:index]
      resources :leads, only: [:index, :show, :create, :update] do
        post :notifications, on: :member, to: "leads#send_notification"
        resources :lead_notes, only: [:index, :create], path: "notes"
        resources :lead_tasks, only: [:index, :create], path: "tasks"
        resources :lead_activities, only: [:index], path: "activities"
      end
      resources :lead_notes, only: [:update]
      resources :lead_tasks, only: [:update]
      resources :showing_appointments, only: [:index, :show, :create, :update]
      resources :saved_searches, only: [:create]
      resources :data_sync_runs, only: [:index]

      namespace :admin do
        get "dashboard", to: "dashboard#show"
        resources :brokerages, only: [:index]
        resources :agents, only: [:index]
        resources :users, only: [:index, :update]
      end
    end
  end
end
