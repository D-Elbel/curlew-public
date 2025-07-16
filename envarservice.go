package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v3/pkg/application"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type EnvarService struct {
	app *application.App
}

type EnvarJSON struct {
	Env       string            `json:"env"`
	Variables map[string]string `json:"variables"`
}

func (s *EnvarService) InitEnvarWatch(ctx context.Context) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	defer watcher.Close()

	go func() {
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				log.Println("event:", event)
				if event.Has(fsnotify.Write) {
					log.Println("modified file:", event.Name)
					//TODO: Use an enum for these events, can share it with frontend
					s.app.EmitEvent("ENVARS_UPDATED")
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			case <-ctx.Done():
				log.Println("Watcher cancelled")
				return
			}
			time.Sleep(time.Second)
		}
	}()

	err = watcher.Add("./data/environments")
	if err != nil {
		log.Fatal(err)
	}

	<-ctx.Done()
}
func (s *EnvarService) ScanEnvars() json.RawMessage {

	envarList := []EnvarJSON{}

	envarMap := make(map[string]map[string]string)

	entries, err := os.ReadDir("./data/environments")
	if err != nil {
		fmt.Print(err)
	}
	var fileNames []string
	for _, entry := range entries {
		fileNames = append(fileNames, entry.Name())

	}
	for index, fileName := range fileNames {
		vars := make(map[string]string)
		fmt.Println(index)
		file, err := os.Open("./data/environments/" + fileName)
		if err != nil {
			fmt.Println(err)
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := scanner.Text()
			lineLen := len(line)
			splitIndex := strings.Index(line, "=")
			key := line[0:splitIndex]
			value := line[splitIndex+1 : lineLen]
			vars[key] = value
		}
		envarMap[fileName] = vars
		envarList = append(envarList, EnvarJSON{
			Env:       fileName,
			Variables: vars,
		})
	}

	jsonBytes, err := json.MarshalIndent(envarList, "", "  ")

	return jsonBytes
}

func (s *EnvarService) ReadEnvFile(filename string) (string, error) {
	path := filepath.Join("./data/environments", filename)
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (s *EnvarService) SaveEnvFile(filename, content string) error {
	path := filepath.Join("./data/environments", filename)

	if err := os.MkdirAll("./data/environments", fs.ModePerm); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func (s *EnvarService) CreateEnvFile(filename string) error {
	path := filepath.Join("./data/environments", filename)
	if err := os.MkdirAll("./data/environments", fs.ModePerm); err != nil {
		return err
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	return f.Close()
}
