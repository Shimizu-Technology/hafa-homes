module PaginatedResponse
  extend ActiveSupport::Concern

  private

  def paginated_response(scope, collection_key, default_per_page: 10, max_per_page: 50)
    page = [integer_pagination_param(params[:page], fallback: 1), 1].max
    per_page = [[integer_pagination_param(params[:per_page], fallback: default_per_page), 1].max, max_per_page].min
    total_count = scope.count
    primary_key = scope.klass.arel_table[scope.klass.primary_key]
    records = scope.order(primary_key.asc).offset((page - 1) * per_page).limit(per_page)
    total_pages = (total_count.to_f / per_page).ceil

    {
      collection_key => records.map { |record| yield(record) },
      pagination: {
        page: page,
        per_page: per_page,
        total_count: total_count,
        total_pages: total_pages,
        previous_page: page > 1 ? page - 1 : nil,
        next_page: page < total_pages ? page + 1 : nil
      }
    }
  end

  def integer_pagination_param(value, fallback:)
    return fallback unless value.is_a?(String) || value.is_a?(Numeric)

    Integer(value, exception: false) || fallback
  end
end
