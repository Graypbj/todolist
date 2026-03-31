package main

import (
	"net/http"

	"github.com/Graypbj/todolist/apps/api/internal/auth"
	"github.com/Graypbj/todolist/apps/api/internal/database"
	"github.com/google/uuid"
)

func (cfg *apiConfig) handlerItemsRetrieve(w http.ResponseWriter, r *http.Request) {
	type response struct {
		Items []Item `json:"items"`
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

	listIDStr := r.URL.Query().Get("list_id")
	if listIDStr == "" {
		respondWithError(w, http.StatusBadRequest, "Missing list_id query parameter", nil)
		return
	}

	listID, err := uuid.Parse(listIDStr)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid list_id (must be UUID)", err)
		return
	}

	dbItems, err := cfg.db.ListItemsByList(r.Context(), database.ListItemsByListParams{
		UserID: userID,
		ListID: listID,
	})
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Couldn't retrieve items", err)
		return
	}

	items := make([]Item, len(dbItems))
	for i, dbIt := range dbItems {
		items[i] = Item{
			ID:        dbIt.ID,
			ListID:    dbIt.ListID,
			Name:      dbIt.Name,
			CreatedAt: dbIt.CreatedAt,
			UpdatedAt: dbIt.UpdatedAt,
		}
	}

	respondWithJSON(w, http.StatusOK, response{
		Items: items,
	})
}
