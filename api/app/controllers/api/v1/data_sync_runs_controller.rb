module Api
  module V1
    class DataSyncRunsController < ApplicationController
      include ClerkAuthenticatable

      before_action :authenticate_user!
      before_action :require_platform_admin!

      def index
        runs = DataSyncRun.order(started_at: :desc, created_at: :desc).limit(10)

        render json: {
          data_sync_runs: runs.map do |run|
            run.as_json(
              only: [
                :id,
                :provider,
                :status,
                :started_at,
                :finished_at,
                :imported_count,
                :updated_count,
                :inactive_count,
                :error_count,
                :notes
              ]
            )
          end
        }
      end
    end
  end
end
