package main

import (
	"encoding/json"
	"net/http"

	"github.com/Graypbj/internal/auth"
	"github.com/Graypbj/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerItemsDelete(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		ID     uuid.UUID `json:"id"`
		ListID uuid.UUID `json:"list_id"`
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
		respondWithError(w, http.StatusInternalServerError, "Couldn't decode paramters", err)
		return
	}

	err = cfg.db.DeleteItemByID(r.Context(), database.DeleteItemByIDParams{
		ID:     params.ID,
		UserID: userID,
		ListID: params.ListID,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't delete item", err)
		return
	}

	var a any

	respondWithJSON(w, http.StatusNoContent, a)
}
