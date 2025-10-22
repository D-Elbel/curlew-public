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
	Command    *string `json:"command"`
	Bind       *string `json:"bind"`
	PrettyName *string `json:"prettyName"`
}

type DbKeybind struct {
	command     sql.NullString
	bind        sql.NullString
	pretty_name sql.NullString
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
		err := rows.Scan(&dbK.command, &dbK.bind, &dbK.pretty_name)
		if err != nil {
			fmt.Println("Error scanning rows", err)
			continue
		}

		keybind := Keybind{
			Command:    nullStringToPointer(dbK.command),
			Bind:       nullStringToPointer(dbK.bind),
			PrettyName: nullStringToPointer(dbK.pretty_name),
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
	Theme              string `json:"theme"`
	DefaultEnv         string `json:"defaultEnv"`
	EnableAnimations   bool   `json:"enableAnimations"`
	ResponseHistoryTTL int    `json:"responseHistoryTTL"`
}

func (s *UserService) LoadUserSettings() (*UserSettings, error) {
	defaultSettings := &UserSettings{
		Theme:              "dark",
		DefaultEnv:         "",
		EnableAnimations:   true,
		ResponseHistoryTTL: defaultResponseHistoryTTL,
	}

	var configJSON sql.NullString

	err := s.db.QueryRow(`SELECT config FROM users WHERE id = 1`).Scan(&configJSON)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			ttl, ttlErr := loadResponseHistoryTTL(s.db)
			if ttlErr != nil {
				fmt.Println("Failed to load response history TTL:", ttlErr)
			} else {
				defaultSettings.ResponseHistoryTTL = ttl
			}
			return defaultSettings, nil
		}
		return nil, fmt.Errorf("failed to load user settings: %w", err)
	}

	if !configJSON.Valid || configJSON.String == "" {
		ttl, ttlErr := loadResponseHistoryTTL(s.db)
		if ttlErr != nil {
			fmt.Println("Failed to load response history TTL:", ttlErr)
		} else {
			defaultSettings.ResponseHistoryTTL = ttl
		}
		return defaultSettings, nil
	}

	var settings UserSettings
	if err := json.Unmarshal([]byte(configJSON.String), &settings); err != nil {
		return nil, fmt.Errorf("failed to parse user settings JSON: %w", err)
	}

	if settings.Theme == "" {
		settings.Theme = defaultSettings.Theme
	}
	if settings.ResponseHistoryTTL < 1 {
		settings.ResponseHistoryTTL = defaultSettings.ResponseHistoryTTL
	}

	ttl, ttlErr := loadResponseHistoryTTL(s.db)
	if ttlErr != nil {
		fmt.Println("Failed to load response history TTL:", ttlErr)
	} else {
		settings.ResponseHistoryTTL = ttl
	}

	return &settings, nil
}

func (s *UserService) SaveUserSettings(settings *UserSettings) error {
	if settings == nil {
		return fmt.Errorf("settings payload is required")
	}
	if settings.ResponseHistoryTTL < 1 {
		return fmt.Errorf("response history TTL must be greater than zero")
	}

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

	if err := saveResponseHistoryTTL(s.db, settings.ResponseHistoryTTL); err != nil {
		return err
	}

	return nil
}

func (s *UserService) UpdateUserKeybinds(keybinds []Keybind) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start keybind update transaction: %w", err)
	}

	stmt, err := tx.Prepare(`
		INSERT INTO hotkey_binds (command, bind, pretty_name)
		VALUES (?, ?, ?)
		ON CONFLICT(command) DO UPDATE SET
			bind = excluded.bind,
			pretty_name = excluded.pretty_name
	`)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to prepare keybind upsert statement: %w", err)
	}
	defer stmt.Close()

	for _, kb := range keybinds {
		if kb.Command == nil || *kb.Command == "" {
			tx.Rollback()
			return fmt.Errorf("keybind command is required")
		}

		var bindValue interface{}
		if kb.Bind != nil {
			bindValue = *kb.Bind
		}

		var prettyName interface{}
		if kb.PrettyName != nil {
			prettyName = *kb.PrettyName
		}

		if _, err := stmt.Exec(*kb.Command, bindValue, prettyName); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to upsert keybind %s: %w", *kb.Command, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit keybind updates: %w", err)
	}

	return nil
}
