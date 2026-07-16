// VelaApp/VelaApp.swift
// App entry point — @main executable

import SwiftUI
import VelaCore
import VelaUI

@main
struct VelaApp: App {
    @State private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appModel)
                .onAppear {
                    // Load last opened project if exists
                    if let lastPath = UserDefaults.standard.string(forKey: "lastProjectPath"),
                       FileManager.default.fileExists(atPath: lastPath) {
                        Task {
                            do {
                                try await appModel.openProject(path: lastPath)
                            } catch {
                                print("Failed to auto-open last project: \(error)")
                            }
                        }
                    }
                }
        }
    }
}

@Observable
public final class AppModel: Sendable {
    public var database = DatabaseManager()
    public var projectCore: ProjectCoreRepository?
    public var blueprintRepo: BlueprintRepository?
    public var characterRepo: CharacterRepository?
    public var draftRepo: DraftRepository?
    public var contentRepo: ContentRepository?

    public var projectPath: String?
    public var isProjectOpen: Bool = false
    public var projectName: String = ""
    public var chapters: [Blueprint] = []
    public var selectedChapter: Blueprint?
    public var selectedDraftContent: String = ""
    public var errorMessage: String?

    public var llmConfig: LLMConfig? {
        guard let baseURL = UserDefaults.standard.string(forKey: "llm_base_url"),
              let apiKey = UserDefaults.standard.string(forKey: "llm_api_key"),
              let model = UserDefaults.standard.string(forKey: "llm_model") ?? "deepseek-chat" as String? else {
            return nil
        }
        return LLMConfig(baseURL: baseURL, apiKey: apiKey, modelName: model)
    }

    public init() {}

    /// Open a project at the given path
    public func openProject(path: String) async throws {
        try database.open(projectPath: path)

        projectCore = ProjectCoreRepository(db: database)
        blueprintRepo = BlueprintRepository(db: database)
        characterRepo = CharacterRepository(db: database)
        draftRepo = DraftRepository(db: database)
        contentRepo = ContentRepository(db: database)

        projectPath = path
        isProjectOpen = true

        if let core = try projectCore?.get() {
            projectName = core.projectName
        }

        chapters = try blueprintRepo?.getAll() ?? []
        UserDefaults.standard.set(path, forKey: "lastProjectPath")
    }

    /// Select a chapter and load its latest draft
    public func selectChapter(_ chapter: Blueprint) async {
        selectedChapter = chapter
        do {
            if let draft = try draftRepo?.getLatestByChapter(chapter.chapterNumber) {
                let body = try contentRepo?.getBody(draft.contentId) ?? ""
                selectedDraftContent = body
            } else {
                selectedDraftContent = ""
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Save draft content and update DB
    public func saveDraft(content: String) async throws {
        guard let chapter = selectedChapter else { return }
        let wordCount = content.count

        if let latest = try draftRepo?.getLatestByChapter(chapter.chapterNumber) {
            try draftRepo?.updateContent(latest.id!, content: content, wordCount: wordCount)
            selectedDraftContent = content
        } else {
            // Create first draft for this chapter
            let version = try draftRepo?.getNextVersion(chapter.chapterNumber) ?? 1
            let id = try draftRepo?.create(
                chapterNumber: chapter.chapterNumber,
                version: version,
                source: "write",
                content: content,
                wordCount: wordCount
            )
            _ = id
            selectedDraftContent = content
        }
    }

    /// AI write: generate draft for current chapter
    public func aiWrite(prompt: String) async throws -> String {
        guard let config = llmConfig else {
            throw LLMError.auth("LLM 未配置")
        }
        let provider = LLMProvider(config: config)

        // Get novel config for system prompt context
        let core = try projectCore?.get()
        let systemPrompt = """
        你是一位专业的小说作家。请根据以下配置和用户指令创作小说章节正文。
        - 流派：\(core?.genre ?? "未设定")
        - 文风：\(core?.writingStyle ?? "未设定")
        - 单章字数：\(core?.wordsPerChapter ?? 3000) 字左右
        - 全局指导：\(core?.globalGuidance ?? "")
        直接输出正文，不要客套话。
        """

        let messages = [
            ChatMessage(role: "system", content: systemPrompt),
            ChatMessage(role: "user", content: prompt),
        ]

        let result = try await provider.completeWithRetry(
            messages: messages,
            minLength: 200,
            maxRetries: 3,
            thinking: true
        )

        return result.content
    }
}