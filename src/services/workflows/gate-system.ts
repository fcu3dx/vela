/**
 * v0.3.0: 工作流门禁系统 — 步骤执行后的自动质量检查
 *
 * 提供格式、重复、大小、一致性四类内置门禁，支持自定义 validator。
 * 运行在 WorkflowEngine 执行每个 step 后、标记完成前。
 */

import type { GateIssue, GateResult, WorkflowContext, WorkflowGate } from '../../stores/workflow-store'

// ===== 内置门禁实现 =====

/**
 * format gate — 空值/空行/thinking 标签残留检查
 */
export async function formatGate(output: string, _context: WorkflowContext): Promise<GateResult> {
  const issues: GateIssue[] = []

  // 1. 空输出检查 (blocker)
  if (!output || output.trim().length === 0) {
    issues.push({ severity: 'blocker', message: '步骤输出为空字符串' })
    return { gateName: 'format', gateType: 'format', passed: false, issues }
  }

  // 2. thinking 标签残留 (blocker)
  if (/[\s\S]*?<\/think>/i.test(output)) {
    issues.push({ severity: 'blocker', message: '输出包含未剥离的 thinking 块' })
  }

  // 3. 连续空行过多 (>3个连续空行) (warning)
  const emptyLineMatches = output.match(/\n\s*\n\s*\n\s*\n/g)
  if (emptyLineMatches && emptyLineMatches.length > 2) {
    issues.push({ severity: 'warning', message: `存在 ${emptyLineMatches.length} 处连续空行（≥3空行），建议压缩` })
  }

  // 4. 纯JSON输出占位检查 (warning)
  // 某些LLM会只输出 {"content": ""} 或类似空壳JSON
  if (output.length < 50 && /^\s*[{[]/.test(output) && /[}\]]\s*$/.test(output)) {
    issues.push({ severity: 'warning', message: '输出疑似空壳JSON（<50字符），请检查' })
  }

  const hasBlocker = issues.some(i => i.severity === 'blocker')
  return {
    gateName: 'format',
    gateType: 'format',
    passed: !hasBlocker,
    issues,
  }
}

/**
 * duplicate gate — 重复章节号检测
 */
export async function duplicateGate(
  blueprints: Array<{ chapterNumber: number }>,
  existingNums: Set<number>,
): Promise<GateResult> {
  const issues: GateIssue[] = []

  for (const bp of blueprints) {
    if (existingNums.has(bp.chapterNumber)) {
      issues.push({
        severity: 'blocker',
        message: `第 ${bp.chapterNumber} 章已入库，跳过重复生成`,
      })
    }
  }

  return {
    gateName: 'duplicate',
    gateType: 'duplicate',
    passed: issues.length === 0,
    issues,
  }
}

/**
 * size gate — 字数范围检查
 */
export async function sizeGate(
  output: string,
  minChars: number,
  maxChars: number,
): Promise<GateResult> {
  const issues: GateIssue[] = []
  const len = output.length

  if (len < minChars) {
    issues.push({ severity: 'warning', message: `输出 ${len} 字符，低于最小要求 ${minChars}` })
  }
  if (maxChars > 0 && len > maxChars) {
    issues.push({ severity: 'warning', message: `输出 ${len} 字符，超过最大限制 ${maxChars}` })
  }

  return {
    gateName: 'size',
    gateType: 'size',
    passed: true, // size gate 从不阻断，仅警告
    issues,
  }
}

// ===== Gate 调度器 =====

/**
 * 执行步骤上的所有门禁检查
 * 返回：是否全部 blocker gate 通过
 */
export async function runStepGates(
  stepOutput: string,
  gates: WorkflowGate[],
  context: WorkflowContext,
): Promise<GateResult[]> {
  const results: GateResult[] = []

  for (const gate of gates) {
    let result: GateResult

    if (gate.validator) {
      // 自定义门禁
      result = await gate.validator(stepOutput, context)
    } else {
      // 内置门禁
      switch (gate.type) {
        case 'format':
          result = await formatGate(stepOutput, context)
          break
        case 'size':
          // size gate 需要额外参数，从 context 读取
          const min = (context.data._gateMinChars as number) ?? 0
          const max = (context.data._gateMaxChars as number) ?? 0
          result = await sizeGate(stepOutput, min, max)
          break
        default:
          // duplicate/consistency 需要结构化数据，不适用于纯文本输出
          // 这些类型必须提供自定义 validator
          result = {
            gateName: gate.name,
            gateType: gate.type,
            passed: false,
            issues: [{ severity: 'blocker', message: `门禁类型 "${gate.type}" 需要自定义 validator，但未提供` }],
          }
      }
    }

    // 覆盖 name
    result.gateName = gate.name
    results.push(result)
  }

  return results
}

/**
 * 判断门禁是否全部通过（所有 blocker gate passed）
 */
export function allGatesPassed(results: GateResult[]): boolean {
  return results.every(r => r.passed)
}