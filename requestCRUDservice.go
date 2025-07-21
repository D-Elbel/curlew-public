package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
	"io"
	"net/http"
	"strings"
	"time"
)

type RequestCRUDService struct {
	db  *sql.DB
	app *application.App
}

type Request struct {
	ID             int       `json:"id"`
	CollectionID   *string   `json:"collectionId"`
	CollectionName *string   `json:"collectionName"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Method         string    `json:"method"`
	URL            string    `json:"url"`
	Headers        string    `json:"headers"`
	Body           string    `json:"body"`
	BodyType       string    `json:"bodyType"`
	BodyFormat     string    `json:"bodyFormat"`
	Auth           string    `json:"auth"`
	Response       *Response `json:"response,omitempty"`
}

type DbRequest struct {
	ID             int
	CollectionID   sql.NullString
	CollectionName sql.NullString
	Name           sql.NullString
	Description    sql.NullString
	Method         sql.NullString
	URL            sql.NullString
	Headers        sql.NullString
	Body           sql.NullString
	BodyType       sql.NullString
	BodyFormat     sql.NullString
	Auth           sql.NullString
}

type Collection struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	ParentCollectionId *string `json:"parentCollectionId"`
}

type Response struct {
	ID         int    `json:"id"`
	StatusCode int    `json:"statusCode"`
	Headers    string `json:"headers"`
	Body       string `json:"body"`
	RuntimeMS  int    `json:"runtimeMS"`
	RequestID  int    `json:"requestID"`
}

func (s *RequestCRUDService) GetRequest(id int) Request {
	var dbR DbRequest
	s.app.EmitEvent("test")
	err := s.db.QueryRow("SELECT requests.id, requests.collection_id, collections.name as 'collection_name', requests.name, requests.description, requests.method, requests.url, requests.headers, requests.body, requests.body_type, requests.body_format, requests.auth FROM requests LEFT JOIN collections ON collections.id = requests.collection_id WHERE requests.id = ?", id).
		Scan(&dbR.ID, &dbR.CollectionID, &dbR.CollectionName, &dbR.Name, &dbR.Description, &dbR.Method, &dbR.URL, &dbR.Headers, &dbR.Body, &dbR.BodyType, &dbR.BodyFormat, &dbR.Auth)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("No request found with ID %d", id)
			return Request{}
		}
		return Request{}
	}

	var r = Request{
		ID:             dbR.ID,
		CollectionID:   nullStringToPointer(dbR.CollectionID),
		CollectionName: nullStringToPointer(dbR.CollectionName),
		Name:           dbR.Name.String,
		Description:    dbR.Description.String,
		Method:         dbR.Method.String,
		URL:            dbR.URL.String,
		Headers:        nullStringToEmptyString(dbR.Headers),
		Body:           nullStringToEmptyString(dbR.Body),
		BodyType:       nullStringToEmptyString(dbR.BodyType),
		BodyFormat:     nullStringToEmptyString(dbR.BodyFormat),
	}

	var resp Response
	respErr := s.db.QueryRow("SELECT id, status_code, headers, body, runtime_ms, request_id FROM responses WHERE request_id = ? ORDER BY id DESC LIMIT 1", dbR.ID).
		Scan(&resp.ID, &resp.StatusCode, &resp.Headers, &resp.Body, &resp.RuntimeMS, &resp.RequestID)
	if respErr == nil {
		r.Response = &resp
	}

	return r
}

func (s *RequestCRUDService) DeleteRequest(id int) error {
	_, err := s.db.Exec("DELETE FROM requests WHERE id = ?", id)
	if err != nil {
		fmt.Println("Error deleting request")
		return err
	}
	return nil
}

// TODO: lock down response object, replace "" with nulls etc
func (s *RequestCRUDService) GetAllRequestsList() []Request {
	var requests []Request
	rows, err := s.db.Query("SELECT id, collection_id, name, description, method, url FROM requests")

	if err != nil {
		fmt.Print("No requests found")
		return []Request{}
	}
	for rows.Next() {
		var dbR DbRequest
		err := rows.Scan(&dbR.ID, &dbR.CollectionID, &dbR.Name, &dbR.Description, &dbR.Method, &dbR.URL)
		if err != nil {
			fmt.Println("Failed to scan request:", err)
			continue
		}
		var r = Request{
			ID:           dbR.ID,
			CollectionID: nullStringToPointer(dbR.CollectionID),
			Name:         dbR.Name.String,
			Description:  dbR.Description.String,
			Method:       dbR.Method.String,
			URL:          dbR.URL.String,
		}
		requests = append(requests, r)
	}

	return requests
}

func (s *RequestCRUDService) ExecuteRequest(method string, requestUrl string, headersIn string, body string, bodyType string, bodyFormat string, auth string) (json.RawMessage, error) {
	var bodyReader io.Reader

	var headers []map[string]string
	if err := json.Unmarshal([]byte(headersIn), &headers); err != nil {
		var headerMap map[string]string
		if err := json.Unmarshal([]byte(headersIn), &headerMap); err != nil {
			headers = []map[string]string{}
		} else {
			headers = make([]map[string]string, 0, len(headerMap))
			for k, v := range headerMap {
				headers = append(headers, map[string]string{"key": k, "value": v})
			}
		}
	}

	switch bodyType {
	case "none":
		bodyReader = nil

	case "raw":
		bodyReader = bytes.NewBufferString(body)

		contentType := "text/plain" // Default
		switch bodyFormat {
		case "JSON":
			contentType = "application/json"
		case "HTML":
			contentType = "text/html"
		case "XML":
			contentType = "application/xml"
		case "JavaScript":
			contentType = "application/javascript"
		}

		foundContentType := false
		for i, header := range headers {
			if strings.ToLower(header["key"]) == "content-type" {
				headers[i]["value"] = contentType
				foundContentType = true
				break
			}
		}
		if !foundContentType {
			headers = append(headers, map[string]string{"key": "Content-Type", "value": contentType})
		}

	case "graphql":
		var graphqlData struct {
			Query     string          `json:"query"`
			Variables json.RawMessage `json:"variables"`
		}
		if err := json.Unmarshal([]byte(body), &graphqlData); err != nil {
			return encodeError(fmt.Errorf("invalid GraphQL data format: %w", err)), err
		}

		graphqlBody, err := json.Marshal(graphqlData)
		if err != nil {
			return encodeError(fmt.Errorf("failed to encode GraphQL request: %w", err)), err
		}

		bodyReader = bytes.NewReader(graphqlBody)

		foundContentType := false
		for i, header := range headers {
			if strings.ToLower(header["key"]) == "content-type" {
				headers[i]["value"] = "application/json"
				foundContentType = true
				break
			}
		}
		if !foundContentType {
			headers = append(headers, map[string]string{"key": "Content-Type", "value": "application/json"})
		}

	default:
		bodyReader = bytes.NewBufferString(body)
	}

	httpReq, err := http.NewRequest(method, requestUrl, bodyReader)
	if err != nil {
		return encodeError(err), err
	}

	//
	for _, header := range headers {
		if header["key"] != "" {
			httpReq.Header.Set(header["key"], header["value"])
		}
	}

	if auth != "" {
		httpReq.Header.Set("Authorization", auth)
	}

	client := http.DefaultClient
	startTime := time.Now()
	resp, err := client.Do(httpReq)
	endTime := time.Now()
	requestTime := endTime.Sub(startTime).Milliseconds()

	if err != nil {
		return encodeError(err), err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return encodeError(err), err
	}

	headersJSON, err := json.Marshal(resp.Header)
	if err != nil {
		return encodeError(err), err
	}

	var bodyJSON json.RawMessage
	if json.Valid(bodyBytes) {
		bodyJSON = json.RawMessage(bodyBytes)
	} else {
		str, _ := json.Marshal(string(bodyBytes))
		bodyJSON = json.RawMessage(str)
	}

	responseJSON, err := json.Marshal(map[string]interface{}{
		"statusCode": resp.StatusCode,
		"headers":    json.RawMessage(headersJSON),
		"body":       bodyJSON,
		"runtimeMS":  int(requestTime),
	})
	if err != nil {
		return encodeError(err), err
	}

	return responseJSON, nil
}

func encodeError(err error) json.RawMessage {
	errorJSON, _ := json.Marshal(map[string]string{
		"error": err.Error(),
	})
	return errorJSON
}

func (s *RequestCRUDService) SaveRequest(collectionId *string, name string, description string, method string, url string, headers string, body string, bodyType string, bodyFormat string, auth string, response *Response) Request {
	var newRequest = Request{
		CollectionID: collectionId,
		Name:         name,
		Description:  description,
		Method:       method,
		URL:          url,
		Headers:      headers,
		Body:         body,
		BodyType:     bodyType,
		BodyFormat:   bodyFormat,
		Auth:         auth,
	}

	err := s.db.QueryRow("INSERT INTO requests (collection_id, name, description, method, url, headers, body, body_type, body_format, auth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ID",
		newRequest.CollectionID,
		emptyStringToNullString(newRequest.Name),
		emptyStringToNullString(newRequest.Description),
		emptyStringToNullString(newRequest.Method),
		emptyStringToNullString(newRequest.URL),
		emptyStringToNullString(newRequest.Headers),
		emptyStringToNullString(newRequest.Body),
		emptyStringToNullString(newRequest.BodyType),
		emptyStringToNullString(newRequest.BodyFormat),
		emptyStringToNullString(newRequest.Auth)).Scan(&newRequest.ID)
	if err != nil {
		fmt.Println("Failed to insert request:", err)
		return Request{}
	}

	// Insert response if provided
	if response != nil {
		_, respErr := s.db.Exec("INSERT INTO responses (status_code, headers, body, runtime_ms, request_id) VALUES (?, ?, ?, ?, ?)",
			response.StatusCode, response.Headers, response.Body, response.RuntimeMS, newRequest.ID)
		if respErr != nil {
			fmt.Println("Failed to insert response:", respErr)
		}
	}

	return newRequest
}

func (s *RequestCRUDService) UpdateRequest(id int, collectionId *string, name string, description string, method string, requestUrl string, headers string, body string, bodyType string, bodyFormat string, auth string, response *Response) Request {
	_, err := s.db.Exec(
		`UPDATE requests
         SET collection_id = ?, name = ?, description = ?, method = ?, url = ?, headers = ?, body = ?, body_type = ?, body_format = ?, auth = ?
         WHERE id = ?`,
		collectionId,
		emptyStringToNullString(name),
		emptyStringToNullString(description),
		emptyStringToNullString(method),
		emptyStringToNullString(requestUrl),
		emptyStringToNullString(headers),
		emptyStringToNullString(body),
		emptyStringToNullString(bodyType),
		emptyStringToNullString(bodyFormat),
		emptyStringToNullString(auth),
		id,
	)
	if err != nil {
		fmt.Println("Failed to update request:", err)
		return Request{}
	}

	if response != nil {
		_, respErr := s.db.Exec("INSERT INTO responses (status_code, headers, body, runtime_ms, request_id) VALUES (?, ?, ?, ?, ?)",
			response.StatusCode, response.Headers, response.Body, response.RuntimeMS, id)
		if respErr != nil {
			fmt.Println("Failed to insert response:", respErr)
		}
	}

	return Request{
		ID:           id,
		CollectionID: collectionId,
		Name:         name,
		Description:  description,
		Method:       method,
		URL:          requestUrl,
		Headers:      headers,
		Body:         body,
		BodyType:     bodyType,
		BodyFormat:   bodyFormat,
		Auth:         auth,
	}
}

// TODO: Implement this
func (s *RequestCRUDService) SetRequestSortOrder(id int, sortOrder int) error {
	return nil
}

func (s *RequestCRUDService) SearchRequests(searchTerm string) []Request {
	var requests []Request
	query := `
        SELECT id, collection_id, name, description, body, url, method
        FROM requests
        WHERE name = ? OR url = ? 
        OR name LIKE ? OR url LIKE ? OR body LIKE ?
        ORDER BY id ASC
    `
	rows, err := s.db.Query(query, searchTerm, searchTerm, "%"+searchTerm+"%", "%"+searchTerm+"%", "%"+searchTerm+"%")
	if err != nil {
		fmt.Println("Error searching requests:", err)
		return []Request{}
	}
	defer rows.Close()

	for rows.Next() {
		var dbR DbRequest
		err := rows.Scan(
			&dbR.ID,
			&dbR.CollectionID,
			&dbR.Name,
			&dbR.Description,
			&dbR.Body,
			&dbR.URL,
			&dbR.Method,
		)
		if err != nil {
			fmt.Println("Failed to scan request:", err)
			continue
		}
		r := Request{
			ID:           dbR.ID,
			CollectionID: nullStringToPointer(dbR.CollectionID),
			Name:         dbR.Name.String,
			Description:  dbR.Description.String,
			Body:         nullStringToEmptyString(dbR.Body),
			URL:          dbR.URL.String,
			Method:       dbR.Method.String,
		}
		requests = append(requests, r)
	}

	return requests
}

func (s *RequestCRUDService) CreateCollection(name string, description string, parentId *string) Collection {
	var newCollection = Collection{
		ID:                 uuid.New().String(),
		Name:               name,
		Description:        description,
		ParentCollectionId: parentId,
	}

	err := s.db.QueryRow(
		"INSERT INTO collections (id, name, description, parent_collection) VALUES(?, ?, ?, ?) RETURNING ID",
		newCollection.ID,
		newCollection.Name,
		emptyStringToNullString(newCollection.Description),
		newCollection.ParentCollectionId,
	).Scan(&newCollection.ID)

	if err != nil {
		fmt.Println("Failed to insert collection", err)
		return Collection{}
	}

	return newCollection
}

func (s *RequestCRUDService) UpdateCollectionParent(collectionId string, parentId *string) error {
	_, err := s.db.Exec(
		"UPDATE collections SET parent_collection = ? WHERE id = ?",
		parentId,
		collectionId,
	)
	if err != nil {
		fmt.Println("Failed to update collection parent:", err)
		return err
	}
	return nil
}

func (s *RequestCRUDService) SetRequestCollection(requestId int, collectionId string) {
	err := s.db.QueryRow("UPDATE requests SET collection_id = ? WHERE id = ?", collectionId, requestId)
	if err != nil {
		fmt.Println("Filed to set request collection", err)
	}
}

func (s *RequestCRUDService) DeleteCollection(collectionId string) error {
	_, err := s.db.Query("DELETE FROM collections where id = ?", collectionId)
	if err != nil {
		fmt.Println("Filed to delete collection", err)
		return err
	}
	return nil
}

func (s *RequestCRUDService) GetAllCollections() []Collection {
	var collections []Collection
	rows, err := s.db.Query("SELECT id, name, parent_collection FROM collections")

	if err != nil {
		fmt.Println("Failed to get all collections", err)
		return []Collection{}
	}

	for rows.Next() {
		var c Collection
		var parentId sql.NullString
		err := rows.Scan(&c.ID, &c.Name, &parentId)
		if err != nil {
			fmt.Println("Failed to scan row to collection", err)
			continue
		}
		c.ParentCollectionId = nullStringToPointer(parentId)
		collections = append(collections, c)
	}

	return collections
}

func emptyStringToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func nullStringToEmptyString(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}

func nullStringToPointer(ns sql.NullString) *string {
	if ns.Valid {
		return &ns.String
	}
	return nil
}
