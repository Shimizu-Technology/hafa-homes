Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resource :me, only: [:show], controller: :me
      resources :listings, only: [:index, :show]
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
