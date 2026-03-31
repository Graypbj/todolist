package main

import (
	"errors"
	"net/http"
	"strings"
)

func (cfg *apiConfig) handlerRevoke(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") == "" {
		respondWithError(w, http.StatusBadRequest, "No token sent", errors.New("No token sent"))
		return
	}

	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	err := cfg.db.RevokeToken(r.Context(), token)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't update token", err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
