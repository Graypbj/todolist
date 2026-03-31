-- name: CreateToken :one
INSERT INTO refresh_tokens (token, created_at, updated_at, user_id, expires_at, revoked_at)
VALUES (
	$1,
	NOW(),
	NOW(),
	$2,
	$3,
	NULL
)
RETURNING *;

-- name: GetToken :one
SELECT * FROM refresh_tokens
WHERE token = $1
LIMIT 1;

-- name: GetUsersByRefreshToken :one
SELECT users.id, users.created_at, users.updated_at, users.email, users.hashed_password
FROM users
JOIN refresh_tokens ON users.id = refresh_tokens.user_id
WHERE refresh_tokens.token = $1
	AND refresh_tokens.expires_at > NOW()
	AND refresh_tokens.revoked_at IS NULL
LIMIT 1;

-- name: RevokeToken :exec
UPDATE refresh_tokens
SET updated_at = NOW(),
	revoked_At = NOW()
WHERE token = $1;

