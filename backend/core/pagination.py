import math

def paginate(query, page: int, size: int):
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    pages = math.ceil(total / size) if size > 0 else 0
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": pages
    }
