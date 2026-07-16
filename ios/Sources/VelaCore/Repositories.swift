// VelaCore/Repositories.swift
// Repository classes — mirrors electron/repositories/*.ts
// All methods throw GRDB errors; callers handle with do/catch

import Foundation
import GRDB

// MARK: - ProjectCoreRepository

public struct ProjectCoreRepository {
    private let db: DatabaseManager

    public init(db: DatabaseManager) { self.db = db }

    public func get() throws -> ProjectCore? {
        try db.read { db in
            try ProjectCore.fetchOne(db, key: "main")
        }
    }

    public func update(_ data: ProjectCore) throws {
        try db.write { db in
            // upsert: insert or replace
            var core = data
            core.id = "main"
            try core.save(db)
        }
    }
}

// MARK: - BlueprintRepository

public struct BlueprintRepository {
    private let db: DatabaseManager

    public init(db: DatabaseManager) { self.db = db }

    public func getAll() throws -> [Blueprint] {
        try db.read { db in
            try Blueprint
                .order(Blueprint.Columns.chapterNumber)
                .fetchAll(db)
        }
    }

    public func getByChapter(_ chapterNumber: Int) throws -> Blueprint? {
        try db.read { db in
            try Blueprint.fetchOne(db, key: chapterNumber)
        }
    }

    public func upsert(_ bp: Blueprint) throws {
        try db.write { db in
            try bp.save(db)
        }
    }

    public func upsertMany(_ items: [Blueprint]) throws {
        try db.write { db in
            for bp in items { try bp.save(db) }
        }
    }

    public func updateNotes(_ chapterNumber: Int, notes: String) throws {
        try db.write { db in
            try db.execute(
                sql: """
                    UPDATE blueprints
                    SET notes = ?, notes_updated_at = datetime('now'), updated_at = datetime('now')
                    WHERE chapter_number = ?
                    """,
                arguments: [notes, chapterNumber]
            )
        }
    }

    public func delete(_ chapterNumber: Int) throws {
        try db.write { db in
            try db.execute(sql: "DELETE FROM blueprints WHERE chapter_number = ?", arguments: [chapterNumber])
        }
    }
}

// MARK: - CharacterRepository

public struct CharacterRepository {
    private let db: DatabaseManager

    public init(db: DatabaseManager) { self.db = db }

    public func getAll() throws -> [Character] {
        try db.read { db in
            try Character.fetchAll(db)
        }
    }

    public func upsert(_ char: Character) throws {
        try db.write { db in
            try char.save(db)
        }
    }

    public func delete(_ name: String) throws {
        try db.write { db in
            try db.execute(sql: "DELETE FROM characters WHERE name = ?", arguments: [name])
        }
    }
}

// MARK: - ContentRepository

public struct ContentRepository {
    private let db: DatabaseManager

    public init(db: DatabaseManager) { self.db = db }

    public func create(body: String) throws -> Int64 {
        try db.write { db in
            var content = Content(body: body)
            try content.insert(db)
            return content.id!
        }
    }

    public func getBody(_ contentId: Int64) throws -> String? {
        try db.read { db in
            try Content.fetchOne(db, key: contentId)?.body
        }
    }

    public func updateBody(_ contentId: Int64, body: String) throws {
        try db.write { db in
            try db.execute(sql: "UPDATE contents SET body = ? WHERE id = ?", arguments: [body, contentId])
        }
    }

    public func delete(_ contentId: Int64) throws {
        try db.write { db in
            try db.execute(sql: "DELETE FROM contents WHERE id = ?", arguments: [contentId])
        }
    }
}

// MARK: - DraftRepository

public struct DraftRepository {
    private let db: DatabaseManager
    private let contentRepo: ContentRepository

    public init(db: DatabaseManager) {
        self.db = db
        self.contentRepo = ContentRepository(db: db)
    }

    /// Create a new draft (writes content first, then draft record)
    public func create(chapterNumber: Int, version: Int, source: String, content: String, wordCount: Int) throws -> Int64 {
        try db.write { db in
            let contentId = try contentRepo.create(body: content)
            var draft = Draft(
                chapterNumber: chapterNumber,
                version: version,
                source: source,
                contentId: contentId,
                wordCount: wordCount
            )
            try draft.insert(db)
            return draft.id!
        }
    }

    public func listByChapter(_ chapterNumber: Int) throws -> [Draft] {
        try db.read { db in
            try Draft
                .filter(Draft.Columns.chapterNumber == chapterNumber)
                .order(Draft.Columns.version)
                .fetchAll(db)
        }
    }

    public func getMeta(_ id: Int64) throws -> Draft? {
        try db.read { db in
            try Draft.fetchOne(db, key: id)
        }
    }

    /// Get draft + body content
    public func getFull(_ id: Int64) throws -> (draft: Draft, body: String)? {
        guard let draft = try getMeta(id) else { return nil }
        let body = try contentRepo.getBody(draft.contentId) ?? ""
        return (draft, body)
    }

    public func getLatestByChapter(_ chapterNumber: Int) throws -> Draft? {
        try db.read { db in
            try Draft
                .filter(Draft.Columns.chapterNumber == chapterNumber)
                .order(Draft.Columns.version.desc)
                .limit(1)
                .fetchOne(db)
        }
    }

    public func getFinalizedByChapter(_ chapterNumber: Int) throws -> Draft? {
        try db.read { db in
            try Draft
                .filter(Draft.Columns.chapterNumber == chapterNumber && Draft.Columns.status == DraftStatus.finalized.rawValue)
                .order(Draft.Columns.version.desc)
                .limit(1)
                .fetchOne(db)
        }
    }

    public func getMaxFinalizedChapter() throws -> Int {
        try db.read { db in
            try Int.fetchOne(db, sql: "SELECT MAX(chapter_number) FROM drafts WHERE status = 'finalized'") ?? 0
        }
    }

    public func getNextVersion(_ chapterNumber: Int) throws -> Int {
        try db.read { db in
            (try Int.fetchOne(db, sql: "SELECT MAX(version) FROM drafts WHERE chapter_number = ?", arguments: [chapterNumber]) ?? 0) + 1
        }
    }

    public func updateStatus(_ id: Int64, status: DraftStatus, wordCount: Int? = nil) throws {
        try db.write { db in
            if let wc = wordCount {
                try db.execute(
                    sql: "UPDATE drafts SET status = ?, word_count = ?, updated_at = datetime('now') WHERE id = ?",
                    arguments: [status.rawValue, wc, id]
                )
            } else {
                try db.execute(
                    sql: "UPDATE drafts SET status = ?, updated_at = datetime('now') WHERE id = ?",
                    arguments: [status.rawValue, id]
                )
            }
        }
    }

    public func updateContent(_ id: Int64, content: String, wordCount: Int) throws {
        guard let draft = try getMeta(id) else { return }
        try contentRepo.updateBody(draft.contentId, body: content)
        try db.write { db in
            try db.execute(
                sql: "UPDATE drafts SET word_count = ?, updated_at = datetime('now') WHERE id = ?",
                arguments: [wordCount, id]
            )
        }
    }

    /// Revoke finalize: status → draft + cleanup notes/files (caller handles file deletion)
    public func revokeFinalize(_ chapterNumber: Int) throws {
        guard let finalized = try getFinalizedByChapter(chapterNumber) else {
            throw RepositoryError.notFound("No finalized draft for chapter \(chapterNumber)")
        }
        try updateStatus(finalized.id!, status: .draft)
    }
}

public enum RepositoryError: LocalizedError {
    case notFound(String)

    public var errorDescription: String? {
        switch self {
        case .notFound(let msg): return msg
        }
    }
}