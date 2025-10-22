package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type RequestCRUDService struct {
	db  *sql.DB
	app *application.App
}

type Request struct {
	ID             int       `json:"id"`
	CollectionID   *string   `json:"collectionId"`
	CollectionName *string   `json:"collectionName"`
	Name           *string   `json:"name"`
	Description    *string   `json:"description"`
	Method         *string   `json:"method"`
	URL            *string   `json:"url"`
	Headers        *string   `json:"headers"`
	Body           *string   `json:"body"`
	BodyType       *string   `json:"bodyType"`
	BodyFormat     *string   `json:"bodyFormat"`
	Auth           *string   `json:"auth"`
	SortOrder      *int      `json:"sortOrder"`
	Response       *Response `json:"response,omitempty"`
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
	var (
		requestID      int
		collectionID   sql.NullString
		collectionName sql.NullString
		name           sql.NullString
		description    sql.NullString
		method         sql.NullString
		url            sql.NullString
		headers        sql.NullString
		body           sql.NullString
		bodyType       sql.NullString
		bodyFormat     sql.NullString
		auth           sql.NullString
	)

	s.app.EmitEvent("test")
	err := s.db.QueryRow("SELECT requests.id, requests.collection_id, collections.name as 'collection_name', requests.name, requests.description, requests.method, requests.url, requests.headers, requests.body, requests.body_type, requests.body_format, requests.auth FROM requests LEFT JOIN collections ON collections.id = requests.collection_id WHERE requests.id = ?", id).
		Scan(&requestID, &collectionID, &collectionName, &name, &description, &method, &url, &headers, &body, &bodyType, &bodyFormat, &auth)

	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("No request found with ID %d", id)
			return Request{}
		}
		return Request{}
	}

	var r = Request{
		ID:             requestID,
		CollectionID:   nullStringToPointer(collectionID),
		CollectionName: nullStringToPointer(collectionName),
		Name:           nullStringToPointer(name),
		Description:    nullStringToPointer(description),
		Method:         nullStringToPointer(method),
		URL:            nullStringToPointer(url),
		Headers:        nullStringToPointer(headers),
		Body:           nullStringToPointer(body),
		BodyType:       nullStringToPointer(bodyType),
		BodyFormat:     nullStringToPointer(bodyFormat),
		Auth:           nullStringToPointer(auth),
	}

	var resp Response
	respErr := s.db.QueryRow("SELECT id, status_code, headers, body, runtime_ms, request_id FROM responses WHERE request_id = ? ORDER BY id DESC LIMIT 1", requestID).
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
	s.normalizeRequestSortOrder()

	var requests []Request
	rows, err := s.db.Query("SELECT id, collection_id, name, description, method, url, sort_order FROM requests ORDER BY collection_id, COALESCE(sort_order, id)")

	if err != nil {
		fmt.Print("No requests found")
		return []Request{}
	}
	defer rows.Close()

	for rows.Next() {
		var (
			requestID    int
			collectionID sql.NullString
			name         sql.NullString
			description  sql.NullString
			method       sql.NullString
			url          sql.NullString
			sortOrder    sql.NullInt64
		)

		err := rows.Scan(&requestID, &collectionID, &name, &description, &method, &url, &sortOrder)
		if err != nil {
			fmt.Println("Failed to scan request:", err)
			continue
		}
		var r = Request{
			ID:           requestID,
			CollectionID: nullStringToPointer(collectionID),
			Name:         nullStringToPointer(name),
			Description:  nullStringToPointer(description),
			Method:       nullStringToPointer(method),
			URL:          nullStringToPointer(url),
			SortOrder:    nullIntToPointer(sortOrder),
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
		Name:         stringPointerOrNil(name),
		Description:  stringPointerOrNil(description),
		Method:       stringPointerOrNil(method),
		URL:          stringPointerOrNil(url),
		Headers:      stringPointerOrNil(headers),
		Body:         stringPointerOrNil(body),
		BodyType:     stringPointerOrNil(bodyType),
		BodyFormat:   stringPointerOrNil(bodyFormat),
		Auth:         stringPointerOrNil(auth),
	}

	// Get the next sort order for this collection
	var maxSortOrder sql.NullInt64
	err := s.db.QueryRow("SELECT MAX(sort_order) FROM requests WHERE collection_id = ?", collectionId).Scan(&maxSortOrder)
	if err != nil {
		fmt.Println("Failed to get max sort order:", err)
	}

	nextSortOrder := 0
	if maxSortOrder.Valid {
		nextSortOrder = int(maxSortOrder.Int64) + 1
	}

	err = s.db.QueryRow("INSERT INTO requests (collection_id, name, description, method, url, headers, body, body_type, body_format, auth, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ID",
		newRequest.CollectionID,
		emptyStringToNullString(name),
		emptyStringToNullString(description),
		emptyStringToNullString(method),
		emptyStringToNullString(url),
		emptyStringToNullString(headers),
		emptyStringToNullString(body),
		emptyStringToNullString(bodyType),
		emptyStringToNullString(bodyFormat),
		emptyStringToNullString(auth),
		nextSortOrder).Scan(&newRequest.ID)
	if err != nil {
		fmt.Println("Failed to insert request:", err)
		return Request{}
	}

	newRequest.SortOrder = intPointer(nextSortOrder)

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
		Name:         stringPointerOrNil(name),
		Description:  stringPointerOrNil(description),
		Method:       stringPointerOrNil(method),
		URL:          stringPointerOrNil(requestUrl),
		Headers:      stringPointerOrNil(headers),
		Body:         stringPointerOrNil(body),
		BodyType:     stringPointerOrNil(bodyType),
		BodyFormat:   stringPointerOrNil(bodyFormat),
		Auth:         stringPointerOrNil(auth),
	}
}

