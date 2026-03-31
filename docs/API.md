# VN-Sutra API Documentation

## Overview

VN-Sutra provides a backend API for managing game assets and serving them to the game client. The API is built with Express.js and handles file compression, serving, and storage management.

For client-side declarative scene authoring, see [STORY_SCRIPTING.md](./STORY_SCRIPTING.md).
For planned XML/CSS-to-Konva UI compilation workflow (home/game shell UI), see [UI_LAYOUT_WORKFLOW.md](./UI_LAYOUT_WORKFLOW.md).

## Table of Contents

<details class="toc">
<summary><strong>Contents</strong> — click to expand</summary>

<ul>
  <li><a href="#base-url">🌐 Base URL</a></li>
  <li><a href="#authentication">🔐 Authentication</a></li>
  <li>
    <a href="#endpoints">📬 Endpoints</a>
    <ul>
      <li><a href="#get-">GET /</a></li>
      <li><a href="#get-folder">GET /folder</a></li>
    </ul>
  </li>
  <li><a href="#quick-examples">🔎 Quick Examples</a></li>
  <li><a href="#static-files">📁 Static Files</a></li>
  <li><a href="#environment-variables">⚙️ Environment Variables</a></li>
  <li><a href="#error-handling">❗ Error Handling</a></li>
  <li><a href="#security-features">🛡️ Security Features</a></li>
  <li><a href="#troubleshooting">🛠️ Troubleshooting</a></li>
</ul>

<p style="margin-top:0.5rem;color:#6b7280;font-size:0.95rem">Tip: expand this list, then click an item to jump to the section.</p>

</details>

## Base URL

- Development: `http://localhost:10000`
- Production: `https://vnsutra.vercel.app`

## Authentication

Currently, the API uses origin-based validation (`Sec-Fetch-Site` header) rather than traditional authentication.

## Endpoints

### GET /

Serves the home page.

**Request:**
```
GET /
```

**Response:**
```
200 OK
Content-Type: text/html
```

---

### GET /folder

Retrieves and serves a zipped folder as base64-encoded data.

**Request:**
```
GET /folder?path=<folder-path>
Headers:
  Sec-Fetch-Site: same-origin
```

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| path | string | Yes | Relative path to folder (e.g., "backgrounds", "characters/Rin/Casual") |

**Security Checks:**
- Validates `Sec-Fetch-Site` header (must be "same-origin")
- Prevents path traversal attacks (`../`, `..\\`)
- Verifies resolved path is within `/assets/game-assets`
- Checks path exists and is a directory

**Response Success (200):**
```json
{
  "status": 200,
  "data": "UEsDBAoAAAAAABD..."  // base64-encoded zip file
}
```

**Response Errors:**

**400 Bad Request** - Missing path parameter:
```json
{
  "status": 400,
  "error": "Missing path parameter"
}
```

**403 Forbidden** - Invalid origin or path traversal attempt:
```json
{
  "status": 403,
  "error": "Forbidden"  // or "Access denied" / "Invalid path"
}
```

**404 Not Found** - Path doesn't exist:
```json
{
  "status": 404,
  "error": "Path not found"
}
```

**400 Bad Request** - Path is not a directory:
```json
{
  "status": 400,
  "error": "Path is not a directory"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "status": 500,
  "error": "Internal server error"
}
```

**Example Requests:**

Valid request:
```bash
curl -H "Sec-Fetch-Site: same-origin" \
  "http://localhost:10000/folder?path=backgrounds"
```

Attack attempt (blocked):
```bash
curl -H "Sec-Fetch-Site: same-origin" \
  "http://localhost:10000/folder?path=../../etc/passwd"
# Returns 403 Forbidden
```

---

## Quick Examples

Minimal examples to interact with the API quickly.

- Download a zipped folder (curl):

```bash
curl -H "Sec-Fetch-Site: same-origin" \
  "http://localhost:10000/folder?path=backgrounds" \
  -o backgrounds.json

# The response JSON contains a base64 `data` field you can decode.
```

- Fetch and save the folder zip in Node.js:

```js
import fetch from 'node-fetch';
import fs from 'fs';

const res = await fetch('http://localhost:10000/folder?path=backgrounds', {
  headers: { 'Sec-Fetch-Site': 'same-origin' }
});
const json = await res.json();
const buf = Buffer.from(json.data, 'base64');
fs.writeFileSync('backgrounds.zip', buf);
```

These illustrate the common flow: call `/folder` with origin validation and decode the base64 ZIP payload.

---

## Static Files

The following directories are served as static files:

- `/css/` - Stylesheets
- `/assets/` - Game assets (images, audio, fonts)
- `/vnsutra_modules/` - Core game engine
- `/game/` - Game configuration and data

---

## Environment Variables

