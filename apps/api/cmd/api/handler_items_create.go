package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
	"github.com/Graypbj/todolist/apps/api/internal/database"
	"github.com/google/uuid"
)

type Item struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	ListID    uuid.UUID `json:"list_id"`
	Name      string    `json:"name"`
	Completed bool      `json:"completed"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (cfg *apiConfig) handlerItemsCreate(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		ListID    uuid.UUID `json:"list_id"`
		Name      string    `json:"name"`
		Completed bool      `json:"completed"`
	}

	token, err := auth.GetBearerToken(r.Header)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Couldn't find JWT", err)
		return
	}

	userID, err := auth.ValidateJWT(token, cfg.jwtSecret)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Couldn't validate JWT", err)
		return
	}

	decoder := json.NewDecoder(r.Body)
	params := parameters{}
	err = decoder.Decode(&params)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't decode parameters", err)
		return
	}

	item, err := cfg.db.CreateItem(r.Context(), database.CreateItemParams{
		UserID:    userID,
		ListID:    params.ListID,
		Name:      params.Name,
		Completed: params.Completed,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't create item", err)
		return
	}

	respondWithJSON(w, http.StatusCreated, Item{
		ID:        item.ID,
		UserID:    item.UserID,
		ListID:    item.ListID,
		Name:      item.Name,
		CreatedAt: item.CreatedAt,
		UpdatedAt: item.UpdatedAt,
	})
}
