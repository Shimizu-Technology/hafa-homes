Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      resources :listings, only: [:index, :show]
      resources :villages, only: [:index]
      resources :leads, only: [:create]
      resources :data_sync_runs, only: [:index]
    end
  end
end
