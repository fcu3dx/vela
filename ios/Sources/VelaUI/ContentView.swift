// VelaUI/ContentView.swift
// Main navigation — iPad 三栏布局 (NavigationSplitView)

import SwiftUI
import VelaCore

public struct ContentView: View {
    @Environment(AppModel.self) private var model

    public init() {}

    public var body: some View {
        if model.isProjectOpen {
            ProjectWorkspace()
        } else {
            WelcomeView()
        }
    }
}

// MARK: - Welcome screen (no project open)

struct WelcomeView: View {
    @Environment(AppModel.self) private var model
    @State private var projectPath: String = ""
    @State private var projectName: String = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Spacer().frame(height: 60)

                    Image(systemName: "book.and.pencil")
                        .font(.system(size: 64))
                        .foregroundStyle(.tint)

                    Text("Vela")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("AI 小说创作 IDE")
                        .font(.title3)
                        .foregroundStyle(.secondary)

                    Spacer().frame(height: 40)

                    // Open existing project
                    VStack(alignment: .leading, spacing: 12) {
                        Label("打开已有项目", systemImage: "folder.badge.plus")
                            .font(.headline)

                        TextField("项目文件夹路径 (e.g. /path/to/MyNovel)", text: $projectPath)
                            .textFieldStyle(.roundedBorder)
                            .font(.body)

                        Button("打开项目") {
                            Task {
                                do {
                                    try await model.openProject(path: projectPath)
                                } catch {
                                    model.errorMessage = error.localizedDescription
                                }
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(projectPath.isEmpty)
                    }
                    .padding(24)
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .frame(maxWidth: 500)

                    // Create new project
                    VStack(alignment: .leading, spacing: 12) {
                        Label("创建新项目", systemImage: "doc.badge.plus")
                            .font(.headline)

                        TextField("项目名称", text: $projectName)
                            .textFieldStyle(.roundedBorder)

                        Button("创建项目") {
                            // TODO: create new project
                        }
                        .buttonStyle(.bordered)
                        .disabled(projectName.isEmpty)
                    }
                    .padding(24)
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .frame(maxWidth: 500)

                    Spacer()
                }
                .frame(maxWidth: .infinity)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Vela")
        }
    }
}

// MARK: - Project workspace (iPad split view)

struct ProjectWorkspace: View {
    @Environment(AppModel.self) private var model
    @State private var columnVisibility = NavigationSplitViewVisibility.all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar: chapter list
            ChapterList()
                .navigationTitle(model.projectName)
        } content: {
            // Content: editor area
            if let chapter = model.selectedChapter {
                ChapterEditorView(chapter: chapter)
            } else {
                ContentPlaceholder()
            }
        } detail: {
            // Detail: AI panel / tool output
            AIPanelView()
        }
    }
}

// MARK: - Chapter list sidebar

struct ChapterList: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List(model.chapters, selection: Binding(
            get: { model.selectedChapter?.chapterNumber },
            set: { newValue in
                if let num = newValue, let chapter = model.chapters.first(where: { $0.chapterNumber == num }) {
                    Task { await model.selectChapter(chapter) }
                }
            }
        )) { chapter in
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("第 \(chapter.chapterNumber) 章")
                        .font(.headline)
                    if !chapter.title.isEmpty {
                        Text(chapter.title)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            } icon: {
                Image(systemName: "doc.text")
            }
        }
        .listStyle(.sidebar)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: { /* TODO: new chapter */ }) {
                    Image(systemName: "plus")
                }
            }
        }
    }
}

struct ContentPlaceholder: View {
    var body: some View {
        VStack {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundStyle(.tertiary)
            Text("选择章节开始编辑")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Chapter editor (Phase 1: simple text editor + AI write)

struct ChapterEditorView: View {
    let chapter: Blueprint
    @Environment(AppModel.self) private var model
    @State private var bodyText: String = ""
    @State private var isAIGenerating: Bool = false
    @State private var aiPrompt: String = ""

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading) {
                    Text("第 \(chapter.chapterNumber) 章").font(.headline)
                    if !chapter.title.isEmpty {
                        Text(chapter.title).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    Text("\(bodyText.count) 字")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()

                    Button("保存") {
                        Task {
                            do {
                                try await model.saveDraft(content: bodyText)
                            } catch {
                                model.errorMessage = error.localizedDescription
                            }
                        }
                    }
                    .buttonStyle(.bordered)

                    Button("定稿") {
                        // TODO: finalize
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(true)  // Phase 2
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            Divider()

            // Text editor
            TextEditor(text: $bodyText)
                .font(.body)
                .scrollContentBackground(.hidden)
                .background(Color(.systemBackground))
                .task {
                    bodyText = model.selectedDraftContent
                }
                .onChange(of: model.selectedDraftContent) { _, newValue in
                    bodyText = newValue
                }

            Divider()

            // AI write bar
            HStack(spacing: 8) {
                TextField("AI 写稿指令 (e.g. 续写后续情节)", text: $aiPrompt)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isAIGenerating)

                Button(action: {
                    isAIGenerating = true
                    Task {
                        do {
                            let result = try await model.aiWrite(prompt: aiPrompt)
                            bodyText += (bodyText.isEmpty ? "" : "\n\n") + result
                            try await model.saveDraft(content: bodyText)
                        } catch {
                            model.errorMessage = error.localizedDescription
                        }
                        isAIGenerating = false
                        aiPrompt = ""
                    }
                }) {
                    if isAIGenerating {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("AI 写稿", systemImage: "wand.and.stars")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(aiPrompt.isEmpty || isAIGenerating)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .toolbar {
            if let msg = model.errorMessage {
                ToolbarItem(placement: .status) {
                    Label(msg, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }
        }
    }
}

// MARK: - AI panel (detail column)

struct AIPanelView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack {
            if model.llmConfig != nil {
                VStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 36))
                        .foregroundStyle(.tint)
                    Text("AI 助手")
                        .font(.headline)
                    Text("在编辑区下方使用 AI 写稿功能")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 36))
                        .foregroundStyle(.orange)
                    Text("LLM 未配置")
                        .font(.headline)
                    Text("请在系统中设置 base_url/api_key/model")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}