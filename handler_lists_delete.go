package main

import (
	"encoding/json"
	"net/http"

	"github.com/Graypbj/internal/auth"
	"github.com/Graypbj/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerListsDelete(w http.ResponseWriter, r *http.Request) {
	type parameters struct {
		ID uuid.UUID `json:"id"`
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

	err = cfg.db.DeleteListByID(r.Context(), database.DeleteListByIDParams{
		ID:     params.ID,
		UserID: userID,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't delete list", err)
		return
	}

	var a any
	respondWithJSON(w, http.StatusNoContent, a)
}
