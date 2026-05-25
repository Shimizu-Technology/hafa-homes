class AddLocalIntelToVillages < ActiveRecord::Migration[8.1]
  def change
    add_column :villages, :local_intel, :jsonb, null: false, default: {}
  end
end
