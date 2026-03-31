package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"github.com/Graypbj/internal/database"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type apiConfig struct {
	fileserverHits atomic.Int32
	db             *database.Queries
	platform       string
	admin          string
	jwtSecret      string
}

func main() {
	const filePathRoot = "."
	const port = "8080"

	godotenv.Load()
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("DB_URL must be set")
	}
	platform := os.Getenv("PLATFORM")
	if platform == "" {
		log.Fatal("PLATFORM must be set")
	}
	admin := os.Getenv("ADMIN_KEY")
	if admin == "" {
		log.Fatal("ADMIN_KEY must be set")
	}
	secret := os.Getenv("TOKEN_SECRET")
	if secret == "" {
		log.Fatal("TOKEN_SECRET must be set")
	}
	dbConn, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Error opening database: %s", err)
	}
	dbQueries := database.New(dbConn)

	apiCfg := apiConfig{
		fileserverHits: atomic.Int32{},
		db:             dbQueries,
		admin:          admin,
		platform:       platform,
		jwtSecret:      secret,
	}

	mux := http.NewServeMux()
	fsHandler := apiCfg.middlewareMetricsInc(http.StripPrefix("/app", http.FileServer(http.Dir(filePathRoot))))
	mux.Handle("/app/", fsHandler)

	mux.HandleFunc("POST /api/users", apiCfg.handlerUsersCreate)
	mux.HandleFunc("PUT /api/users", apiCfg.handlerUsersUpdate)
	mux.HandleFunc("DELETE /api/users", apiCfg.handlerUsersDelete)

	mux.HandleFunc("POST /api/items", apiCfg.handlerItemsCreate)
	mux.HandleFunc("PUT /api/items", apiCfg.handlerItemsUpdate)
	mux.HandleFunc("DELETE /api/items/{id}", apiCfg.handlerItemsDelete)
	mux.HandleFunc("GET /api/items", apiCfg.handlerItemsRetrieve)

	mux.HandleFunc("POST /api/lists", apiCfg.handlerListsCreate)
	mux.HandleFunc("PUT /api/lists", apiCfg.handlerListsUpdate)
	mux.HandleFunc("DELETE /api/lists/{id}", apiCfg.handlerListsDelete)
	mux.HandleFunc("GET /api/lists", apiCfg.handlerListsRetrieve)

	mux.HandleFunc("POST /api/login", apiCfg.handlerLogin)
	mux.HandleFunc("POST /api/refresh", apiCfg.handlerRefresh)
	mux.HandleFunc("POST /api/revoke", apiCfg.handlerRevoke)

	mux.HandleFunc("POST /admin/reset", apiCfg.handlerReset)
	mux.HandleFunc("GET /admin/metrics", apiCfg.handlerCount)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("Serving files from %s on port: %s\n", filePathRoot, port)
	log.Printf("See metrics at url http://localhost:%s/admin/metrics", port)
	log.Printf("See app at url http://localhost:%s/app/", port)
	log.Fatal(srv.ListenAndServe())
}
