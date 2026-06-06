class BackfillBrokerPlatformFoundation < ActiveRecord::Migration[8.1]
  class MigrationBrokerage < ActiveRecord::Base
    self.table_name = "brokerages"
  end

  class MigrationAgent < ActiveRecord::Base
    self.table_name = "agents"
  end

  class MigrationListing < ActiveRecord::Base
    self.table_name = "listings"
  end

  class MigrationLead < ActiveRecord::Base
    self.table_name = "leads"
  end

  def up
    brokerage = MigrationBrokerage.find_or_create_by!(slug: "hafa-homes-demo") do |record|
      record.name = "Hafa Homes Demo Brokerage"
      record.status = "active"
      record.subscription_tier = "demo"
      record.primary_contact_name = "Hafa Homes Team"
      record.primary_contact_email = "hello@hafahomes.com"
      record.phone = "(671) 555-0199"
      record.website_url = "https://hafahomes.netlify.app"
      record.brand_primary_color = "#0f3d35"
      record.brand_accent_color = "#17a9df"
      record.app_display_name = "Hafa Homes"
      record.compliance_disclaimer = "Demo brokerage attribution for product development. Replace with authorized brokerage and MLS attribution before production MLS use."
      record.settings = {}
    end

    agent = MigrationAgent.find_or_create_by!(brokerage_id: brokerage.id, email: "hello@hafahomes.com") do |record|
      record.name = "Hafa Homes Team"
      record.phone = "(671) 555-0199"
      record.status = "active"
      record.bio = "Demo contact for Hafa Homes product development."
    end

    MigrationListing.where(brokerage_id: nil).update_all(
      brokerage_id: brokerage.id,
      agent_id: agent.id,
      brokerage_name: brokerage.name,
      agent_name: agent.name,
      updated_at: Time.current
    )

    MigrationLead.where(brokerage_id: nil).update_all(
      brokerage_id: brokerage.id,
      assigned_agent_id: agent.id,
      updated_at: Time.current
    )
  end

  def down
    brokerage = MigrationBrokerage.find_by(slug: "hafa-homes-demo")
    return unless brokerage

    MigrationLead.where(brokerage_id: brokerage.id).update_all(brokerage_id: nil, assigned_agent_id: nil, updated_at: Time.current)
    MigrationListing.where(brokerage_id: brokerage.id).update_all(brokerage_id: nil, agent_id: nil, updated_at: Time.current)
    MigrationAgent.where(brokerage_id: brokerage.id).delete_all
    brokerage.delete
  end
end
