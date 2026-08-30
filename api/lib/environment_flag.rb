module EnvironmentFlag
  TRUTHY_VALUES = %w[1 true t yes y on].freeze

  def self.enabled?(name, default: false)
    TRUTHY_VALUES.include?(ENV.fetch(name, default.to_s).to_s.strip.downcase)
  end
end
