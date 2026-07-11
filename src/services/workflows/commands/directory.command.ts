import { BaseWorkflowCommand, CommandExecuteParams } from './base-command'
import { useProjectStore } from '../../../stores/project-store'
import { getPromptTemplate } from '../../prompt-templates'
import { DirectoryPromptBuilder } from '../../prompts/prompt-builder'
import { DirectoryWorkflowParams, ChapterBlueprint, parseTextBlueprints, saveAllBlueprints } from '../directory-workflow'

export class GenerateDirectoryCommand extends BaseWorkflowCommand<ChapterBlueprint[]> {
  constructor(private params: DirectoryWorkflowParams) {
    super()
  }

  async execute({ context, callbacks }: CommandExecuteParams): Promise<ChapterBlueprint[]> {
    const project = useProjectStore.getState().currentProject
    if (!project) throw new Error('未打开项目')

    const architecture = context.data.architecture as string
    const existingBlueprints = (context.data.existingBlueprints || []) as ChapterBlueprint[]

    const totalChapters = project.novelConfig.totalChapters
    const globalGuidance = project.novelConfig.globalGuidance || ''
    const genre = project.novelConfig.genre || ''

    let startChapter = 1
    let endChapter = totalChapters

    if (this.params.mode === 'append') {
      startChapter = this.params.startChapter || (existingBlueprints.length + 1)
      if (this.params.count && this.params.count > 0) {
        endChapter = startChapter + this.params.count - 1
      }
    } else if (this.params.count && this.params.count > 0) {
      endChapter = Math.min(this.params.count, totalChapters)
    }

    // v0.2.7: full 模式断点续跑 — 检测已入库蓝图，从最后一章+1 继续
    // 解决网络中断后再跑 full 模式不会跳过已生成章节的问题
    if (this.params.mode === 'full' && existingBlueprints.length > 0) {
      const maxExisting = Math.max(...existingBlueprints.map(b => b.chapterNumber))
      if (maxExisting >= startChapter) {
        startChapter = maxExisting + 1
        if (startChapter > endChapter) {
          callbacks.log('✅ 所有章节蓝图均已生成，无需重复执行')
          return existingBlueprints
        }
        callbacks.log(`📌 检测到 ${existingBlueprints.length} 章已入库，从第 ${startChapter} 章继续生成...`)
      }
    }

    callbacks.log(`生成第 ${startChapter}–${endChapter} 章蓝图...`)

    // 从当前默认模型获取 maxTokens，动态计算每批次章节数
    const llmStore = (await import('../../../stores/llm-store')).useLLMStore.getState()
    const defaultModel = llmStore.models.find(m => m.id === llmStore.defaultModelId)
    const modelMaxTokens = defaultModel?.maxTokens || 4096
    const outputBudget = Math.floor(modelMaxTokens * 0.6)  // 预留 40% 给 prompt + 思考
    const tokensPerChapter = 200
    const batchSize = Math.min(50, Math.max(5, Math.floor(outputBudget / tokensPerChapter)))

    const newBlueprints: ChapterBlueprint[] = []
    // 使用游标追踪生成进度，支持 AI 超额返回时智能跳过后续批次
    let cursor = startChapter

    while (cursor <= endChapter) {
      if (context.cancelled) { callbacks.log('已取消'); break }

      const batchEnd = Math.min(cursor + batchSize - 1, endChapter)
      callbacks.log(`  正在生成第 ${cursor}–${batchEnd} 章...`)

      let prompt: string
      // v0.2.7 FIX: 统一使用 chapter_blueprint_chunk 模板，避免首批用不同模板
      // 致 AI 输出格式不一致（首批返回 0 章，后续批正常）
      {
        const template = getPromptTemplate('chapter_blueprint_chunk')
        if (!template) throw new Error('模板丢失')

        const prevAll = [...existingBlueprints, ...newBlueprints]
        const chapterList = prevAll.slice(-100).map(c => `第${c.chapterNumber}章 ${c.title}：${c.keyEvents}`).join('\n')

        prompt = new DirectoryPromptBuilder(template)
          .withNovelArchitecture(architecture)
          .withChapterList(chapterList || '（首批生成，无前序章节）')
          .withNumberOfChapters(totalChapters)
          .withN(cursor)
          .withM(batchEnd)
          .withGlobalGuidance(globalGuidance)
          .withGenre(genre)
          .withPacingGuidance((context.data.pacingGuidance as string) || '')
          .build()
      }

      callbacks.setProgress(Math.round(((cursor - startChapter) / (endChapter - startChapter + 1)) * 90))

      // systemRole 由模板定义，不再硬编码
      const systemRole = getPromptTemplate('chapter_blueprint')?.systemRole || '你是一位经验丰富的网文架构师。'
      const resultText = await this.callLLM(prompt, systemRole, callbacks, { responseFormat: { type: 'json_object' } })

      // ★ 关键修复：接受 AI 返回的从 cursor 到 endChapter 范围内的所有有效章节
      // AI 可能一次性返回超出本批次（batchEnd）的章节，全部保留，避免浪费和重复 LLM 请求
      const parsed = parseTextBlueprints(resultText, cursor, batchEnd)
      newBlueprints.push(...parsed)

      // ==== 批次入库 ====
      if (parsed.length > 0) {
        await saveAllBlueprints(parsed)
        useProjectStore.getState().refreshFileTree()
      }

      // 计算本次实际生成到的最大章节号，推进游标到已生成的最后一章之后
      const actualMaxChapter = parsed.length > 0
        ? Math.max(...parsed.map(p => p.chapterNumber))
        : batchEnd
      callbacks.log(`  ✅ 第 ${cursor}–${actualMaxChapter} 章完成（${parsed.length} 章）并已保存入库`)

      cursor = actualMaxChapter + 1
    }

    context.data.newBlueprints = newBlueprints
    context.data.existingBlueprints = existingBlueprints

    callbacks.log(`✅ 共生成 ${newBlueprints.length} 章蓝图`)
    return newBlueprints
  }
}
