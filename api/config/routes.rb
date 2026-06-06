Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :me, only: [:show], controller: :me
      get "me/saved_listings", to: "saved_listings#index"
      resources :listings, only: [:index, :show] do
        post :save, on: :member, to: "saved_listings#create"
        delete :save, on: :member, to: "saved_listings#destroy"
      end
      resources :villages, only: [:index]
      resources :leads, only: [:index, :create]
      resources :saved_searches, only: [:create]
      resources :data_sync_runs, only: [:index]

      namespace :admin do
        resources :users, only: [:index]
      end
    end
  end
end
