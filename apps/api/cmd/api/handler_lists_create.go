package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
	"github.com/Graypbj/todolist/apps/api/internal/database"
	"github.com/google/uuid"
)

type List struct {
	ID        uuid.UUID `json:"id"`
	UserID    uuid.UUID `json:"user_id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (cfg *apiConfig) handlerListsCreate(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		Name string `json:"name"`
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

	list, err := cfg.db.CreateList(r.Context(), database.CreateListParams{
		UserID: userID,
		Name:   params.Name,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't create list", err)
		return
	}

	respondWithJSON(w, http.StatusCreated, List{
		ID:        list.ID,
		UserID:    list.UserID,
		Name:      list.Name,
		CreatedAt: list.CreatedAt,
		UpdatedAt: list.UpdatedAt,
	})
}
