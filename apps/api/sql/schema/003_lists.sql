-- +goose Up
CREATE TABLE lists (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID REFERENCES users(id)
		ON DELETE CASCADE NOT NULL,
	name VARCHAR(100) NOT NULL,
	created_at TIMESTAMP DEFAULT NOW() NOT NULL,
	updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- +goose Down
DROP TABLE lists;

