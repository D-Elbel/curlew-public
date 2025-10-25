// file: appstateservice.go
package main

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
)

const (
	uiStateKey           = "ui_state"
	themeKey             = "theme"
	defaultEnvKey        = "default_env"
	enableAnimationsKey  = "enable_animations"
	defaultTheme         = "dark"
	defaultEnableAnimate = true
)

type UserSettings struct {
	Theme              string `json:"theme"`
	DefaultEnv         string `json:"defaultEnv"`
	EnableAnimations   bool   `json:"enableAnimations"`
	ResponseHistoryTTL int    `json:"responseHistoryTTL"`
}

type AppStateService struct {
	db          *sql.DB
	shutdownAck chan struct{}
}

func NewAppStateService(db *sql.DB) *AppStateService {
	return &AppStateService{
		db:          db,
		shutdownAck: make(chan struct{}),
	}
}

func (s *AppStateService) SaveState(jsonBlob string) error {
	_, err := s.db.Exec(
		`INSERT INTO app_state(key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		uiStateKey,
		jsonBlob,
	)
	return err
}

func (s *AppStateService) LoadState() (string, error) {
	var blob string
	err := s.db.
		QueryRow(`SELECT value FROM app_state WHERE key=?`, uiStateKey).
		Scan(&blob)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return blob, err
}

func (s *AppStateService) LoadUserSettings() (*UserSettings, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	settings := &UserSettings{
		Theme:              defaultTheme,
		DefaultEnv:         "",
		EnableAnimations:   defaultEnableAnimate,
		ResponseHistoryTTL: defaultResponseHistoryTTL,
	}

	if rawTheme, err := s.getAppStateValue(themeKey); err != nil {
		return nil, fmt.Errorf("failed to load theme from app state: %w", err)
	} else if trimmed := strings.TrimSpace(rawTheme); trimmed != "" {
		settings.Theme = trimmed
	}

	if rawDefaultEnv, err := s.getAppStateValue(defaultEnvKey); err != nil {
		return nil, fmt.Errorf("failed to load default environment from app state: %w", err)
	} else if rawDefaultEnv != "" {
		settings.DefaultEnv = rawDefaultEnv
	}

	if rawEnableAnimations, err := s.getAppStateValue(enableAnimationsKey); err != nil {
		return nil, fmt.Errorf("failed to load enable animations flag from app state: %w", err)
	} else if rawEnableAnimations != "" {
		if parsed, parseErr := strconv.ParseBool(strings.TrimSpace(rawEnableAnimations)); parseErr == nil {
			settings.EnableAnimations = parsed
		} else {
			fmt.Println("Invalid enable animations flag in app state, reverting to default:", parseErr)
		}
	}

	if ttl, err := loadResponseHistoryTTL(s.db); err != nil {
		fmt.Println("Failed to load response history TTL:", err)
	} else {
		settings.ResponseHistoryTTL = ttl
	}

	return settings, nil
}

func (s *AppStateService) SaveUserSettings(settings *UserSettings) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if settings == nil {
		return fmt.Errorf("settings payload is required")
	}
	if settings.ResponseHistoryTTL < 1 {
		return fmt.Errorf("response history TTL must be greater than zero")
	}

	theme := strings.TrimSpace(settings.Theme)
	if theme == "" {
		theme = defaultTheme
	}
	if err := s.saveAppStateValue(themeKey, theme); err != nil {
		return fmt.Errorf("failed to persist theme: %w", err)
	}

	if err := s.saveAppStateValue(defaultEnvKey, strings.TrimSpace(settings.DefaultEnv)); err != nil {
		return fmt.Errorf("failed to persist default environment: %w", err)
	}

	if err := s.saveAppStateValue(enableAnimationsKey, strconv.FormatBool(settings.EnableAnimations)); err != nil {
		return fmt.Errorf("failed to persist enable animations flag: %w", err)
	}

	if err := saveResponseHistoryTTL(s.db, settings.ResponseHistoryTTL); err != nil {
		return err
	}

	return nil
}

func (s *AppStateService) getAppStateValue(key string) (string, error) {
	var value string
	err := s.db.QueryRow(`SELECT value FROM app_state WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return value, nil
}

func (s *AppStateService) saveAppStateValue(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO app_state(key, value)
		 VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		key,
		value,
	)
	return err
}

func (s *AppStateService) AcknowledgeShutdown() error {
	select {
	case <-s.shutdownAck:
	default:
		close(s.shutdownAck)
	}
	return nil
}
