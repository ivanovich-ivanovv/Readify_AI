# Readify AI Chatbot

RAG-based AI chatbot for the Readify bookstore, built with NestJS, MongoDB, ChromaDB, and Google Gemini.

## Prerequisites

- **Node.js** >= 18
- **Docker & Docker Compose** (for ChromaDB)
- **MongoDB** (Atlas connection already configured)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start ChromaDB

```bash
docker-compose up -d
```

This starts ChromaDB on `http://localhost:8000`.

### 3. Configure environment

The `.env` file is already configured. Adjust values if needed:

```
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=AIza...
CHROMA_URL=http://localhost:8000
```

### 4. Start the server

```bash
npm run start:dev
```

The server runs on `http://localhost:3000`.

## API Endpoints

### POST /sync

Synchronize MongoDB book data into ChromaDB vector store. **Run this first** before using the chatbot.

```bash
curl -X POST http://localhost:3000/sync
```

Response:
```json
{
  "message": "Sync completed successfully",
  "synced": 150
}
```

### POST /chat

Ask the chatbot a question.

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "books under 200000"}'
```

Response:
```json
{
  "answer": "Here are some books under 200,000 VND:\n1. ...",
  "books": [
    {
      "title": "Atomic Habits",
      "author": "James Clear",
      "category": "Self Help",
      "price": 180000,
      "currency": "VND",
      "soldCount": 1200
    }
  ]
}
```

#### Example questions

| Query Type | Example |
|------------|---------|
| Price range | `"books from 100000 to 200000 VND"` |
| Under price | `"books under 150000"` |
| By author | `"books by Nguyen Nhat Anh"` |
| By category | `"show fantasy books"` |
| Bestsellers | `"top selling books"` |
| Stock check | `"is Atomic Habits available?"` |
| General | `"recommend a good self-help book"` |

### GET /health

Check system status.

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-08T10:00:00.000Z",
  "services": {
    "mongodb": "connected",
    "chromadb": "connected",
    "chromaDocuments": 150
  }
}
```

## Architecture

```
User Question
  → Embed question (Gemini text-embedding-004)
  → Search ChromaDB for relevant book documents
  → Classify query type (price/author/category/bestseller/stock/general)
  → Query MongoDB for accurate, structured results
  → Generate natural language answer (Gemini)
  → Return answer + book list (max 5)
```

## Project Structure

```
src/
├── config/
│   └── configuration.ts
├── modules/
│   ├── books/          # Book schema & service
│   ├── authors/        # Author schema & service
│   ├── stock/          # Stock schema & service
│   ├── categories/     # Category schema & service
│   ├── chroma/         # ChromaDB client wrapper
│   ├── embedding/      # Gemini embedding & generation
│   ├── sync/           # MongoDB → ChromaDB sync
│   ├── chatbot/        # RAG chat pipeline
│   └── health/         # Health check endpoint
├── app.module.ts
└── main.ts
```

## MongoDB Query Examples

### Find books by price range
```javascript
db.books.find({ basePrice: { $gte: 100000, $lte: 200000 } })
  .sort({ soldCount: -1 })
  .limit(5)
```

### Find books by author
```javascript
const author = db.authors.findOne({ name: /Nguyen Nhat Anh/i })
db.books.find({ authors: author._id })
  .sort({ soldCount: -1 })
  .limit(5)
```

### Find bestsellers
```javascript
db.books.find()
  .sort({ soldCount: -1 })
  .limit(5)
```

### Check stock
```javascript
db.stock.find({ bookId: ObjectId("...") })
```

### Find books by category
```javascript
const cat = db.categories.findOne({ name: /Fantasy/i })
db.books.find({ categoryIds: cat._id })
  .sort({ soldCount: -1 })
  .limit(5)
```
