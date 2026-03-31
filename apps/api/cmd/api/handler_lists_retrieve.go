package main

import (
	"net/http"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
)

func (cfg *apiConfig) handlerListsRetrieve(w http.ResponseWriter, r *http.Request) {
	type response struct {
		Lists []List `json:"lists"`
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

	dbLists, err := cfg.db.ListsByUser(r.Context(), userID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't retrieve lists", err)
		return
	}

	lists := make([]List, len(dbLists))
	for i, dbLi := range dbLists {
		lists[i] = List{
			ID:        dbLi.ID,
			Name:      dbLi.Name,
			CreatedAt: dbLi.CreatedAt,
			UpdatedAt: dbLi.UpdatedAt,
		}
	}

	respondWithJSON(w, http.StatusOK, response{
		Lists: lists,
	})
}
