# Curlew: IDE Power in HTTP Testing

Curlew is a Go-based desktop client designed to bring the power and familiarity of an Integrated Development Environment (IDE) to HTTP testing. Currently in pre-alpha, Curlew aims to provide a robust, offline-first solution with an emphasis on a streamlined user experience and powerful features.

## Why Curlew?

While excellent tools like Postman, Insomnia, SoapUI, and Yaak exist, Curlew was born from a need for an offline-first client that addresses common pain points and offers an IDE-like testing experience.

The impetus for Curlew came during a critical production issue when an existing online-dependent tool failed due to an outage. This highlighted the need for a reliable, local solution. Curlew aims to improve upon existing tools by focusing on:

*   **Offline-First Operation:** Ensure uninterrupted access to your API testing environment.
*   **Performance & Efficiency:** Avoid application bloat and provide a snappy user experience.
*   **Enhanced UX:** Overcome limitations like the inability to view multiple requests side-by-side and unreliable search functionalities.
*   **IDE-like Experience:** Bring powerful hotkeys, navigation, and a familiar workflow to API testing.

## Features

### Split View Requests

Compare responses from different API endpoints, work with related requests simultaneously, and customize your workspace with flexible layouts. Curlew supports adjustable split views for both requests and environments, allowing you to easily compare responses or view all available environment variables while working.

*   Compare responses from different API endpoints
*   Work with related requests simultaneously
*   Customize your workspace with flexible layouts

### Environment Management

Curlew utilizes a file-based environment system. Environments can be created, updated, or deleted externally using your preferred text editor, with changes reflected in real-time within Curlew. Alternatively, environments can be managed directly through the Curlew interface.

*   File-based environments for easy editing and sharing.
*   Quick switching between environments and comparison of variables.

### Command Palette

Inspired by modern developer tooling, Curlew features a command palette for quick access to all features. Search active tabs, create and open environments and requests, all accessible via the command palette or customizable hotkeys.

*   Quick access to all features without leaving the keyboard
*   Search for commands, open requests, or open environments
*   Customizable keyboard shortcuts for frequent actions

### Powerful Search

Emulating the best-in-class search experience of JetBrains tooling, Curlew provides powerful search capabilities across request names, URLs, and request/response body content.

*   Search across all requests and responses
*   Match highlighting for easy identification of results