// TODO: Implement this
func (s *RequestCRUDService) SetRequestSortOrder(id int, sortOrder int) error {
	var collectionId sql.NullString
	err := s.db.QueryRow("SELECT collection_id FROM requests WHERE id = ?", id).Scan(&collectionId)
	if err != nil {
		fmt.Println("Failed to get request collection:", err)
		return err
	}

	rows, err := s.db.Query("SELECT id FROM requests WHERE collection_id = ? AND sort_order IS NULL ORDER BY id", collectionId)
	if err != nil {
		fmt.Println("Failed to get requests with null sort orders:", err)
		return err
	}
	defer rows.Close()

	var requestsToUpdate []int
	for rows.Next() {
		var requestId int
		if err := rows.Scan(&requestId); err != nil {
			continue
		}
		requestsToUpdate = append(requestsToUpdate, requestId)
	}

	var maxSortOrder sql.NullInt64
	err = s.db.QueryRow("SELECT MAX(sort_order) FROM requests WHERE collection_id = ? AND sort_order IS NOT NULL", collectionId).Scan(&maxSortOrder)
	if err != nil {
		fmt.Println("Failed to get max sort order:", err)
		return err
	}

	startOrder := 0
	if maxSortOrder.Valid {
		startOrder = int(maxSortOrder.Int64) + 1
	}

	for i, requestId := range requestsToUpdate {
		_, err = s.db.Exec("UPDATE requests SET sort_order = ? WHERE id = ?", startOrder+i, requestId)
		if err != nil {
			fmt.Println("Failed to initialize sort order for request:", requestId, err)
			return err
		}
	}

	var currentSortOrder sql.NullInt64
	err = s.db.QueryRow("SELECT sort_order FROM requests WHERE id = ?", id).Scan(&currentSortOrder)
	if err != nil {
		fmt.Println("Failed to get current sort order:", err)
		return err
	}

	if !currentSortOrder.Valid {
		fmt.Println("Request sort order is still null after initialization")
		return fmt.Errorf("request sort order is null")
	}

	currentOrder := int(currentSortOrder.Int64)

	if currentOrder == sortOrder {
		return nil
	}

	if currentOrder < sortOrder {
		if collectionId.Valid {
			_, err = s.db.Exec(`
			UPDATE requests 
			SET sort_order = sort_order - 1 
			WHERE collection_id = ? AND sort_order > ? AND sort_order <= ? AND id != ?
		`, collectionId.String, currentOrder, sortOrder, id)
		} else {
			_, err = s.db.Exec(`
			UPDATE requests 
			SET sort_order = sort_order - 1 
			WHERE collection_id IS NULL AND sort_order > ? AND sort_order <= ? AND id != ?
		`, currentOrder, sortOrder, id)
		}
	} else {
		if collectionId.Valid {
			_, err = s.db.Exec(`
			UPDATE requests 
			SET sort_order = sort_order + 1 
			WHERE collection_id = ? AND sort_order >= ? AND sort_order < ? AND id != ?
		`, collectionId.String, sortOrder, currentOrder, id)
		} else {
			_, err = s.db.Exec(`
			UPDATE requests 
			SET sort_order = sort_order + 1 
			WHERE collection_id IS NULL AND sort_order >= ? AND sort_order < ? AND id != ?
		`, sortOrder, currentOrder, id)
		}
	}

	if err != nil {
		fmt.Println("Failed to shift sort orders:", err)
		return err
	}

	_, err = s.db.Exec("UPDATE requests SET sort_order = ? WHERE id = ?", sortOrder, id)
	if err != nil {
		fmt.Println("Failed to update request sort order:", err)
		return err
	}

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
		var (
			requestID    int
			collectionID sql.NullString
			name         sql.NullString
			description  sql.NullString
			bodyValue    sql.NullString
			url          sql.NullString
			methodValue  sql.NullString
		)
		err := rows.Scan(
			&requestID,
			&collectionID,
			&name,
			&description,
			&bodyValue,
			&url,
			&methodValue,
		)
		if err != nil {
			fmt.Println("Failed to scan request:", err)
			continue
		}
		r := Request{
			ID:           requestID,
			CollectionID: nullStringToPointer(collectionID),
			Name:         nullStringToPointer(name),
			Description:  nullStringToPointer(description),
			Body:         nullStringToPointer(bodyValue),
			URL:          nullStringToPointer(url),
			Method:       nullStringToPointer(methodValue),
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
	if parentId != nil && *parentId == collectionId {
		return fmt.Errorf("a collection cannot be its own parent")
	}

	if parentId != nil {
		var exists bool
		if err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM collections WHERE id = ?)", *parentId).Scan(&exists); err != nil {
			fmt.Println("Failed to validate parent collection:", err)
			return err
		}
		if !exists {
			return fmt.Errorf("parent collection %s does not exist", *parentId)
		}

		cycle, err := s.createsCollectionCycle(collectionId, *parentId)
		if err != nil {
			fmt.Println("Failed to validate collection hierarchy:", err)
			return err
		}
		if cycle {
			return fmt.Errorf("cannot move collection: circular hierarchy detected")
		}
	}

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
	var value interface{}
	if strings.TrimSpace(collectionId) != "" {
		value = collectionId
	}

	if _, err := s.db.Exec("UPDATE requests SET collection_id = ? WHERE id = ?", value, requestId); err != nil {
		fmt.Println("Failed to set request collection", err)
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
	s.sanitizeCollectionParents()

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
		if parentId.Valid && parentId.String == c.ID {
			parentId.Valid = false
		}
		c.ParentCollectionId = nullStringToPointer(parentId)
		collections = append(collections, c)
	}

	return collections
}