Configure the API using environment variables:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| PORT | number | 10000 | Server port |
| NODE_ENV | string | development | Environment (development/production) |
| ZIP_DIR | string | /tmp/zipfiles | Directory for temporary zip files |
| ZIP_TTL_HOURS | number | 24 | Hours before zip files are deleted |
| MAX_ZIP_SIZE_MB | number | 100 | Maximum total size of zip files (MB) |
| ALLOWED_ORIGINS | string | localhost:10000 | Comma-separated allowed origins |

**Example .env file:**
```env
PORT=10000
NODE_ENV=production
ZIP_DIR=/tmp/vnsutra-zips
ZIP_TTL_HOURS=48
MAX_ZIP_SIZE_MB=200
```

---

## Error Handling

The API implements comprehensive error handling:

- **All errors are caught** and returned with appropriate HTTP status codes
- **Sensitive errors** (internal details) are never exposed to clients
- **All errors are logged** to console for server-side debugging
- **Graceful degradation** when operations fail

### Common Error Scenarios

| Scenario | Status | Message |
|----------|--------|---------|
| Missing parameter | 400 | Missing path parameter |
| Cross-origin request | 403 | Forbidden |
| Path traversal attempt | 403 | Access denied |
| Symlink outside assets | 403 | Invalid path |
| Non-existent path | 404 | Path not found |
| File instead of directory | 400 | Path is not a directory |
| Server error (rare) | 500 | Internal server error |

---

## Security Features

### 1. Path Traversal Protection

Multiple validation layers prevent directory traversal attacks:
```javascript
// Normalize path to remove redundant separators
fpath = path.normalize(fpath).replace(/^(\.\.(\/|\\|$))+/, '');

// Resolve absolute path and verify it's within assets root
const folder = path.resolve(assetsRoot, fpath);
if (!folder.startsWith(assetsRoot)) {
    // Reject - path is outside allowed directory
}

// Double-check with path.relative()
const relativePath = path.relative(assetsRoot, folder);
if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    // Reject - path escapes allowed directory
}
```

### 2. Origin Validation

Validates `Sec-Fetch-Site` header to prevent CSRF attacks:
```javascript
if(req.headers['sec-fetch-site'] !== "same-origin") {
    return res.status(403).json({ error: "Forbidden" });
}
```

### 3. Input Validation

- Checks for missing query parameters
- Validates parameter types
- Ensures paths are strings

### 4. Safe Error Messages

Error messages don't expose internal details:
```javascript
// ❌ Don't do this
res.json({ error: error.message }); // Exposes internal details

// ✅ Do this
res.json({ error: "Internal server error" }); // Generic message
```

---

## Performance Optimization

### Async Operations

All file operations use async/await to prevent blocking:
```javascript
// Check if file exists
await fs.promises.access(folder);

// Get file stats
const stats = await fs.promises.stat(folder);

// Read file
const data = await fs.promises.readFile(zipPath);
```

### Zip Caching

Zip files are cached to avoid re-compression:
- Only re-creates zip if it doesn't exist
- Old zips are automatically cleaned up

### Automatic Cleanup

Two-tier cleanup strategy:
1. **Time-based**: Delete files older than 24 hours (configurable via ZIP_TTL_HOURS)
2. **Size-based**: Delete oldest files when total exceeds 100MB (configurable via MAX_ZIP_SIZE_MB)

---

## Testing

Run tests to verify API functionality:

```bash
# Run all tests
npm test

# Run API tests only
npm test tests/api.test.js

# Watch mode for development
npm test:watch

# Generate coverage report
npm test:coverage
```

**Test Coverage Targets:**
- Path validation: 100%
- Security checks: 100%
- Error handling: 95%+

---

## Rate Limiting

Currently, the API does not implement rate limiting. For production deployments, consider:
- Using express-rate-limit middleware
- Implementing IP-based throttling
- Using a CDN with DDoS protection

---

## CORS Configuration

The API does not currently implement CORS headers. To enable CORS for cross-origin requests, you can:

```javascript
const cors = require('cors');

app.use(cors({
    origin: [
        'https://your-origin.com',
        'https://another-origin.com'
    ],
    credentials: true
}));
```

---

## Troubleshooting

### Connection Refused
- Ensure the server is running: `npm run dev:server`
- Check the PORT variable is set correctly

### 403 Forbidden
- Verify request is from same origin (check Sec-Fetch-Site header)
- Ensure path doesn't attempt traversal

### 404 Not Found
- Verify path exists in `/assets/game-assets`
- Check path spelling matches actual folder names

### 500 Internal Server Error
- Check server logs for error details
- Ensure zip directory has write permissions
- Verify disk space is available

---

## Future Enhancements

- [ ] API rate limiting
- [ ] CORS headers configuration
- [ ] Request logging and monitoring
- [ ] Support for zip encryption
- [ ] Compression format options
- [ ] Batch operations

---

## See Also

- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contributing guidelines
- [IMPROVEMENTS.md](../IMPROVEMENTS.md) - Planned improvements
- [package.json](../package.json) - Dependencies
