package main

import (
	"net/http"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
)

func (cfg *apiConfig) handlerRevoke(w http.ResponseWriter, r *http.Request) {
	token, err := auth.GetBearerToken(r.Header)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Missing or invalid refresh token", err)
		return
	}

	err = cfg.db.RevokeToken(r.Context(), token)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't update token", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
