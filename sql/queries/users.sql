-- name: CreateUser :one
INSERT INTO users(id, created_at, updated_at, hashed_password, email)
VALUES (
	gen_random_uuid(),
	NOW(),
	NOW(),
	$1,
	$2
) 
RETURNING id, created_at, updated_at, email;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1
LIMIT 1;

-- name: UpdatUser :one
UPDATE users
SET hashed_password = $2, email = $3, updated_at = NOW()
WHERE
	id = $1
RETURNING id, created_at, updated_at, email;
