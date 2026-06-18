class AddRequestedAgentToLeads < ActiveRecord::Migration[8.1]
  def change
    add_reference :leads, :requested_agent, foreign_key: { to_table: :agents }
    add_index :leads, [:requested_agent_id, :created_at]
  end
end
