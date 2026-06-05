module ClerkAuthenticatable
  extend ActiveSupport::Concern

  private

  def authenticate_user!
    decoded = decoded_clerk_token
    unless decoded
      render_unauthorized("Invalid or missing authentication token")
      return
    end

    @current_user = find_or_create_user_from_clerk(decoded)
    unless @current_user
      render_unauthorized("Unable to authenticate user")
      return
    end
  end

  def authenticate_user_optional
    decoded = decoded_clerk_token
    return unless decoded

    @current_user = find_or_create_user_from_clerk(decoded)
  end

  def current_user
    @current_user
  end

  def require_platform_admin!
    return if performed?

    authenticate_user! unless @current_user
    return if performed?

    render_forbidden("Platform admin access required") unless @current_user&.platform_admin?
  end

  def require_staff!
    return if performed?

    authenticate_user! unless @current_user
    return if performed?

    render_forbidden("Staff access required") unless @current_user&.staff?
  end

  def decoded_clerk_token
    header = request.headers["Authorization"]
    return nil unless header.present?

    token = header.split.last
    ClerkAuth.verify(token)
  end

  def find_or_create_user_from_clerk(decoded)
    clerk_id = decoded["sub"]
    return nil if clerk_id.blank?

    email = email_from_claims(decoded)
    first_name = decoded["first_name"] || decoded.dig("user", "first_name")
    last_name = decoded["last_name"] || decoded.dig("user", "last_name")

    user = User.find_by(clerk_id: clerk_id)
    if user
      updates = { last_sign_in_at: Time.current }
      updates[:email] = email if email.present? && email.downcase != user.email
      updates[:first_name] = first_name if first_name.present?
      updates[:last_name] = last_name if last_name.present?
      user.update(updates)
      return user
    end

    if email.blank?
      email = ClerkAuth.fetch_user_email(clerk_id)
    end

    if email.present?
      invited_user = User.find_by("LOWER(email) = ?", email.downcase)
      return accept_invited_user(invited_user, clerk_id:, first_name:, last_name:) if invited_user
    else
      Rails.logger.warn("[ClerkAuth] No email resolved for Clerk user #{clerk_id}; refusing to create a local user without a verified email.")
      return nil
    end

    create_public_user!(clerk_id:, email:, first_name:, last_name:)
  rescue ActiveRecord::RecordNotUnique
    User.find_by(clerk_id: clerk_id) || User.find_by("LOWER(email) = ?", email.to_s.downcase)
  end

  def accept_invited_user(user, clerk_id:, first_name:, last_name:)
    user.update!(
      clerk_id: clerk_id,
      first_name: first_name.presence || user.first_name,
      last_name: last_name.presence || user.last_name,
      invitation_status: "accepted",
      accepted_at: user.accepted_at || Time.current,
      last_sign_in_at: Time.current
    )
    user
  rescue ActiveRecord::RecordNotUnique
    User.find_by(clerk_id: clerk_id) || user.reload
  end

  def create_public_user!(clerk_id:, email:, first_name:, last_name:)
    resolved_email = email.to_s.strip.downcase

    User.create!(
      clerk_id: clerk_id,
      email: resolved_email,
      first_name: first_name,
      last_name: last_name,
      role: default_role_for(resolved_email),
      invitation_status: "accepted",
      accepted_at: Time.current,
      last_sign_in_at: Time.current
    )
  end

  def default_role_for(email)
    admin_email = ENV.fetch("PLATFORM_ADMIN_EMAIL") do
      Rails.logger.warn("[ClerkAuth] PLATFORM_ADMIN_EMAIL is not set; no automatic platform_admin will be granted on sign-up.")
      nil
    end

    admin_email.present? && email.to_s.downcase == admin_email.downcase ? "platform_admin" : "consumer"
  end

  def email_from_claims(decoded)
    direct = decoded["email"] || decoded["email_address"] || decoded["primary_email_address"]
    return direct if direct.present?

    nested = decoded.dig("user", "email") || decoded.dig("user", "email_address") || decoded.dig("user", "primary_email_address")
    return nested if nested.present?

    emails = decoded["email_addresses"] || decoded.dig("user", "email_addresses")
    if emails.is_a?(Array)
      primary_id = decoded["primary_email_address_id"] || decoded.dig("user", "primary_email_address_id")
      primary = emails.find { |address| address.is_a?(Hash) && address["id"] == primary_id }
      first = primary || emails.find { |address| address.is_a?(Hash) }
      return first["email_address"] || first["email"] if first
    end

    nil
  end

  def render_unauthorized(message = "Unauthorized")
    render json: { error: message }, status: :unauthorized
  end

  def render_forbidden(message = "Forbidden")
    render json: { error: message }, status: :forbidden
  end
end
