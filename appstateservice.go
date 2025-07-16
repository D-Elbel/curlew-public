// file: appstateservice.go
package main

import (
	"database/sql"
)

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
		 VALUES ('ui_state', ?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		jsonBlob,
	)
	return err
}

func (s *AppStateService) LoadState() (string, error) {
	var blob string
	err := s.db.
		QueryRow(`SELECT value FROM app_state WHERE key='ui_state'`).
		Scan(&blob)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return blob, err
}

func (s *AppStateService) AcknowledgeShutdown() error {
	select {
	case <-s.shutdownAck:
	default:
		close(s.shutdownAck)
	}
	return nil
}
