class AddQualificationFieldsToLeads < ActiveRecord::Migration[8.1]
  def change
    add_column :leads, :prequalified_status, :string
    add_column :leads, :lender_name, :string
    add_column :leads, :purchase_timeline, :string
    add_column :leads, :budget_min, :decimal
    add_column :leads, :budget_max, :decimal
    add_column :leads, :desired_villages, :text
    add_column :leads, :desired_beds, :integer
    add_column :leads, :desired_baths, :decimal
    add_column :leads, :buyer_status, :string
    add_column :leads, :already_working_with_agent, :string
    add_column :leads, :qualification_notes, :text
    add_column :leads, :quality_score, :integer, null: false, default: 0

    add_index :leads, :prequalified_status
    add_index :leads, :purchase_timeline
    add_index :leads, :quality_score
  end
end
