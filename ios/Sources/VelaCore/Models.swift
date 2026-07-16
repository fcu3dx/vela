// VelaCore/Models.swift
// Database record types — mirrors TypeScript interface files

import Foundation
import GRDB

// MARK: - ProjectCore

public struct ProjectCore: Codable, FetchableRecord, PersistableRecord {
    public var id: String = "main"
    public var projectName: String = ""
    public var genre: String = ""
    public var subGenre: String = ""
    public var targetAudience: String = ""
    public var totalChapters: Int = 100
    public var wordsPerChapter: Int = 3000
    public var plotStructure: String = "three_act"
    public var narrativePov: String = "third_limited"
    public var writingStyle: String = ""
    public var referenceWorks: String = ""
    public var globalGuidance: String = ""
    public var goldenFinger: String = ""
    public var premise: String = ""
    public var worldbuilding: String = ""
    public var charactersArch: String = ""
    public var synopsis: String = ""
    public var characterStates: String = ""
    public var createdAt: String = ""
    public var updatedAt: String = ""

    /// Column mapping for snake_case DB → camelCase Swift
    enum Columns: String, ColumnExpression {
        case id, projectName = "project_name"
        case genre, subGenre = "sub_genre"
        case targetAudience = "target_audience"
        case totalChapters = "total_chapters"
        case wordsPerChapter = "words_per_chapter"
        case plotStructure = "plot_structure"
        case narrativePov = "narrative_pov"
        case writingStyle = "writing_style"
        case referenceWorks = "reference_works"
        case globalGuidance = "global_guidance"
        case goldenFinger = "golden_finger"
        case premise, worldbuilding
        case charactersArch = "characters_arch"
        case synopsis
        case characterStates = "character_states"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Blueprint

public struct Blueprint: Codable, FetchableRecord, PersistableRecord {
    public var chapterNumber: Int
    public var title: String = ""
    public var role: String = ""
    public var purpose: String = ""
    public var keyEvents: String = ""
    public var characters: String = "[]"  // JSON array stored as string
    public var suspenseHook: String = ""
    public var userGuidance: String = ""
    public var notes: String = ""
    public var notesUpdatedAt: String = ""
    public var createdAt: String = ""
    public var updatedAt: String = ""

    enum Columns: String, ColumnExpression {
        case chapterNumber = "chapter_number"
        case title, role, purpose
        case keyEvents = "key_events"
        case characters
        case suspenseHook = "suspense_hook"
        case userGuidance = "user_guidance"
        case notes
        case notesUpdatedAt = "notes_updated_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Character

public struct Character: Codable, FetchableRecord, PersistableRecord {
    public var name: String
    public var role: String = "supporting"
    public var gender: String = ""
    public var age: String = ""
    public var appearance: String = ""
    public var personality: String = ""
    public var background: String = ""
    public var abilities: String = ""
    public var motivation: String = ""
    public var relationships: String = ""
    public var arc: String = ""
    public var notes: String = ""
    public var csLocation: String = ""
    public var csPowerLevel: String = ""
    public var csPhysicalState: String = ""
    public var csMentalState: String = ""
    public var csKeyItems: String = ""
    public var csRecentEvents: String = ""
    public var csUpdatedAtChapter: Int = 0
    public var createdAt: String = ""
    public var updatedAt: String = ""

    enum Columns: String, ColumnExpression {
        case name, role, gender, age, appearance, personality, background, abilities, motivation
        case relationships, arc, notes
        case csLocation = "cs_location"
        case csPowerLevel = "cs_power_level"
        case csPhysicalState = "cs_physical_state"
        case csMentalState = "cs_mental_state"
        case csKeyItems = "cs_key_items"
        case csRecentEvents = "cs_recent_events"
        case csUpdatedAtChapter = "cs_updated_at_chapter"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Content

public struct Content: Codable, FetchableRecord, PersistableRecord {
    public var id: Int64?
    public var body: String = ""
    public var createdAt: String = ""

    enum Columns: String, ColumnExpression {
        case id, body
        case createdAt = "created_at"
    }

    // auto-increment id
    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - Draft

public struct Draft: Codable, FetchableRecord, PersistableRecord {
    public var id: Int64?
    public var chapterNumber: Int
    public var version: Int
    public var status: String = "draft"   // draft|revised|reviewed|finalized|archived
    public var source: String = "write"    // write|rewrite
    public var contentId: Int64
    public var wordCount: Int = 0
    public var createdAt: String = ""
    public var updatedAt: String = ""

    enum Columns: String, ColumnExpression {
        case id
        case chapterNumber = "chapter_number"
        case version, status, source
        case contentId = "content_id"
        case wordCount = "word_count"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - DraftStatus enum

public enum DraftStatus: String, CaseIterable {
    case draft
    case revised
    case reviewed
    case finalized
    case archived
}

// MARK: - LLMCallRecord

public struct LLMCallRecord: Codable, FetchableRecord, PersistableRecord {
    public var id: Int64?
    public var model: String
    public var provider: String
    public var promptTokens: Int = 0
    public var completionTokens: Int = 0
    public var cost: Double = 0
    public var durationMs: Int = 0
    public var createdAt: String = ""

    enum Columns: String, ColumnExpression {
        case id, model, provider
        case promptTokens = "prompt_tokens"
        case completionTokens = "completion_tokens"
        case cost
        case durationMs = "duration_ms"
        case createdAt = "created_at"
    }

    public mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}