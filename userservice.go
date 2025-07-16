package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type UserService struct {
	db  *sql.DB
	app *application.App
}

type Keybind struct {
	Command *string `json:"command"`
	Bind    *string `json:"bind"`
}

type DbKeybind struct {
	command sql.NullString
	bind    sql.NullString
}

func (s *UserService) FetchUserKeybinds() json.RawMessage {
	var keybinds []Keybind
	rows, err := s.db.Query("SELECT * FROM hotkey_binds")

	if err != nil {
		fmt.Println("Error fetching keybinds ")

	}

	for rows.Next() {
		var dbK DbKeybind
		err := rows.Scan(&dbK.command, &dbK.bind)
		if err != nil {
			fmt.Println("Error scanning rows", err)

		}

		keybind := Keybind{
			Command: nullStringToPointer(dbK.command),
			Bind:    nullStringToPointer(dbK.bind),
		}

		keybinds = append(keybinds, keybind)
	}

	jsonBytes, err := json.MarshalIndent(keybinds, "", "")

	return jsonBytes
}
