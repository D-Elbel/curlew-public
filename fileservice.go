package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
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

	//TODO: Exploratory, will probably not support versioning but including for now for completeness
	var major, minor, patch int
	var identifier string
	if collection.Info.Version != nil {
		major = collection.Info.Version.Major
		minor = collection.Info.Version.Minor
		patch = collection.Info.Version.Patch
		identifier = collection.Info.Version.Identifier
	}

	_, err := s.db.Exec(`
		INSERT INTO collections (ID, name, description, schema, version_major, version_minor, version_patch, version_identifier)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		collection.Info.PostmanID,
		collection.Info.Name,
		collection.Info.Description,
		collection.Info.Schema,
		major,
		minor,
		patch,
		identifier,
	)
	if err != nil {
		return fmt.Errorf("error inserting collection: %w", err)
	}

	if err := s.processItems(collection.Info.PostmanID, collection.Items); err != nil {
		return err
	}

	fmt.Println("Successfully imported Postman collection into the database.")
	return nil
}

func (s *FileService) processItems(collectionID string, items []PostmanItem) error {
	for _, item := range items {
		//If no request and has items it is a folder, process folders items
		if item.Request == nil && len(item.Items) > 0 {
			fmt.Println("Folder found:", item.Name)
			//TODO: Keep track of folders
			if err := s.processItems(collectionID, item.Items); err != nil {
				return err
			}
			continue
		}

		if item.Request != nil {
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
				INSERT INTO requests (collection_id, name, description, method, url, headers, body, auth)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				collectionID,
				item.Name,
				descStr,
				item.Request.Method,
				urlStr,
				string(headerJSON),
				string(bodyJSON),
				string(authJSON),
			)
			if err != nil {
				return fmt.Errorf("error inserting request (%s): %w", item.Name, err)
			}
		}
	}
	return nil
}
