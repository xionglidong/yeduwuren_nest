import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigStoreService } from '../config-store/config-store.service';
import { PaperRepository } from '../paper/repositories/paper.repository';

export interface KnowledgePointScore {
  name: string;
  score: number;
  questionCount: number;
}

export interface PredictionNode {
  index: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string; // MM-DD ~ MM-DD
  score: number; // 0..150
  questionCount: number;
  knowledgePoints: KnowledgePointScore[];
}

export interface PredictedScoreRange {
  min: number;
  max: number;
}

export interface PhaseTargetPrediction {
  studentId: string;
  configured: boolean;
  range: { startDate: string; endDate: string } | null;
  nodeDays: number;
  nodes: PredictionNode[];
  predictedScore: number | null;
  predictedScoreRange: PredictedScoreRange | null;
  nextNodeLabel: string;
  trend: 'up' | 'down' | 'flat';
  slope: number;
  reason?: string; // 'no-config' | 'no-data'
}

const NODE_DAYS = 7;
const BASE_SCORE = 150;
const MAX_SCORE = 150;
const IN_CLASS_WEIGHT = 0.6;
const HOMEWORK_WEIGHT = 0.4;
const DIFFICULTY_COEFF: Record<string, number> = { 简单题: 0.85, 中档题: 1.0, 较难题: 1.2 };
const TYPE_COEFF: Record<string, number> = { 新题: 1.0, 旧题: 0.9 };
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedPaper {
  type: string;
  answers: unknown[];
  fillInBlankConfig: Record<string, unknown>[];
  questionCount: number;
  singlePoints: number;
}

interface NodeAgg {
  weightedCorrect: number;
  weightedTotal: number;
  inClassCorrect: number;
  inClassTotal: number;
  homeworkCorrect: number;
  homeworkTotal: number;
  diffSum: number;
  diffCount: number;
  typeSum: number;
  typeCount: number;
}

