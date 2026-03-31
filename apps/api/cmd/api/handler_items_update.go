package main

import (
	"encoding/json"
	"net/http"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
	"github.com/Graypbj/todolist/apps/api/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerItemsUpdate(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		ID        uuid.UUID `json:"id"`
		Name      string    `json:"name"`
		Completed bool      `json:"completed"`
	}

	type response struct {
		Item
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

	item, err := cfg.db.UpdateItemByID(r.Context(), database.UpdateItemByIDParams{
		ID:        params.ID,
		UserID:    userID,
		Name:      params.Name,
		Completed: params.Completed,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't update item", err)
		return
	}

	respondWithJSON(w, http.StatusOK, response{
		Item: Item{
			ID:        item.ID,
			ListID:    item.ListID,
			Name:      item.Name,
			Completed: item.Completed,
			CreatedAt: item.CreatedAt,
			UpdatedAt: item.UpdatedAt,
		},
	})
}
