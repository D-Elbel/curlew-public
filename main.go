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

	files := []string{"sql/collections.sql", "sql/requests.sql", "sql/environments.sql", "sql/responses.sql", "sql/hotkey_binds.sql", "sql/app_state.sql", "sql/users.sql"}
	for _, file := range files {
		if err := executeSQLFromFile(db, file); err != nil {
			log.Fatalf("Failed to execute %s: %v", file, err)
		}
	}

	crudService := &RequestCRUDService{db: db}
	envarService := &EnvarService{}
	userService := &UserService{db: db}
	fileService := &FileService{db: db}
	appStateService := NewAppStateService(db)

	app := application.New(application.Options{
		Name:        "curlew",
		Description: "A demo of using raw HTML & CSS",
		Services: []application.Service{
			application.NewService(fileService),
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

func executeSQLFromFile(db *sql.DB, filePath string) error {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return err
	}
	_, err = db.Exec(string(content))
	return err
}
