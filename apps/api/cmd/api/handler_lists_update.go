package main

import (
	"encoding/json"
	"net/http"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
	"github.com/Graypbj/todolist/apps/api/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerListsUpdate(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		ID   uuid.UUID `json:"id"`
		Name string    `json:"name"`
	}

	type response struct {
		List
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

	list, err := cfg.db.UpdateListByID(r.Context(), database.UpdateListByIDParams{
		ID:     params.ID,
		UserID: userID,
		Name:   params.Name,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't update list", err)
		return
	}

	respondWithJSON(w, http.StatusOK, response{
		List: List{
			ID:        list.ID,
			Name:      list.Name,
			CreatedAt: list.CreatedAt,
			UpdatedAt: list.UpdatedAt,
		},
	})
}
