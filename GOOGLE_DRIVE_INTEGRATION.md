# Google Drive Integration for Simply Beeutiful Events

This document outlines how to integrate Google Drive as the source of truth for event data, while keeping the Doc Reader and backend as the processing and presentation layer.

## Overview

Instead of storing event files in the Git repository (`events/` folder), we'll use Google Drive as a collaborative workspace where planners and clients can organize contracts, budgets, vendor quotes, and inspiration. The backend will sync files from Google Drive, parse them, and store structured data in a database.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Google Drive (Source of Truth)                             │
│  ├─ Simply Beeutiful Events/                                │
│  │  ├─ Event 1: Mistretta-Petran Wedding (6.6.26)/         │
│  │  │  ├─ Budget & Payments/                                │
│  │  │  │  └─ Mistretta_Petran Wedding - Budget.xlsx         │
│  │  │  ├─ Contracts & Agreements/                           │
│  │  │  │  ├─ Katie_Mike 6.6.26 Agreement.pdf               │
│  │  │  │  └─ [vendor contracts]                             │
│  │  │  ├─ Inspiration/                                      │
│  │  │  │  └─ [photos, Pinterest pins]                       │
│  │  │  └─ Vendor List (Google Sheet)                        │
│  │  └─ Event 2: [Next Wedding]/                             │
│  └─ Client Proposals/ (shared with clients)                 │
└─────────────────────────────────────────────────────────────┘
           │
           │ (periodic sync or on-demand)
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (FastAPI/Flask)                                    │
│  ├─ Google Drive Sync Service                               │
│  │  ├─ List files from Google Drive                         │
│  │  ├─ Download and export (Sheets → XLSX, Docs → PDF)     │
│  │  └─ Detect changes (modified timestamps)                 │
│  ├─ Parser Service                                          │
│  │  ├─ Extract data from XLSX, PDF, DOCX                   │
│  │  ├─ Identify dates, amounts, vendor info                │
│  │  └─ Validate budget and timeline                         │
│  └─ Database Layer (PostgreSQL)                             │
│     ├─ events (name, drive_folder_id, synced_at)           │
│     ├─ documents (event_id, filename, parsed_data)         │
│     ├─ vendors (event_id, name, cost, status)              │
│     └─ budgets (event_id, category, planned, actual, paid)  │
└─────────────────────────────────────────────────────────────┘
           │
           │ (REST API)
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Doc Reader)                                      │
│  ├─ Event Dashboard                                         │
│  ├─ Budget & Payment Status                                 │
│  ├─ Timeline & Deadlines                                    │
│  ├─ Vendor Management                                       │
│  └─ Reports & Exports                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Why Google Drive?

### Benefits

- **Familiar workflow:** Your wife and clients already use Google Docs/Sheets for collaboration
- **Real-time collaboration:** Multiple people can edit simultaneously
- **Version history:** Built-in versioning for all files
- **Access control:** Share folders with specific people (clients, vendors)
- **No Git bloat:** Large PDFs and images don't clutter the repository
- **Client transparency:** Clients can see their own event folder without accessing sensitive app code

### Tradeoffs

