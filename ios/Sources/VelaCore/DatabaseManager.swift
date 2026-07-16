// VelaCore/DatabaseManager.swift
// SQLite database life-cycle — mirrors electron/database.ts

import Foundation
import GRDB

/// Manages per-project SQLite database (WAL mode, foreign_keys ON)
public final class DatabaseManager: @unchecked Sendable {
    private var dbQueue: DatabaseQueue?

    public init() {}

    /// Open a project database at projectPath/.vela/vela.db
    public func open(projectPath: String) throws {
        close()

        let velDir = URL(fileURLWithPath: projectPath).appendingPathComponent(".vela")
        try FileManager.default.createDirectory(at: velDir, withIntermediateDirectories: true)
        let dbURL = velDir.appendingPathComponent("vela.db")

        var config = Configuration()
        config.prepareDatabase { db in
            // Mirror: journal_mode = WAL
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            // Mirror: foreign_keys = ON
            try db.execute(sql: "PRAGMA foreign_keys = ON")
        }

        let queue = try DatabaseQueue(path: dbURL.path, configuration: config)
        dbQueue = queue

        // Run migration
        try Migrator.migrate(queue)
    }

    /// Close current database
    public func close() {
        dbQueue = nil
    }

    /// Access the queue for read/write
    public func read<T>(_ block: @escaping (Database) throws -> T) throws -> T {
        guard let queue = dbQueue else {
            throw DatabaseError.notOpen
        }
        return try queue.read(block)
    }

    public func write<T>(_ block: @escaping (Database) throws -> T) throws -> T {
        guard let queue = dbQueue else {
            throw DatabaseError.notOpen
        }
        return try queue.write(block)
    }

    public var isOpen: Bool { dbQueue != nil }
}

public enum DatabaseError: LocalizedError {
    case notOpen

    public var errorDescription: String? {
        switch self {
        case .notOpen: return "Database not opened"
        }
    }
}

// MARK: - Schema migration

private enum Migrator {
    static func migrate(_ dbQueue: DatabaseQueue) throws {
        var migrator = DatabaseMigrator()

        // v1: Initial schema — mirrors electron/database.ts
        migrator.registerMigration("v1") { db in
            try db.execute(sql: """
                -- 1. project_core — 项目主台账
                CREATE TABLE IF NOT EXISTS project_core (
                    id TEXT PRIMARY KEY DEFAULT 'main',
                    project_name TEXT NOT NULL DEFAULT '',
                    genre TEXT DEFAULT '',
                    sub_genre TEXT DEFAULT '',
                    target_audience TEXT DEFAULT '',
                    total_chapters INTEGER DEFAULT 100,
                    words_per_chapter INTEGER DEFAULT 3000,
                    plot_structure TEXT DEFAULT 'three_act',
                    narrative_pov TEXT DEFAULT 'third_limited',
                    writing_style TEXT DEFAULT '',
                    reference_works TEXT DEFAULT '',
                    global_guidance TEXT DEFAULT '',
                    golden_finger TEXT DEFAULT '',
                    premise TEXT DEFAULT '',
                    worldbuilding TEXT DEFAULT '',
                    characters_arch TEXT DEFAULT '',
                    synopsis TEXT DEFAULT '',
                    character_states TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                -- 2. blueprints — 章节蓝图
                CREATE TABLE IF NOT EXISTS blueprints (
                    chapter_number INTEGER PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT '',
                    role TEXT DEFAULT '',
                    purpose TEXT DEFAULT '',
                    key_events TEXT DEFAULT '',
                    characters TEXT DEFAULT '[]',
                    suspense_hook TEXT DEFAULT '',
                    user_guidance TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    notes_updated_at TEXT DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                -- 3. characters — 角色卡
                CREATE TABLE IF NOT EXISTS characters (
                    name TEXT PRIMARY KEY,
                    role TEXT DEFAULT 'supporting',
                    gender TEXT DEFAULT '',
                    age TEXT DEFAULT '',
                    appearance TEXT DEFAULT '',
                    personality TEXT DEFAULT '',
                    background TEXT DEFAULT '',
                    abilities TEXT DEFAULT '',
                    motivation TEXT DEFAULT '',
                    relationships TEXT DEFAULT '',
                    arc TEXT DEFAULT '',
                    notes TEXT DEFAULT '',
                    cs_location TEXT DEFAULT '',
                    cs_power_level TEXT DEFAULT '',
                    cs_physical_state TEXT DEFAULT '',
                    cs_mental_state TEXT DEFAULT '',
                    cs_key_items TEXT DEFAULT '',
                    cs_recent_events TEXT DEFAULT '',
                    cs_updated_at_chapter INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );

                -- 4. contents — 文本内容池
                CREATE TABLE IF NOT EXISTS contents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    body TEXT NOT NULL DEFAULT '',
                    created_at TEXT DEFAULT (datetime('now'))
                );

                -- 5. drafts — 草稿主线
                CREATE TABLE IF NOT EXISTS drafts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chapter_number INTEGER NOT NULL,
                    version INTEGER NOT NULL,
                    status TEXT DEFAULT 'draft',
                    source TEXT DEFAULT 'write',
                    content_id INTEGER NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE RESTRICT
                );
                CREATE INDEX IF NOT EXISTS idx_drafts_chapter ON drafts(chapter_number);

                -- 6. revisions — 修稿
                CREATE TABLE IF NOT EXISTS revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    base_draft_id INTEGER NOT NULL,
                    revision_index INTEGER NOT NULL,
                    revision_type TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    merged_to_draft_id INTEGER,
                    user_prompt TEXT DEFAULT '',
                    review_source_id INTEGER,
                    content_id INTEGER NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (base_draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
                    FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE RESTRICT
                );

                -- 7. reviews — 审稿
                CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    base_draft_id INTEGER NOT NULL,
                    review_index INTEGER NOT NULL,
                    content_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT (datetime('now')),
                    FOREIGN KEY (base_draft_id) REFERENCES drafts(id) ON DELETE CASCADE,
                    FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE RESTRICT
                );

                -- 8. post_process_runs
                CREATE TABLE IF NOT EXISTS post_process_runs (
                    id TEXT PRIMARY KEY,
                    trigger_source_type TEXT NOT NULL,
                    trigger_source_id TEXT NOT NULL,
                    source_label TEXT DEFAULT '',
                    all_critical_passed INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_post_runs_source
                    ON post_process_runs(trigger_source_type, trigger_source_id);

                -- 9. post_process_steps
                CREATE TABLE IF NOT EXISTS post_process_steps (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    step_key TEXT NOT NULL,
                    label TEXT DEFAULT '',
                    critical INTEGER DEFAULT 0,
                    ok INTEGER DEFAULT 0,
                    error_msg TEXT DEFAULT '',
                    attempt_count INTEGER DEFAULT 0,
                    completed_at TEXT DEFAULT '',
                    last_attempt_at TEXT DEFAULT '',
                    FOREIGN KEY (run_id) REFERENCES post_process_runs(id) ON DELETE CASCADE
                );

                -- 沿用：LLM 调用记录
                CREATE TABLE IF NOT EXISTS llm_calls (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    model TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    cost REAL DEFAULT 0,
                    duration_ms INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                );
                """)
        }

        try migrator.migrate(dbQueue)
    }
}