@Injectable()
export class PredictionService {
  constructor(
    private readonly paperRepository: PaperRepository,
    private readonly configStore: ConfigStoreService,
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
        predictedScoreRange: null,
        nextNodeLabel,
        trend: 'flat',
        slope: 0,
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
    const allSubs = await this.paperRepository.findSubmissionsByStudent(studentId);
    const submissions = allSubs.filter((sub) => {
      const dt = new Date(String(sub.submitTime || '').replace(/-/g, '/'));
      if (isNaN(dt.getTime())) return false;
      return dt >= rangeStart && dt <= rangeEnd;
    });
    const papers = await this.paperRepository.findAllPapers();

    // 4. Build paper map.
    const paperMap = new Map<string, ParsedPaper>();
    for (const p of papers) {
      const opts = this.safeParseJson<Record<string, unknown>>(p.options, {});
      paperMap.set(p.id, {
        type: typeof opts['type'] === 'string' ? opts['type'] : 'test',
        answers: this.safeParseJson<unknown[]>(p.answers, []),
        fillInBlankConfig: this.safeParseJson<Record<string, unknown>[]>(p.fillInBlankConfig, []),
        questionCount: p.questionCount,
        singlePoints: p.singlePoints,
      });
    }

    // 5. Bucket & aggregate: nodeIndex -> NodeAgg.
    //    Scores are now computed from the node-wide weighted accuracy instead of
    //    per-knowledge-point accuracy, so papers without knowledge-point tags are
    //    no longer skipped.
    const nodeAgg = new Map<number, NodeAgg>();

    const accumulate = (
      nodeIndex: number,
      weight: 'in-class' | 'homework',
      correct: boolean,
      tags: Record<string, unknown>,
    ) => {
      const { difficulty, typeCoef } = this.extractTags(tags);
      let agg = nodeAgg.get(nodeIndex);
      if (!agg) {
        agg = {
          weightedCorrect: 0,
          weightedTotal: 0,
          inClassCorrect: 0,
          inClassTotal: 0,
          homeworkCorrect: 0,
          homeworkTotal: 0,
          diffSum: 0,
          diffCount: 0,
          typeSum: 0,
          typeCount: 0,
        };
        nodeAgg.set(nodeIndex, agg);
      }
      const weightCoef = weight === 'in-class' ? IN_CLASS_WEIGHT : HOMEWORK_WEIGHT;
      const w = weightCoef * difficulty * typeCoef;
      agg.weightedTotal += w;
      if (correct) agg.weightedCorrect += w;
      if (weight === 'in-class') {
        agg.inClassTotal++;
        if (correct) agg.inClassCorrect++;
      } else {
        agg.homeworkTotal++;
        if (correct) agg.homeworkCorrect++;
      }
      agg.diffSum += difficulty;
      agg.diffCount++;
      agg.typeSum += typeCoef;
      agg.typeCount++;
    };

    for (const sub of submissions) {
      const dt = new Date(String(sub.submitTime || '').replace(/-/g, '/'));
      if (isNaN(dt.getTime())) continue;
      if (dt < rangeStart || dt > rangeEnd) continue;

      const paper = paperMap.get(sub.paperId);
      if (!paper) continue;

      const weight =
        paper.type === 'homework'
          ? 'homework'
          : paper.type === 'test' || paper.type === 'custom'
            ? 'in-class'
            : null;
      if (!weight) continue; // correction / unknown -> skip

      const nodeIndex = Math.floor((dt.getTime() - rangeStart.getTime()) / (NODE_DAYS * DAY_MS));

      const subAnswers = this.safeParseJson<unknown[]>(sub.answers, []);
      const subOpts = this.safeParseJson<Record<string, unknown>>(sub.options, {});
      const fbDetails = Array.isArray(subOpts['fillInBlankDetails'])
        ? (subOpts['fillInBlankDetails'] as unknown[])
        : [];

      // MC questions
      const stdAnswers = paper.answers;
      const mcCount = Math.min(
        paper.questionCount > 0 ? paper.questionCount : stdAnswers.length,
        stdAnswers.length,
      );
      for (let i = 0; i < mcCount; i++) {
        const stdItem = stdAnswers[i];
        const stdAns =
          stdItem && typeof stdItem === 'object'
            ? String((stdItem as Record<string, unknown>)['answer'] ?? '')
            : String(stdItem ?? '');
        const studentAns = subAnswers[i];
        const correct =
          studentAns != null &&
          String(studentAns).trim().toUpperCase() === stdAns.trim().toUpperCase();
        const tags =
          stdItem && typeof stdItem === 'object'
            ? ((stdItem as Record<string, unknown>)['tags'] as Record<string, unknown>) || {}
            : {};
        accumulate(nodeIndex, weight, correct, tags);
      }

      // Fill-in-blank / subjective questions
      const fbConfig = paper.fillInBlankConfig;
      for (let i = 0; i < fbConfig.length; i++) {
        const item = fbConfig[i];
        const detail = fbDetails[i];
        const maxScore = Number(item?.['points'] ?? paper.singlePoints ?? 0) || 0;
        let correct = false;
        if (detail === true) correct = true;
        else if (detail === false || detail == null) correct = false;
        else if (typeof detail === 'number') {
          correct = maxScore > 0 ? detail >= maxScore * 0.8 : detail > 0;
        } else {
          correct = false;
        }
        const tags = ((item?.['tags'] as Record<string, unknown>) || {}) as Record<string, unknown>;
        accumulate(nodeIndex, weight, correct, tags);
      }
    }

    // 6. Compute node scores.
    //    Each 7-day bucket is now scored purely from its weighted average accuracy
    //    (in-class vs homework, difficulty and new/old weights are kept in the
    //    per-question weight). Node score = BASE_SCORE * weighted accuracy.
    const nodes: PredictionNode[] = [];
    const sortedIndices = Array.from(nodeAgg.keys()).sort((a, b) => a - b);
    for (const nodeIndex of sortedIndices) {
      const agg = nodeAgg.get(nodeIndex)!;
      if (agg.weightedTotal <= 0) continue;

      const weightedAcc = agg.weightedCorrect / agg.weightedTotal;
      const nodeScore = this.clamp(Math.round(BASE_SCORE * weightedAcc), 0, MAX_SCORE);
      const totalQuestions = agg.inClassTotal + agg.homeworkTotal;
      const kpScores: KnowledgePointScore[] = [
        { name: '综合', score: nodeScore, questionCount: totalQuestions },
      ];

      const start = new Date(rangeStart.getTime() + nodeIndex * NODE_DAYS * DAY_MS);
      const end = new Date(
        Math.min(start.getTime() + (NODE_DAYS - 1) * DAY_MS, rangeEnd.getTime()),
      );
      nodes.push({
        index: nodeIndex,
        startDate: this.fmtYmd(start),
        endDate: this.fmtYmd(end),
        label: `${this.fmtMMDD(start)} ~ ${this.fmtMMDD(end)}`,
        score: nodeScore,
        questionCount: totalQuestions,
        knowledgePoints: kpScores,
      });
    }

    // 7. Linear regression over node scores.
    const n = nodes.length;
    if (n === 0) {
      return {
        studentId,
        configured: true,
        range: { startDate: s, endDate: e },
        nodeDays: NODE_DAYS,
        nodes: [],
        predictedScore: null,
        predictedScoreRange: null,
        nextNodeLabel,
        trend: 'flat',
        slope: 0,
        reason: 'no-data',
      };
    }
    if (n === 1) {
      const predictedScore = nodes[0].score;
      return {
        studentId,
        configured: true,
        range: { startDate: s, endDate: e },
        nodeDays: NODE_DAYS,
        nodes,
        predictedScore,
        predictedScoreRange: this.buildScoreRange(predictedScore),
        nextNodeLabel,
        trend: 'flat',
        slope: 0,
      };
    }

    const ys = nodes.map((nd) => nd.score);
    const xMean = (n - 1) / 2;
    const yMean = ys.reduce((sum, y) => sum + y, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - xMean;
      num += dx * (ys[i] - yMean);
      den += dx * dx;
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    const predictedScore = this.clamp(Math.round(intercept + slope * n), 0, MAX_SCORE);
    const trend = slope > 1 ? 'up' : slope < -1 ? 'down' : 'flat';

    return {
      studentId,
      configured: true,
      range: { startDate: s, endDate: e },
      nodeDays: NODE_DAYS,
      nodes,
      predictedScore,
      predictedScoreRange: this.buildScoreRange(predictedScore),
      nextNodeLabel,
      trend,
      slope: Number(slope.toFixed(4)),
    };
  }

  private buildScoreRange(score: number): PredictedScoreRange {
    return {
      min: this.clamp(Math.round(score - 2), 0, MAX_SCORE),
      max: this.clamp(Math.round(score + 2), 0, MAX_SCORE),
    };
  }

  private extractTags(tags: Record<string, unknown>): {
    difficulty: number;
    typeCoef: number;
    kp: string;
  } {
    let difficulty = 1.0;
    let typeCoef = 1.0;
    let kp = '';
    for (const [k, v] of Object.entries(tags ?? {})) {
      const keyStr = String(k).trim();
      const valStr = String(v ?? '').trim();
      if (!valStr) continue;
      if (keyStr.includes('难度')) {
        difficulty =
          valStr.includes('简') ? DIFFICULTY_COEFF['简单题'] : valStr.includes('难') ? DIFFICULTY_COEFF['较难题'] : 1.0;
      } else if (keyStr.includes('类型')) {
        typeCoef = valStr.includes('旧') ? TYPE_COEFF['旧题'] : TYPE_COEFF['新题'];
      } else if (!kp) {
        kp = valStr;
      }
    }
    return { difficulty, typeCoef, kp };
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
