module PaginatedResponse
  extend ActiveSupport::Concern

  private

  def paginated_response(scope, collection_key)
    page = [params.fetch(:page, 1).to_i, 1].max
    per_page = [[params.fetch(:per_page, 10).to_i, 1].max, 50].min
    total_count = scope.count
    records = scope.offset((page - 1) * per_page).limit(per_page)

    {
      collection_key => records.map { |record| yield(record) },
      pagination: {
        page: page,
        per_page: per_page,
        total_count: total_count,
        total_pages: (total_count.to_f / per_page).ceil
      }
    }
  end
end