func (s *RequestCRUDService) sanitizeCollectionParents() {
	if s.db == nil {
		return
	}
	if _, err := s.db.Exec("UPDATE collections SET parent_collection = NULL WHERE parent_collection = id"); err != nil {
		fmt.Println("Failed to sanitize self-referential collections:", err)
	}
}

func (s *RequestCRUDService) normalizeRequestSortOrder() {
	if s.db == nil {
		return
	}

	rows, err := s.db.Query("SELECT DISTINCT collection_id FROM requests")
	if err != nil {
		fmt.Println("Failed to gather collections for sort normalization:", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var collectionID sql.NullString
		if err := rows.Scan(&collectionID); err != nil {
			fmt.Println("Failed to scan collection id during sort normalization:", err)
			continue
		}

		var (
			reqRows *sql.Rows
			query   string
			args    []interface{}
		)

		if collectionID.Valid {
			query = `
			SELECT id, sort_order
			FROM requests
			WHERE collection_id = ?
			ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order, id
		`
			args = []interface{}{collectionID.String}
		} else {
			query = `
			SELECT id, sort_order
			FROM requests
			WHERE collection_id IS NULL
			ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order, id
		`
		}

		reqRows, err = s.db.Query(query, args...)
		if err != nil {
			fmt.Println("Failed to load requests for normalization:", err)
			continue
		}

		index := 0
		for reqRows.Next() {
			var requestID int
			var sortOrder sql.NullInt64
			if err := reqRows.Scan(&requestID, &sortOrder); err != nil {
				fmt.Println("Failed to scan request during normalization:", err)
				continue
			}

			if !sortOrder.Valid || int(sortOrder.Int64) != index {
				if _, err := s.db.Exec("UPDATE requests SET sort_order = ? WHERE id = ?", index, requestID); err != nil {
					fmt.Println("Failed to normalize request sort order:", err)
					continue
				}
			}
			index++
		}
		reqRows.Close()
	}
}

func (s *RequestCRUDService) createsCollectionCycle(collectionId string, newParentId string) (bool, error) {
	current := newParentId
	for current != "" {
		if current == collectionId {
			return true, nil
		}

		var parent sql.NullString
		err := s.db.QueryRow("SELECT parent_collection FROM collections WHERE id = ?", current).Scan(&parent)
		if err == sql.ErrNoRows {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if !parent.Valid {
			return false, nil
		}

		if parent.String == current {
			if _, err := s.db.Exec("UPDATE collections SET parent_collection = NULL WHERE id = ?", current); err != nil {
				fmt.Println("Failed to repair self-referential parent during cycle check:", err)
			}
			return false, nil
		}

		current = parent.String
	}
	return false, nil
}

func emptyStringToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func stringPointerOrNil(value string) *string {
	if value == "" {
		return nil
	}
	v := value
	return &v
}

func intPointer(value int) *int {
	v := value
	return &v
}

func nullStringToPointer(ns sql.NullString) *string {
	if ns.Valid {
		value := ns.String
		return &value
	}
	return nil
}

func nullIntToPointer(ni sql.NullInt64) *int {
	if ni.Valid {
		val := int(ni.Int64)
		return &val
	}
	return nil
}
