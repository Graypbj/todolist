-- name: CreateList :one
INSERT INTO lists (id, user_id, name, created_at, updated_at)
VALUES (
	gen_random_uuid(),
	$1,
	$2,
	NOW(),
	NOW()
)
RETURNING *;

-- name: UpdateListByID :one
UPDATE lists
SET name = $3, updated_at = NOW()
WHERE id = $1 AND user_id = $2
RETURNING id, name, created_at, updated_at;

-- name: DeleteListByID :exec
DELETE FROM lists
WHERE id = $1 and user_id = $2;

-- name: ListsByUser :many
SELECT id, name, created_at, updated_at
FROM lists
WHERE user_id = $1
ORDER BY name ASC;

-- name: GetListByID :one
SELECT id, name, created_at, updated_at
FROM lists
WHERE id = $1 AND user_id = $2;

