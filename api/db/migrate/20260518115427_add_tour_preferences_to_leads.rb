class AddTourPreferencesToLeads < ActiveRecord::Migration[8.1]
  def change
    add_column :leads, :preferred_time, :string
    add_column :leads, :preferred_tour_date, :date
    add_column :leads, :tour_type, :string
    add_column :leads, :target_price, :decimal
  end
end
