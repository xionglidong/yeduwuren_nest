import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigStoreService } from '../config-store/config-store.service';
import { PrismaService } from '../database/prisma.service';

export interface KnowledgePointScore {
  name: string;
  score: number;
  questionCount: number;
}

export interface PredictionNode {
  index: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string; // MM-DD
  score: number; // 本次练习按 150 分制折算后的分数
  rawScore: number;
  totalScore: number;
  type: string;
  typeLabel: string;
  name: string;
  weight: number;
  questionCount: number;
  knowledgePoints: KnowledgePointScore[];
}

export interface PredictedScoreRange {
  min: number;
  max: number;
}

export interface PredictionComposition {
  test: number;
  homework: number;
  comprehensive: number;
  custom: number;
  correction: number;
  schoolScore: number;
  weights: {
    comprehensive: number;
    test: number;
    custom: number;
    homework: number;
    schoolScore: number;
    correctionBonus: number; // +10% = 0.1
  };
}

export interface PhaseTargetPrediction {
  studentId: string;
  configured: boolean;
  range: { startDate: string; endDate: string } | null;
  nodeDays: number;
  nodes: PredictionNode[];
  predictedScore: number | null;
  basePredictedScore: number | null;
  correctionBonus: number;
  predictedScoreRange: PredictedScoreRange | null;
  confidence: number; // 1..99, 预测成功率（%），受作答次数与作答间隔影响
  nextNodeLabel: string;
  trend: 'up' | 'down' | 'flat';
  slope: number;
  composition: PredictionComposition;
  suggestions: string[];
  reason?: string; // 'no-config' | 'no-data'
}

const NODE_DAYS = 1;
const BASE_SCORE = 150;
const MAX_SCORE = 150;
const COMPREHENSIVE_WEIGHT = 0.8;
const IN_CLASS_WEIGHT = 0.6;
const HOMEWORK_WEIGHT = 0.4;
const SCHOOL_SCORE_WEIGHT = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type PredictionWeights = PredictionComposition['weights'];

const DEFAULT_PREDICTION_WEIGHTS: PredictionWeights = {
  comprehensive: COMPREHENSIVE_WEIGHT,
  test: IN_CLASS_WEIGHT,
  custom: IN_CLASS_WEIGHT,
  homework: HOMEWORK_WEIGHT,
  schoolScore: SCHOOL_SCORE_WEIGHT,
  correctionBonus: 0.1,
};

interface ParsedPaper {
  type: string;
  name: string;
  totalPoints: number;
  fillInBlankConfig: Record<string, unknown>[];
  questionCount: number;
  singlePoints: number;
  questionTypes: string[];
  fillInBlankPoints: number[];
}

@Injectable()
export class PredictionService {
  constructor(
    private readonly configStore: ConfigStoreService,
    private readonly prisma: PrismaService,
  ) {}

