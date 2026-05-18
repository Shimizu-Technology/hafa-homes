module Api
  module V1
    class SavedSearchesController < ApplicationController
      def create
        saved_search = SavedSearch.new(saved_search_params)

        if saved_search.save
          render json: {
            saved_search: saved_search.as_json(only: [:id, :name, :email, :filters, :alert_frequency])
          }, status: :created
        else
          render json: { errors: saved_search.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def saved_search_params
        params.require(:saved_search).permit(:name, :email, :alert_frequency, filters: {})
      end
    end
  end
end
