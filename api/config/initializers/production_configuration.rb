Rails.application.config.after_initialize do
  ProductionConfiguration.validate! if Rails.env.production?
end
