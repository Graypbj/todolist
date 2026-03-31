package main

import (
	"errors"
	"net/http"
	"time"

	"github.com/Graypbj/internal/auth"
)

func (cfg *apiConfig) handlerRefresh(w http.ResponseWriter, r *http.Request) {
	type response struct {
		Token string `json:"token"`
	}

	token, err := auth.GetBearerToken(r.Header)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Missing or invalid refresh token", err)
		return
	}

	dbToken, err := cfg.db.GetToken(r.Context(), token)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "Error finding refresh token in database", err)
		return
	}

	if dbToken.RevokedAt.Valid {
		respondWithError(w, http.StatusUnauthorized, "Refresh token has been revoked", errors.New("Refresh token has been revoked"))
		return
	}

	if time.Now().After(dbToken.ExpiresAt) {
		respondWithError(w, http.StatusUnauthorized, "Refresh token has expired", errors.New("Refresh token has expired"))
		return
	}

	user, err := cfg.db.GetUsersByRefreshToken(r.Context(), token)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Error retrieving user", err)
		return
	}

	newAccessToken, err := auth.MakeJWT(user.ID, cfg.jwtSecret, time.Hour)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Error creating access token", err)
		return
	}

	respondWithJSON(w, http.StatusOK, response{
		Token: newAccessToken,
	})
}
