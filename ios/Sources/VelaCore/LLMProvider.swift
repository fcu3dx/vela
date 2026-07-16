// VelaCore/LLMProvider.swift
// OpenAI-compatible API client with streaming support
// Mirrors electron/llm/openai-provider.ts logic

import Foundation
import AsyncAlgorithms

// MARK: - Provider configuration

public struct LLMConfig: Sendable {
    public let baseURL: String
    public let apiKey: String
    public let modelName: String
    public let timeout: TimeInterval

    public init(baseURL: String, apiKey: String, modelName: String, timeout: TimeInterval = 120) {
        self.baseURL = baseURL.hasSuffix("/") ? String(baseURL.dropLast()) : baseURL
        self.apiKey = apiKey
        self.modelName = modelName
        self.timeout = timeout
    }
}

// MARK: - Message types

public struct ChatMessage: Codable, Sendable {
    public let role: String   // "system" | "user" | "assistant"
    public let content: String

    public init(role: String, content: String) {
        self.role = role
        self.content = content
    }
}

// MARK: - Response types

public struct LLMResponse: Sendable {
    public let content: String
    public let promptTokens: Int
    public let completionTokens: Int
}

public struct LLMStreamChunk: Sendable {
    public let delta: String
    public let finishReason: String?  // nil = still streaming, "stop" = done
}

// MARK: - Error

public enum LLMError: LocalizedError {
    case network(String)
    case auth(String)
    case rateLimited(String)
    case invalidResponse(String)
    case timeout

    public var errorDescription: String? {
        switch self {
        case .network(let msg): return "Network error: \(msg)"
        case .auth(let msg): return "Auth error: \(msg)"
        case .rateLimited(let msg): return "Rate limited: \(msg)"
        case .invalidResponse(let msg): return "Invalid response: \(msg)"
        case .timeout: return "Request timed out"
        }
    }
}

// MARK: - Provider

