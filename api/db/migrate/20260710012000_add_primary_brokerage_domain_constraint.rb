class AddPrimaryBrokerageDomainConstraint < ActiveRecord::Migration[8.1]
  def change
    add_index :brokerage_domains,
      :brokerage_id,
      unique: true,
      where: '"primary" = TRUE',
      name: "index_brokerage_domains_on_primary_brokerage"
  end
end
