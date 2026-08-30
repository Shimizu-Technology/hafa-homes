Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :context, only: [ :show ], controller: :contexts
      resource :me, only: [ :show, :update, :destroy ], controller: :me do
        get :leads
        get "leads/:id", action: :lead, as: :lead
      end
      get "me/search_profile", to: "search_profiles#show"
      patch "me/search_profile", to: "search_profiles#update"
      get "me/saved_listings", to: "saved_listings#index"
      resources :listings, only: [ :index, :show ] do
        post :save, on: :member, to: "saved_listings#create"
        delete :save, on: :member, to: "saved_listings#destroy"
      end
      resources :villages, only: [ :index ]
      resources :agents, only: [ :index ]
      resource :lead_intent, only: [], controller: :lead_intents do
        post :events
        post :dismiss
      end
      resources :leads, only: [ :index, :show, :create, :update ] do
        post :notifications, on: :member, to: "leads#send_notification"
        resources :lead_notes, only: [ :index, :create ], path: "notes"
        resources :lead_tasks, only: [ :index, :create ], path: "tasks"
        resources :lead_activities, only: [ :index ], path: "activities"
      end
      resources :lead_notes, only: [ :update ]
      resources :lead_tasks, only: [ :update ]
      resources :showing_appointments, only: [ :index, :show, :create, :update ]
      resources :saved_searches, only: [ :create ]
      resources :data_sync_runs, only: [ :index ]

      namespace :admin do
        get "dashboard", to: "dashboard#show"
        get "brokerages/:brokerage_id/customers/:user_id", to: "customer_workspaces#show", as: :brokerage_customer_workspace
        resources :brokerages, only: [ :index, :update ]
        resources :brokerage_domains, only: [ :index, :create, :update, :destroy ]
        resources :agents, only: [ :index ]
        resources :users, only: [ :index, :create, :update ]
        resources :lead_intent_sessions, only: [ :index ]
        resources :audit_events, only: [ :index ]
      end
    end
  end
end
