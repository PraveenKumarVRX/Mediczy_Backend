# CIMS Medicine API

This document covers the CIMS endpoints for pharmacy inventory, including pagination and cursor-based pagination.

## Base Path

`/api/pharmacy/inventory/cims`

## Authentication

All endpoints require a pharmacy JWT in the `Authorization` header.

```
Authorization: Bearer <token>
```

## Pagination

All list endpoints support two pagination modes:

### 1) Page/Limit

- Query params: `page`, `limit`
- Response includes:
  - `pagination.page`
  - `pagination.limit`
  - `pagination.totalPages`

### 2) Cursor

- Query param: `cursor` (base64)
- Optional: `limit`
- Response includes:
  - `pagination.cursor`
  - `pagination.nextCursor`
  - `pagination.limit`

Cursor mode is stable-sorted by `brandName` then `id`.
To start cursor mode, send the `cursor` param (it can be empty on the first call).

## Endpoints

### GET /search

Search by brand, generic, or composition.

**Query params:**

- `q` (required, min 2 chars)
- `page`, `limit`
- `cursor` (for cursor mode)

**Response:**

- `total`
- `data`
- `pagination`

### GET /categories

List all categories with counts and subcategories.

### GET /category/:categoryName

Fetch medicines by category.

**Query params:**

- `page`, `limit`
- `cursor`

### GET /medicine/:id

Fetch full medicine details by CIMS ID.

### GET /alternatives/:medicineId

Fetch alternatives by same generic name.

**Query params:**

- `page`, `limit`
- `cursor`

### GET /indication/:indication

Search by indication text.

**Query params:**

- `page`, `limit`
- `cursor`

### GET /stats

Database statistics.

### GET /otc

List OTC medicines.

**Query params:**

- `page`, `limit`
- `cursor`

### GET /pregnancy-safe

List pregnancy-safe medicines.

**Query params:**

- `page`, `limit`
- `cursor`

### POST /advanced-search

Advanced filter-based search.

**Body fields (optional):**

- `query`
- `category`
- `subCategory`
- `manufacturer`
- `schedule`
- `form`
- `minPrice`
- `maxPrice`
- `sortBy` (`price_asc`, `price_desc`, `name`, `generic`)
- `page`, `limit`
- `cursor`

**Response:**

- `total`
- `data`
- `pagination`

## Example (cursor mode)

Request:

```
GET /api/pharmacy/inventory/cims/search?q=para&limit=50&cursor=<cursor>
```

Response:

```
{
  "success": true,
  "query": "para",
  "total": 120,
  "data": [ ... ],
  "pagination": {
    "cursor": "<cursor>",
    "nextCursor": "<nextCursor>",
    "limit": 50
  }
}
```