  async predictPhaseTarget(
    studentId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<PhaseTargetPrediction> {
    // 1. Resolve range: query override wins, then config, else not configured.
    const cfg = (await this.configStore.get('predictionTimeRange')) as
      | { startDate?: string; endDate?: string }
      | string
      | null;
    const nextNodeLabelRaw = await this.configStore.get('predictionNextNodeLabel');
    const nextNodeLabel =
      typeof nextNodeLabelRaw === 'string' && nextNodeLabelRaw.trim()
        ? nextNodeLabelRaw.trim()
        : '预测';
    const weights = await this.getPredictionWeights();

    let cfgStart: string | undefined;
    let cfgEnd: string | undefined;
    if (cfg && typeof cfg === 'object') {
      cfgStart = cfg.startDate;
      cfgEnd = cfg.endDate;
    }

    const s = (startDate || cfgStart || '').trim();
    const e = (endDate || cfgEnd || '').trim();

    if (!s || !e) {
      return {
        studentId,
        configured: false,
        range: null,
        nodeDays: NODE_DAYS,
        nodes: [],
        predictedScore: null,
        basePredictedScore: null,
        correctionBonus: 0,
        predictedScoreRange: null,
        confidence: 1,
        nextNodeLabel,
        trend: 'flat',
        slope: 0,
        composition: {
          test: 0,
          homework: 0,
          comprehensive: 0,
          custom: 0,
          correction: 0,
          schoolScore: 0,
          weights,
        },
        suggestions: [],
        reason: 'no-config',
      };
    }

    if (!DATE_RE.test(s) || !DATE_RE.test(e)) {
      throw new BadRequestException('startDate/endDate 必须为 YYYY-MM-DD 格式');
    }
    if (s > e) {
      throw new BadRequestException('startDate 不能晚于 endDate');
    }

    // 2. Date range (local time, Safari-safe). submitTime uses mixed formats
    //    ("2026/8/26 21:04:08", "2026-8-27 10:05:43", "2026-08-27 10:16:40"), so the
    //    DB-side string comparison in findSubmissionsByDateRange is unreliable — filter
    //    in memory by parsed date instead.
    const rangeStart = new Date(s.replace(/-/g, '/'));
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(e.replace(/-/g, '/'));
    rangeEnd.setHours(23, 59, 59, 999);

    // 3. Fetch data (all of this student's submissions, filtered in memory).
    const allSubs = await this.prisma.studentAnswer.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
    const submissions = allSubs.filter((sub) => {
      const dt = new Date(String(sub.submitTime || '').replace(/-/g, '/'));
      if (isNaN(dt.getTime())) return false;
      return dt >= rangeStart && dt <= rangeEnd;
    });
    const papers = await this.prisma.paper.findMany({ orderBy: { createdAt: 'desc' } });

    // 4. Build paper map.
    const paperMap = new Map<string, ParsedPaper>();
    for (const p of papers) {
      let opts = this.safeParseJson<Record<string, unknown>>(p.options, {});
      // Some stored options are wrapped as { options: '{"type":"..."}' }
      if (opts && typeof opts['options'] === 'string') {
        opts = this.safeParseJson<Record<string, unknown>>(opts['options'], {});
      }
      paperMap.set(p.id, {
        type: typeof opts['type'] === 'string' ? opts['type'] : 'test',
        name: p.name,
        totalPoints: p.totalPoints,
        fillInBlankConfig: this.safeParseJson<Record<string, unknown>[]>(p.fillInBlankConfig, []),
        questionCount: p.questionCount,
        singlePoints: p.singlePoints,
        questionTypes: Array.isArray(opts['questionTypes'])
          ? (opts['questionTypes'] as unknown[]).map((value) => String(value))
          : [],
        fillInBlankPoints: Array.isArray(opts['fbPointsArray'])
          ? (opts['fbPointsArray'] as unknown[]).map((value) => Number(value) || 0)
          : [],
      });
    }

    // 5. Build one chart point per practice. No 7-day averaging is performed.
    const practicePoints: Array<PredictionNode & { timeMs: number }> = [];
    const composition: PredictionComposition = {
      test: 0,
      homework: 0,
      comprehensive: 0,
      custom: 0,
      correction: 0,
      schoolScore: 0,
      weights,
    };
    let hasCorrection = false;

    for (const sub of submissions) {
      const dt = new Date(String(sub.submitTime || '').replace(/-/g, '/'));
      if (isNaN(dt.getTime())) continue;
      if (dt < rangeStart || dt > rangeEnd) continue;

      const paper = paperMap.get(sub.paperId);
      if (!paper) continue;

      // Count every submission by type for the composition breakdown.
      if (paper.type === 'test') composition.test++;
      else if (paper.type === 'homework') composition.homework++;
      else if (paper.type === 'comprehensive') composition.comprehensive++;
      else if (paper.type === 'custom') composition.custom++;
      else if (paper.type === 'correction') {
        composition.correction++;
        hasCorrection = true;
      } else {
        continue; // unknown type
      }

      const weightCoef =
        paper.type === 'comprehensive'
          ? weights.comprehensive
          : paper.type === 'test'
            ? weights.test
            : paper.type === 'custom'
              ? weights.custom
              : paper.type === 'homework'
                ? weights.homework
                : null;
      if (weightCoef === null) continue; // correction only counts toward composition/bonus

      const rawScore = Number(sub.redoScore ?? sub.score);
      const answeredScope = this.getAnsweredScope(sub, paper);
      const totalScore = sub.status === 0
        ? answeredScope.totalPoints
        : Number(sub.totalPoints || paper.totalPoints);
      if (!Number.isFinite(rawScore) || !Number.isFinite(totalScore) || totalScore <= 0) continue;
      const normalizedScore = this.clamp(
        Math.round((rawScore / totalScore) * BASE_SCORE * weightCoef),
        0,
        MAX_SCORE,
      );
      const date = this.fmtYmd(dt);
      practicePoints.push({
        index: 0,
        startDate: date,
        endDate: date,
        label: this.fmtMMDD(dt),
        score: normalizedScore,
        rawScore: Number(rawScore.toFixed(2)),
        totalScore: Number(totalScore.toFixed(2)),
        type: paper.type,
        typeLabel: this.getPracticeTypeLabel(paper.type),
        name: paper.name,
        weight: weightCoef,
        questionCount: sub.status === 0
          ? answeredScope.questionCount
          : paper.questionCount + Math.max(paper.fillInBlankConfig.length, paper.fillInBlankPoints.length),
        knowledgePoints: [],
        timeMs: dt.getTime(),
      });
    }

    // 5b. School scores are also individual points on their actual dates.
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    const schoolScores = this.safeParseJson<unknown[]>(student?.schoolScores, []);

    for (const raw of schoolScores) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const dt = this.parseSchoolScoreDate(item);
      if (!dt || dt < rangeStart || dt > rangeEnd) continue;

      const score = Number(item['score'] ?? 0);
      const totalScore = Number(item['totalScore'] ?? 0);
      if (!totalScore || score < 0) continue;

      const ratio = this.clamp(score / totalScore, 0, 1);
      const date = this.fmtYmd(dt);
      practicePoints.push({
        index: 0,
        startDate: date,
        endDate: date,
        label: this.fmtMMDD(dt),
        score: Math.round(BASE_SCORE * ratio * weights.schoolScore),
        rawScore: Number(score.toFixed(2)),
        totalScore: Number(totalScore.toFixed(2)),
        type: 'schoolScore',
        typeLabel: '校内成绩',
        name: String(item['name'] || item['title'] || '校内成绩'),
        weight: weights.schoolScore,
        questionCount: 1,
        knowledgePoints: [],
        timeMs: dt.getTime(),
      });
      composition.schoolScore++;
    }

    practicePoints.sort((a, b) => a.timeMs - b.timeMs);
    const nodes: PredictionNode[] = practicePoints.map(({ timeMs: _timeMs, ...point }, index) => ({
      ...point,
      index,
    }));

    // 6. Group practices by date, then average the daily nodes.
    const n = nodes.length;
    if (n === 0) {
      return {
        studentId,
        configured: true,
        range: { startDate: s, endDate: e },
        nodeDays: NODE_DAYS,
        nodes: [],
        predictedScore: null,
        basePredictedScore: null,
        correctionBonus: 0,
        predictedScoreRange: null,
        confidence: 1,
        nextNodeLabel,
        trend: 'flat',
        slope: 0,
        composition,
        suggestions: this.buildSuggestions(composition, 1),
        reason: 'no-data',
      };
    }
    const dailyGroups = new Map<string, { date: Date; scoreSum: number; count: number }>();
    for (const point of practicePoints) {
      const date = new Date(point.startDate.replace(/-/g, '/'));
      date.setHours(0, 0, 0, 0);
      const group = dailyGroups.get(point.startDate);
      if (group) {
        group.scoreSum += point.score;
        group.count++;
      } else {
        dailyGroups.set(point.startDate, { date, scoreSum: point.score, count: 1 });
      }
    }

    const dailyNodes = Array.from(dailyGroups.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((group) => {
        const averageScore = group.scoreSum / group.count;
        return {
          date: group.date,
          averageScore,
        };
      });

    const averageNodeScore = dailyNodes.reduce(
      (sum, node) => sum + node.averageScore,
      0,
    ) / dailyNodes.length;
    const basePredictedScore = this.clamp(Math.round(averageNodeScore), 0, MAX_SCORE);
    const predictedScore = hasCorrection
      ? this.clamp(Math.round(basePredictedScore * (1 + weights.correctionBonus)), 0, MAX_SCORE)
      : basePredictedScore;
    const correctionBonus = predictedScore - basePredictedScore;
    const firstDailyScore = dailyNodes[0].averageScore;
    const lastDailyScore = dailyNodes[dailyNodes.length - 1].averageScore;
    const scoreChange = lastDailyScore - firstDailyScore;
    const trend = scoreChange > 1 ? 'up' : scoreChange < -1 ? 'down' : 'flat';
    const confidence = this.computeConfidence(submissions);

    return {
      studentId,
      configured: true,
      range: { startDate: s, endDate: e },
      nodeDays: NODE_DAYS,
      nodes,
      predictedScore,
      basePredictedScore,
      correctionBonus,
      predictedScoreRange: this.buildScoreRange(predictedScore),
      confidence,
      nextNodeLabel,
      trend,
      slope: 0,
      composition,
      suggestions: this.buildSuggestions(composition, confidence),
    };
  }

  private buildScoreRange(score: number): PredictedScoreRange {
    return {
      min: this.clamp(Math.round(score - 2), 0, MAX_SCORE),
      max: this.clamp(Math.round(score + 2), 0, MAX_SCORE),
    };
  }

  private getAnsweredScope(
    submission: { answers: string; options: string | null; totalPoints: number },
    paper: ParsedPaper,
  ): { totalPoints: number; questionCount: number } {
    const answers = this.safeParseJson<unknown[]>(submission.answers, []);
    let totalPoints = 0;
    let questionCount = 0;

    for (let index = 0; index < paper.questionCount; index++) {
      const answer = answers[index];
      const answered = answer !== null && answer !== undefined && String(answer).trim() !== '';
      if (!answered) continue;
      totalPoints += paper.questionTypes[index] === 'multiple' ? 6 : paper.singlePoints;
      questionCount++;
    }

    const submissionOptions = this.safeParseJson<Record<string, unknown>>(submission.options, {});
    const answeredFlags = Array.isArray(submissionOptions['fillInBlankAnswered'])
      ? (submissionOptions['fillInBlankAnswered'] as unknown[])
      : [];
    const details = Array.isArray(submissionOptions['fillInBlankDetails'])
      ? (submissionOptions['fillInBlankDetails'] as unknown[])
      : [];
    const fillCount = Math.max(
      paper.fillInBlankConfig.length,
      paper.fillInBlankPoints.length,
      answeredFlags.length,
      details.length,
    );
    const allChoicePoints = Array.from({ length: paper.questionCount }).reduce<number>(
      (sum, _, index) => sum + (paper.questionTypes[index] === 'multiple' ? 6 : paper.singlePoints),
      0,
    );
    const fallbackFillPoints = fillCount > 0
      ? Math.max(0, paper.totalPoints - allChoicePoints) / fillCount
      : 0;

    for (let index = 0; index < fillCount; index++) {
      const answered = answeredFlags.length > 0
        ? answeredFlags[index] === true
        : details[index] !== null && details[index] !== undefined && details[index] !== '';
      if (!answered) continue;
      const configuredPoints = Number(paper.fillInBlankConfig[index]?.['points']);
      const optionPoints = Number(paper.fillInBlankPoints[index]);
      totalPoints += configuredPoints > 0
        ? configuredPoints
        : optionPoints > 0
          ? optionPoints
          : fallbackFillPoints;
      questionCount++;
    }

    return {
      totalPoints: Number(totalPoints.toFixed(2)),
      questionCount,
    };
  }

  private getPracticeTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      comprehensive: '综合考试',
      test: '课上测试',
      custom: '自定义题库',
      homework: '课后作业',
      correction: '改错任务',
      schoolScore: '校内成绩',
    };
    return labels[type] || '练习';
  }

  private buildSuggestions(
    composition: PredictionComposition,
    confidence: number,
  ): string[] {
    const suggestions: string[] = [];
    if (composition.comprehensive < 5) {
      suggestions.push('建议完成一套综合考试，提升预测覆盖度。');
    }
    if (composition.test < 5) {
      suggestions.push('建议完成课上测试，补充课堂表现数据。');
    }
    if (composition.homework < 5) {
      suggestions.push('建议完成课后作业，巩固知识点。');
    }
    // if (composition.custom < 5) {
    //   suggestions.push('建议进行自定义题库练习，补充个性化数据。');
    // }
    if (composition.schoolScore < 5) {
      suggestions.push('建议录入校内成绩，纳入预测参考。');
    }
    if (composition.correction < 5) {
      suggestions.push(`建议提交改错任务，可获得 ${Math.round(composition.weights.correctionBonus * 100)}% 预测分数加成。`);
    }
    if (confidence < 30) {
      suggestions.push('建议保持规律作答，提高预测准确率。');
    }
    return suggestions;
  }

  /**
   * 计算预测成功率（1-99 的整数）。
   * 受两个因素影响：
   * 1. 作答次数：次数越多，样本越充足，成功率越高。
   * 2. 作答间隔规律性：间隔越稳定、时间跨度越合理，成功率越高；
   *    若作答过于集中或间隔波动极大，成功率会被压低。
   */
  private computeConfidence(
    submissions: { submitTime?: string | Date | null }[],
  ): number {
    const total = submissions.length;
    if (total === 0) return 1;

    // 1. 基础成功率：随作答次数对数增长
    const base = Math.min(95, Math.round(25 + 20 * Math.log2(total)));

    const times = submissions
      .map((s) => new Date(String(s.submitTime || '').replace(/-/g, '/')).getTime())
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    if (times.length < 2) {
      return this.clamp(base, 1, 99);
    }

    // 2. 作答间隔规律性（变异系数 CV）
    const intervals: number[] = [];
    for (let i = 1; i < times.length; i++) {
      intervals.push((times[i] - times[i - 1]) / DAY_MS);
    }
    const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;

    let regularityDelta = 0;
    if (mean <= 0) {
      // 所有作答时间完全相同，视为极不规律
      regularityDelta = -20;
    } else {
      const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.3) regularityDelta = 10;
      else if (cv < 0.6) regularityDelta = 5;
      else if (cv < 1.0) regularityDelta = 0;
      else if (cv < 1.5) regularityDelta = -10;
      else regularityDelta = -15;
    }

    // 3. 时间跨度：过于集中（<1 天）降低信心，跨度合理（>=14 天）略增信心
    const spanDays = (times[times.length - 1] - times[0]) / DAY_MS;
    let spanDelta = 0;
    if (spanDays < 1) spanDelta = -10;
    else if (spanDays >= 14) spanDelta = 5;

    return this.clamp(base + regularityDelta + spanDelta, 1, 99);
  }

  private parseSchoolScoreDate(item: Record<string, unknown>): Date | null {
    if (typeof item['date'] === 'string' && DATE_RE.test(item['date'])) {
      return new Date(item['date'].replace(/-/g, '/'));
    }
    const ct = item['createTime'];
    if (ct != null && ct !== '') {
      const dt = new Date(String(ct).replace(/-/g, '/'));
      if (!isNaN(dt.getTime())) return dt;
    }
    return null;
  }

  private async getPredictionWeights(): Promise<PredictionWeights> {
    const raw = await this.configStore.get('predictionWeights');
    const configured =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const normalized = { ...DEFAULT_PREDICTION_WEIGHTS };
    for (const key of Object.keys(normalized) as (keyof PredictionWeights)[]) {
      const value = Number(configured[key]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) normalized[key] = value;
    }
    return normalized;
  }

  private safeParseJson<T>(str: string | null | undefined, fallback: T): T {
    if (str === null || str === undefined || str === '') return fallback;
    try {
      const v = JSON.parse(str);
      return (v ?? fallback) as T;
    } catch {
      return fallback;
    }
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private fmtYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private fmtMMDD(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
  }
}
