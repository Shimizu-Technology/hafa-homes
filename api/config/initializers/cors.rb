# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

default_web_origins = ["http://localhost:5173"]

allowed_web_origins = ENV.fetch("WEB_ORIGINS", nil).to_s
  .split(",")
  .map(&:strip)
  .reject(&:empty?)

if allowed_web_origins.empty?
  allowed_web_origins = ENV.fetch("WEB_ORIGIN", nil).to_s
    .split(",")
    .map(&:strip)
    .reject(&:empty?)
end

allowed_web_origins = default_web_origins if allowed_web_origins.empty? && !Rails.env.production?

if allowed_web_origins.empty?
  raise "WEB_ORIGINS or WEB_ORIGIN must include at least one allowed web origin"
end

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*allowed_web_origins)

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
