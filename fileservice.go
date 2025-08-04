package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
)

type FileService struct {
	db *sql.DB
}

// TODO: Will probably drop this
type PostmanVersion struct {
	Major      int    `json:"major"`
	Minor      int    `json:"minor"`
	Patch      int    `json:"patch"`
	Identifier string `json:"identifier"`
}

type PostmanInfo struct {
	Name        string          `json:"name"`
	PostmanID   string          `json:"_postman_id"`
	Description string          `json:"description"`
	Schema      string          `json:"schema"`
	Version     *PostmanVersion `json:"version"`
}

type PostmanRequest struct {
	Method string      `json:"method"`
	URL    interface{} `json:"url"`
	Header interface{} `json:"header"`
	Body   interface{} `json:"body"`
	Auth   interface{} `json:"auth"`
}

type PostmanItem struct {
	ID          string          `json:"ID"`
	Name        string          `json:"name"`
	Description interface{}     `json:"description"`
	Request     *PostmanRequest `json:"request,omitempty"`
	Items       []PostmanItem   `json:"item,omitempty"`
}

type PostmanCollection struct {
	Info  PostmanInfo   `json:"info"`
	Items []PostmanItem `json:"item"`
}

func (s *FileService) ParsePostmanV21Collection(rawExportJSON string) error {
	var collection PostmanCollection
	if err := json.Unmarshal([]byte(rawExportJSON), &collection); err != nil {
		return fmt.Errorf("error parsing JSON: %w", err)
	}

	rootCollectionID := uuid.New().String()

	// TODO: Exploratory, will probably not support versioning but including for now for completeness
	var major, minor, patch int
	var identifier string
	if collection.Info.Version != nil {
		major = collection.Info.Version.Major
		minor = collection.Info.Version.Minor
		patch = collection.Info.Version.Patch
		identifier = collection.Info.Version.Identifier
	}

	_, err := s.db.Exec(`
		INSERT INTO collections (id, name, description, schema, version_major, version_minor, version_patch, version_identifier, parent_collection)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		rootCollectionID,
		collection.Info.Name,
		collection.Info.Description,
		collection.Info.Schema,
		major,
		minor,
		patch,
		identifier,
		nil, // Root collection has no parent
	)
	if err != nil {
		return fmt.Errorf("error inserting root collection: %w", err)
	}

	if err := s.processItems(rootCollectionID, collection.Items, 0); err != nil {
		return err
	}

	fmt.Printf("Successfully imported Postman collection '%s' into the database.\n", collection.Info.Name)
	return nil
}

func (s *FileService) processItems(parentCollectionID string, items []PostmanItem, sortOrder int) error {
	currentSortOrder := sortOrder

	for _, item := range items {
		// If Postman item has no request but has items, it's a folder (subcollection)
		if item.Request == nil && len(item.Items) > 0 {
			fmt.Printf("Processing folder: %s\n", item.Name)

			folderID := uuid.New().String()

			descStr := ""
			switch d := item.Description.(type) {
			case string:
				descStr = d
			case map[string]interface{}:
				if content, ok := d["content"].(string); ok {
					descStr = content
				}
			}

			_, err := s.db.Exec(`
				INSERT INTO collections (id, name, description, schema, version_major, version_minor, version_patch, version_identifier, parent_collection)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				folderID,
				item.Name,
				descStr,
				"",
				0, 0, 0, "",
				parentCollectionID,
			)
			if err != nil {
				return fmt.Errorf("error inserting folder '%s': %w", item.Name, err)
			}

			if err := s.processItems(folderID, item.Items, 0); err != nil {
				return err
			}
		} else if item.Request != nil {
			fmt.Printf("Processing request: %s %s\n", item.Request.Method, item.Name)

			descStr := ""
			switch d := item.Description.(type) {
			case string:
				descStr = d
			case map[string]interface{}:
				if content, ok := d["content"].(string); ok {
					descStr = content
				}
			}

			urlStr := ""
			switch u := item.Request.URL.(type) {
			case string:
				urlStr = u
			case map[string]interface{}:
				if raw, ok := u["raw"].(string); ok {
					urlStr = raw
				}
			}

			headerJSON, _ := json.Marshal(item.Request.Header)
			bodyJSON, _ := json.Marshal(item.Request.Body)
			authJSON, _ := json.Marshal(item.Request.Auth)

			_, err := s.db.Exec(`
				INSERT INTO requests (collection_id, name, description, method, url, headers, body, auth, sort_order)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				parentCollectionID,
				item.Name,
				descStr,
				item.Request.Method,
				urlStr,
				string(headerJSON),
				string(bodyJSON),
				string(authJSON),
				currentSortOrder,
			)
			if err != nil {
				return fmt.Errorf("error inserting request '%s': %w", item.Name, err)
			}

			currentSortOrder++
		}
	}
	return nil
}

func (s *FileService) ImportPostmanCollection(jsonContent string) error {
	return s.ParsePostmanV21Collection(jsonContent)
}
