package main

import (
	"context"
	"database/sql"
	"embed"
	_ "embed"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"log"
	_ "modernc.org/sqlite"
	"os"
	"time"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	folderErr := buildFolders()
	if folderErr != nil {
		fmt.Println("Failed to setup folders:", folderErr)
	}

	var openDbErr error
	var db *sql.DB
	db, openDbErr = sql.Open("sqlite", "./curlew_db.db")
	if openDbErr != nil {
		log.Fatal(openDbErr)
	}

	createTableSQL := `
		CREATE TABLE IF NOT EXISTS requests (
		    id INTEGER PRIMARY KEY AUTOINCREMENT,
	  		collection_id TEXT NOT NULL,
	  		name TEXT,
	  		description TEXT,
	  		method TEXT,
	  		url TEXT,
	  		headers TEXT, 
	  		body TEXT,     
	  		body_type TEXT,
	  		auth TEXT,    
	  		body_format TEXT,
	  		FOREIGN KEY(collection_id) REFERENCES collections(id)
				);

		CREATE TABLE IF NOT EXISTS environments (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT
		);
	
		CREATE TABLE IF NOT EXISTS environment_variables (
  			id INTEGER PRIMARY KEY AUTOINCREMENT,
  			environment_id TEXT NOT NULL,
  			key TEXT NOT NULL,
  			value TEXT,
  			type TEXT,
  			FOREIGN KEY(environment_id) REFERENCES environments(id)
		);
		
		CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,            
			name TEXT NOT NULL,             
			description TEXT,               
		  	schema TEXT,                    
			version_major INTEGER,          
			version_minor INTEGER,
		  	version_patch INTEGER,
		  	version_identifier TEXT,
		  	parent_collection TEXT
		);

		CREATE TABLE IF NOT EXISTS responses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			status_code INTEGER,
			headers TEXT,
			body TEXT,
			runtime_ms INTEGER,
			request_id INTEGER,
		);

		CREATE TABLE IF NOT EXISTS hotkey_binds (
		    Command TEXT NOT NULL PRIMARY KEY,
		    Bind TEXT
		);
		
		INSERT INTO hotkey_binds (Command, Bind) VALUES ('OPEN_SEARCH_COMMAND', 'ctrl+k'), ('OPEN_TAB_MENU', 'ctrl+tab'),('NEW_ENV', 'ctrl+n+e'),('NEW_REQUEST', 'ctrl+n+r'),('OPEN_ENV', 'ctrl+e') ON CONFLICT(Command) DO NOTHING;
		
		CREATE TABLE IF NOT EXISTS app_state (
		    key TEXT PRIMARY KEY,
		    value TEXT NOT NULL
		)
`

	var createDbErr error
	_, createDbErr = db.Exec(createTableSQL)
	if createDbErr != nil {
		fmt.Println("Failed to create table:", createDbErr)
		return
	}

	crudService := &RequestCRUDService{db: db}
	envarService := &EnvarService{}
	userService := &UserService{db: db}
	appStateService := NewAppStateService(db)

	app := application.New(application.Options{
		Name:        "curlew",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(&FileService{db: db}),
			application.NewService(crudService),
			application.NewService(envarService),
			application.NewService(userService),
			application.NewService(appStateService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		Windows: application.WindowsOptions{
			DisableQuitOnLastWindowClosed: false,
		},
	})
	crudService.app = app
	envarService.app = app
	userService.app = app
	envarService.ScanEnvars()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go envarService.InitEnvarWatch(ctx)

	window := app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title: "Curlew",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(27, 38, 54),
		URL:              "/",
		Width:            1920,
		Height:           1080,
	})

	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		//TODO: Enum this
		app.EmitEvent("SHUTDOWN")

		select {
		case <-appStateService.shutdownAck:
			fmt.Println("Closing safely")
		case <-time.After(5 * time.Second):
			fmt.Println("Closing unsafely")
		}
	})

	err := app.Run()

	if err != nil {
		log.Fatal(err)
	}
}

func buildFolders() error {
	dataDir := "./data"

	_, err := os.Stat(dataDir)
	if os.IsNotExist(err) {
		err := os.Mkdir(dataDir, 0755)
		if err != nil {
			fmt.Println(err)
			return err
		}
	}

	environmentsDir := "./data/environments"

	_, err = os.Stat(environmentsDir)
	if os.IsNotExist(err) {
		err := os.Mkdir(environmentsDir, 0755)
		if err != nil {
			fmt.Println(err)
			return err
		}
	}

	return nil
}