public actor LLMProvider {
    private let config: LLMConfig
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    public init(config: LLMConfig) {
        self.config = config
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeout
        sessionConfig.timeoutIntervalForResource = config.timeout * 2
        self.session = URLSession(configuration: sessionConfig)
    }

    // ── Non-streaming completion ────────────────────────────────────

    public func complete(messages: [ChatMessage],
                         responseFormat: String? = nil,
                         thinking: Bool = false) async throws -> LLMResponse {
        let body = ChatCompletionRequest(
            model: config.modelName,
            messages: messages,
            stream: false,
            responseFormat: responseFormat.map { ResponseFormat(type: $0) },
            thinking: thinking
        )
        let request = try buildRequest(body: body)
        let (data, response) = try await session.data(for: request)

        try validateHTTP(response, data: data)

        let result = try decoder.decode(ChatCompletionResponse.self, from: data)
        guard let choice = result.choices.first else {
            throw LLMError.invalidResponse("No choices in response")
        }

        // Strip thinking tags if present
        let rawContent = choice.message.content
        let cleanContent = stripThinkingTags(rawContent)

        return LLMResponse(
            content: cleanContent,
            promptTokens: result.usage?.promptTokens ?? 0,
            completionTokens: result.usage?.completionTokens ?? 0
        )
    }

    // ── Streaming completion ────────────────────────────────────────

    public func stream(messages: [ChatMessage],
                       responseFormat: String? = nil,
                       thinking: Bool = false) -> AsyncThrowingStream<LLMStreamChunk, Error> {
        AsyncThrowingStream { continuation in
            let body = ChatCompletionRequest(
                model: config.modelName,
                messages: messages,
                stream: true,
                responseFormat: responseFormat.map { ResponseFormat(type: $0) },
                thinking: thinking
            )

            Task {
                do {
                    let request = try self.buildRequest(body: body)
                    let (bytes, response) = try await self.session.bytes(for: request)
                    try self.validateHTTP(response, data: nil)

                    var fullContent = ""
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let dataStr = String(line.dropFirst(6))
                        if dataStr == "[DONE]" {
                            continuation.yield(LLMStreamChunk(delta: "", finishReason: "stop"))
                            continuation.finish()
                            return
                        }
                        guard let data = dataStr.data(using: .utf8),
                              let chunk = try? self.decoder.decode(StreamChunk.self, from: data),
                              let choice = chunk.choices.first else { continue }

                        let delta = choice.delta.content ?? ""
                        fullContent += delta
                        let finishReason = choice.finishReason
                        continuation.yield(LLMStreamChunk(delta: delta, finishReason: finishReason))

                        if finishReason == "stop" {
                            continuation.finish()
                            return
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    // ── Retry-enabled completion with min-length guard ──────────────
    // Mirrors base-command.ts callLLM + doRetry logic

    public func completeWithRetry(
        messages: [ChatMessage],
        minLength: Int = 50,
        maxRetries: Int = 3,
        responseFormat: String? = nil,
        thinking: Bool = false
    ) async throws -> LLMResponse {
        var lastError: Error?
        var currentMessages = messages

        for attempt in 1...(maxRetries + 1) {
            do {
                let result = try await complete(
                    messages: currentMessages,
                    responseFormat: responseFormat,
                    thinking: attempt == 1 ? thinking : false  // retries: thinking off
                )

                // Min length guard
                if result.content.count >= minLength {
                    return result
                }

                // Too short → retry with enforcement message
                if attempt <= maxRetries {
                    let enforcementMsg = ChatMessage(
                        role: "user",
                        content: "(请直接输出正文内容，包含所有已有内容和新增修改内容，而不仅仅是修改或新增的部分。至少 \(minLength) 字。这是强制要求。)"
                    )
                    currentMessages = messages + [enforcementMsg]
                    continue
                } else {
                    throw LLMError.invalidResponse("连续\(maxRetries+1)次返回内容过短（不足\(minLength)字）")
                }
            } catch {
                lastError = error
                if attempt <= maxRetries {
                    try await Task.sleep(nanoseconds: UInt64(attempt) * 2_000_000_000)  // backoff: 2s, 4s, 6s
                    continue
                }
            }
        }

        throw lastError ?? LLMError.invalidResponse("Unknown retry failure")
    }

    // ── Private helpers ─────────────────────────────────────────────

    private func buildRequest(body: ChatCompletionRequest) throws -> URLRequest {
        let url = URL(string: "\(config.baseURL)/chat/completions")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encoder.encode(body)
        return request
    }

    private func validateHTTP(_ response: URLResponse, data: Data?) throws {
        guard let http = response as? HTTPURLResponse else {
            throw LLMError.network("Not an HTTP response")
        }
        switch http.statusCode {
        case 200...299: return
        case 401, 403:
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            throw LLMError.auth(body)
        case 429:
            throw LLMError.rateLimited("Too many requests")
        default:
            let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            throw LLMError.network("HTTP \(http.statusCode): \(body)")
        }
    }

    /// Strip <think>... tags from LLM output
    /// Mirrors v0.2.7 unified stripping logic
    private func stripThinkingTags(_ text: String) -> String {
        // Case 1: complete tags  thinking...</think>
        let regexComplete = try? NSRegularExpression(
            pattern: "(?:<|\\uff1c)think(?:>|\\uff1e)[\\s\\S]*?(?:<|\\uff1c)/think(?:>|\\uff1e)",
            options: []
        )
        if let regex = regexComplete {
            let range = NSRange(location: 0, length: text.utf16.count)
            let cleaned = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "")
            if cleaned != text { return cleaned.trimmingCharacters(in: .whitespacesAndNewlines) }
        }

        // Case 2: open tag only → find first real content after empty line
        let regexOpen = try? NSRegularExpression(
            pattern: "(?:<|\\uff1c)think(?:>|\\uff1e)[\\s\\S]*",
            options: []
        )
        if let regex = regexOpen,
           regex.firstMatch(in: text, range: NSRange(location: 0, length: text.utf16.count)) != nil {
            // Find first non-empty line after double newline
            if let blankRange = text.range(of: "\n\n") {
                return String(text[blankRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        return text
    }
}

// MARK: - OpenAI API JSON types

private struct ChatCompletionRequest: Encodable {
    let model: String
    let messages: [ChatMessage]
    let stream: Bool
    let responseFormat: ResponseFormat?
    let thinking: Bool

    enum CodingKeys: String, CodingKey {
        case model, messages, stream
        case responseFormat = "response_format"
        case thinking
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(model, forKey: .model)
        try container.encode(messages, forKey: .messages)
        try container.encode(stream, forKey: .stream)
        try container.encodeIfPresent(responseFormat, forKey: .responseFormat)
        if thinking {
            try container.encode(true, forKey: .thinking)
        }
    }
}

private struct ResponseFormat: Encodable {
    let type: String
}

private struct ChatCompletionResponse: Decodable {
    let choices: [Choice]
    let usage: Usage?

    struct Choice: Decodable {
        let message: ChoiceMessage
    }

    struct ChoiceMessage: Decodable {
        let content: String
    }

    struct Usage: Decodable {
        let promptTokens: Int
        let completionTokens: Int

        enum CodingKeys: String, CodingKey {
            case promptTokens = "prompt_tokens"
            case completionTokens = "completion_tokens"
        }
    }
}

private struct StreamChunk: Decodable {
    let choices: [StreamChoice]

    struct StreamChoice: Decodable {
        let delta: Delta
        let finishReason: String?

        enum CodingKeys: String, CodingKey {
            case delta
            case finishReason = "finish_reason"
        }
    }

    struct Delta: Decodable {
        let content: String?
    }
}