- Requires Google Cloud setup and OAuth credentials
- Introduces a sync dependency (app can't work if Drive is unreachable)
- API rate limits (300 requests/min for most operations)
- Slightly higher latency than local files

---

## Google Drive Folder Structure

Create a shared Google Drive folder with this structure:

```
Simply Beeutiful Events/
├─ Events/
│  ├─ 2026-06-06 Mistretta-Petran Wedding/
│  │  ├─ 📊 Budget & Payments/
│  │  │  ├─ Mistretta_Petran Wedding - Budget.xlsx
│  │  │  ├─ Payment Tracker.xlsx
│  │  │  └─ Invoice Register.xlsx
│  │  ├─ 📋 Contracts & Agreements/
│  │  │  ├─ Katie_Mike 6.6.26 Agreement.pdf
│  │  │  ├─ Venue Contract - Grateful Dane Lodge.pdf
│  │  │  ├─ Catering Contract - Grumpa's Lunchbox.pdf
│  │  │  ├─ Photography - Beth Rexford.pdf
│  │  │  └─ [vendor contracts and quotes]
│  │  ├─ 👥 Vendors/
│  │  │  └─ Vendor List & Booked (Google Sheet)
│  │  ├─ 🎨 Inspiration/
│  │  │  ├─ Color Inspo.png
│  │  │  ├─ Flowers & Decor/
│  │  │  └─ [photos, Pinterest screenshots]
│  │  └─ 📝 Notes & Timeline/
│  │     ├─ Client Intake Form.pdf
│  │     ├─ Planning Timeline.docx
│  │     └─ Important Dates (Google Sheet)
│  ├─ 2026-07-18 [Next Wedding]/
│  └─ [Archive]/
├─ Templates/
│  ├─ Wedding Budget Template.xlsx
│  ├─ Contract Checklist.docx
│  └─ Vendor Intake Form.docx
├─ Clients/ (shared with clients only)
│  ├─ [Client Name] Shared Portal/
│  └─ [inspirations, timelines, payment status]
└─ Documentation/
   └─ [README, instructions for clients]
```

### Naming Convention

Use ISO date format for events: `YYYY-MM-DD Event Name`. This makes sorting and searching predictable.

---

## Google Cloud Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project called "Simply Beeutiful Events"
3. Enable the following APIs:
   - Google Drive API
   - Google Sheets API
   - Google Docs API

### Step 2: Create a Service Account (for backend sync)

A service account is a non-human account that can access Google Drive without user interaction.

1. In Google Cloud Console, go to **Service Accounts**
2. Create a new service account:
   - Name: `sbe-sync-service`
   - Description: "Syncs event files from Google Drive to the app backend"
3. Grant this role: **Editor** (or more restrictive: **Drive Editor + Sheets Editor**)
4. Create a JSON key:
   - Go to Keys tab
   - Add Key → Create new key → JSON
   - Download the file (save as `credentials.json`)

### Step 3: Share Google Drive Folder with Service Account

1. Open your "Simply Beeutiful Events" folder in Google Drive
2. Share it with the service account email (found in `credentials.json` under `client_email`)
3. Give it **Editor** access

### Step 4: Set Up OAuth for Clients (Optional, later)

If you want to allow clients to authorize the app to read their personal Google Drive:

1. In Google Cloud Console, go to **OAuth Consent Screen**
2. Configure the consent screen with SBE branding
3. Create OAuth 2.0 credentials (Web Application)
4. Add authorized redirect URI: `http://localhost:8000/auth/callback` (development)

---

## Backend Implementation

### Prerequisites

```bash
pip install google-auth-oauthlib google-auth-httplib2 google-api-python-client
pip install python-docx openpyxl pymupdf
pip install sqlalchemy psycopg2-binary  # for PostgreSQL
```

### 1. Google Drive Sync Service

Create `backend/services/google_drive_sync.py`:

```python
"""
Google Drive sync service for Simply Beeutiful Events.
Connects to Google Drive, downloads files, and syncs them to the database.
"""

import os
import io
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

logger = logging.getLogger(__name__)

class GoogleDriveSync:
    """Handles syncing files from Google Drive to the backend."""
    
    SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
    
    # MIME type mappings for export
    EXPORT_MIMES = {
        'application/vnd.google-apps.spreadsheet': 
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
        'application/vnd.google-apps.document': 
            'application/pdf',  # .pdf
    }
    
    def __init__(self, credentials_path: str = 'credentials.json'):
        """Initialize with service account credentials."""
        if not os.path.exists(credentials_path):
            raise FileNotFoundError(f"Credentials file not found: {credentials_path}")
        
        self.credentials = Credentials.from_service_account_file(
            credentials_path, 
            scopes=self.SCOPES
        )
        self.drive_service = build('drive', 'v3', credentials=self.credentials)
    
    def list_files_in_folder(self, folder_id: str, 
                            include_subfolders: bool = True) -> List[Dict]:
        """
        List all files in a Google Drive folder.
        
        Args:
            folder_id: Google Drive folder ID
            include_subfolders: If True, recursively list subfolders
        
        Returns:
            List of file metadata dicts with: id, name, mimeType, modifiedTime, size
        """
        files = []
        query = f"'{folder_id}' in parents and trashed=false"
        
        page_token = None
        while True:
            results = self.drive_service.files().list(
                q=query,
                spaces='drive',
                fields='nextPageToken, files(id, name, mimeType, modifiedTime, size)',
                pageSize=100,
                pageToken=page_token
            ).execute()
            
            files.extend(results.get('files', []))
            page_token = results.get('nextPageToken')
            
            if not page_token:
                break
        
        # Recursively fetch subfolders if requested
        if include_subfolders:
            for file in files[:]:  # iterate over copy
                if file['mimeType'] == 'application/vnd.google-apps.folder':
                    subfolder_files = self.list_files_in_folder(
                        file['id'], 
                        include_subfolders=True
                    )
                    files.extend(subfolder_files)
        
        return files
    
    def download_file(self, file_id: str, file_name: str) -> bytes:
        """
        Download a file from Google Drive.
        
        For Google Docs/Sheets, export to standard format (PDF, XLSX).
        """
        file_metadata = self.drive_service.files().get(
            fileId=file_id,
            fields='mimeType'
        ).execute()
        
        mime_type = file_metadata['mimeType']
        
        # Export Google Docs/Sheets to standard format
        if mime_type in self.EXPORT_MIMES:
            export_mime = self.EXPORT_MIMES[mime_type]
            logger.info(f"Exporting {file_name} from {mime_type} to {export_mime}")
            request = self.drive_service.files().export_media(
                fileId=file_id,
                mimeType=export_mime
            )
        else:
            # Download native file
            request = self.drive_service.files().get_media(fileId=file_id)
        
        file_content = io.BytesIO()
        downloader = MediaIoBaseDownload(file_content, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        return file_content.getvalue()
    
    def sync_event_folder(self, event_name: str, folder_id: str, 
                         temp_dir: str = '/tmp/sbe_sync') -> Dict:
        """
        Sync all files from an event folder in Google Drive.
        
        Args:
            event_name: Name of the event (e.g., "2026-06-06 Mistretta-Petran Wedding")
            folder_id: Google Drive folder ID for the event
            temp_dir: Temporary directory to store downloaded files
        
        Returns:
            Dictionary with sync results and parsed data
        """
        logger.info(f"Starting sync for event: {event_name}")
        
        # Create temp directory
        event_temp_dir = os.path.join(temp_dir, event_name.replace(' ', '_'))
        Path(event_temp_dir).mkdir(parents=True, exist_ok=True)
        
        # List and download files
        files = self.list_files_in_folder(folder_id)
        downloaded_files = []
        errors = []
        
        for file in files:
            # Skip folders
            if file['mimeType'] == 'application/vnd.google-apps.folder':
                continue
            
            try:
                logger.info(f"Downloading: {file['name']}")
                file_content = self.download_file(file['id'], file['name'])
                
                # Determine output filename (adjust extension if exported)
                output_filename = file['name']
                if file['mimeType'] in self.EXPORT_MIMES:
                    # Add extension for exported file
                    if file['mimeType'] == 'application/vnd.google-apps.spreadsheet':
                        output_filename = Path(output_filename).stem + '.xlsx'
                    elif file['mimeType'] == 'application/vnd.google-apps.document':
                        output_filename = Path(output_filename).stem + '.pdf'
                
                output_path = os.path.join(event_temp_dir, output_filename)
                with open(output_path, 'wb') as f:
                    f.write(file_content)
                
                downloaded_files.append({
                    'id': file['id'],
                    'name': output_filename,
                    'path': output_path,
                    'drive_mime': file['mimeType'],
                    'size': len(file_content),
                    'modified': file.get('modifiedTime', datetime.now().isoformat())
                })
                
            except Exception as e:
                error_msg = f"Failed to download {file['name']}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        logger.info(f"Downloaded {len(downloaded_files)} files for {event_name}")
        
        return {
            'event_name': event_name,
            'event_drive_id': folder_id,
            'synced_at': datetime.now().isoformat(),
            'files_downloaded': downloaded_files,
            'errors': errors,
            'temp_dir': event_temp_dir
        }


def get_drive_sync(credentials_path: Optional[str] = None) -> GoogleDriveSync:
    """Factory function to get a GoogleDriveSync instance."""
    if credentials_path is None:
        credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH', 'credentials.json')
    return GoogleDriveSync(credentials_path)
```

### 2. Event Parser (Enhanced)

Modify `tools/scan_event.py` to accept a directory and return structured data:

```python
# (Enhanced version, compatible with backend)

def parse_event_from_directory(event_dir: Path) -> Dict:
    """
    Parse all files in an event directory.
    Returns structured data ready for database storage.
    """
    files = [p for p in event_dir.rglob("*") if p.is_file()]
    
    parsed_docs = []
    budget_data = None
    vendor_data = None
    images = []
    
    for file_path in sorted(files):
        if file_path.suffix.lower() in ('.txt', '.md', '.docx', '.pdf', '.xlsx'):
            doc = parse_file(file_path)
            parsed_docs.append(doc)
            
            # Extract budget and vendor info
            if 'budget' in file_path.name.lower() and file_path.suffix == '.xlsx':
                budget_data = parse_budget(file_path)
            if 'vendor' in file_path.name.lower() and file_path.suffix == '.xlsx':
                vendor_data = parse_vendors(file_path)
        
        elif file_path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.heic'):
            images.append({
                'path': str(file_path),
                'name': file_path.name,
                'type': file_path.suffix.lower()
            })
    
    # Aggregate timeline across all documents
    all_events = sorted(
        [e for d in parsed_docs for e in d.get('events', [])],
        key=lambda e: e.get('dateISO', '')
    )
    
    return {
        'event_dir': str(event_dir),
        'parsed_at': datetime.now().isoformat(),
        'num_files': len(files),
        'documents': parsed_docs,
        'budget': budget_data,
        'vendors': vendor_data,
        'timeline': all_events,
        'images': images
    }
```

### 3. Database Models

Create `backend/models/database.py`:

```python
"""Database models for Simply Beeutiful Events."""

from sqlalchemy import (
    create_engine, Column, String, Integer, Float, 
    DateTime, ForeignKey, Text, JSON, Boolean
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from datetime import datetime

Base = declarative_base()

class Event(Base):
    """An event (wedding, party, etc.)"""
    __tablename__ = 'events'
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # e.g., "2026-06-06 Mistretta-Petran Wedding"
    drive_folder_id = Column(String, unique=True)  # Google Drive folder ID
    event_date = Column(DateTime)  # When the event happens
    client_name = Column(String)
    budget_total = Column(Float)
    
    # Sync metadata
    synced_at = Column(DateTime, default=datetime.utcnow)
    last_sync_error = Column(Text)
    
    # Relations
    documents = relationship("Document", back_populates="event", cascade="all, delete-orphan")
    vendors = relationship("Vendor", back_populates="event", cascade="all, delete-orphan")
    budget_items = relationship("BudgetItem", back_populates="event", cascade="all, delete-orphan")
    timeline_items = relationship("TimelineItem", back_populates="event", cascade="all, delete-orphan")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Document(Base):
    """A parsed document (contract, budget, proposal, etc.)"""
    __tablename__ = 'documents'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=False)
    
    name = Column(String, nullable=False)  # Filename
    drive_file_id = Column(String)  # Google Drive file ID
    file_type = Column(String)  # .pdf, .xlsx, .docx, etc.
    category = Column(String)  # "budget", "contract", "quote", "inspiration", "notes"
    
    raw_data = Column(JSON)  # Raw parsed content
    summary = Column(Text)  # AI or extracted summary
    extracted_data = Column(JSON)  # Extracted dates, amounts, keywords
    
    # For tracking
    uploaded_by = Column(String)  # Who uploaded this to Drive
    status = Column(String, default='new')  # new, reviewed, needs_action, archived
    notes = Column(Text)
    
    event = relationship("Event", back_populates="documents")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Vendor(Base):
    """A vendor for an event."""
    __tablename__ = 'vendors'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=False)
    
    name = Column(String, nullable=False)
    service_type = Column(String)  # photographer, caterer, florist, etc.
    location = Column(String)
    contact_name = Column(String)
    email = Column(String)
    phone = Column(String)
    
    # Contract & payment info
    contract_status = Column(String)  # draft, sent, signed, expired
    quoted_cost = Column(Float)
    actual_cost = Column(Float)
    paid_amount = Column(Float, default=0.0)
    payment_status = Column(String)  # not_due, due, partially_paid, paid, overdue
    payment_due_date = Column(DateTime)
    
    notes = Column(Text)
    
    event = relationship("Event", back_populates="vendors")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BudgetItem(Base):
    """A budget category for an event."""
    __tablename__ = 'budget_items'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=False)
    
    category = Column(String, nullable=False)  # Venue, Catering, Photography, etc.
    planned_amount = Column(Float)
    actual_amount = Column(Float)
    paid_amount = Column(Float, default=0.0)
    due_amount = Column(Float, default=0.0)
    
    notes = Column(Text)
    
    event = relationship("Event", back_populates="budget_items")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TimelineItem(Base):
    """A date or milestone for an event."""
    __tablename__ = 'timeline_items'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=False)
    
    date_iso = Column(String)  # YYYY-MM-DD
    date_raw = Column(String)  # Original text (e.g., "6.6.26")
    
    title = Column(String)  # e.g., "Wedding Day"
    description = Column(Text)  # Context or snippet
    category = Column(String)  # deadline, event, payment_due, follow_up
    source_document = Column(String)  # Where this date came from
    
    is_important = Column(Boolean, default=False)  # Flag for alerts
    status = Column(String)  # pending, completed, cancelled
    
    event = relationship("Event", back_populates="timeline_items")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Database initialization
def init_db(database_url: str = 'sqlite:///sbe.db'):
    """Initialize database."""
    engine = create_engine(database_url, echo=False)
    Base.metadata.create_all(engine)
    return engine


def get_session(engine):
    """Get a database session."""
    Session = sessionmaker(bind=engine)
    return Session()
```

### 4. Sync Scheduler (FastAPI)

Create `backend/main.py`:

```python
"""FastAPI backend for Simply Beeutiful Events."""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import logging
import os
from datetime import datetime

from services.google_drive_sync import get_drive_sync
from tools.scan_event import parse_event_from_directory
from models.database import init_db, get_session, Event, Document, Vendor, BudgetItem
from models.database import SessionLocal

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize database
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./sbe.db')
engine = init_db(DATABASE_URL)

app = FastAPI(title="Simply Beeutiful Events API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============ Routes ============

@app.post("/api/events/sync/{event_id}")
def sync_event(event_id: int, db: Session = Depends(get_db)):
    """Manually trigger a sync for an event from Google Drive."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    if not event.drive_folder_id:
        raise HTTPException(status_code=400, detail="Event has no Google Drive folder")
    
    try:
        # Sync files from Google Drive
        drive_sync = get_drive_sync()
        sync_result = drive_sync.sync_event_folder(event.name, event.drive_folder_id)
        
        # Parse downloaded files
        parsed_data = parse_event_from_directory(sync_result['temp_dir'])
        
        # Update database
        event.synced_at = datetime.utcnow()
        
        # Store documents
        for doc_data in parsed_data.get('documents', []):
            doc = Document(
                event_id=event.id,
                name=doc_data['name'],
                file_type=doc_data.get('ext'),
                category=infer_category(doc_data['name']),
                extracted_data=doc_data.get('parsed'),
                summary=doc_data.get('summary')
            )
            db.add(doc)
        
        # Store vendors
        if parsed_data.get('vendors'):
            for vendor_data in parsed_data['vendors'].get('booked', []):
                vendor = Vendor(
                    event_id=event.id,
                    name=vendor_data['vendor'],
                    location=vendor_data.get('location'),
                    email=vendor_data.get('email'),
                    quoted_cost=parse_amount(vendor_data.get('cost', '$0'))
                )
                db.add(vendor)
        
        # Store budget
        if parsed_data.get('budget'):
            budget = parsed_data['budget']
            event.budget_total = budget.get('budget_total')
            
            for cat_data in budget.get('categories', []):
                item = BudgetItem(
                    event_id=event.id,
                    category=cat_data['category'],
                    planned_amount=budget.get('budget_total'),
                    actual_amount=cat_data.get('actual'),
                    paid_amount=cat_data.get('paid'),
                    due_amount=cat_data.get('due')
                )
                db.add(item)
        
        db.commit()
        
        return {
            "status": "success",
            "event_id": event.id,
            "synced_at": event.synced_at.isoformat(),
            "files_processed": len(parsed_data.get('documents', [])),
            "vendors_extracted": len(parsed_data.get('vendors', {}).get('booked', [])),
            "timeline_events": len(parsed_data.get('timeline', []))
        }
    
    except Exception as e:
        logger.error(f"Sync failed for event {event_id}: {str(e)}")
        event.last_sync_error = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@app.get("/api/events/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db)):
    """Get event details with all related data."""
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    return {
        "id": event.id,
        "name": event.name,
        "event_date": event.event_date,
        "client_name": event.client_name,
        "budget_total": event.budget_total,
        "synced_at": event.synced_at,
        "documents": [
            {
                "id": d.id,
                "name": d.name,
                "category": d.category,
                "summary": d.summary,
                "extracted_data": d.extracted_data
            }
            for d in event.documents
        ],
        "vendors": [
            {
                "id": v.id,
                "name": v.name,
                "service_type": v.service_type,
                "contact_email": v.email,
                "quoted_cost": v.quoted_cost,
                "paid_amount": v.paid_amount,
                "payment_status": v.payment_status
            }
            for v in event.vendors
        ],
        "budget": [
            {
                "category": b.category,
                "planned": b.planned_amount,
                "actual": b.actual_amount,
                "paid": b.paid_amount,
                "due": b.due_amount
            }
            for b in event.budget_items
        ]
    }


@app.get("/api/events")
def list_events(db: Session = Depends(get_db)):
    """List all events."""
    events = db.query(Event).order_by(Event.event_date.desc()).all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "event_date": e.event_date,
            "client_name": e.client_name,
            "budget_total": e.budget_total,
            "synced_at": e.synced_at
        }
        for e in events
    ]


# ============ Helper Functions ============

def infer_category(filename: str) -> str:
    """Infer document category from filename."""
    filename_lower = filename.lower()
    if 'budget' in filename_lower:
        return 'budget'
    elif 'contract' in filename_lower or 'agreement' in filename_lower:
        return 'contract'
    elif 'quote' in filename_lower or 'estimate' in filename_lower:
        return 'quote'
    elif any(ext in filename_lower for ext in ['.png', '.jpg', '.jpeg', '.heic']):
        return 'inspiration'
    else:
        return 'notes'


def parse_amount(amount_str: str) -> float:
    """Parse amount string to float."""
    import re
    match = re.search(r'[\d,]+(?:\.\d{2})?', amount_str.replace('$', '').strip())
    if match:
        return float(match.group().replace(',', ''))
    return 0.0


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
```

### 5. Environment Configuration

Create `.env.example`:

```
# Google Drive & OAuth
GOOGLE_CREDENTIALS_PATH=credentials.json
GOOGLE_DRIVE_FOLDER_ID=<your-main-sbe-folder-id>

# Database
DATABASE_URL=postgresql://user:password@localhost/sbe_events
# Or SQLite: DATABASE_URL=sqlite:///./sbe.db

# Backend
API_HOST=0.0.0.0
API_PORT=8000

# Frontend
REACT_APP_API_URL=http://localhost:8000
```

---

## Frontend Integration

### Updated Doc Reader

Modify `docs/app.js` to fetch from the backend:

```javascript
// Get event from backend API instead of loading report
async function loadEventFromBackend(eventId) {
  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    
    // Map backend data to frontend format
    docs = data.documents.map(d => ({
      name: d.name,
      text: d.summary,
      parsed: d.extracted_data || {}
    }));
    
    budgetData = {
      budget_total: data.budget_total,
      categories: data.budget.map(b => ({
        category: b.category,
        actual: b.actual,
        paid: b.paid,
        due: b.due
      }))
    };
    
    vendorData = {
      booked: data.vendors.map(v => ({
        vendor: v.name,
        event: v.service_type,
        location: v.location || '',
        contact: v.contact_name || '',
        email: v.contact_email || '',
        cost: `$${v.quoted_cost}`
      }))
    };
    
    renderAll();
  } catch (e) {
    console.error('Failed to load event:', e);
    setStatus(`Error loading event: ${e.message}`);
  }
}

// Trigger sync button
document.getElementById('syncFromDrive')?.addEventListener('click', async () => {
  const eventId = getSelectedEventId();
  setStatus('Syncing from Google Drive...');
  
  try {
    const response = await fetch(`${API_URL}/api/events/${eventId}/sync`, {
      method: 'POST'
    });
    const result = await response.json();
    
    if (response.ok) {
      setStatus(`Synced! ${result.files_processed} files, ${result.vendors_extracted} vendors`);
      loadEventFromBackend(eventId);
    } else {
      setStatus(`Sync failed: ${result.detail}`);
    }
  } catch (e) {
    setStatus(`Sync error: ${e.message}`);
  }
});
```

---

## Workflow

### For Planners

1. **Create event folder** in Google Drive: `Simply Beeutiful Events/Events/2026-MM-DD Event Name/`
2. **Upload documents**: Place contracts, budgets, vendor lists in organized subfolders
3. **Open app**, create event record, link Google Drive folder ID
4. **Click "Sync from Drive"** to download and parse files
5. View budget status, timelines, vendor info on dashboard
6. App automatically syncs periodically (e.g., hourly)

### For Clients

1. **Share event folder** with client (read-only or edit access)
2. Client can upload inspiration photos, view approved timelines
3. Client can see payment status and vendor info via a **client portal** (future)

### For Vendors

1. **Share specific contract/quote** with vendor
2. Vendor updates document in Drive
3. **App auto-syncs** and updates payment status, dates, etc.
4. Optional: vendor dashboard shows what's due, payment status

---

## Security Considerations

### Credentials Management

- Never commit `credentials.json` to Git (add to `.gitignore`)
- Store credentials in environment variables or a secrets manager
- For production, use Google Cloud Secrets Manager or AWS Secrets Manager

### Access Control

- Service account can only read from shared folders
- Different folders for different clients/events
- Implement role-based access in the app (admin, planner, client, vendor)

### Data Privacy

- Clients see only their own event data
- Vendors see only their contracts and payment status
- Audit log all file access and sync operations

---

## Deployment

### Production Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export GOOGLE_CREDENTIALS_PATH=/etc/sbe/credentials.json
export DATABASE_URL=postgresql://user:password@sbe-db.example.com/events

# Run migrations (if using Alembic)
alembic upgrade head

# Start backend
gunicorn backend.main:app --workers 4

# Serve frontend (separate)
npm run build
serve -s build
```

### Docker (Optional)

Create `Dockerfile` and `docker-compose.yml` for containerized deployment.

---

## Next Steps

1. Set up Google Cloud project and service account (Step 1-3 in Setup section)
2. Implement `GoogleDriveSync` service
3. Create database models
4. Build FastAPI backend with sync routes
5. Update frontend to call backend API
6. Test with your existing Mistretta-Petran wedding data
7. Add tests for sync, parsing, and API routes
8. Deploy to production (Heroku, AWS, DigitalOcean, etc.)

---

## Monitoring & Logging

Add structured logging to track syncs:

```python
import logging
from pythonjsonlogger import jsonlogger

# Log to file in JSON format for easy parsing
logHandler = logging.FileHandler('sbe_sync.log')
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)

logger = logging.getLogger()
logger.addHandler(logHandler)
```

Monitor:
- Sync duration and file count
- Parse errors and retry attempts
- API response times
- Database query performance
- Failed document extractions

---

## FAQ

**Q: What if a file is corrupted or can't be parsed?**  
A: The sync logs the error and continues with other files. The document is marked with status "parse_error" in the database.

**Q: How often should we sync?**  
A: Start with manual syncs, then add a scheduled job (e.g., every 1-6 hours depending on update frequency).

**Q: Can multiple users sync the same event?**  
A: Yes, with proper conflict handling. The latest modification time wins, or you can implement a manual merge workflow.

**Q: What about offline access?**  
A: The current design requires Google Drive connectivity. For offline, cache the latest sync locally or pre-download to the frontend.

**Q: Can we use personal Google Drive instead of a business account?**  
A: Yes, but a Google Workspace business account is recommended for scalability and better support.
