package main

import (
	"database/sql"
	"encoding/json"
	"errors"
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
		fmt.Println("Error fetching keybinds", err)
		return nil
	}
	defer rows.Close()

	for rows.Next() {
		var dbK DbKeybind
		err := rows.Scan(&dbK.command, &dbK.bind)
		if err != nil {
			fmt.Println("Error scanning rows", err)
			continue
		}

		keybind := Keybind{
			Command: nullStringToPointer(dbK.command),
			Bind:    nullStringToPointer(dbK.bind),
		}

		keybinds = append(keybinds, keybind)
	}

	jsonBytes, err := json.MarshalIndent(keybinds, "", "")
	if err != nil {
		fmt.Println("Error marshalling keybinds", err)
		return nil
	}

	return jsonBytes
}

type UserSettings struct {
	Theme            string `json:"theme"`
	DefaultEnv       string `json:"defaultEnv"`
	EnableAnimations bool   `json:"enableAnimations"`
}

func (s *UserService) LoadUserSettings() (*UserSettings, error) {
	var configJSON sql.NullString

	err := s.db.QueryRow(`SELECT config FROM users WHERE id = 1`).Scan(&configJSON)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			defaults := &UserSettings{
				Theme:            "dark",
				DefaultEnv:       "",
				EnableAnimations: true,
			}
			return defaults, nil
		}
		return nil, fmt.Errorf("failed to load user settings: %w", err)
	}

	if !configJSON.Valid || configJSON.String == "" {
		// No config set — return defaults
		return &UserSettings{
			Theme:            "dark",
			DefaultEnv:       "",
			EnableAnimations: true,
		}, nil
	}

	var settings UserSettings
	if err := json.Unmarshal([]byte(configJSON.String), &settings); err != nil {
		return nil, fmt.Errorf("failed to parse user settings JSON: %w", err)
	}

	return &settings, nil
}

func (s *UserService) SaveUserSettings(settings *UserSettings) error {
	data, err := json.Marshal(settings)
	if err != nil {
		return fmt.Errorf("failed to marshal settings: %w", err)
	}

	_, err = s.db.Exec(`
		INSERT INTO users (id, config)
		VALUES (1, ?)
		ON CONFLICT(id) DO UPDATE SET config = excluded.config
	`, string(data))
	if err != nil {
		return fmt.Errorf("failed to save user settings: %w", err)
	}

	return nil
}
