module ClerkAuthenticatable
  extend ActiveSupport::Concern

  private

  def authenticate_user!
    decoded = decoded_clerk_token
    unless decoded
      render_unauthorized("Invalid or missing authentication token")
      return
    end

    @archived_user_authentication_attempt = false
    @current_user = find_or_create_user_from_clerk(decoded)
    if @archived_user_authentication_attempt
      render_forbidden(archived_account_message)
      return
    end

    unless @current_user
      render_unauthorized("Unable to authenticate user")
      return
    end

    if @current_user.archived?
      render_forbidden(archived_account_message)
      return
    end
  end

  def authenticate_user_optional
    decoded = decoded_clerk_token
    return unless decoded

    @archived_user_authentication_attempt = false
    user = find_or_create_user_from_clerk(decoded)
    @current_user = user unless user&.archived? || @archived_user_authentication_attempt
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
    phone = normalized_clerk_phone(phone_from_claims(decoded), clerk_id: clerk_id)
    clerk_profile = nil

    user = User.find_by(clerk_id: clerk_id)
    if user
      updates = { last_sign_in_at: Time.current }
      updates[:email] = email if email.present? && email.downcase != user.email
      updates[:first_name] = first_name if user.first_name.blank? && first_name.present?
      updates[:last_name] = last_name if user.last_name.blank? && last_name.present?
      updates[:phone] = phone if user.phone.blank? && phone.present?
      user.update(updates)
      return user
    end

    if email.blank? || first_name.blank? || last_name.blank? || phone.blank?
      clerk_profile = ClerkAuth.fetch_user_profile(clerk_id)
      email ||= clerk_profile&.dig(:email)
      first_name ||= clerk_profile&.dig(:first_name)
      last_name ||= clerk_profile&.dig(:last_name)
      phone ||= normalized_clerk_phone(clerk_profile&.dig(:phone), clerk_id: clerk_id)
    end

    if email.present?
      invited_user = User.find_by("LOWER(email) = ?", email.downcase)
      if invited_user&.archived?
        @archived_user_authentication_attempt = true
        return nil
      end
      return accept_invited_user(invited_user, clerk_id:, first_name:, last_name:, phone:) if invited_user
    else
      Rails.logger.warn("[ClerkAuth] No email resolved for Clerk user #{clerk_id}; refusing to create a local user without a verified email.")
      return nil
    end

    create_public_user!(clerk_id:, email:, first_name:, last_name:, phone:)
  rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid => e
    existing_user = User.find_by(clerk_id: clerk_id) || User.find_by("LOWER(email) = ?", email.to_s.downcase)
    return existing_user if existing_user && user_uniqueness_conflict?(e)

    Rails.logger.warn("[ClerkAuth] Unable to create local user for Clerk user #{clerk_id}: #{e.message}")
    nil
  end

  def accept_invited_user(user, clerk_id:, first_name:, last_name:, phone: nil)
    normalized_phone = normalized_clerk_phone(phone, clerk_id: clerk_id)
    user.update!(
      clerk_id: clerk_id,
      first_name: user.first_name.presence || first_name,
      last_name: user.last_name.presence || last_name,
      phone: user.phone.presence || normalized_phone,
      invitation_status: "accepted",
      accepted_at: user.accepted_at || Time.current,
      last_sign_in_at: Time.current
    )
    user
  rescue ActiveRecord::RecordNotUnique
    User.find_by(clerk_id: clerk_id) || user.reload
  end

  def user_uniqueness_conflict?(error)
    return true if error.is_a?(ActiveRecord::RecordNotUnique)
    return false unless error.is_a?(ActiveRecord::RecordInvalid) && error.record.is_a?(User)

    error.record.errors.details.slice(:clerk_id, :email).values.flatten.any? { |detail| detail[:error] == :taken }
  end

  def create_public_user!(clerk_id:, email:, first_name:, last_name:, phone: nil)
    resolved_email = email.to_s.strip.downcase
    normalized_phone = normalized_clerk_phone(phone, clerk_id: clerk_id)

    User.create!(
      clerk_id: clerk_id,
      email: resolved_email,
      first_name: first_name,
      last_name: last_name,
      phone: normalized_phone,
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

  def normalized_clerk_phone(phone, clerk_id:)
    return nil if phone.blank?

    normalized = ClicksendClient.normalize_phone(phone)
    return normalized if normalized.present?

    Rails.logger.warn("[ClerkAuth] Ignoring invalid Clerk phone for #{clerk_id}")
    nil
  end

  def phone_from_claims(decoded)
    direct = decoded["phone"] || decoded["phone_number"] || decoded["primary_phone_number"]
    return direct if direct.present?

    nested = decoded.dig("user", "phone") || decoded.dig("user", "phone_number") || decoded.dig("user", "primary_phone_number")
    return nested if nested.present?

    unsafe_metadata = decoded["unsafe_metadata"] || decoded.dig("user", "unsafe_metadata") || {}
    public_metadata = decoded["public_metadata"] || decoded.dig("user", "public_metadata") || {}
    unsafe_metadata["phone"].presence || public_metadata["phone"].presence
  end

  def archived_account_message
    "This account is archived. Contact Hafa Homes support if this looks wrong."
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
