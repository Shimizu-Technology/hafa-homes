require "uri"

class CreateBrokerageDomains < ActiveRecord::Migration[8.1]
  def up
    create_table :brokerage_domains do |t|
      t.references :brokerage, null: false, foreign_key: { on_delete: :cascade }
      t.string :hostname, null: false
      t.string :status, null: false, default: "active"
      t.boolean :primary, null: false, default: false
      t.timestamps
    end

    add_index :brokerage_domains, "LOWER(hostname)", unique: true, name: "index_brokerage_domains_on_lower_hostname"
    add_index :brokerage_domains, [ :brokerage_id, :status ]

    backfill_known_domains
  end

  def down
    drop_table :brokerage_domains
  end

  private

  def backfill_known_domains
    brokerage_class = Class.new(ActiveRecord::Base) do
      self.table_name = "brokerages"
    end
    domain_class = Class.new(ActiveRecord::Base) do
      self.table_name = "brokerage_domains"
    end

    brokerage_class.find_each do |brokerage|
      hosts = []
      begin
        hosts << URI.parse(brokerage.website_url).host if brokerage.website_url.present?
      rescue URI::InvalidURIError
        # Invalid legacy URLs stay visible in admin but are not routing domains.
      end
      hosts.concat(%w[hafahomes.com www.hafahomes.com]) if brokerage.slug.to_s.start_with?("hafa-homes")

      hosts.compact.map { |host| host.to_s.downcase.sub(/\Awww\./, "") }.uniq.each_with_index do |host, index|
        domain_class.create!(brokerage_id: brokerage.id, hostname: host, primary: index.zero?, status: "active")
      end
    end
  end
end
