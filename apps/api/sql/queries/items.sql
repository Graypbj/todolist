-- name: CreateItem :one
INSERT INTO items (id, user_id, list_id, name, completed, created_at, updated_at)
VALUES (
	gen_random_uuid(),
	$1,
	$2,
	$3,
	$4,
	NOW(),
	NOW()
)
RETURNING *;

-- name: UpdateItemByID :one
UPDATE items
SET name = $4, completed = $5, updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, list_id, name, completed, created_at, updated_at;

-- name: DeleteItemByID :exec
DELETE FROM items
WHERE id = $1 AND user_id = $2;

-- name: ListItemsByUser :many
SELECT id, list_id, name, completed, created_at, updated_at
FROM items
WHERE user_id = $1
ORDER BY name ASC;

-- name: ListItemsByList :many
SELECT id, list_id, name, completed, created_at, updated_at
FROM items
WHERE user_id = $1 AND list_id = $2
ORDER BY name ASC;

-- name: GetItemByID :one
SELECT id, list_id, name, completed, created_at, updated_at
FROM items
WHERE id = $1 AND user_id = $2;

