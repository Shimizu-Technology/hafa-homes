module Api
  module V1
    module Admin
      class BrokerageDomainsController < ApplicationController
        include ClerkAuthenticatable

        before_action :authenticate_user!
        before_action :require_platform_admin!
        before_action :set_domain, only: [ :update, :destroy ]

        def index
          domains = BrokerageDomain.includes(:brokerage).order(:hostname)
          render json: { brokerage_domains: domains.map(&:as_api_json) }
        end

        def create
          domain = BrokerageDomain.new(domain_params)
          persist_domain(domain, status: :created)
        end

        def update
          @domain.assign_attributes(domain_params)
          persist_domain(@domain)
        end

        def destroy
          @domain.brokerage.with_lock do
            if last_active_domain?
              render json: { errors: [ "Deactivate the brokerage or add another active domain before deleting its last active domain" ] },
                status: :unprocessable_entity
              return
            end

            @domain.destroy!
          end

          head :no_content
        end

        private

        def set_domain
          @domain = BrokerageDomain.find(params[:id])
        end

        def last_active_domain?
          @domain.status == "active" &&
            @domain.brokerage.status == "active" &&
            !BrokerageDomain.active.where(brokerage_id: @domain.brokerage_id).where.not(id: @domain.id).exists?
        end

        def persist_domain(domain, status: :ok)
          BrokerageDomain.transaction do
            # Serialize primary-domain changes per brokerage so concurrent
            # admins cannot race the partial unique index.
            domain.brokerage&.lock!

            if domain.primary?
              BrokerageDomain.where(brokerage_id: domain.brokerage_id, primary: true).where.not(id: domain.id).update_all(primary: false, updated_at: Time.current)
            end
            domain.save!
          end

          render json: { brokerage_domain: domain.as_api_json }, status: status
        rescue ActiveRecord::RecordInvalid => e
          render json: { errors: e.record.errors.full_messages }, status: :unprocessable_entity
        rescue ActiveRecord::RecordNotUnique
          render json: { errors: [ "Domain configuration changed concurrently; reload and try again" ] }, status: :unprocessable_entity
        end

        def domain_params
          params.require(:brokerage_domain).permit(:brokerage_id, :hostname, :status, :primary)
        end
      end
    end
  end
end
