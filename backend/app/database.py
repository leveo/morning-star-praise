from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.secrets import get_secret

DATABASE_URL = get_secret("DATABASE_URL")


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_tables():
    """Create PPT Maker tables if they don't exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ppt_songs (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                lyrics TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                source TEXT,
                source_url TEXT,
                created_by INTEGER REFERENCES auth_user(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ppt_templates (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                config JSONB NOT NULL DEFAULT '{}',
                is_default BOOLEAN DEFAULT FALSE,
                created_by INTEGER REFERENCES auth_user(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ppt_backgrounds (
                id SERIAL PRIMARY KEY,
                filename TEXT NOT NULL,
                original_name TEXT,
                category TEXT DEFAULT 'general',
                is_default BOOLEAN DEFAULT FALSE,
                uploaded_by INTEGER REFERENCES auth_user(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ppt_generation_history (
                id SERIAL PRIMARY KEY,
                song_id INTEGER REFERENCES ppt_songs(id) ON DELETE SET NULL,
                template_id INTEGER REFERENCES ppt_templates(id) ON DELETE SET NULL,
                output_filename TEXT,
                created_by INTEGER REFERENCES auth_user(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ppt_video_jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'pending',
                stage TEXT NOT NULL DEFAULT 'queued',
                progress INTEGER NOT NULL DEFAULT 0,
                title TEXT,
                language TEXT DEFAULT 'en',
                video_filename TEXT,
                srt_filename TEXT,
                error TEXT,
                created_by INTEGER REFERENCES auth_user(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Insert default template if none exists
        result = conn.execute("SELECT COUNT(*) as cnt FROM ppt_templates WHERE is_default = TRUE").fetchone()
        if result["cnt"] == 0:
            conn.execute("""
                INSERT INTO ppt_templates (name, config, is_default)
                VALUES ('Default Worship', '{"font_size_en": 36, "font_size_zh": 40, "max_lines": 6, "overlay_opacity": 40}', TRUE)
            """)
