package main

import (
	"net/http"

	"github.com/Graypbj/internal/auth"
	"github.com/Graypbj/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerItemsDelete(w http.ResponseWriter, r *http.Request) {
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

	idStr := r.PathValue("id")
	if idStr == "" {
		respondWithError(w, http.StatusBadRequest, "Missing item id in path", nil)
		return
	}

	itemID, err := uuid.Parse(idStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid item id (must be UUID)", err)
		return
	}
	err = cfg.db.DeleteItemByID(r.Context(), database.DeleteItemByIDParams{
		ID:     itemID,
		UserID: userID,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't delete item", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
